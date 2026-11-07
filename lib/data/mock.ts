// Mock DataProvider (SPEC §3.4): in-memory store seeded from data/seed.json,
// localStorage-persisted, full command semantics mirroring the SQL RPCs.
// Demo identities are handled by the UI role switcher; this provider is data-only.
import seedJson from "../../data/seed.json";
import type {
  AwardInfo, ConflictReport, DataProvider, DivisionInfo, EntryInfo, EventInfo,
  FixtureEditInput, FixtureInput, FixtureResult, GroupInfo, MatchInfo, MatchStage,
  MatchStatus, PlayerInfo, ScorePayload, Snapshot, SportInfo, TeamInfo, VenueInfo,
} from "../types";
import { computedWinner, computeStandings, sortStandings, standingsTied } from "../standings";
import { checkFixtureConflicts, conflictAckHash, canonicalFixture, type FixtureLike, type RosterLike } from "../conflicts/overlap";

const LS_KEY = "pglulympics-mock-v2";


const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const manilaISO = (date: string, time: string) => new Date(`${date}T${time}:00+08:00`).toISOString();

interface InternalState extends Snapshot { slotFrozen: Record<string, boolean> }

interface SeedFixture {
  label: string; stage: string; group?: string | null; date: string; time?: string | null;
  venue?: string | null; teamA?: string | null; teamB?: string | null; entries?: string[];
  slotA?: { kind: "group_rank"; group: string; rank: number } | { kind: "match_outcome"; matchLabel: string; outcome: "winner" | "loser" };
  slotB?: SeedFixture["slotA"];
}
interface SeedDivision {
  name: string; slug: string; scoringKind?: string; scoringConfig?: Record<string, unknown>;
  groups: { name: string; teams: string[] }[]; entries?: string[]; fixtures: SeedFixture[];
}
interface SeedSport {
  name: string; slug: string; defaultDurationMinutes?: number;
  divisions: SeedDivision[];
}

function buildInitialState(): InternalState {
  const seed = seedJson as unknown as { event: { startDate: string; endDate: string }; teams: string[]; sports: SeedSport[] };
  const teams: TeamInfo[] = seed.teams.map((t) => ({ id: `team:${slugify(t)}`, name: t, slug: slugify(t) }));
  const teamId = (name: string) => `team:${slugify(name)}`;
  const venueNames = new Set<string>();
  for (const sp of seed.sports) for (const dv of sp.divisions) for (const f of dv.fixtures) if (f.venue) venueNames.add(f.venue);
  const venues: VenueInfo[] = [...venueNames].map((n) => ({ id: `venue:${slugify(n)}`, name: n }));
  const venueId = (n?: string | null) => (n ? `venue:${slugify(n)}` : null);
  const sports: SportInfo[] = [];
  const divisions: DivisionInfo[] = [];
  const groups: GroupInfo[] = [];
  const entries: EntryInfo[] = [];
  const matches: MatchInfo[] = [];
  const slotFrozen: Record<string, boolean> = {};

  const DEFAULT_STANDINGS = { order: ["win_pct", "wins", "head_to_head", "set_ratio", "point_ratio"], show_draws: false, standings_points: { win: 3, draw: 1, loss: 0 } };
  const DEFAULT_MEDALS = { place_to_medal: { "1": "gold", "2": "silver", "3": "bronze" }, max_per_medal: { gold: 1, silver: 1, bronze: 1 }, shared_allowed: false };

  for (const sp of seed.sports) {
    const sportId = `sport:${sp.slug}`;
    sports.push({ id: sportId, name: sp.name, slug: sp.slug, iconKey: sp.slug, defaultDurationMinutes: sp.defaultDurationMinutes ?? 60 });
    for (const div of sp.divisions) {
      const divId = `div:${sp.slug}:${div.slug}`;
      divisions.push({
        id: divId, sportId, name: div.name, slug: div.slug,
        scoringKind: (div.scoringKind as DivisionInfo["scoringKind"]) ?? "simple",
        scoringConfig: div.scoringConfig ?? {},
        standingsConfig: DEFAULT_STANDINGS, medalPolicy: DEFAULT_MEDALS,
      });
      const groupIdByName = new Map<string, string>();
      const entryId = (t: string) => `entry:${sp.slug}:${div.slug}:${slugify(t)}`;
      for (const g of div.groups ?? []) {
        const gid = `grp:${sp.slug}:${div.slug}:${slugify(g.name)}`;
        groupIdByName.set(g.name, gid);
        groups.push({ id: gid, divisionId: divId, name: g.name });
        for (const t of g.teams) {
          entries.push({ id: entryId(t), divisionId: divId, teamId: teamId(t), groupId: gid, rosterStatus: "unknown" });
        }
      }
      for (const t of div.entries ?? []) {
        entries.push({ id: entryId(t), divisionId: divId, teamId: teamId(t), groupId: null, rosterStatus: "unknown" });
      }
      const matchIdByLabel = new Map<string, string>();
      for (const f of div.fixtures) {
        const mid = `match:${sp.slug}:${div.slug}:${slugify(f.label)}`;
        matchIdByLabel.set(f.label, mid);
        const m: MatchInfo = {
          id: mid, divisionId: divId,
          groupId: f.group ? groupIdByName.get(f.group) ?? null : null,
          stage: f.stage as MatchStage, status: "scheduled", label: f.label,
          startsAt: f.time ? manilaISO(f.date, f.time) : null, durationMinutes: null,
          venueId: venueId(f.venue), venue: f.venue ?? null,
          slots: [], segments: [], revision: 0,
        };
        if (f.entries) {
          m.slots = f.entries.map((t, i) => ({ slotNo: i + 1, entryId: entryId(t), teamName: t, source: { kind: "entry" as const } }));
        } else if (f.teamA && f.teamB) {
          m.slots = [f.teamA, f.teamB].map((t, i) => ({ slotNo: i + 1, entryId: entryId(t), teamName: t, source: { kind: "entry" as const } }));
        }
        matches.push(m);
      }
      // second pass: playoff slot sources from seed descriptors
      for (const f of div.fixtures) {
        const m = matches.find((x) => x.id === matchIdByLabel.get(f.label));
        if (!m) continue;
        const apply = (slotNo: number, desc: SeedFixture["slotA"]) => {
          if (!desc) return;
          while (m.slots.length < slotNo) m.slots.push({ slotNo: m.slots.length + 1, entryId: null });
          if (desc.kind === "group_rank") {
            m.slots[slotNo - 1] = { slotNo, entryId: null, placeholder: `${desc.group} #${desc.rank}`,
              source: { kind: "group_rank", groupId: groupIdByName.get(desc.group) ?? null, rank: desc.rank } };
          } else {
            m.slots[slotNo - 1] = { slotNo, entryId: null, placeholder: `${desc.outcome === "winner" ? "Winner" : "Loser"} · ${desc.matchLabel}`,
              source: { kind: "match_outcome", matchId: matchIdByLabel.get(desc.matchLabel) ?? null, outcome: desc.outcome } };
          }
        };
        apply(1, f.slotA);
        apply(2, f.slotB);
      }
    }
  }

  return {
    event: {
      id: "event:pglulympics-2026", slug: "pglulympics-2026", name: "PGLUlympics",
      organizer: "Provincial Government of La Union",
      startDate: seed.event.startDate, endDate: seed.event.endDate,
      goldPoints: 5, silverPoints: 3, bronzePoints: 1, pointsProvisional: true,
    },
    teams, sports, divisions, groups, entries, matches,
    awards: [], players: [], rosters: {}, venues, revision: 0, slotFrozen,
  };
}

export class MockProvider implements DataProvider {
  private state: InternalState;
  private listeners = new Set<(s: Snapshot) => void>();

  constructor() {
    this.state = buildInitialState();
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as InternalState;
          if (parsed?.event?.slug === "pglulympics-2026" && Array.isArray(parsed.matches)) this.state = parsed;
        }
      } catch { /* start fresh */ }
    }
  }

  private persist() {
    if (typeof window !== "undefined") {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.state)); } catch { /* quota */ }
    }
  }
  private snapshot(): Snapshot {
    const { slotFrozen: _omit, ...snap } = this.state;
    return structuredClone(snap);
  }
  private emit() {
    this.state.revision++;
    this.persist();
    const snap = this.snapshot();
    this.listeners.forEach((cb) => cb(snap));
  }
  async getSnapshot(): Promise<Snapshot> { return this.snapshot(); }
  subscribe(cb: (s: Snapshot) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private match(id: string): MatchInfo {
    const m = this.state.matches.find((x) => x.id === id);
    if (!m) throw new Error("match not found");
    return m;
  }
  private division(id: string): DivisionInfo {
    return this.state.divisions.find((d) => d.id === id)!;
  }
  private teamNameOfEntry(entryId: string | null | undefined): string | null {
    if (!entryId) return null;
    const e = this.state.entries.find((x) => x.id === entryId);
    return e ? this.state.teams.find((t) => t.id === e.teamId)?.name ?? null : null;
  }

  /** SPEC §7 resolution; usable source = final + not needs_review. */
  private resolveAdvancement() {
    const st = this.state;
    for (const m of st.matches) {
      for (const slot of m.slots) {
        const src = slot.source;
        if (!src || src.kind === "entry") continue;
        let resolved: string | null = null;
        if (src.kind === "group_rank" && src.groupId && src.rank) {
          const divMatches = st.matches.filter((x) => x.divisionId === m.divisionId && x.groupId === src.groupId && x.stage === "round_robin");
          if (divMatches.length > 0 && divMatches.every((x) => x.status === "final" && !x.needsReview)) {
            const rows = sortStandings(computeStandings(this.division(m.divisionId),
              st.entries.filter((e) => e.groupId === src.groupId), st.matches, st.teams));
            const row = rows[src.rank - 1];
            const next = rows[src.rank];
            const prev = rows[src.rank - 2];
            const tied = (row && next && standingsTied(row, next)) || (row && prev && standingsTied(row, prev));
            if (row && !tied) resolved = row.entryId;
          }
        } else if (src.kind === "match_outcome" && src.matchId) {
          const srcMatch = st.matches.find((x) => x.id === src.matchId);
          if (srcMatch && srcMatch.status === "final" && !srcMatch.needsReview && srcMatch.winnerEntryId) {
            if (src.outcome === "winner") resolved = srcMatch.winnerEntryId;
            else {
              const loser = srcMatch.slots.find((s) => s.entryId && s.entryId !== srcMatch.winnerEntryId);
              resolved = loser?.entryId ?? null;
            }
          }
        }
        const frozen = st.slotFrozen[`${m.id}:${slot.slotNo}`];
        if (m.status === "scheduled" && !frozen) {
          slot.entryId = resolved;
          slot.teamName = this.teamNameOfEntry(resolved);
        } else if (resolved !== slot.entryId && (m.status === "live" || m.status === "final")) {
          m.needsReview = true;
        }
      }
    }
  }

  private proposeAwards(m: MatchInfo) {
    if (m.status !== "final" || !m.winnerEntryId) return;
    const upsertDraft = (awardKey: string, medal: AwardInfo["medal"], entryId: string) => {
      const existing = this.state.awards.find((a) => a.divisionId === m.divisionId && a.awardKey === awardKey && a.state === "draft");
      const teamName = this.teamNameOfEntry(entryId) ?? undefined;
      if (existing) { existing.entryId = entryId; existing.teamName = teamName; }
      else this.state.awards.push({ divisionId: m.divisionId, awardKey, medal, entryId, teamName, state: "draft", source: m.stage === "placement" ? "placement" : "playoff" });
    };
    if (m.stage === "gold") {
      upsertDraft("gold", "gold", m.winnerEntryId);
      const loser = m.slots.find((s) => s.entryId && s.entryId !== m.winnerEntryId);
      if (loser?.entryId) upsertDraft("silver", "silver", loser.entryId);
    } else if (m.stage === "bronze") {
      upsertDraft("bronze", "bronze", m.winnerEntryId);
    } else if (m.stage === "placement" && m.placements) {
      const policy = (this.division(m.divisionId).medalPolicy?.place_to_medal ?? {}) as Record<string, AwardInfo["medal"]>;
      for (const p of m.placements) {
        if (p.place && policy[String(p.place)]) {
          const entryId = m.slots[p.slotNo - 1]?.entryId;
          if (entryId) upsertDraft(`place:${p.place}`, policy[String(p.place)], entryId);
        }
      }
    }
  }

  async saveScore(matchId: string, expectedRevision: number, payload: ScorePayload): Promise<{ revision: number }> {
    const m = this.match(matchId);
    if (m.revision !== expectedRevision) throw new Error(`stale revision: server is at ${m.revision}`);
    if (m.status !== "live" && m.status !== "scheduled") throw new Error("scores can only be edited before final");
    m.segments = payload.segments.map((s) => ({
      segmentNo: s.segmentNo, kind: s.kind, status: s.status,
      points: [s.scores[1] ?? 0, s.scores[2] ?? 0],
    }));
    m.totals = payload.totals ? [payload.totals[1] ?? 0, payload.totals[2] ?? 0] : m.totals;
    if (payload.placements) {
      m.placements = payload.placements.map((p) => ({ slotNo: p.slotNo, place: p.place ?? null, finish: p.finish, note: p.note ?? null }));
    }
    m.revision++;
    this.emit();
    return { revision: m.revision };
  }

  async setMatchStatus(matchId: string, status: MatchStatus, opts?: { outcome?: string; winnerEntryId?: string; reason?: string }): Promise<{ revision: number; status: MatchStatus }> {
    const m = this.match(matchId);
    const div = this.division(m.divisionId);
    if (status === "live") {
      if (m.status !== "scheduled") throw new Error("only a scheduled match can start");
      if (div.scoringKind !== "placement_only" && m.slots.some((s) => !s.entryId)) throw new Error("both contestants must be resolved before starting");
      for (const s of m.slots) this.state.slotFrozen[`${m.id}:${s.slotNo}`] = true;
      m.status = "live";
    } else if (status === "final") {
      if (m.status !== "live") throw new Error("only a live match can be finalized");
      if (opts?.outcome === "forfeit") {
        if (!opts.winnerEntryId) throw new Error("forfeit requires a winner");
        m.winnerEntryId = opts.winnerEntryId; m.outcome = "forfeit";
      } else if (div.scoringKind === "placement_only") {
        if (m.slots.some((s) => s.entryId && !m.placements?.some((p) => p.slotNo === s.slotNo))) throw new Error("every entrant needs a placement result before final");
        m.outcome = "win";
      } else {
        const { winnerEntryId, isDraw } = computedWinner(m, div);
        if (!winnerEntryId && !isDraw) throw new Error("no winner determined by the current scores");
        if (isDraw && opts?.outcome !== "draw") throw new Error("scores are tied; pass outcome=draw if draws are allowed");
        m.winnerEntryId = winnerEntryId; m.outcome = isDraw ? "draw" : "win";
      }
      m.status = "final";
      this.proposeAwards(m);
    } else if (status === "scheduled") {
      if (m.status !== "final") throw new Error("only a final match can be reopened");
      m.status = "scheduled"; m.winnerEntryId = null; m.outcome = null; m.needsReview = false;
      this.state.awards = this.state.awards.filter((a) => !(a.divisionId === m.divisionId && a.state !== "void" &&
        ((m.stage === "gold" && (a.awardKey === "gold" || a.awardKey === "silver")) || (m.stage === "bronze" && a.awardKey === "bronze"))));
    } else if (status === "cancelled") {
      m.status = "cancelled";
    }
    m.revision++;
    this.resolveAdvancement();
    this.emit();
    return { revision: m.revision, status: m.status };
  }

  async requestCorrection(matchId: string, _reason: string): Promise<void> {
    const m = this.match(matchId);
    if (m.status !== "final") throw new Error("only a final match can be flagged for correction");
    m.needsReview = true;
    m.revision++;
    this.resolveAdvancement();
    this.emit();
  }

  async resetMatch(matchId: string, _reason?: string): Promise<void> {
    // mandatory descendant closure over match_outcome sources (SPEC §7)
    const closure = new Set<string>([matchId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const m of this.state.matches) {
        if (closure.has(m.id)) continue;
        if (m.slots.some((s) => s.source?.kind === "match_outcome" && s.source.matchId && closure.has(s.source.matchId))) {
          closure.add(m.id); grew = true;
        }
      }
    }
    for (const m of this.state.matches) {
      if (!closure.has(m.id)) continue;
      m.segments = []; m.totals = null; m.placements = [];
      m.status = "scheduled"; m.winnerEntryId = null; m.outcome = null; m.needsReview = false;
      m.revision++;
      for (const s of m.slots) delete this.state.slotFrozen[`${m.id}:${s.slotNo}`];
    }
    const divIds = new Set([...closure].map((id) => this.match(id).divisionId));
    this.state.awards = this.state.awards.filter((a) => !(divIds.has(a.divisionId) && a.state === "draft"));
    this.resolveAdvancement();
    this.emit();
  }

  async listConflicts(): Promise<import("../types").ConflictRow[]> {
    // pairwise over the same inclusion set as the checker (SPEC §11.5 read model)
    const rows: import("../types").ConflictRow[] = [];
    const likes = this.fixtureLikes();
    const rosters = this.rosterLike();
    const byId = new Map(this.state.matches.map((m) => [m.id, m]));
    for (let i = 0; i < likes.length; i++) {
      for (let j = i + 1; j < likes.length; j++) {
        const a = likes[i], b = likes[j];
        const rep = checkFixtureConflicts(a, [b], rosters);
        const ma = byId.get(a.id)!, mb = byId.get(b.id)!;
        const divName = (id: string) => this.state.divisions.find((d) => d.id === id)?.name ?? "";
        for (const c of rep.playerClashes) {
          rows.push({
            kind: "player", playerId: c.player_id, playerName: c.player_name,
            matchId: a.id, label: a.label, sport: a.sportName, division: divName(a.divisionId),
            startsAt: a.startsAt!, endsAt: new Date(Date.parse(a.startsAt!) + (a.durationMinutes ?? 60) * 60000).toISOString(),
            otherMatchId: b.id, otherLabel: b.label, otherSport: b.sportName,
            otherStartsAt: c.other_starts_at, otherEndsAt: c.other_ends_at,
            acked: !!(ma.conflictAck || mb.conflictAck),
          });
        }
        for (const c of rep.venueClashes) {
          rows.push({
            kind: "venue",
            matchId: a.id, label: a.label, sport: a.sportName, division: divName(a.divisionId),
            startsAt: a.startsAt!, endsAt: new Date(Date.parse(a.startsAt!) + (a.durationMinutes ?? 60) * 60000).toISOString(),
            otherMatchId: b.id, otherLabel: b.label, otherSport: b.sportName,
            otherStartsAt: c.other_starts_at, otherEndsAt: c.other_ends_at,
            acked: !!(ma.conflictAck || mb.conflictAck),
          });
        }
      }
    }
    return rows.sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  }

  // ---------- §11 fixtures + conflicts ----------
  private fixtureLikes(excludeId?: string): FixtureLike[] {
    const st = this.state;
    return st.matches
      .filter((m) => m.status !== "cancelled" && m.id !== excludeId)
      .map((m) => {
        const sport = st.sports.find((s) => s.id === st.divisions.find((d) => d.id === m.divisionId)?.sportId);
        return {
          id: m.id, label: m.label, sportName: sport?.name ?? "",
          divisionId: m.divisionId, startsAt: m.startsAt,
          durationMinutes: m.durationMinutes ?? sport?.defaultDurationMinutes ?? 60,
          venueId: m.venueId ?? null, venueName: m.venue,
          entryIds: m.slots.map((s) => s.entryId).filter((x): x is string => !!x),
        };
      });
  }
  private rosterLike(): RosterLike {
    const byEntry: Record<string, string[]> = { ...this.state.rosters };
    const statusByEntry: Record<string, "unknown" | "verified"> = {};
    for (const e of this.state.entries) statusByEntry[e.id] = e.rosterStatus;
    const playerName: Record<string, string> = {};
    for (const p of this.state.players) playerName[p.id] = p.name;
    return { byEntry, statusByEntry, playerName };
  }
  private checkFor(input: { divisionId: string; label: string; stage: MatchStage; groupId?: string | null; startsAt: string; durationMinutes?: number | null; venueId?: string | null; entryIds: string[] }, selfId?: string): { report: ConflictReport; hash: string } {
    const sport = this.state.sports.find((s) => s.id === this.division(input.divisionId).sportId);
    const proposed: FixtureLike = {
      id: selfId ?? "proposed", label: input.label, sportName: sport?.name ?? "",
      divisionId: input.divisionId, startsAt: input.startsAt,
      durationMinutes: input.durationMinutes ?? sport?.defaultDurationMinutes ?? 60,
      venueId: input.venueId ?? null,
      venueName: this.state.venues.find((v) => v.id === input.venueId)?.name ?? null,
      entryIds: input.entryIds,
    };
    const report = checkFixtureConflicts(proposed, this.fixtureLikes(selfId), this.rosterLike()) as ConflictReport;
    const hash = conflictAckHash(canonicalFixture(input), report);
    return { report, hash };
  }

  async createFixture(input: FixtureInput, ackHash?: string): Promise<FixtureResult> {
    const { report, hash } = this.checkFor(input);
    const hasIssues = report.playerClashes.length + report.venueClashes.length + report.incomplete.length > 0;
    if (hasIssues && ackHash !== hash) return { status: "warning", ackHash: hash, conflicts: report };
    const id = `match:${this.division(input.divisionId).slug}:custom-${Date.now().toString(36)}`;
    const m: MatchInfo = {
      id, divisionId: input.divisionId, groupId: input.groupId ?? null,
      stage: input.stage, status: "scheduled", label: input.label,
      startsAt: input.startsAt, durationMinutes: input.durationMinutes ?? null,
      venueId: input.venueId ?? null,
      venue: this.state.venues.find((v) => v.id === input.venueId)?.name ?? input.venueText ?? null,
      slots: input.entryIds.map((entryId, i) => ({
        slotNo: i + 1, entryId, teamName: this.teamNameOfEntry(entryId), source: { kind: "entry" as const },
      })),
      segments: [], revision: 0,
      conflictAck: ackHash ? { hash, by: "demo", at: new Date().toISOString() } : null,
    };
    this.state.matches.push(m);
    this.emit();
    return { status: "ok", matchId: id };
  }

  async updateFixture(matchId: string, input: FixtureEditInput, ackHash?: string): Promise<FixtureResult> {
    const m = this.match(matchId);
    const merged: FixtureInput = {
      divisionId: m.divisionId, label: input.label ?? m.label, stage: m.stage, groupId: m.groupId,
      startsAt: input.startsAt, durationMinutes: input.durationMinutes ?? null,
      venueId: input.venueId ?? null, venueText: input.venueText ?? null,
      entryIds: m.slots.map((s) => s.entryId).filter((x): x is string => !!x),
    };
    const { report, hash } = this.checkFor(merged, matchId);
    const hasIssues = report.playerClashes.length + report.venueClashes.length + report.incomplete.length > 0;
    if (hasIssues && ackHash !== hash) return { status: "warning", ackHash: hash, conflicts: report };
    m.startsAt = input.startsAt;
    m.durationMinutes = input.durationMinutes ?? null;
    m.venueId = input.venueId ?? null;
    m.venue = this.state.venues.find((v) => v.id === input.venueId)?.name ?? input.venueText ?? m.venue;
    if (input.label) m.label = input.label;
    if (ackHash) m.conflictAck = { hash, by: "demo", at: new Date().toISOString() };
    m.revision++;
    this.emit();
    return { status: "ok", matchId };
  }

  async confirmAwards(divisionId: string, awards: { awardKey: string; medal: AwardInfo["medal"]; entryId: string; source?: string }[]): Promise<void> {
    this.state.awards = this.state.awards.filter((a) => !(a.divisionId === divisionId && a.state !== "void"));
    for (const a of awards) {
      this.state.awards.push({
        divisionId, awardKey: a.awardKey, medal: a.medal, entryId: a.entryId,
        teamName: this.teamNameOfEntry(a.entryId) ?? undefined,
        state: "confirmed", source: a.source ?? "manual",
      });
    }
    this.emit();
  }

  // ---------- admin facet ----------
  async upsertPlayer(name: string): Promise<PlayerInfo> {
    const existing = this.state.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const p: PlayerInfo = { id: `player:${slugify(name)}-${this.state.players.length + 1}`, name };
    this.state.players.push(p);
    this.emit();
    return p;
  }
  async setEntryRoster(entryId: string, playerIds: string[]): Promise<void> {
    this.state.rosters[entryId] = [...playerIds];
    this.emit();
  }
  async setEntryRosterStatus(entryId: string, status: "unknown" | "verified"): Promise<void> {
    const e = this.state.entries.find((x) => x.id === entryId);
    if (e) e.rosterStatus = status;
    this.emit();
  }
  async updateEventPoints(p: { goldPoints: number; silverPoints: number; bronzePoints: number; pointsProvisional: boolean }): Promise<void> {
    Object.assign(this.state.event, p);
    this.emit();
  }
  async updateSportDuration(sportId: string, minutes: number): Promise<void> {
    const s = this.state.sports.find((x) => x.id === sportId);
    if (s) s.defaultDurationMinutes = minutes;
    this.emit();
  }
}
