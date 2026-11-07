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
