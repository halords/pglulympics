// Standings + tally computation (SPEC §1.2) — mirrors the SQL views; used by the mock
// provider and available to the UI for instant local recomputation.
import type { DivisionInfo, EntryInfo, MatchInfo, StandingRow, TallyRow, TeamInfo, AwardInfo } from "./types";

export function setsWon(match: MatchInfo, slotIdx: number): number {
  let n = 0;
  for (const seg of match.segments) {
    if (seg.status !== "closed") continue;
    const mine = seg.points[slotIdx] ?? 0;
    const theirs = seg.points[1 - slotIdx] ?? 0;
    if (mine > theirs) n++;
  }
  return n;
}

export function computedWinner(match: MatchInfo, division?: DivisionInfo): { winnerEntryId: string | null; isDraw: boolean } {
  const [s1, s2] = [match.slots[0], match.slots[1]];
  if (!s1?.entryId || !s2?.entryId) return { winnerEntryId: null, isDraw: false };
  const kind = division?.scoringKind ?? "set_based";
  if (kind === "set_based") {
    const cfg = (division?.scoringConfig ?? {}) as { best_of?: number };
    const needed = Math.floor((cfg.best_of ?? 3) / 2) + 1;
    const w1 = setsWon(match, 0), w2 = setsWon(match, 1);
    if (w1 >= needed) return { winnerEntryId: s1.entryId, isDraw: false };
    if (w2 >= needed) return { winnerEntryId: s2.entryId, isDraw: false };
    return { winnerEntryId: null, isDraw: false };
  }
  if (kind === "simple") {
    const total = (idx: number) =>
      match.totals?.[idx] ??
      match.segments.filter((s) => s.status === "closed").reduce((a, s) => a + (s.points[idx] ?? 0), 0);
    const t1 = total(0), t2 = total(1);
    if (t1 > t2) return { winnerEntryId: s1.entryId, isDraw: false };
    if (t2 > t1) return { winnerEntryId: s2.entryId, isDraw: false };
    return { winnerEntryId: null, isDraw: true };
  }
  return { winnerEntryId: null, isDraw: false };
}

export function computeStandings(
  division: DivisionInfo, entries: EntryInfo[], matches: MatchInfo[], teams: TeamInfo[],
): StandingRow[] {
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? id;
  const cfg = (division.standingsConfig ?? {}) as { standings_points?: { win?: number; draw?: number; loss?: number } };
  const pw = cfg.standings_points?.win ?? 3, pd = cfg.standings_points?.draw ?? 1, pl = cfg.standings_points?.loss ?? 0;
  const rows = new Map<string, StandingRow>();
  for (const e of entries.filter((x) => x.divisionId === division.id)) {
    rows.set(e.id, {
      entryId: e.id, teamName: teamName(e.teamId), groupId: e.groupId ?? null,
      played: 0, wins: 0, losses: 0, draws: 0, winPct: 0,
      setsWon: 0, setsLost: 0, pointsFor: 0, pointsAgainst: 0, standingsPoints: 0,
    });
  }
  for (const m of matches) {
    if (m.divisionId !== division.id || m.stage !== "round_robin" || m.status !== "final" || m.needsReview) continue;
    const [a, b] = m.slots;
    if (!a?.entryId || !b?.entryId) continue;
    const ra = rows.get(a.entryId), rb = rows.get(b.entryId);
    if (!ra || !rb) continue;
    ra.played++; rb.played++;
    if (m.outcome === "draw") { ra.draws++; rb.draws++; }
    else if (m.winnerEntryId === a.entryId) { ra.wins++; rb.losses++; }
    else if (m.winnerEntryId === b.entryId) { rb.wins++; ra.losses++; }
    // Totals-only finals have no segments to sum (their recorded totals are
    // the point score). Segment-scored matches already count points below,
    // so only use totals when there are no closed segments to avoid
    // double-counting basketball periods.
    if (!m.segments.some((seg) => seg.status === "closed") && m.totals) {
      ra.pointsFor += m.totals[0] ?? 0; ra.pointsAgainst += m.totals[1] ?? 0;
      rb.pointsFor += m.totals[1] ?? 0; rb.pointsAgainst += m.totals[0] ?? 0;
    }
    for (const seg of m.segments) {
      if (seg.status !== "closed") continue;
      ra.pointsFor += seg.points[0] ?? 0; ra.pointsAgainst += seg.points[1] ?? 0;
      rb.pointsFor += seg.points[1] ?? 0; rb.pointsAgainst += seg.points[0] ?? 0;
      if ((seg.points[0] ?? 0) > (seg.points[1] ?? 0)) { ra.setsWon++; rb.setsLost++; }
      if ((seg.points[1] ?? 0) > (seg.points[0] ?? 0)) { rb.setsWon++; ra.setsLost++; }
    }
  }
  for (const r of rows.values()) {
    r.winPct = r.played ? Math.round((1000 * r.wins) / r.played) / 10 : 0;
    r.standingsPoints = r.wins * pw + r.draws * pd + r.losses * pl;
  }
  return [...rows.values()];
}

/** Default ordering (SPEC §1.3): win% -> wins -> set ratio -> point ratio -> name. */
export function sortStandings(rows: StandingRow[]): StandingRow[] {
  const ratio = (w: number, l: number) => (l === 0 ? (w > 0 ? Infinity : 0) : w / l);
  return [...rows].sort((a, b) =>
    b.winPct - a.winPct || b.wins - a.wins ||
    ratio(b.setsWon, b.setsLost) - ratio(a.setsWon, a.setsLost) ||
    ratio(b.pointsFor, b.pointsAgainst) - ratio(a.pointsFor, a.pointsAgainst) ||
    a.teamName.localeCompare(b.teamName));
}

/** Is the ordering key of two rows exactly equal on every sporting criterion? (tie detection) */
export function standingsTied(a: StandingRow, b: StandingRow): boolean {
  const ratio = (w: number, l: number) => (l === 0 ? (w > 0 ? Infinity : 0) : w / l);
  return a.winPct === b.winPct && a.wins === b.wins &&
    ratio(a.setsWon, a.setsLost) === ratio(b.setsWon, b.setsLost) &&
    ratio(a.pointsFor, a.pointsAgainst) === ratio(b.pointsFor, b.pointsAgainst);
}

export function computeTally(
  teams: TeamInfo[], awards: AwardInfo[],
  points: { goldPoints: number; silverPoints: number; bronzePoints: number },
  entryTeam: (entryId: string) => string | undefined,
): TallyRow[] {
  const rows = teams.map((t) => ({ teamId: t.id, teamName: t.name, gold: 0, silver: 0, bronze: 0, points: 0, rank: 0 }));
  const byTeam = new Map(rows.map((r) => [r.teamId, r]));
  for (const a of awards) {
    if (a.state !== "confirmed") continue;
    const teamId = entryTeam(a.entryId);
    const row = teamId ? byTeam.get(teamId) : undefined;
    if (row) row[a.medal]++;
  }
  for (const r of rows) r.points = r.gold * points.goldPoints + r.silver * points.silverPoints + r.bronze * points.bronzePoints;
  const sorted = [...rows].sort((a, b) => b.points - a.points || b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.teamName.localeCompare(b.teamName));
  let lastKey = "", lastRank = 0;
  sorted.forEach((r, i) => {
    const key = `${r.points}|${r.gold}|${r.silver}|${r.bronze}`;
    r.rank = key === lastKey ? lastRank : i + 1;
    lastKey = key; lastRank = r.rank;
  });
  return sorted;
}
