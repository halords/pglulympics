// Poster data builders — pure functions over a Snapshot.
//
// Two poster kinds, mirroring the official announcement graphics but in the
// app's own branding:
//  - "schedule" posters for head-to-head sports: one poster per Manila day,
//    matches numbered in start-time order (like the printed announcements).
//  - "entries" posters for entry-matrix sports (placement / entries-only):
//    teams × divisions with a boolean entered flag. The UI renders entered
//    as a check mark — NEVER the raw "1" the source sheets use, which reads
//    as a score and confuses everyone.

import { fmtDayLong, fmtTime, manilaDayKey } from "./format";
import type { MatchInfo, Snapshot, SportInfo } from "./types";

export type PosterKind = "schedule" | "entries";

export interface SchedulePosterRow {
  matchId: string;
  matchNo: number;
  time: string;
  venue: string;
  divisionName: string;
  label: string;
  teamA: string;
  teamB: string;
  status: MatchInfo["status"];
  scoreA?: number | null;
  scoreB?: number | null;
}

export interface SchedulePosterDay {
  dayKey: string;
  dateLabel: string;
  venueLine: string;
  rows: SchedulePosterRow[];
}

export interface EntriesPosterData {
  columns: string[];
  rows: { teamName: string; entered: boolean[] }[];
  enteredCount: number;
  venueLine: string;
}

function sportDivisions(snap: Snapshot, sport: SportInfo) {
  return snap.divisions.filter((d) => d.sportId === sport.id);
}

function sportMatches(snap: Snapshot, sport: SportInfo): MatchInfo[] {
  const divIds = new Set(sportDivisions(snap, sport).map((d) => d.id));
  return snap.matches.filter((m) => divIds.has(m.divisionId) && m.status !== "cancelled");
}

function isHeadToHead(m: MatchInfo): boolean {
  return m.slots.length === 2;
}

function dominantVenue(matches: MatchInfo[]): string {
  const counts = new Map<string, number>();
  for (const m of matches) {
    if (m.venue) counts.set(m.venue, (counts.get(m.venue) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [venue, count] of counts) {
    if (count > bestCount) {
      best = venue;
      bestCount = count;
    }
  }
  return best;
}

/** A sport gets a schedule poster when it has dated head-to-head matches;
 *  otherwise its poster is the entries matrix. */
export function posterKind(snap: Snapshot, sport: SportInfo): PosterKind {
  const matches = sportMatches(snap, sport);
  return matches.some((m) => isHeadToHead(m) && !!m.startsAt) ? "schedule" : "entries";
}

export function schedulePosterDays(snap: Snapshot, sport: SportInfo): SchedulePosterDay[] {
  const divById = new Map(snap.divisions.map((d) => [d.id, d]));
  const matches = sportMatches(snap, sport)
    .filter((m) => isHeadToHead(m) && !!m.startsAt)
    .sort((a, b) => (a.startsAt! < b.startsAt! ? -1 : a.startsAt! > b.startsAt! ? 1 : 0));

  const byDay = new Map<string, MatchInfo[]>();
  for (const m of matches) {
    const key = manilaDayKey(m.startsAt);
    const list = byDay.get(key) ?? [];
    list.push(m);
    byDay.set(key, list);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dayKey, dayMatches]) => ({
      dayKey,
      // Noon Manila keeps the calendar date stable regardless of viewer TZ.
      dateLabel: fmtDayLong(`${dayKey}T12:00:00+08:00`),
      venueLine: dominantVenue(dayMatches),
      rows: dayMatches.map((m, i) => ({
        matchId: m.id,
        matchNo: i + 1,
        time: fmtTime(m.startsAt),
        venue: m.venue ?? "TBA",
        divisionName: divById.get(m.divisionId)?.name ?? "",
        label: m.label,
        teamA: m.slots[0]?.teamName ?? m.slots[0]?.placeholder ?? "TBD",
        teamB: m.slots[1]?.teamName ?? m.slots[1]?.placeholder ?? "TBD",
        status: m.status,
        scoreA: m.status === "final" ? (m.totals?.[0] ?? null) : null,
        scoreB: m.status === "final" ? (m.totals?.[1] ?? null) : null,
      })),
    }));
}

export function entriesPoster(snap: Snapshot, sport: SportInfo): EntriesPosterData {
  const divisions = sportDivisions(snap, sport);
  const enteredSet = new Set(
    snap.entries
      .filter((e) => divisions.some((d) => d.id === e.divisionId))
      .map((e) => `${e.divisionId}::${e.teamId}`),
  );
  const rows = snap.teams.map((team) => ({
    teamName: team.name,
    entered: divisions.map((d) => enteredSet.has(`${d.id}::${team.id}`)),
  }));
  return {
    columns: divisions.map((d) => d.name),
    rows,
    enteredCount: rows.reduce((n, r) => n + r.entered.filter(Boolean).length, 0),
    venueLine: dominantVenue(sportMatches(snap, sport)),
  };
}
