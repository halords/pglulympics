import { describe, expect, it } from "vitest";
import { runSheetSync, type ParsedTab } from "./engine";
import type {
  SheetFixture, SyncDbState, SyncLogRow, SyncMatch, SyncStore,
} from "./types";

// ---------------- in-memory store with RPC-equivalent rules ----------------

interface FakeMatch extends SyncMatch { winnerName?: string | null }

class FakeStore implements SyncStore {
  matches = new Map<string, FakeMatch>();
  entries: SyncDbState["entries"];
  logAvailable = true;
  logRows: (SyncLogRow & { runId: string })[] = [];
  scheduleWarning = false;

  constructor(public db: SyncDbState) {
    for (const m of db.matches) this.matches.set(m.id, { ...m });
    this.entries = db.entries.map((e) => ({ ...e }));
  }
  async getState(): Promise<SyncDbState> {
    return {
      ...this.db,
      matches: [...this.matches.values()].map((m) => ({ ...m })),
      entries: this.entries.map((e) => ({ ...e })),
    };
  }
  async getMatch(id: string) { const m = this.matches.get(id); return m ? { ...m } : null; }
  async updateFixtureSchedule(id: string, input: { startsAt: string; durationMinutes: number | null; venueId: string | null; venueText: string | null }) {
    if (this.scheduleWarning) return { status: "warning" as const };
    const m = this.matches.get(id)!;
    m.startsAt = input.startsAt;
    m.venueName = input.venueText ?? this.db.venues.find((v) => v.id === input.venueId)?.name ?? m.venueName;
    m.venueId = input.venueId;
    m.revision++;
    return { status: "ok" as const };
  }
  async saveScore(id: string, expectedRevision: number, payload: Parameters<SyncStore["saveScore"]>[2]) {
    const m = this.matches.get(id)!;
    if (m.revision !== expectedRevision) throw new Error(`stale revision: server is at ${m.revision}`);
    if (m.status !== "live" && m.status !== "scheduled") throw new Error("scores can only be edited before final");
    m.sets = payload.segments.map((sg) => ({ points: [sg.scores[1] ?? 0, sg.scores[2] ?? 0] as [number, number] }));
    if (payload.totals) m.totals = [payload.totals[1] ?? 0, payload.totals[2] ?? 0];
    if (payload.placements) {
      m.placements = payload.placements.map((p, i) => ({ entryId: m.slots[i]?.entryId ?? null, place: p.place ?? null }));
    }
    m.revision++;
    return { revision: m.revision };
  }
  async setMatchStatus(id: string, status: "live" | "final", opts?: { outcome?: string }) {
    const m = this.matches.get(id)!;
    const div = this.db.divisions.find((d) => d.id === m.divisionId)!;
    if (status === "live") {
      if (m.status !== "scheduled") throw new Error("only a scheduled match can start");
      if (div.scoringKind !== "placement_only" && m.slots.some((s) => !s.entryId)) throw new Error("both contestants must be resolved before starting");
      m.status = "live";
    } else {
      if (m.status !== "live") throw new Error("only a live match can be finalized");
      if (div.scoringKind === "placement_only") {
        if (m.slots.some((s) => s.entryId && !m.placements.some((p) => p.entryId === s.entryId && p.place !== null))) {
          throw new Error("every entrant needs a placement result before final");
        }
      } else if (div.scoringKind === "set_based") {
        const needed = Math.floor((div.bestOf ?? 3) / 2) + 1;
        const wins = [0, 0];
        for (const sgm of m.sets) { if (sgm.points[0] > sgm.points[1]) wins[0]++; else if (sgm.points[1] > sgm.points[0]) wins[1]++; }
        if (wins[0] < needed && wins[1] < needed) throw new Error("no winner determined by the current scores");
        m.winnerEntryId = m.slots[wins[0] > wins[1] ? 0 : 1].entryId;
      } else {
        const t = m.totals ?? [0, 0];
        if (t[0] === t[1] && opts?.outcome !== "draw") throw new Error("scores are tied; pass outcome=draw if draws are allowed");
        m.winnerEntryId = t[0] === t[1] ? null : m.slots[t[0] > t[1] ? 0 : 1].entryId;
      }
      m.status = "final";
    }
    m.revision++;
    return { revision: m.revision };
  }
  async addEntry(divisionId: string, teamId: string, groupId: string | null) {
    const entryId = `entry:${divisionId}:${teamId}`;
    this.entries.push({ id: entryId, divisionId, teamId, groupId, active: true });
    return { entryId };
  }
  async setEntryActive(entryId: string, active: boolean) {
    const e = this.entries.find((x) => x.id === entryId)!;
    e.active = active;
  }
  async setEntryGroup(entryId: string, groupId: string | null) {
    const e = this.entries.find((x) => x.id === entryId)!;
    e.groupId = groupId;
  }
  async writeLog(runId: string, rows: SyncLogRow[]) {
    if (!this.logAvailable) return false;
    this.logRows.push(...rows.map((r) => ({ ...r, runId })));
    return true;
  }
  async readLog() { return null; }
}

// ---------------- world builders ----------------

const T = (id: string, name: string) => ({ id, name });
const TEAMS = [T("t1", "CODE RED"), T("t2", "THE CODE BLUES"), T("t3", "ECO-AGKAYSA"), T("t4", "Agkaysa FOURce")];
const ent = (id: string, divisionId: string, teamId: string, groupId: string | null = null, active = true) =>
  ({ id, divisionId, teamId, groupId, active });
const match = (partial: Partial<SyncMatch> & { id: string; divisionId: string; label: string }): SyncMatch => ({
  stage: "round_robin", status: "scheduled", startsAt: null, durationMinutes: 60,
  venueId: null, venueName: null, slots: [], sets: [], totals: null, placements: [],
  winnerEntryId: null, revision: 0, ...partial,
});
const slot = (entryId: string, teamName: string) => ({ entryId, teamName });

function baseDb(): SyncDbState {
  return {
    divisions: [
      { id: "dv", sportId: "sv", sportSlug: "volleyball", name: "Men's", slug: "mens", scoringKind: "set_based", bestOf: 3 },
      { id: "db", sportId: "sb", sportSlug: "basketball", name: "Men's", slug: "mens", scoringKind: "simple", bestOf: null },
      { id: "dbo", sportId: "sbo", sportSlug: "bowling", name: "Executive Mixed", slug: "executive-mixed", scoringKind: "placement_only", bestOf: null },
      { id: "dbo2", sportId: "sbo", sportSlug: "bowling", name: "40 Mixed", slug: "40-mixed", scoringKind: "placement_only", bestOf: null },
    ],
    teams: TEAMS,
    groups: [],
    venues: [{ id: "v1", name: "DMMMSU Covered Court" }],
    entries: [
      ent("e1", "dv", "t1"), ent("e2", "dv", "t2"), ent("e3", "dv", "t3"),
      ent("e4", "db", "t1"), ent("e5", "db", "t2"), ent("e6", "db", "t3"),
      ent("e7", "dbo", "t1"), ent("e8", "dbo", "t2"), ent("e9", "dbo", "t3"),
      ent("e10", "dbo2", "t1"), ent("e11", "dbo2", "t2"),
      ent("e12", "dv", "t4"), // Agkaysa FOURce in volleyball: no matches — clean withdraw candidate
    ],
    matches: [
      match({ id: "m-vb1", divisionId: "dv", label: "1", startsAt: "2026-11-09T13:00:00+08:00", venueName: "DMMMSU Covered Court", slots: [slot("e1", "CODE RED"), slot("e2", "THE CODE BLUES")] }),
      match({ id: "m-vb2", divisionId: "dv", label: "2", status: "live", startsAt: "2026-11-09T14:00:00+08:00", slots: [slot("e1", "CODE RED"), slot("e3", "ECO-AGKAYSA")] }),
      match({ id: "m-bb1", divisionId: "db", label: "Match 1", status: "final", totals: [80, 70], winnerEntryId: "e4", slots: [slot("e4", "CODE RED"), slot("e5", "THE CODE BLUES")] }),
      match({ id: "m-bb2", divisionId: "db", label: "Match 2", status: "final", totals: [60, 55], winnerEntryId: "e4", slots: [slot("e4", "CODE RED"), slot("e6", "ECO-AGKAYSA")] }),
      match({ id: "m-bb3", divisionId: "db", label: "Match 3", status: "scheduled", slots: [slot("e5", "THE CODE BLUES"), slot("e6", "ECO-AGKAYSA")] }),
      match({ id: "m-bo1", divisionId: "dbo", label: "Executive Mixed", stage: "placement", slots: [slot("e7", "CODE RED"), slot("e8", "THE CODE BLUES"), slot("e9", "ECO-AGKAYSA")] }),
      match({ id: "m-bo2", divisionId: "dbo2", label: "40 Mixed", stage: "placement", slots: [slot("e10", "CODE RED"), slot("e11", "THE CODE BLUES")] }),
    ],
    confirmedDivisions: new Set<string>(),
  };
}

const fx = (partial: Partial<SheetFixture>): SheetFixture => ({
  sportSlug: "volleyball", divisionKey: "mens", label: null, stage: "round_robin",
  teamA: null, teamB: null, startsAt: null, venue: null, scorePairs: null,
  winnerName: null, sourceRef: "Volleyball · row 5", ...partial,
});
const sheetEntry = (sportSlug: string, divisionKey: string, teamName: string, place: number | null = null, groupName: string | null = null) =>
  ({ sportSlug, divisionKey, teamName, groupName, place, sourceRef: "Sheet · row 3" });

function tabsFor(state: { fixtures: SheetFixture[]; entries: ReturnType<typeof sheetEntry>[]; warnings?: string[] }): ParsedTab[] {
  return [
    { name: "Volleyball", sportSlug: "volleyball", state: { fixtures: state.fixtures.filter((f) => f.sportSlug === "volleyball"), entries: state.entries.filter((e) => e.sportSlug === "volleyball"), warnings: [] } },
    { name: "Basketball", sportSlug: "basketball", state: { fixtures: state.fixtures.filter((f) => f.sportSlug === "basketball"), entries: state.entries.filter((e) => e.sportSlug === "basketball"), warnings: [] } },
    { name: "Bowling", sportSlug: "bowling", state: { fixtures: [], entries: state.entries.filter((e) => e.sportSlug === "bowling"), warnings: [] } },
  ];
}
const ALL_ENTRIES = [
  sheetEntry("volleyball", "mens", "CODE RED"), sheetEntry("volleyball", "mens", "THE CODE BLUES"), sheetEntry("volleyball", "mens", "ECO-AGKAYSA"),
  sheetEntry("volleyball", "mens", "Agkaysa FOURce"),
  sheetEntry("basketball", "mens", "CODE RED"), sheetEntry("basketball", "mens", "THE CODE BLUES"), sheetEntry("basketball", "mens", "ECO-AGKAYSA"),
  sheetEntry("bowling", "executive-mixed", "CODE RED"), sheetEntry("bowling", "executive-mixed", "THE CODE BLUES"), sheetEntry("bowling", "executive-mixed", "ECO-AGKAYSA"),
  sheetEntry("bowling", "40-mixed", "CODE RED"), sheetEntry("bowling", "40-mixed", "THE CODE BLUES"),
];

describe("runSheetSync", () => {
  it("applies a schedule move and an unconfirmed final from recorded sets", async () => {
    const store = new FakeStore(baseDb());
    const tabs = tabsFor({
      fixtures: [fx({ label: "1", teamA: "CODE RED", teamB: "THE CODE BLUES", startsAt: "2026-11-09T15:00:00+08:00", venue: "DMMMSU Covered Court", scorePairs: [[25, 20], [25, 22]], winnerName: "CODE RED" })],
      entries: ALL_ENTRIES,
    });
    const res = await runSheetSync({ tabs, store, runId: "r1" });
    const m = store.matches.get("m-vb1")!;
    expect(m.startsAt).toBe("2026-11-09T15:00:00+08:00");
    expect(m.status).toBe("final");
    expect(m.winnerEntryId).toBe("e1");
    expect(res.applied).toBe(2); // schedule + result
    expect(res.failed).toBe(0);
    expect(res.logPersisted).toBe(true);
    expect(store.logRows.some((r) => r.kind === "fixture_result")).toBe(true);
  });

  it("protects LIVE matches: schedule + result become conflict skips, nothing is written", async () => {
    const store = new FakeStore(baseDb());
    const tabs = tabsFor({
      fixtures: [fx({ label: "2", teamA: "CODE RED", teamB: "ECO-AGKAYSA", startsAt: "2026-11-09T16:00:00+08:00", scorePairs: [[25, 20], [25, 22]] })],
      entries: ALL_ENTRIES,
    });
    const res = await runSheetSync({ tabs, store, runId: "r2" });
    const m = store.matches.get("m-vb2")!;
    expect(m.status).toBe("live");
    expect(m.startsAt).toBe("2026-11-09T14:00:00+08:00");
    expect(res.applied).toBe(0);
    expect(res.skipped).toBe(2);
  });

  it("protects portal finals: disagreement skips, identical sheet result is a no-op", async () => {
    const store = new FakeStore(baseDb());
    const tabs = tabsFor({
      fixtures: [
        fx({ sportSlug: "basketball", label: "Match 1", teamA: "CODE RED", teamB: "THE CODE BLUES", scorePairs: [[90, 70]] }),
        fx({ sportSlug: "basketball", label: "Match 2", teamA: "CODE RED", teamB: "ECO-AGKAYSA", scorePairs: [[60, 55]] }),
        fx({ sportSlug: "basketball", label: "Match 3", teamA: "THE CODE BLUES", teamB: "ECO-AGKAYSA", scorePairs: [[88, 80]] }),
      ],
      entries: ALL_ENTRIES,
    });
    const res = await runSheetSync({ tabs, store, runId: "r3" });
    expect(store.matches.get("m-bb1")!.totals).toEqual([80, 70]); // untouched
    expect(store.matches.get("m-bb3")!.status).toBe("final"); // scheduled one applied
    expect(store.matches.get("m-bb3")!.winnerEntryId).toBe("e5");
    expect(res.skipped).toBe(1); // only the disagreeing final
    expect(res.applied).toBe(1);
  });

  it("holds undecided set scores and winner-contradicting results", async () => {
    const store = new FakeStore(baseDb());
    const tabs = tabsFor({
      fixtures: [
        fx({ label: "1", teamA: "CODE RED", teamB: "THE CODE BLUES", scorePairs: [[25, 20], [20, 25]] }), // 1-1, undecided
      ],
      entries: ALL_ENTRIES,
    });
    const res = await runSheetSync({ tabs, store, runId: "r4" });
    expect(store.matches.get("m-vb1")!.status).toBe("scheduled");
    expect(res.skipped).toBe(1);
    expect(res.applied).toBe(0);
  });

  it("applies complete placements and holds partial ones", async () => {
    const store = new FakeStore(baseDb());
    const entries = [
      ...ALL_ENTRIES.filter((e) => e.sportSlug !== "bowling"),
      sheetEntry("bowling", "executive-mixed", "CODE RED", 2),
      sheetEntry("bowling", "executive-mixed", "THE CODE BLUES", 1),
      sheetEntry("bowling", "executive-mixed", "ECO-AGKAYSA", 3),
      sheetEntry("bowling", "40-mixed", "CODE RED", 1), // partial: t2 unplaced
      sheetEntry("bowling", "40-mixed", "THE CODE BLUES"),
    ];
    const res = await runSheetSync({ tabs: tabsFor({ fixtures: [], entries }), store, runId: "r5" });
    const bo1 = store.matches.get("m-bo1")!;
    expect(bo1.status).toBe("final");
    expect(bo1.placements.find((p) => p.entryId === "e8")!.place).toBe(1);
    expect(store.matches.get("m-bo2")!.status).toBe("scheduled");
    expect(res.applied).toBe(1);
    expect(res.changes.some((c) => c.kind === "placement" && /partial/.test(c.detail ?? ""))).toBe(true);
  });

  it("adds and withdraws entries; teams with played/live matches are protected", async () => {
    const store = new FakeStore(baseDb());
    // Sheet drops: Agkaysa FOURce from volleyball (no matches → withdraw),
    // ECO-AGKAYSA from basketball (has a final → protected) and from
    // volleyball (on a LIVE match → also protected).
    const entries = ALL_ENTRIES
      .filter((e) => !(e.sportSlug === "basketball" && e.teamName === "ECO-AGKAYSA"))
      .filter((e) => !(e.sportSlug === "volleyball" && e.teamName === "ECO-AGKAYSA"))
      .filter((e) => !(e.sportSlug === "volleyball" && e.teamName === "Agkaysa FOURce"));
    entries.push(sheetEntry("basketball", "mens", "Agkaysa FOURce")); // new entry
    const res = await runSheetSync({ tabs: tabsFor({ fixtures: [], entries }), store, runId: "r6" });
    expect(store.entries.find((e) => e.id === "e12")!.active).toBe(false); // withdrawn
    expect(store.entries.find((e) => e.id === "e6")!.active).toBe(true); // protected (final)
    expect(store.entries.find((e) => e.id === "e3")!.active).toBe(true); // protected (live)
    expect(store.entries.some((e) => e.divisionId === "db" && e.teamId === "t4" && e.active)).toBe(true); // added
    expect(res.applied).toBe(2);
    expect(res.skipped).toBe(2);
  });

  it("holds withdrawal for a team whose only matches are still scheduled (sheet matrices can lag fixture lists)", async () => {
    const store = new FakeStore(baseDb());
    // THE CODE BLUES is in volleyball only via the scheduled m-vb1 — the sheet
    // dropping it from the matrix must NOT withdraw the entry.
    const entries = ALL_ENTRIES.filter((e) => !(e.sportSlug === "volleyball" && e.teamName === "THE CODE BLUES"));
    const res = await runSheetSync({ tabs: tabsFor({ fixtures: [], entries }), store, runId: "r6b" });
    expect(store.entries.find((e) => e.id === "e2")!.active).toBe(true);
    expect(res.applied).toBe(0);
    expect(res.skipped).toBe(1);
  });

  it("counts unmatched sheet fixtures instead of inserting them", async () => {
    const store = new FakeStore(baseDb());
    const tabs = tabsFor({ fixtures: [fx({ label: "99", teamA: "CODE RED", teamB: "THE CODE BLUES", scorePairs: [[25, 20], [25, 22]] })], entries: ALL_ENTRIES });
    const res = await runSheetSync({ tabs, store, runId: "r7" });
    expect(res.unmatched).toBe(1);
    expect(res.applied).toBe(0);
    expect(store.matches.size).toBe(7);
  });

  it("is idempotent: a second identical run applies nothing", async () => {
    const store = new FakeStore(baseDb());
    const makeTabs = () => tabsFor({
      fixtures: [fx({ label: "1", teamA: "CODE RED", teamB: "THE CODE BLUES", startsAt: "2026-11-09T15:00:00+08:00", venue: "DMMMSU Covered Court", scorePairs: [[25, 20], [25, 22]] })],
      entries: ALL_ENTRIES,
    });
    const first = await runSheetSync({ tabs: makeTabs(), store, runId: "r8a" });
    expect(first.applied).toBeGreaterThan(0);
    const second = await runSheetSync({ tabs: makeTabs(), store, runId: "r8b" });
    expect(second.applied).toBe(0);
    expect(second.failed).toBe(0);
  });

  it("degrades gracefully when the log table is missing: changes still apply, log stays in the response", async () => {
    const store = new FakeStore(baseDb());
    store.logAvailable = false;
    const tabs = tabsFor({
      fixtures: [fx({ label: "1", teamA: "CODE RED", teamB: "THE CODE BLUES", scorePairs: [[25, 20], [25, 22]] })],
      entries: ALL_ENTRIES,
    });
    const res = await runSheetSync({ tabs, store, runId: "r9" });
    expect(res.logPersisted).toBe(false);
    expect(res.applied).toBe(1);
    expect(store.matches.get("m-vb1")!.status).toBe("final");
    expect(res.changes.length).toBeGreaterThan(0);
  });

  it("a failed tab contributes nothing — its divisions' entries are never withdrawn", async () => {
    const store = new FakeStore(baseDb());
    const tabs: ParsedTab[] = [
      { name: "Volleyball", sportSlug: "volleyball", state: { fixtures: [], entries: ALL_ENTRIES.filter((e) => e.sportSlug === "volleyball"), warnings: [] } },
      { name: "Basketball", sportSlug: "basketball", error: "HTTP 500" },
      { name: "Bowling", sportSlug: "bowling", state: { fixtures: [], entries: ALL_ENTRIES.filter((e) => e.sportSlug === "bowling"), warnings: [] } },
    ];
    const res = await runSheetSync({ tabs, store, runId: "r10" });
    expect(res.perTab.find((t) => t.tab === "Basketball")!.status).toBe("failed");
    expect(store.entries.filter((e) => e.divisionId === "db").every((e) => e.active)).toBe(true);
    expect(res.applied).toBe(0);
  });

  it("turns an RPC conflict warning on a schedule move into a failed change (never self-acknowledges)", async () => {
    const store = new FakeStore(baseDb());
    store.scheduleWarning = true;
    const tabs = tabsFor({
      fixtures: [fx({ label: "1", teamA: "CODE RED", teamB: "THE CODE BLUES", startsAt: "2026-11-09T18:00:00+08:00" })],
      entries: ALL_ENTRIES,
    });
    const res = await runSheetSync({ tabs, store, runId: "r11" });
    expect(res.failed).toBe(1);
    expect(store.matches.get("m-vb1")!.startsAt).toBe("2026-11-09T13:00:00+08:00");
  });
});
