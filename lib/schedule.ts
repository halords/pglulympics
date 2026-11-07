import type { MatchInfo } from "./types";
import { manilaDayKey } from "./format";

// Audience-first schedule ordering (SPEC addendum): live matches pinned
// first, then day groups starting from the nearest day (today while the
// event runs, otherwise Day 1), past days (results) after, and matches
// without a date/time ("to be scheduled") last of all.

export interface ScheduleDay {
  key: string; // manilaDayKey, e.g. "2026-11-09"
  matches: MatchInfo[];
  isPast: boolean;
}

export interface ScheduleSections {
  live: MatchInfo[];
  days: ScheduleDay[];
  tba: MatchInfo[];
}

const byStart = (a: MatchInfo, b: MatchInfo) => (a.startsAt ?? "").localeCompare(b.startsAt ?? "");

export function buildScheduleSections(matches: MatchInfo[], todayKey: string): ScheduleSections {
  const live = matches.filter((m) => m.status === "live").sort(byStart);
  const tba = matches.filter((m) => m.status !== "live" && !m.startsAt);
  const byDay = new Map<string, MatchInfo[]>();
  for (const m of matches) {
    if (m.status === "live" || !m.startsAt) continue;
    const k = manilaDayKey(m.startsAt);
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(m);
  }
  const keys = [...byDay.keys()];
  const upcoming = keys.filter((k) => k >= todayKey).sort();
  const past = keys.filter((k) => k < todayKey).sort().reverse();
  const days = [...upcoming, ...past].map((k) => {
    const inDay = byDay.get(k)!;
    // within a day: upcoming fixtures first, finished/cancelled after
    const open = inDay.filter((m) => m.status === "scheduled").sort(byStart);
    const done = inDay.filter((m) => m.status !== "scheduled").sort(byStart);
    return { key: k, matches: [...open, ...done], isPast: k < todayKey };
  });
  return { live, days, tba };
}

export interface NextUp {
  live: MatchInfo[];
  upcoming: MatchInfo[];
}

/** "Up next" rail (homepage + sport pages): live matches separated out for
 *  pinning, then the next scheduled fixtures in chronological order —
 *  nearest day first (today while the event runs, else Day 1), start time
 *  ascending within a day. Finished matches and past days never appear;
 *  unscheduled (TBA) fixtures only fill slots left over by dated ones. */
export function nextUpFixtures(matches: MatchInfo[], todayKey: string, limit = 8): NextUp {
  const { live, days, tba } = buildScheduleSections(matches, todayKey);
  const upcoming: MatchInfo[] = [];
  for (const d of days) {
    if (d.isPast) continue;
    for (const m of d.matches) if (m.status === "scheduled") upcoming.push(m);
  }
  for (const m of tba) if (m.status === "scheduled") upcoming.push(m);
  return { live, upcoming: upcoming.slice(0, Math.max(0, limit)) };
}
