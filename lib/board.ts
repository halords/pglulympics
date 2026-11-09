// Display-board view models (pure, unit-tested) for the two chromeless
// per-game screens:
//   /board/[matchId]            — one match, propped on a courtside tablet
//                                 or laptop for the players to watch.
//   /board/division/[divisionId] — a whole division's teams board, for
//                                 session sports whose teams all play in
//                                 the same area at the same time.
// Both consume the SAME public snapshot/realtime feed as /display; nothing
// here talks to a provider, and both screens are display-only.
import { computedWinner, setsWon } from "./standings";
import type { DivisionInfo, MatchInfo, Snapshot, SportInfo } from "./types";

/** Session sports: every entered team competes in one area at the same
 *  time (Mobile Games — Mobile Legends and CODM, each its OWN division),
 *  so the useful spectator unit is the whole division, not a single match.
 *  The teams-board mechanism below is generic per division (any divisionId
 *  renders); this flag only decides where the "Teams board" / "All teams"
 *  entry points are offered, keeping fixture sports on the per-match
 *  screen and placement sports on their placement form. */
export const SESSION_SPORT_SLUGS: readonly string[] = ["mobile-games"];

export function isSessionSport(
  sport: { slug?: string | null } | null | undefined,
): boolean {
  return !!sport?.slug && SESSION_SPORT_SLUGS.includes(sport.slug);
}

/** Score pair for the big board numerals — sets won for set-based sports,
 *  totals otherwise. Mirrors scoreText in components/MatchCard (the
 *  /display bug derivation) so every public surface shows the same score. */
export function boardScore(
  match: MatchInfo,
  division?: DivisionInfo,
): { a: string; b: string } | null {
  if (division?.scoringKind === "set_based") {
    return { a: String(setsWon(match, 0)), b: String(setsWon(match, 1)) };
  }
  if (match.totals) return { a: String(match.totals[0] ?? 0), b: String(match.totals[1] ?? 0) };
  if (division?.scoringKind === "simple") {
    const closed = match.segments.filter((s) => s.status === "closed");
    if (!closed.length) return null;
    return {
      a: String(closed.reduce((x, s) => x + (s.points[0] ?? 0), 0)),
      b: String(closed.reduce((x, s) => x + (s.points[1] ?? 0), 0)),
    };
  }
  return null;
}

/* ------------------------- per-match board ------------------------- */

export interface BoardContext {
  match: MatchInfo;
  division?: DivisionInfo;
  sport?: SportInfo;
}

/** Resolve a match + its division/sport from the snapshot (null = the
 *  board's clean not-found state). */
export function boardContext(snap: Snapshot, matchId: string): BoardContext | null {
  const match = snap.matches.find((m) => m.id === matchId);
  if (!match) return null;
  const division = snap.divisions.find((d) => d.id === match.divisionId);
  const sport = snap.sports.find((s) => s.id === division?.sportId);
  return { match, division, sport };
}

export interface BoardSegmentChip { label: string; a: number; b: number; open: boolean }
export interface BoardPlacementRow { teamName: string; place: number | null; finish: string; note: string | null }

export interface BoardView {
  kind: "versus" | "placement";
  state: MatchInfo["status"];
  /** Head-to-head display names (slots 0/1, placeholder-aware). */
  teams: [string, string];
  score: { a: string; b: string } | null;
  segments: BoardSegmentChip[];
  /** Finals only: which side won (0/1) — drives the winner emphasis. */
  winnerSide: 0 | 1 | null;
  isDraw: boolean;
  /** Placement events: every entered team's display name (deduped). */
  entrants: string[];
  /** Placement events: recorded places first (ascending), then the
   *  entrants still without a place. */
  placementRows: BoardPlacementRow[];
  hasPlacements: boolean;
}

export function boardView(match: MatchInfo, division?: DivisionInfo): BoardView {
  const kind: BoardView["kind"] = division?.scoringKind === "placement_only" ? "placement" : "versus";
  const teamName = (i: number) => match.slots[i]?.teamName ?? match.slots[i]?.placeholder ?? "TBD";

  // Winner emphasis is a FINAL-state concept. Prefer the recorded winner;
  // fall back to the score-derived winner for a final whose tag is missing.
  let winnerSide: 0 | 1 | null = null;
  let isDraw = match.outcome === "draw";
  if (match.status === "final" && kind === "versus") {
    if (match.winnerEntryId) {
      const idx = match.slots.findIndex((s) => s.entryId === match.winnerEntryId);
      if (idx === 0 || idx === 1) winnerSide = idx;
    }
    if (winnerSide === null && !isDraw) {
      const cw = computedWinner(match, division);
      if (cw.winnerEntryId) {
        const idx = match.slots.findIndex((s) => s.entryId === cw.winnerEntryId);
        if (idx === 0 || idx === 1) winnerSide = idx;
      } else if (cw.isDraw) {
        isDraw = true;
      }
    }
  }

  const entrants: string[] = [];
  for (const s of match.slots) {
    if (s.teamName && !entrants.includes(s.teamName)) entrants.push(s.teamName);
  }
  const placementRows: BoardPlacementRow[] = [...(match.placements ?? [])]
    .sort((x, y) => (x.place ?? 999) - (y.place ?? 999))
    .map((p) => ({
      teamName: match.slots[p.slotNo - 1]?.teamName ?? "Entrant",
      place: p.place ?? null,
      finish: p.finish,
      note: p.note ?? null,
    }));
  const covered = new Set(placementRows.map((r) => r.teamName));
  for (const name of entrants) {
    if (!covered.has(name)) placementRows.push({ teamName: name, place: null, finish: "", note: null });
  }

  return {
    kind,
    state: match.status,
    teams: [teamName(0), teamName(1)],
    score: kind === "versus" ? boardScore(match, division) : null,
    segments: match.segments.map((s) => ({
      // Chip prefix by segment flavour: S = set (set-based sports),
      // Q = period (basketball), G = game (best-of-3 series, Mobile Games).
      label: `${s.kind === "period" ? "Q" : division?.scoringKind === "set_based" ? "S" : "G"}${s.segmentNo}`,
      a: s.points[0] ?? 0,
      b: s.points[1] ?? 0,
      open: s.status === "open",
    })),
    winnerSide,
    isDraw,
    entrants,
    placementRows,
    hasPlacements: placementRows.some((r) => r.place != null),
  };
}

/* ------------------------- per-division teams board ------------------------- */

export interface TeamBoardRow {
  entryId: string;
  teamId: string;
  teamName: string;
  /** live = playing right now; played = has at least one decided final;
   *  idle = entered but no decided match yet. */
  state: "live" | "played" | "idle";
  liveMatchId: string | null;
  liveOpponent: string | null;
  /** Current score of the live match FROM THIS TEAM's side. */
  liveScoreFor: string | null;
  liveScoreAgainst: string | null;
  wins: number;
  losses: number;
  draws: number;
  /** Most recent decided final, from this team's side. */
  lastResult: { outcome: "W" | "L" | "D"; scoreFor: string; scoreAgainst: string; opponent: string } | null;
}

export interface DivisionBoard {
  division: DivisionInfo;
  sport?: SportInfo;
  rows: TeamBoardRow[];
  /** Distinct matches currently live in the division. */
  liveCount: number;
}

/**
 * The teams board for ONE division (= one game: the Mobile Legends board
 * lists only ML's teams, the CODM board only CODM's — divisions are never
 * merged). Rows are per entered team: live state first (current match +
 * score), else the recorded W/L/D so far with the latest result. Cancelled
 * matches and under-review finals do not count (same rule as standings).
 */
export function divisionBoard(snap: Snapshot, divisionId: string): DivisionBoard | null {
  const division = snap.divisions.find((d) => d.id === divisionId);
  if (!division) return null;
  const sport = snap.sports.find((s) => s.id === division.sportId);
  const teamNameOf = new Map(snap.teams.map((t) => [t.id, t.name]));
  const divMatches = snap.matches.filter(
    (m) => m.divisionId === divisionId && m.status !== "cancelled",
  );

  const rows: TeamBoardRow[] = snap.entries
    .filter((e) => e.divisionId === divisionId)
    .map((entry) => {
      const slotIdxOf = (m: MatchInfo) => m.slots.findIndex((s) => s.entryId === entry.id);
      const otherSlot = (m: MatchInfo, idx: number) => m.slots.find((_, i) => i !== idx);
      const nameOf = (m: MatchInfo, idx: number) => {
        const o = otherSlot(m, idx);
        return o?.teamName ?? o?.placeholder ?? "TBD";
      };
      // Score orientation only makes sense for two-slot (head-to-head)
      // matches — the session-sport form this board serves.
      const oriented = (m: MatchInfo, idx: number) => {
        if (m.slots.length !== 2) return null;
        const sc = boardScore(m, division);
        if (!sc) return null;
        return idx === 0
          ? { for: sc.a, against: sc.b }
          : { for: sc.b, against: sc.a };
      };

      const live = divMatches.find((m) => m.status === "live" && slotIdxOf(m) >= 0);
      let liveOpponent: string | null = null;
      let liveScoreFor: string | null = null;
      let liveScoreAgainst: string | null = null;
      if (live) {
        const idx = slotIdxOf(live);
        liveOpponent = nameOf(live, idx);
        const sc = oriented(live, idx);
        if (sc) { liveScoreFor = sc.for; liveScoreAgainst = sc.against; }
      }

      let wins = 0, losses = 0, draws = 0;
      let lastResult: TeamBoardRow["lastResult"] = null;
      const finals = divMatches
        .filter((m) => m.status === "final" && !m.needsReview && slotIdxOf(m) >= 0)
        .sort((a, b) => (b.startsAt ?? "").localeCompare(a.startsAt ?? ""));
      for (const m of finals) {
        const idx = slotIdxOf(m);
        const other = otherSlot(m, idx);
        let outcome: "W" | "L" | "D" | null = null;
        if (m.outcome === "draw") outcome = "D";
        else if (m.winnerEntryId === entry.id) outcome = "W";
        else if (m.winnerEntryId && m.winnerEntryId === other?.entryId) outcome = "L";
        else {
          const cw = computedWinner(m, division);
          if (cw.isDraw) outcome = "D";
          else if (cw.winnerEntryId === entry.id) outcome = "W";
          else if (cw.winnerEntryId) outcome = "L";
        }
        if (!outcome) continue;
        if (outcome === "W") wins++;
        else if (outcome === "L") losses++;
        else draws++;
        if (!lastResult) {
          const sc = oriented(m, idx);
          if (sc) {
            lastResult = { outcome, scoreFor: sc.for, scoreAgainst: sc.against, opponent: nameOf(m, idx) };
          }
        }
      }

      return {
        entryId: entry.id,
        teamId: entry.teamId,
        teamName: teamNameOf.get(entry.teamId) ?? "Team",
        state: live ? "live" : wins + losses + draws > 0 ? "played" : "idle",
        liveMatchId: live?.id ?? null,
        liveOpponent,
        liveScoreFor,
        liveScoreAgainst,
        wins, losses, draws,
        lastResult,
      } as TeamBoardRow;
    });

  // Live teams lead; then by record (wins, fewest losses), then name.
  rows.sort((a, b) =>
    (a.state === "live" ? 0 : 1) - (b.state === "live" ? 0 : 1)
    || b.wins - a.wins
    || a.losses - b.losses
    || a.teamName.localeCompare(b.teamName));

  return {
    division,
    sport,
    rows,
    liveCount: new Set(rows.map((r) => r.liveMatchId).filter(Boolean)).size,
  };
}
