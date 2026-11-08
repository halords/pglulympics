// Sheet sync — diff + apply engine. Pure planning (planChanges) separated
// from application (runSheetSync) so the rules are unit-testable against an
// in-memory store. Binding rules (2026-11-08):
//  - allowed writes: fixture starts_at/venue, recorded finals (versus
//    sports), placement finishes, entry add/withdraw/reactivate/group.
//  - NEVER overwrite: live matches, portal-final results, confirmed
//    divisions' entries. Disagreements become conflict_skip log rows.
//  - sheet finals are applied through the normal status flow (live →
//    save → final) so propagation + DRAFT award proposal run exactly as
//    for a coordinator-entered final; medal confirmation stays human.
//  - unmatched sheet rows are logged, never inserted as fixtures.
//  - a tab that fails to fetch/parse contributes NOTHING (its divisions'
//    entries are never diffed — a parser outage must not withdraw teams).
import { normName, slugify } from "./parse";
import type {
  PlannedChange, SheetFixture, SheetState, SyncDbState, SyncDivision, SyncLogRow,
  SyncMatch, SyncRunResult, SyncStore, TabOutcome,
} from "./types";

export interface TabData {
  name: string;
  sportSlug: string | null;
  grid?: import("./types").Grid;
  error?: string;
}

// ---------------- resolution helpers ----------------

function resolveDivision(db: SyncDbState, sportSlug: string, key: string): SyncDivision | null {
  const divs = db.divisions.filter((d) => d.sportSlug === sportSlug);
  return divs.find((d) => d.slug === key)
    ?? divs.find((d) => slugify(d.name) === key)
    ?? null;
}
function teamIdByName(db: SyncDbState, name: string): string | null {
  const n = normName(name);
  return db.teams.find((t) => normName(t.name) === n)?.id ?? null;
}
function teamNameById(db: SyncDbState, id: string | null): string | null {
  if (!id) return null;
  return db.teams.find((t) => t.id === id)?.name ?? null;
}
function sameInstant(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  const ta = Date.parse(a), tb = Date.parse(b);
  if (ta === tb) return true;
  // Documented sheet quirk: two Basketball women's starts are written
  // "12:40 AM" inside a midday sequence and were seeded as 12:40 PM.
  // An AM/PM flip on the same date+minutes is the same start, not a move.
  const da = new Date(ta), db2 = new Date(tb);
  const off = Math.abs(ta - tb);
  return off === 12 * 3600 * 1000 && da.getMinutes() === db2.getMinutes() && da.getSeconds() === db2.getSeconds();
}
function pairingKey(names: (string | null)[]): string {
  return names.map((n) => normName(n ?? "")).filter(Boolean).sort().join(" vs ");
}
function setsEqual(a: { points: [number, number] }[], b: [number, number][]): boolean {
  return a.length === b.length && a.every((s, i) => s.points[0] === b[i][0] && s.points[1] === b[i][1]);
}
function pairsWinner(pairs: [number, number][]): 0 | 1 | null {
  let w0 = 0, w1 = 0;
  for (const [a, b] of pairs) { if (a > b) w0++; else if (b > a) w1++; }
  return w0 === w1 ? null : w0 > w1 ? 0 : 1;
}

// ---------------- planning (pure) ----------------

export interface PlanResult {
  changes: PlannedChange[];
  /** Sports whose tabs parsed cleanly — only these get entry diffs. */
  okSports: Set<string>;
}

export function planChanges(sheet: SheetState, db: SyncDbState, parsedSports: Set<string>): PlanResult {
  const changes: PlannedChange[] = [];
  const skip = (matchId: string | null, divisionId: string | null, reason: string, sourceRef: string | null, logKind?: "conflict_skip" | "placement") => {
    changes.push({ type: "conflict_skip", matchId, divisionId, reason, sourceRef, ...(logKind ? { logKind } : {}) });
  };

  // ---------- fixtures ----------
  const sheetByDivision = new Map<string, SheetFixture[]>();
  for (const f of sheet.fixtures) {
    const arr = sheetByDivision.get(`${f.sportSlug}|${f.divisionKey}`) ?? [];
    arr.push(f); sheetByDivision.set(`${f.sportSlug}|${f.divisionKey}`, arr);
  }
  for (const f of sheet.fixtures) {
    const div = resolveDivision(db, f.sportSlug, f.divisionKey);
    if (!div) {
      changes.push({ type: "unmatched", divisionId: null, description: `${f.sportSlug}/${f.divisionKey} — division not in portal`, sourceRef: f.sourceRef });
      continue;
    }
    const inDiv = db.matches.filter((m) => m.divisionId === div.id);
    let match: SyncMatch | null = null;
    if (f.label) {
      match = inDiv.find((m) => normName(m.label) === normName(f.label)) ?? null;
      if (!match) {
        changes.push({ type: "unmatched", divisionId: div.id, description: `${div.name} "${f.label}" — no portal fixture with this label`, sourceRef: f.sourceRef });
        continue;
      }
      // pairing verification for labeled fixtures with named teams
      if (f.teamA && f.teamB) {
        const dbPair = pairingKey(match.slots.map((s) => s.teamName));
        if (dbPair && dbPair !== pairingKey([f.teamA, f.teamB])) {
          skip(match.id, div.id, `pairing changed in portal (${match.slots.map((s) => s.teamName ?? "?").join(" vs ")}) — sheet says ${f.teamA} vs ${f.teamB}; left untouched`, f.sourceRef);
          continue;
        }
      }
    } else {
      // racket round robin: match by pairing (+ start time when ambiguous)
      const want = pairingKey([f.teamA, f.teamB]);
      const cands = inDiv.filter((m) => pairingKey(m.slots.map((s) => s.teamName)) === want);
      if (cands.length === 1) match = cands[0];
      else if (cands.length > 1) {
        match = cands.find((m) => sameInstant(m.startsAt, f.startsAt)) ?? null;
        if (!match) {
          changes.push({ type: "unmatched", divisionId: div.id, description: `${div.name} ${f.teamA} vs ${f.teamB} — pairing is ambiguous in portal`, sourceRef: f.sourceRef });
          continue;
        }
      } else {
        changes.push({ type: "unmatched", divisionId: div.id, description: `${div.name} ${f.teamA} vs ${f.teamB} — pairing not in portal`, sourceRef: f.sourceRef });
        continue;
      }
    }

    // ----- schedule diff -----
    const timeDiff = f.startsAt !== null && !sameInstant(match.startsAt, f.startsAt);
    const venueDiff = f.venue !== null && normName(match.venueName ?? "") !== normName(f.venue);
    if (timeDiff || venueDiff) {
      if (match.status !== "scheduled") {
        skip(match.id, div.id, `schedule change in sheet but the match is ${match.status} in the portal — left untouched`, f.sourceRef);
      } else {
        changes.push({
          type: "schedule", matchId: match.id, divisionId: div.id,
          field: timeDiff ? "starts_at" : "venue",
          oldValue: timeDiff ? match.startsAt : match.venueName,
          newValue: timeDiff ? f.startsAt! : f.venue!,
          sourceRef: f.sourceRef,
          applyStartsAt: f.startsAt ?? match.startsAt ?? "",
          applyVenueName: f.venue ?? match.venueName,
        });
      }
    }

    // ----- result diff -----
    if (f.scorePairs && f.scorePairs.length) {
      if (div.scoringKind === "placement_only") {
        skip(match.id, div.id, "scores recorded on a placement division row — not applicable", f.sourceRef);
      } else if (match.status === "live") {
        skip(match.id, div.id, "sheet records a final but the match is LIVE in the portal — left untouched", f.sourceRef);
      } else if (match.status === "cancelled") {
        skip(match.id, div.id, "sheet records a final but the match is cancelled in the portal — left untouched", f.sourceRef);
      } else if (match.status === "final") {
        const same = div.scoringKind === "set_based"
          ? setsEqual(match.sets, f.scorePairs)
          : !!match.totals && match.totals[0] === f.scorePairs[0][0] && match.totals[1] === f.scorePairs[0][1];
        if (!same) skip(match.id, div.id, "sheet result disagrees with the portal's recorded final — left untouched (human review)", f.sourceRef);
      } else {
        // scheduled: applicable unless contestants unresolved or undecidable
        if (match.slots.some((s) => !s.entryId)) {
          skip(match.id, div.id, "sheet records a final but the portal fixture's contestants are not resolved yet — held", f.sourceRef);
        } else if (div.scoringKind === "set_based") {
          const needed = Math.floor((div.bestOf ?? 3) / 2) + 1;
          const wins = [0, 0];
          for (const [a, b] of f.scorePairs) { if (a > b) wins[0]++; else if (b > a) wins[1]++; }
          if (wins[0] < needed && wins[1] < needed) {
            skip(match.id, div.id, `recorded sets (${wins[0]}–${wins[1]}) do not decide the match yet — held`, f.sourceRef);
          } else if (f.winnerName && pairsWinner(f.scorePairs) !== null) {
            const wIdx = pairsWinner(f.scorePairs)!;
            const winnerTeam = match.slots[wIdx]?.teamName;
            if (winnerTeam && normName(winnerTeam) !== normName(f.winnerName)) {
              skip(match.id, div.id, `sheet Winner column (${f.winnerName}) contradicts the recorded scores — held for human review`, f.sourceRef);
            } else {
              changes.push({ type: "result", matchId: match.id, divisionId: div.id, fixture: f });
            }
          } else {
            changes.push({ type: "result", matchId: match.id, divisionId: div.id, fixture: f });
          }
        } else {
          changes.push({ type: "result", matchId: match.id, divisionId: div.id, fixture: f });
        }
      }
    }
  }

  // ---------- placements (from placement-matrix places) ----------
  const placedByDivision = new Map<string, { entry: (typeof sheet.entries)[number]; div: SyncDivision }[]>();
  for (const e of sheet.entries) {
    if (e.place === null) continue;
    const div = resolveDivision(db, e.sportSlug, e.divisionKey);
    if (!div || div.scoringKind !== "placement_only") continue;
    const arr = placedByDivision.get(div.id) ?? [];
    arr.push({ entry: e, div }); placedByDivision.set(div.id, arr);
  }
  for (const [divId, list] of placedByDivision) {
    const div = list[0].div;
    const match = db.matches.find((m) => m.divisionId === divId && (m.stage === "placement" || m.slots.length > 2));
    if (!match) continue;
    const placeByEntry = new Map<string, number>();
    let unresolved = 0;
    for (const { entry } of list) {
      const teamId = teamIdByName(db, entry.teamName);
      const ent = teamId ? db.entries.find((x) => x.divisionId === divId && x.teamId === teamId && x.active) : null;
      if (ent) placeByEntry.set(ent.id, entry.place!); else unresolved++;
    }
    const slotEntryIds = match.slots.map((s) => s.entryId).filter((x): x is string => !!x);
    const complete = unresolved === 0 && slotEntryIds.every((id) => placeByEntry.has(id));
    if (match.status === "live") {
      skip(match.id, divId, "placements recorded in the sheet but the event is LIVE in the portal — left untouched", list[0].entry.sourceRef, "placement");
    } else if (match.status === "final") {
      const same = match.placements.every((p) => p.entryId && placeByEntry.get(p.entryId) === p.place)
        && match.placements.length === placeByEntry.size;
      if (!same) skip(match.id, divId, "sheet placements disagree with the portal's recorded final — left untouched (human review)", list[0].entry.sourceRef, "placement");
    } else if (match.status === "scheduled") {
      if (!complete) {
        skip(match.id, divId, `partial placements in the sheet (${placeByEntry.size} of ${slotEntryIds.length} entrants placed) — held until complete`, list[0].entry.sourceRef, "placement");
      } else {
        changes.push({
          type: "placement", matchId: match.id, divisionId: divId,
          places: slotEntryIds.map((id) => ({ entryId: id, place: placeByEntry.get(id)! })),
          sourceRef: list[0].entry.sourceRef,
        });
      }
    }
  }

  // ---------- entries ----------
  for (const div of db.divisions) {
    if (!parsedSports.has(div.sportSlug)) continue; // tab failed/absent: never diff
    const sheetForDiv = sheet.entries.filter((e) => {
      const d = resolveDivision(db, e.sportSlug, e.divisionKey);
      return d?.id === div.id;
    });
    if (!sheetForDiv.length && div.scoringKind !== "placement_only") {
      // A tracker/racket tab that parsed but lists no entries for a division
      // it should cover is suspicious — hold entry sync for it entirely.
      // (Placement divisions always list their matrix, so they pass through.)
      const covered = sheet.entries.some((e) => e.sportSlug === div.sportSlug);
      if (covered) {
        skip(null, div.id, "sheet lists no entries for this division — entry sync held (possible sheet restructure)", null);
        continue;
      }
    }
    const sheetTeamIds = new Map<string, (typeof sheet.entries)[number]>();
    for (const e of sheetForDiv) {
      const tid = teamIdByName(db, e.teamName);
      if (!tid) {
        changes.push({ type: "unmatched", divisionId: div.id, description: `${div.name}: team "${e.teamName}" not in portal`, sourceRef: e.sourceRef });
        continue;
      }
      if (!sheetTeamIds.has(tid)) sheetTeamIds.set(tid, e);
    }
    const divGroups = db.groups.filter((g) => g.divisionId === div.id);
    const resolveGroup = (e: (typeof sheet.entries)[number]): string | null => {
      if (e.groupName) {
        return divGroups.find((g) => normName(g.name) === normName(e.groupName!))?.id ?? null;
      }
      return divGroups.length === 1 ? divGroups[0].id : null;
    };
    const playedTeamIds = new Set(
      db.matches.filter((m) => m.divisionId === div.id && (m.status === "live" || m.status === "final"))
        .flatMap((m) => m.slots.map((s) => s.entryId).filter(Boolean)
          .map((eid) => db.entries.find((x) => x.id === eid)?.teamId).filter(Boolean)),
    );
    /** Teams in ANY non-cancelled match of the division. The sheet's fixture
     *  lists schedule matches for teams its entry matrices sometimes omit
     *  (e.g. Pickleball 39-Girls plays a second round the matrix predates), so
     *  an entry with fixtures on the calendar is never withdrawn on matrix
     *  evidence alone — withdrawal requires zero fixtures. */
    const fixtureTeamIds = new Set(
      db.matches.filter((m) => m.divisionId === div.id && m.status !== "cancelled")
        .flatMap((m) => m.slots.map((s) => s.entryId).filter(Boolean)
          .map((eid) => db.entries.find((x) => x.id === eid)?.teamId).filter(Boolean)),
    );
    for (const [tid, e] of sheetTeamIds) {
      const existing = db.entries.find((x) => x.divisionId === div.id && x.teamId === tid);
      if (!existing) {
        changes.push({ type: "entry_add", divisionId: div.id, teamId: tid, teamName: teamNameById(db, tid) ?? e.teamName, groupId: resolveGroup(e), reactivateEntryId: null, sourceRef: e.sourceRef });
      } else if (!existing.active) {
        changes.push({ type: "entry_add", divisionId: div.id, teamId: tid, teamName: teamNameById(db, tid) ?? e.teamName, groupId: resolveGroup(e), reactivateEntryId: existing.id, sourceRef: e.sourceRef });
      } else if (e.groupName) {
        const wantGroup = resolveGroup(e);
        if (wantGroup && existing.groupId !== wantGroup) {
          if (playedTeamIds.has(tid)) {
            skip(null, div.id, `${teamNameById(db, tid) ?? e.teamName} moved groups in the sheet but already has played/live matches — group change held`, e.sourceRef);
          } else {
            changes.push({ type: "entry_group", divisionId: div.id, entryId: existing.id, teamName: teamNameById(db, tid) ?? e.teamName, groupId: wantGroup, sourceRef: e.sourceRef });
          }
        }
      }
    }
    for (const ent of db.entries.filter((x) => x.divisionId === div.id && x.active)) {
      if (sheetTeamIds.has(ent.teamId)) continue;
      const name = teamNameById(db, ent.teamId) ?? ent.teamId;
      if (db.confirmedDivisions.has(div.id)) {
        skip(null, div.id, `${name} is absent from the sheet but this division's awards are confirmed — entry left active`, null);
      } else if (fixtureTeamIds.has(ent.teamId)) {
        skip(null, div.id, `${name} is absent from the sheet's entry list but has fixtures in this division — entry left active`, null);
      } else {
        changes.push({ type: "entry_withdraw", divisionId: div.id, entryId: ent.id, teamName: name, sourceRef: null });
      }
    }
  }

  return { changes, okSports: parsedSports };
}

// ---------------- application ----------------

function logRowFor(change: PlannedChange, detail?: string): SyncLogRow {
  switch (change.type) {
    case "schedule":
      return { kind: "fixture_schedule", fixtureId: change.matchId, divisionId: change.divisionId, field: change.field, oldValue: change.oldValue, newValue: change.newValue, sourceRef: change.sourceRef, detail: detail ?? null };
    case "result":
      return { kind: "fixture_result", fixtureId: change.matchId, divisionId: change.divisionId, field: "result", oldValue: null, newValue: change.fixture.scorePairs?.map((p) => p.join("-")).join(", ") ?? null, sourceRef: change.fixture.sourceRef, detail: detail ?? "recorded final applied as UNCONFIRMED final (award drafts proposed; confirmation stays human)" };
    case "placement":
      return { kind: "placement", fixtureId: change.matchId, divisionId: change.divisionId, field: "placements", oldValue: null, newValue: change.places.map((p) => `${p.place}`).join(", "), sourceRef: change.sourceRef, detail: detail ?? "placements applied as UNCONFIRMED final" };
    case "entry_add":
      return { kind: "entry", fixtureId: null, divisionId: change.divisionId, field: "entry", oldValue: null, newValue: change.teamName, sourceRef: change.sourceRef, detail: detail ?? (change.reactivateEntryId ? "entry reactivated (was withdrawn)" : "entry added from sheet") };
    case "entry_withdraw":
      return { kind: "entry", fixtureId: null, divisionId: change.divisionId, field: "entry", oldValue: change.teamName, newValue: null, sourceRef: change.sourceRef, detail: detail ?? "entry withdrawn (absent from sheet)" };
    case "entry_group":
      return { kind: "entry", fixtureId: null, divisionId: change.divisionId, field: "group", oldValue: null, newValue: change.teamName, sourceRef: change.sourceRef, detail: detail ?? "group updated from sheet" };
    case "conflict_skip":
      return { kind: change.logKind ?? "conflict_skip", fixtureId: change.matchId, divisionId: change.divisionId, field: null, oldValue: null, newValue: null, sourceRef: change.sourceRef, detail: change.reason };
    case "unmatched":
      return { kind: "unmatched", fixtureId: null, divisionId: change.divisionId, field: null, oldValue: null, newValue: null, sourceRef: change.sourceRef, detail: change.description };
  }
}

export async function applyChange(store: SyncStore, change: PlannedChange, db: SyncDbState): Promise<void> {
  switch (change.type) {
    case "schedule": {
      const match = db.matches.find((m) => m.id === change.matchId);
      if (!match) throw new Error("match vanished before apply");
      if (!change.applyStartsAt) throw new Error("no start time to apply");
      const venueName = change.applyVenueName;
      const venue = venueName ? db.venues.find((v) => normName(v.name) === normName(venueName)) : null;
      const res = await store.updateFixtureSchedule(change.matchId, {
        startsAt: change.applyStartsAt,
        durationMinutes: match.durationMinutes,
        venueId: venue?.id ?? null,
        venueText: venue ? null : venueName ?? null,
      });
      if (res.status === "warning") throw new Error("MAJOR player conflict — schedule change needs a human acknowledgement in the console");
      return;
    }
    case "result": {
      const f = change.fixture;
      const div = db.divisions.find((d) => d.id === change.divisionId);
      let m = await store.getMatch(change.matchId);
      if (!m) throw new Error("match vanished before apply");
      if (m.status !== "scheduled") throw new Error(`match is ${m.status} now — result not applied`);
      const live = await store.setMatchStatus(change.matchId, "live");
      let payload: Parameters<SyncStore["saveScore"]>[2];
      if (div?.scoringKind === "set_based") {
        payload = {
          segments: (f.scorePairs ?? []).map((p, i) => ({
            segmentNo: i + 1, kind: "set" as const, status: "closed" as const,
            scores: { 1: p[0], 2: p[1] },
          })),
          totals: null, placements: null,
        };
      } else {
        const t = f.scorePairs![0];
        payload = { segments: [], totals: { 1: t[0], 2: t[1] }, placements: null };
      }
      const saved = await store.saveScore(change.matchId, live.revision, payload);
      void saved;
      const tie = div?.scoringKind !== "set_based" && f.scorePairs![0][0] === f.scorePairs![0][1];
      await store.setMatchStatus(change.matchId, "final", tie ? { outcome: "draw" } : undefined);
      return;
    }
    case "placement": {
      let m = await store.getMatch(change.matchId);
      if (!m) throw new Error("match vanished before apply");
      if (m.status !== "scheduled") throw new Error(`event is ${m.status} now — placements not applied`);
      const live = await store.setMatchStatus(change.matchId, "live");
      const placements = m.slots.map((s, i) => {
        const found = change.places.find((p) => p.entryId === s.entryId);
        return { slotNo: i + 1, place: found?.place ?? null, finish: "finished" };
      });
      await store.saveScore(change.matchId, live.revision, { segments: [], totals: null, placements });
      await store.setMatchStatus(change.matchId, "final");
      return;
    }
    case "entry_add": {
      if (change.reactivateEntryId) await store.setEntryActive(change.reactivateEntryId, true);
      else await store.addEntry(change.divisionId, change.teamId, change.groupId);
      return;
    }
    case "entry_withdraw":
      await store.setEntryActive(change.entryId, false);
      return;
    case "entry_group":
      await store.setEntryGroup(change.entryId, change.groupId);
      return;
    default:
      return; // conflict_skip / unmatched carry no write
  }
}

// ---------------- run orchestration ----------------

export interface ParsedTab extends TabData { state?: SheetState }

export async function runSheetSync(deps: {
  tabs: ParsedTab[];
  store: SyncStore;
  runId: string;
  now?: () => Date;
}): Promise<SyncRunResult> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const { store, runId } = deps;
  const rows: SyncLogRow[] = [];
  const perTab: TabOutcome[] = [];
  const sheet: SheetState = { fixtures: [], entries: [], warnings: [] };
  const parsedSports = new Set<string>();

  for (const tab of deps.tabs) {
    if (tab.error || !tab.state) {
      perTab.push({ tab: tab.name, status: "failed", fixtures: 0, entries: 0, error: tab.error ?? "not fetched" });
      continue;
    }
    perTab.push({ tab: tab.name, status: "ok", fixtures: tab.state.fixtures.length, entries: tab.state.entries.length });
    if (tab.sportSlug) parsedSports.add(tab.sportSlug);
    sheet.fixtures.push(...tab.state.fixtures);
    sheet.entries.push(...tab.state.entries);
    sheet.warnings.push(...tab.state.warnings);
  }

  const db = await store.getState();
  const { changes } = planChanges(sheet, db, parsedSports);

  let applied = 0, skipped = 0, failed = 0, unmatched = 0;
  const order = { schedule: 0, result: 1, placement: 2, entry_add: 3, entry_group: 4, entry_withdraw: 5, conflict_skip: 6, unmatched: 7 } as const;
  const sorted = [...changes].sort((a, b) => order[a.type] - order[b.type]);
  for (const change of sorted) {
    if (change.type === "conflict_skip") { skipped++; rows.push(logRowFor(change)); continue; }
    if (change.type === "unmatched") { unmatched++; rows.push(logRowFor(change)); continue; }
    try {
      await applyChange(store, change, db);
      applied++;
      rows.push(logRowFor(change));
    } catch (e) {
      failed++;
      rows.push(logRowFor(change, `FAILED: ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  const summary: SyncLogRow = {
    kind: "run_summary", fixtureId: null, divisionId: null, field: null,
    oldValue: null, newValue: null, sourceRef: null,
    detail: `applied=${applied} skipped=${skipped} failed=${failed} unmatched=${unmatched} tabs_ok=${perTab.filter((t) => t.status === "ok").length}/${perTab.length}`,
  };
  rows.push(summary);
  const logPersisted = await store.writeLog(runId, rows).catch(() => false);
  return {
    runId, startedAt, finishedAt: now().toISOString(),
    applied, skipped, failed, unmatched, logPersisted, perTab, changes: rows,
  };
}
