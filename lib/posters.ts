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

/** One venue's matches within a day (or within one poster page). */
export interface SchedulePosterGroup {
  venue: string;
  rows: SchedulePosterRow[];
}

export interface SchedulePosterDay {
  dayKey: string;
  dateLabel: string;
  /** The day's single venue, or "" when matches span several venues (those
   *  get venue banner rows inside the table instead of a header venue). */
  venueLine: string;
  /** True when the day spans multiple venues: the table groups matches
   *  under full-width venue banner rows. */
  showVenueBanners: boolean;
  rows: SchedulePosterRow[];
  /** The day chunked into poster pages. Each page is a list of venue
   *  groups (a group that spills across pages repeats its banner). A dense
   *  day (Pickleball: 74 matches on Nov 16) must never be crushed into one
   *  1080px frame — each page is its own downloadable poster. */
  pages: SchedulePosterGroup[][];
}

/** Max matches per schedule poster page — keeps rows at a readable height
 *  in the fixed 1920×1080 frame. */
export const POSTER_ROWS_PER_PAGE = 12;

/** Group a day's rows by venue: groups in first-appearance order, matches
 *  chronological inside each group. Match numbers stay the day's
 *  chronological numbers, so a number means the same match everywhere. */
export function groupRowsByVenue(rows: SchedulePosterRow[]): SchedulePosterGroup[] {
  const order: string[] = [];
  const byVenue = new Map<string, SchedulePosterRow[]>();
  for (const r of rows) {
    if (!byVenue.has(r.venue)) {
      byVenue.set(r.venue, []);
      order.push(r.venue);
    }
    byVenue.get(r.venue)!.push(r);
  }
  return order.map((venue) => ({ venue, rows: byVenue.get(venue)! }));
}

/** Chunk venue groups into poster pages. Capacity is POSTER_ROWS_PER_PAGE
 *  units per page; with banners, a banner costs 1 unit and repeats when
 *  its group continues onto the next page. A page never ends on a banner. */
export function buildPosterPages(
  groups: SchedulePosterGroup[],
  showBanners: boolean,
): SchedulePosterGroup[][] {
  if (!showBanners) {
    const rows = groups.flatMap((g) => g.rows);
    const pages: SchedulePosterGroup[][] = [];
    for (let i = 0; i < rows.length; i += POSTER_ROWS_PER_PAGE) {
      pages.push([{ venue: groups[0]?.venue ?? "", rows: rows.slice(i, i + POSTER_ROWS_PER_PAGE) }]);
    }
    return pages.length > 0 ? pages : [[{ venue: groups[0]?.venue ?? "", rows: [] }]];
  }
  const pages: SchedulePosterGroup[][] = [];
  let page: SchedulePosterGroup[] = [];
  let units = 0;
  const flush = () => {
    if (page.length > 0) {
      pages.push(page);
      page = [];
      units = 0;
    }
  };
  for (const g of groups) {
    let i = 0;
    while (i < g.rows.length) {
      if (units + 2 > POSTER_ROWS_PER_PAGE) flush(); // banner + at least one row must fit
      const segment: SchedulePosterGroup = { venue: g.venue, rows: [] };
      page.push(segment);
      units += 1; // the banner
      while (i < g.rows.length && units + 1 <= POSTER_ROWS_PER_PAGE) {
        segment.rows.push(g.rows[i]);
        i += 1;
        units += 1;
      }
    }
  }
  flush();
  return pages.length > 0 ? pages : [[{ venue: "", rows: [] }]];
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
    .map(([dayKey, dayMatches]) => {
      const rows = dayMatches.map((m, i) => ({
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
      }));
      const groups = groupRowsByVenue(rows);
      const showVenueBanners = groups.length > 1;
      return {
        dayKey,
        // Noon Manila keeps the calendar date stable regardless of viewer TZ.
        dateLabel: fmtDayLong(`${dayKey}T12:00:00+08:00`),
        venueLine: showVenueBanners ? "" : (groups[0]?.venue ?? ""),
        showVenueBanners,
        rows,
        pages: buildPosterPages(groups, showVenueBanners),
      };
    });
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
