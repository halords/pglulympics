// Supabase DataProvider (SPEC §3.2/§3.3): public reads via projection views,
// staff reads via RLS-scoped base tables, all writes via the migration-4 RPCs.
// Realtime: event_updates subscription -> snapshot refetch (patch payloads are also
// emitted server-side per SPEC §2 for API consumers). Polling: 5s while visible.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AwardInfo, ConflictReport, DataProvider, DivisionInfo, EntryInfo, EventInfo, FixtureEditInput,
  FixtureInput, FixtureResult, GroupInfo, LineupTeam, MatchInfo, MatchStatus, PlayerInfo,
  ScorePayload, Snapshot, SportInfo, TeamInfo, VenueInfo,
} from "../types";
import { lineupsFromViewRows, type PublicLineupRow } from "../lineups";

/** Stamp the severity model onto a conflict report coming back from the
 *  RPCs: player clashes are MAJOR, venue clashes MINOR (migration 9 also
 *  stamps them server-side; doing it here keeps the client correct against
 *  a database that has not applied migration 9 yet). */
function normalizeConflicts(raw: unknown): ConflictReport {
  const r = (raw ?? {}) as Partial<ConflictReport>;
  return {
    playerClashes: (r.playerClashes ?? []).map((c) => ({ ...c, severity: "major" as const })),
    venueClashes: (r.venueClashes ?? []).map((c) => ({ ...c, severity: "minor" as const })),
    anomalies: r.anomalies ?? [],
    incomplete: r.incomplete ?? [],
  };
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? undefined : String(v));

export class SupabaseProvider implements DataProvider {
  private listeners = new Set<(s: Snapshot) => void>();
  private lastRevision = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private channel: ReturnType<SupabaseClient["channel"]> | null = null;

  constructor(private sb: SupabaseClient, private mode: "realtime" | "polling") {}

  // ---------------- snapshot assembly ----------------
  private async assemble(): Promise<Snapshot> {
    const sb = this.sb;
    const { data: userData } = await sb.auth.getUser();
    const staff = !!userData?.user;
    const [events, teams, sports, venues, pubDivisions] = await Promise.all([
      sb.from("events").select("*").limit(1),
      sb.from("teams").select("*"),
      sb.from("sports").select("*"),
      sb.from("venues").select("*"),
      sb.from("public_divisions").select("*"),
    ]);
    const ev = (events.data?.[0] ?? {}) as Row;
    const event: EventInfo = {
      id: s(ev.id) ?? "", slug: s(ev.slug) ?? "", name: s(ev.name) ?? "PGLUlympics",
      organizer: s(ev.organizer), startDate: s(ev.start_date) ?? "", endDate: s(ev.end_date) ?? "",
      goldPoints: Number(ev.gold_points ?? 5), silverPoints: Number(ev.silver_points ?? 3),
      bronzePoints: Number(ev.bronze_points ?? 1), pointsProvisional: Boolean(ev.points_provisional ?? true),
    };
    const teamList: TeamInfo[] = (teams.data ?? []).map((t: Row) => ({ id: s(t.id)!, name: s(t.name)!, slug: s(t.slug)!, color: (t.color as string) ?? null }));
    const teamName = (teamId: string) => teamList.find((t) => t.id === teamId)?.name ?? null;
    const sportList: SportInfo[] = (sports.data ?? []).map((t: Row) => ({
      id: s(t.id)!, name: s(t.name)!, slug: s(t.slug)!, iconKey: (t.icon_key as string) ?? null,
      defaultDurationMinutes: Number(t.default_duration_minutes ?? 60),
    }));
    const venueList: VenueInfo[] = (venues.data ?? []).map((t: Row) => ({ id: s(t.id)!, name: s(t.name)! }));

    let divisions: DivisionInfo[] = (pubDivisions.data ?? []).map((d: Row) => ({
      id: s(d.id)!, sportId: s(d.sport_id)!, name: s(d.name)!, slug: s(d.slug)!,
      scoringKind: d.scoring_kind as DivisionInfo["scoringKind"],
      scoringConfig: {}, standingsConfig: {}, medalPolicy: {},
    }));
    let groups: GroupInfo[] = [];
    let entries: EntryInfo[] = [];
    let matches: MatchInfo[] = [];
    let awards: AwardInfo[] = [];
    let players: PlayerInfo[] = [];
    let rosters: Record<string, string[]> = {};
    let lineups: Record<string, LineupTeam[]> | undefined;

    if (staff) {
      const [divs, grps, ents, mts, slots, segs, segScores, totals, places, results, pls, roster] = await Promise.all([
        sb.from("divisions").select("*"), sb.from("groups").select("*"),
        sb.from("division_entries").select("*"), sb.from("matches").select("*"),
        sb.from("match_slots").select("*"), sb.from("match_segments").select("*"),
        sb.from("segment_scores").select("*"), sb.from("match_totals").select("*"),
        sb.from("placement_results").select("*"), sb.from("division_results").select("*"),
        sb.from("players").select("*"), sb.from("roster_memberships").select("*"),
      ]);
      if (divs.data?.length) {
        divisions = (divs.data as Row[]).map((d) => ({
          id: s(d.id)!, sportId: s(d.sport_id)!, name: s(d.name)!, slug: s(d.slug)!,
          scoringKind: d.scoring_kind as DivisionInfo["scoringKind"],
          scoringConfig: (d.scoring_config as Record<string, unknown>) ?? {},
          standingsConfig: (d.standings_config as Record<string, unknown>) ?? {},
          medalPolicy: (d.medal_policy as Record<string, unknown>) ?? {},
        }));
      }
      groups = (grps.data ?? []).map((g: Row) => ({ id: s(g.id)!, divisionId: s(g.division_id)!, name: s(g.name)! }));
      entries = (ents.data ?? []).map((e: Row) => ({
        id: s(e.id)!, divisionId: s(e.division_id)!, teamId: s(e.team_id)!,
        groupId: (e.group_id as string) ?? null, label: (e.label as string) ?? null,
        rosterStatus: (e.roster_status as "unknown" | "verified") ?? "unknown",
      }));
      const entryTeam = (entryId: string | null) => {
        if (!entryId) return null;
        const e = entries.find((x) => x.id === entryId);
        return e ? teamName(e.teamId) : null;
      };
      const slotsByMatch = new Map<string, Row[]>();
      for (const sl of (slots.data ?? []) as Row[]) {
        const arr = slotsByMatch.get(s(sl.match_id)!) ?? [];
        arr.push(sl); slotsByMatch.set(s(sl.match_id)!, arr);
      }
      const segByMatch = new Map<string, Row[]>();
      for (const sg of (segs.data ?? []) as Row[]) {
        const arr = segByMatch.get(s(sg.match_id)!) ?? [];
        arr.push(sg); segByMatch.set(s(sg.match_id)!, arr);
      }
      const scoreBySegSlot = new Map<string, number>();
      for (const sc of (segScores.data ?? []) as Row[]) scoreBySegSlot.set(`${sc.segment_id}:${sc.slot_id}`, Number(sc.points ?? 0));
      matches = ((mts.data ?? []) as Row[]).map((m) => {
        const mSlots = (slotsByMatch.get(s(m.id)!) ?? []).sort((a, b) => Number(a.slot_no) - Number(b.slot_no));
        const segments = (segByMatch.get(s(m.id)!) ?? [])
          .sort((a, b) => Number(a.segment_no) - Number(b.segment_no))
          .map((sg) => ({
            segmentNo: Number(sg.segment_no), kind: (sg.kind as "set" | "period") ?? "set",
            status: (sg.status as "open" | "closed") ?? "open",
            points: mSlots.map((sl) => scoreBySegSlot.get(`${sg.id}:${sl.id}`) ?? 0),
          }));
        const mTotals = ((totals.data ?? []) as Row[]).filter((t) => t.match_id === m.id);
        const mPlaces = ((places.data ?? []) as Row[]).filter((t) => t.match_id === m.id);
        return {
          id: s(m.id)!, divisionId: s(m.division_id)!, groupId: (m.group_id as string) ?? null,
          stage: m.stage as MatchInfo["stage"], status: m.status as MatchStatus, label: s(m.label)!,
          startsAt: (m.starts_at as string) ?? null, durationMinutes: (m.duration_minutes as number) ?? null,
          venueId: (m.venue_id as string) ?? null, venue: (m.venue_text as string) ?? null,
          slots: mSlots.map((sl) => {
            const eff = (sl.frozen_entry_id as string) ?? (sl.override_entry_id as string) ?? (sl.resolved_entry_id as string) ?? (sl.source_entry_id as string);
            return {
              slotNo: Number(sl.slot_no), entryId: eff ?? null, teamName: entryTeam(eff ?? null),
              frozen: !!sl.frozen_entry_id,
              source: {
                kind: (sl.source as "entry" | "group_rank" | "match_outcome") ?? "entry",
                groupId: (sl.source_group_id as string) ?? null, rank: (sl.source_rank as number) ?? null,
                matchId: (sl.source_match_id as string) ?? null,
                outcome: (sl.source_outcome as "winner" | "loser") ?? null,
              },
            };
          }),
          segments,
          totals: mTotals.length ? mSlots.map((sl) => Number(mTotals.find((t) => t.slot_id === sl.id)?.points ?? 0)) : null,
          placements: mPlaces.map((p) => {
            const idx = mSlots.findIndex((sl) => sl.id === p.slot_id);
            return { slotNo: idx + 1, place: (p.place as number) ?? null, finish: s(p.finish) ?? "finished", note: (p.note as string) ?? null };
          }),
          winnerEntryId: (m.winner_entry_id as string) ?? null, outcome: (m.outcome as string) ?? null,
          needsReview: Boolean(m.needs_review), revision: Number(m.revision ?? 0),
          conflictAck: (m.conflict_ack as MatchInfo["conflictAck"]) ?? null,
        } as MatchInfo;
      });
      awards = ((results.data ?? []) as Row[]).map((r) => ({
        divisionId: s(r.division_id)!, awardKey: s(r.award_key)!, medal: r.medal as AwardInfo["medal"],
        entryId: s(r.entry_id)!, teamName: (() => { const e = entries.find((x) => x.id === r.entry_id); return e ? teamName(e.teamId) ?? undefined : undefined; })(),
        state: r.state as AwardInfo["state"], source: s(r.source) ?? "manual",
      }));
      players = ((pls.data ?? []) as Row[]).map((p) => ({ id: s(p.id)!, name: s(p.full_name)! }));
      for (const rm of (roster.data ?? []) as Row[]) {
        (rosters[s(rm.entry_id)!] ??= []).push(s(rm.player_id)!);
      }
    } else {
      // public assembly from projection views
      const [groupsRes, cards, segScores, results, lineupRows] = await Promise.all([
        sb.from("groups").select("*"),
        sb.from("public_match_cards").select("*"),
        sb.from("public_segment_scores").select("*"),
        sb.from("public_results").select("*"),
        sb.from("public_lineups").select("*"),
      ]);
      // public_lineups arrives with migration 10; until the hosted database
      // applies it, the query errors and lineups stay undefined (the match
      // page then derives what it can and panels light up after the merge).
      if (!lineupRows.error && lineupRows.data) {
        lineups = lineupsFromViewRows((lineupRows.data as Row[]).map((r) => ({
          match_id: s(r.match_id)!, division_id: (r.division_id as string) ?? null,
          entry_id: s(r.entry_id)!, team_name: s(r.team_name)!, player_name: (r.player_name as string) ?? null,
        })) as PublicLineupRow[]);
      }
      groups = (groupsRes.data ?? []).map((g: Row) => ({ id: s(g.id)!, divisionId: s(g.division_id)!, name: s(g.name)! }));
      const segsByMatch = new Map<string, Map<number, { kind: "set" | "period"; status: "open" | "closed"; points: number[] }>>();
      for (const r of (segScores.data ?? []) as Row[]) {
        const mid = s(r.match_id)!;
        const byNo = segsByMatch.get(mid) ?? new Map();
        const seg = byNo.get(Number(r.segment_no)) ?? { kind: (r.kind as "set") ?? "set", status: (r.status as "open") ?? "open", points: [0, 0] };
        seg.points[Number(r.slot_no) - 1] = Number(r.points ?? 0);
        byNo.set(Number(r.segment_no), seg);
        segsByMatch.set(mid, byNo);
      }
      matches = ((cards.data ?? []) as Row[]).map((c) => {
        const segs = [...(segsByMatch.get(s(c.match_id)!) ?? new Map()).entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([segmentNo, v]) => ({ segmentNo, kind: v.kind, status: v.status, points: v.points }));
        const tot = (idx: 1 | 2) => {
          const closed = segs.filter((x) => x.status === "closed");
          const sum = closed.reduce((a, x) => a + (x.points[idx - 1] ?? 0), 0);
          return sum;
        };
        return {
          id: s(c.match_id)!, divisionId: s(c.division_id)!, groupId: null,
          stage: c.stage as MatchInfo["stage"], status: c.status as MatchStatus, label: s(c.label)!,
          startsAt: (c.starts_at as string) ?? null, durationMinutes: null,
          venueId: null, venue: (c.venue as string) ?? null,
          slots: [1, 2].map((n) => ({
            slotNo: n,
            entryId: (c[`slot${n}_entry_id`] as string) ?? null,
            teamName: (c[`slot${n}_team`] as string) ?? null,
            placeholder: (c[`slot${n}_team`] as string) ? null : "TBD",
          })),
          segments: segs,
          totals: segs.length ? [tot(1), tot(2)] : null,
          winnerEntryId: (c.winner_entry_id as string) ?? null,
          revision: 0,
        } as MatchInfo;
      });
      awards = ((results.data ?? []) as Row[]).map((r) => ({
        divisionId: s(r.division_id)!, awardKey: s(r.award_key)!, medal: r.medal as AwardInfo["medal"],
        entryId: s(r.entry_id)!, teamName: (r.team_name as string) ?? undefined,
        state: "confirmed" as const, source: "playoff",
      }));
      // entries are not public; synthesize minimal entries from awards for tally mapping
      entries = awards.map((a) => ({
        id: a.entryId, divisionId: a.divisionId,
        teamId: teamList.find((t) => t.name === a.teamName)?.id ?? "",
        rosterStatus: "unknown" as const,
      }));
    }

    const revRes = await sb.from("event_updates").select("revision").order("revision", { ascending: false }).limit(1);
    const revision = Number((revRes.data?.[0] as Row | undefined)?.revision ?? 0);
    this.lastRevision = revision;
    return { event, teams: teamList, sports: sportList, divisions, groups, entries, matches, awards, players, rosters, lineups, venues: venueList, revision };
  }

  async getSnapshot(): Promise<Snapshot> { return this.assemble(); }

  subscribe(cb: (s: Snapshot) => void): () => void {
    this.listeners.add(cb);
    const notify = async () => { const snap = await this.assemble(); this.listeners.forEach((f) => f(snap)); };
    if (this.mode === "realtime") {
      this.channel = this.sb.channel("pglu-public")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_updates" }, () => { void notify(); })
        .subscribe();
      // 15s watchdog: missed-message detection via max revision (SPEC §3.2)
      this.timer = setInterval(async () => {
        const { data } = await this.sb.from("event_updates").select("revision").order("revision", { ascending: false }).limit(1);
        const rev = Number((data?.[0] as Row | undefined)?.revision ?? 0);
        if (rev > this.lastRevision) void notify();
      }, 15000);
    } else {
      this.timer = setInterval(() => { if (typeof document === "undefined" || document.visibilityState === "visible") void notify(); }, 5000);
    }
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0) {
        if (this.timer) clearInterval(this.timer);
        if (this.channel) void this.sb.removeChannel(this.channel);
      }
    };
  }

  async listConflicts(): Promise<import("../types").ConflictRow[]> {
    const { data, error } = await this.sb.rpc("list_conflicts");
    if (error) throw new Error(error.message);
    return ((data ?? []) as Row[]).map((r) => ({
      kind: r.kind as "player" | "venue",
      severity: (r.severity as "major" | "minor" | undefined) ?? (r.kind === "player" ? "major" : "minor"),
      playerId: (r.player_id as string) ?? null,
      playerName: (r.player_name as string) ?? null,
      matchId: String(r.match_id), label: String(r.label), sport: String(r.sport), division: String(r.division),
      startsAt: String(r.starts_at), endsAt: String(r.ends_at),
      otherMatchId: String(r.other_match_id), otherLabel: String(r.other_label), otherSport: String(r.other_sport),
      otherStartsAt: String(r.other_starts_at), otherEndsAt: String(r.other_ends_at),
      acked: Boolean(r.acked),
    }));
  }

  // ---------------- commands (RPCs) ----------------
  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  }
  async saveScore(matchId: string, expectedRevision: number, payload: ScorePayload) {
    return this.rpc<{ revision: number }>("save_score", { p_match_id: matchId, p_expected_revision: expectedRevision, p_payload: payload });
  }
  async setMatchStatus(matchId: string, status: MatchStatus, opts?: { outcome?: string; winnerEntryId?: string; reason?: string }) {
    return this.rpc<{ revision: number; status: MatchStatus }>("set_match_status", {
      p_match_id: matchId, p_status: status, p_outcome: opts?.outcome ?? null,
      p_winner_entry_id: opts?.winnerEntryId ?? null, p_reason: opts?.reason ?? null,
    });
  }
  async requestCorrection(matchId: string, reason: string) {
    await this.rpc("request_correction", { p_match_id: matchId, p_reason: reason });
  }
  async resetMatch(matchId: string, reason?: string) {
    await this.rpc("reset_match", { p_match_id: matchId, p_reason: reason ?? null });
  }
  async confirmAwards(divisionId: string, awards: { awardKey: string; medal: AwardInfo["medal"]; entryId: string; source?: string }[]) {
    await this.rpc("confirm_awards", { p_division_id: divisionId, p_awards: awards });
  }
  async createFixture(input: FixtureInput, ackHash?: string): Promise<FixtureResult> {
    const r = await this.rpc<Row>("create_fixture", {
      p_division_id: input.divisionId, p_label: input.label, p_stage: input.stage,
      p_group_id: input.groupId ?? null, p_starts_at: input.startsAt,
      p_duration_minutes: input.durationMinutes ?? null, p_venue_id: input.venueId ?? null,
      p_venue_text: input.venueText ?? null, p_entry_ids: input.entryIds, p_ack_hash: ackHash ?? null,
    });
    if (r.status === "warning") return { status: "warning", ackHash: String(r.ack_hash), conflicts: normalizeConflicts(r.conflicts) };
    return { status: "ok", matchId: String(r.match_id), notes: r.notes ? normalizeConflicts(r.notes) : undefined };
  }
  async updateFixture(matchId: string, input: FixtureEditInput, ackHash?: string): Promise<FixtureResult> {
    const r = await this.rpc<Row>("update_fixture", {
      p_match_id: matchId, p_starts_at: input.startsAt, p_duration_minutes: input.durationMinutes ?? null,
      p_venue_id: input.venueId ?? null, p_venue_text: input.venueText ?? null,
      p_label: input.label ?? null, p_ack_hash: ackHash ?? null,
    });
    if (r.status === "warning") return { status: "warning", ackHash: String(r.ack_hash), conflicts: normalizeConflicts(r.conflicts) };
    return { status: "ok", matchId, notes: r.notes ? normalizeConflicts(r.notes) : undefined };
  }
  async setFixtureTeams(matchId: string, entryIds: string[], ackHash?: string): Promise<FixtureResult> {
    const r = await this.rpc<Row>("set_fixture_teams", {
      p_match_id: matchId, p_entry_ids: entryIds, p_ack_hash: ackHash ?? null,
    });
    if (r.status === "warning") return { status: "warning", ackHash: String(r.ack_hash), conflicts: normalizeConflicts(r.conflicts) };
    return { status: "ok", matchId, notes: r.notes ? normalizeConflicts(r.notes) : undefined };
  }
  // ---------------- admin facet (direct DML under admin RLS) ----------------
  async upsertPlayer(name: string): Promise<PlayerInfo> {
    const { data: existing } = await this.sb.from("players").select("*").ilike("full_name", name).limit(1);
    if (existing?.length) return { id: s(existing[0].id)!, name: s(existing[0].full_name)! };
    const ev = await this.sb.from("events").select("id").limit(1);
    const { data, error } = await this.sb.from("players").insert({ full_name: name, event_id: (ev.data?.[0] as Row)?.id }).select().single();
    if (error) throw new Error(error.message);
    return { id: s((data as Row).id)!, name };
  }
  async setEntryRoster(entryId: string, playerIds: string[]) {
    await this.sb.from("roster_memberships").delete().eq("entry_id", entryId);
    if (playerIds.length) {
      const { error } = await this.sb.from("roster_memberships").insert(playerIds.map((pid) => ({ entry_id: entryId, player_id: pid })));
      if (error) throw new Error(error.message);
    }
  }
  async setEntryRosterStatus(entryId: string, status: "unknown" | "verified") {
    const { error } = await this.sb.from("division_entries").update({ roster_status: status }).eq("id", entryId);
    if (error) throw new Error(error.message);
  }
  async updateEventPoints(p: { goldPoints: number; silverPoints: number; bronzePoints: number; pointsProvisional: boolean }) {
    const { error } = await this.sb.from("events").update({
      gold_points: p.goldPoints, silver_points: p.silverPoints, bronze_points: p.bronzePoints,
      points_provisional: p.pointsProvisional,
    }).eq("slug", "pglulympics-2026");
    if (error) throw new Error(error.message);
  }
  async updateSportDuration(sportId: string, minutes: number) {
    const { error } = await this.sb.from("sports").update({ default_duration_minutes: minutes }).eq("id", sportId);
    if (error) throw new Error(error.message);
  }
}
