// Sheet sync — shared types (SPEC addendum 2026-11-08).
// The engine pulls the organizers' source workbook ("Game Tracker PGLU
// Olympics.xlsx", the same sheet the seed was extracted from) and folds its
// schedule / recorded-result / entry changes into the portal database.
// Design rules (binding): the sheet NEVER overwrites a live match or a
// confirmed result; sheet finals land as UNCONFIRMED finals (award drafts
// stay human-confirmed); unmatched sheet rows are logged, never inserted.

export const SHEET_ID = "1I9JwRto0iLZZ3sLYN9Qaw9nUpm_JfTya";

/** Tabs in workbook order: name (gviz fallback) + gid (CSV export primary). */
export const SHEET_TABS = [
  { name: "SUM", gid: "2096581143", sportSlug: null },
  { name: "Basketball", gid: "189028619", sportSlug: "basketball" },
  { name: "Volleyball", gid: "1301000070", sportSlug: "volleyball" },
  { name: "Bowling", gid: "1667625131", sportSlug: "bowling" },
  { name: "Pickle Ball", gid: "2085680548", sportSlug: "pickleball" },
  { name: "Badminton", gid: "590501769", sportSlug: "badminton" },
  { name: "Athletics", gid: "1234658953", sportSlug: "athletics" },
  { name: "Mobile Games", gid: "802742828", sportSlug: "mobile-games" },
  { name: "Chess", gid: "1942970214", sportSlug: "chess" },
  { name: "Laro ng Lahi", gid: "165154871", sportSlug: "laro-ng-lahi" },
] as const;

export type SheetTabName = (typeof SHEET_TABS)[number]["name"];

/** A raw tab grid: rows of trimmed cell strings (CSV/gviz formatted values). */
export type Grid = string[][];

// ---------------- parsed sheet state ----------------

export interface SheetFixture {
  sportSlug: string;
  /** Sheet-side division key: division slug when derivable ("mens",
   *  "40-boys", "ml"); resolved against the DB snapshot by the engine. */
  divisionKey: string;
  /** DB-comparable label ("1", "Match 12", "Semifinal 1", "Championship").
   *  Null for racket round-robin rows — the sheet gives them no per-match
   *  number (its "Match #" column holds the category), so they match by
   *  pairing + start time instead. */
  label: string | null;
  stage: "round_robin" | "semifinal" | "bronze" | "gold" | null;
  teamA: string | null; // display name as written (normalized at match time)
  teamB: string | null;
  startsAt: string | null; // ISO instant (Asia/Manila offset)
  venue: string | null;
  /** Recorded SCORES column pairs, in order. The engine maps them by
   *  scoring kind: set_based → per-set segments; simple → totals (first
   *  pair). Racket tabs have NO score columns (documented) → always null. */
  scorePairs: [number, number][] | null;
  /** Winner as recorded in the sheet's Winner column (corroboration only —
   *  a result is only ever applied from recorded scores). */
  winnerName: string | null;
  sourceRef: string; // "Volleyball · row 14"
}

export interface SheetEntry {
  sportSlug: string;
  divisionKey: string;
  teamName: string;
  groupName: string | null; // tracker standings brackets; null elsewhere
  /** Placement finish recorded in a placement matrix (1 = champion).
   *  Only set when the division's matrix has flipped to places (see
   *  parse.ts) — a bare "1" cell means "entered", not "champion". */
  place: number | null;
  sourceRef: string;
}

export interface SheetState {
  fixtures: SheetFixture[];
  entries: SheetEntry[];
  warnings: string[];
}

// ---------------- DB read model (store) ----------------

export interface SyncDivision {
  id: string; sportId: string; sportSlug: string; name: string; slug: string;
  scoringKind: "set_based" | "simple" | "placement_only";
  /** scoring_config.best_of for set_based divisions (null → assume 3). */
  bestOf: number | null;
}
export interface SyncTeam { id: string; name: string }
export interface SyncGroup { id: string; divisionId: string; name: string }
export interface SyncVenue { id: string; name: string }
export interface SyncEntry {
  id: string; divisionId: string; teamId: string; groupId: string | null; active: boolean;
}
export interface SyncMatch {
  id: string; divisionId: string; label: string;
  stage: string; status: "scheduled" | "live" | "final" | "cancelled";
  startsAt: string | null; durationMinutes: number | null;
  venueId: string | null; venueName: string | null; // effective display name
  /** Resolved slot contestants, slot order: entry id + team name. */
  slots: { entryId: string | null; teamName: string | null }[];
  sets: { points: [number, number] }[]; // closed segments in order
  totals: [number, number] | null;
  placements: { entryId: string | null; place: number | null }[];
  winnerEntryId: string | null;
  revision: number;
}
export interface SyncDbState {
  divisions: SyncDivision[];
  teams: SyncTeam[];
  groups: SyncGroup[];
  venues: SyncVenue[];
  entries: SyncEntry[];
  matches: SyncMatch[];
  /** divisionId -> has at least one CONFIRMED award (division_results). */
  confirmedDivisions: Set<string>;
}

// ---------------- change + log model ----------------

export type SyncLogKind =
  | "fixture_schedule" | "fixture_result" | "placement" | "entry"
  | "conflict_skip" | "unmatched" | "run_summary";

export interface SyncLogRow {
  kind: SyncLogKind;
  fixtureId: string | null;
  divisionId: string | null;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  sourceRef: string | null;
  detail: string | null;
}

export type PlannedChange =
  | { type: "schedule"; matchId: string; divisionId: string; field: "starts_at" | "venue"; oldValue: string | null; newValue: string; sourceRef: string; applyStartsAt: string; applyVenueName: string | null }
  | { type: "result"; matchId: string; divisionId: string; fixture: SheetFixture }
  | { type: "placement"; matchId: string; divisionId: string; places: { entryId: string; place: number }[]; sourceRef: string }
  | { type: "entry_add"; divisionId: string; teamId: string; teamName: string; groupId: string | null; reactivateEntryId: string | null; sourceRef: string }
  | { type: "entry_group"; divisionId: string; entryId: string; teamName: string; groupId: string; sourceRef: string }
  | { type: "entry_withdraw"; divisionId: string; entryId: string; teamName: string; sourceRef: string | null }
  | { type: "conflict_skip"; matchId: string | null; divisionId: string | null; reason: string; sourceRef: string | null; logKind?: "conflict_skip" | "placement" }
  | { type: "unmatched"; divisionId: string | null; description: string; sourceRef: string };

export interface TabOutcome {
  tab: string;
  status: "ok" | "failed";
  fixtures: number;
  entries: number;
  error?: string;
}

export interface SyncRunResult {
  runId: string;
  startedAt: string;
  finishedAt: string;
  applied: number;
  skipped: number; // conflict_skips (protected / disagreements)
  failed: number; // changes that errored while applying
  unmatched: number;
  logPersisted: boolean; // false when sheet_sync_log is missing (pre-migration-11)
  perTab: TabOutcome[];
  changes: SyncLogRow[]; // in-memory copy of the run's log (always complete)
}

// ---------------- store contract ----------------

/** Everything the engine needs from the database. The live implementation
 *  (store.ts) is service-role only; tests drive an in-memory fake with the
 *  same transition rules as the SQL RPCs. */
export interface SyncStore {
  getState(): Promise<SyncDbState>;
  getMatch(matchId: string): Promise<SyncMatch | null>;
  /** Mirrors update_fixture RPC: {status:"warning"} when the move creates a
   *  MAJOR (player) conflict — sync never acknowledges on a human's behalf. */
  updateFixtureSchedule(matchId: string, input: {
    startsAt: string; durationMinutes: number | null;
    venueId: string | null; venueText: string | null;
  }): Promise<{ status: "ok" } | { status: "warning" }>;
  saveScore(matchId: string, expectedRevision: number, payload: {
    segments: { segmentNo: number; kind: "set" | "period"; status: "open" | "closed"; scores: Record<number, number> }[];
    totals?: Record<number, number> | null;
    placements?: { slotNo: number; place?: number | null; finish: string }[] | null;
  }): Promise<{ revision: number }>;
  setMatchStatus(matchId: string, status: "live" | "final", opts?: { outcome?: string }): Promise<{ revision: number }>;
  addEntry(divisionId: string, teamId: string, groupId: string | null): Promise<{ entryId: string }>;
  setEntryActive(entryId: string, active: boolean): Promise<void>;
  setEntryGroup(entryId: string, groupId: string | null): Promise<void>;
  /** Best-effort persistence of the run log. Returns false when the
   *  sheet_sync_log table is not there yet (migration 11 pending) — the run
   *  still applies its changes; the log lives in the response only. */
  writeLog(runId: string, rows: SyncLogRow[]): Promise<boolean>;
  /** Recent persisted log rows + latest run summary; null when the table
   *  is missing (UI then shows the degraded-state note). */
  readLog(limit: number): Promise<{ rows: (SyncLogRow & { runId: string; createdAt: string })[]; lastRun: (SyncLogRow & { runId: string; createdAt: string }) | null } | null>;
}
