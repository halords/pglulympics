import type { DivisionInfo, MatchInfo, SportInfo } from "./types";
import { fmtTime, manilaDayKey } from "./format";

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

export interface DayScheduleRow {
  matchId: string;
  time: string;
  sportName: string;
  divisionName: string;
  label: string;
  teamsText: string;
  venue: string | null;
  status: MatchInfo["status"];
}

/** Read-only "what's already on that day" context for the fixture create /
 *  reschedule pickers (Part 4): every non-cancelled match on a Manila day,
 *  chronological, with sport / division / teams / venue for display. Purely
 *  informational — player-conflict checking stays with the conflict engine. */
export function dayScheduleRows(
  matches: MatchInfo[],
  divisions: DivisionInfo[],
  sports: SportInfo[],
  dayKey: string,
  excludeMatchId?: string,
): DayScheduleRow[] {
  const divById = new Map(divisions.map((d) => [d.id, d]));
  const sportName = (id: string) => sports.find((s) => s.id === id)?.name ?? "";
  return matches
    .filter((m) => m.id !== excludeMatchId && m.status !== "cancelled" && !!m.startsAt && manilaDayKey(m.startsAt) === dayKey)
    .sort(byStart)
    .map((m) => {
      const div = divById.get(m.divisionId);
      const names = m.slots.map((s) => s.teamName ?? s.placeholder ?? "TBD");
      return {
        matchId: m.id,
        time: fmtTime(m.startsAt),
        sportName: div ? sportName(div.sportId) : "",
        divisionName: div?.name ?? "",
        label: m.label,
        teamsText: names.length > 2 ? `${names.length} teams entered` : names.join(" vs "),
        venue: m.venue ?? null,
        status: m.status,
      };
    });
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
