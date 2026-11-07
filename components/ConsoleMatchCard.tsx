"use client";
import Link from "next/link";
import type { DivisionInfo, MatchInfo, SportInfo } from "../lib/types";
import { sportIdentity, SportIcon } from "../lib/sport-identity";
import { fmtTime } from "../lib/format";
import { StatusPill, matchScore } from "./MatchCard";

/** Operations-desk match card for the console home: identity-tinted, with
 *  the three matchday jobs as big front-and-center actions — open the
 *  courtside scoreboard, score / tag the winner (detail scoring page), or
 *  reschedule (fixtures page, edit panel deep-linked). */
export default function ConsoleMatchCard({
  match, division, sport, entrants,
}: {
  match: MatchInfo;
  division?: DivisionInfo;
  sport?: SportInfo;
  entrants?: string[];
}) {
  const identity = sportIdentity(sport);
  const score = matchScore(match, division);
  const isPlacement = division?.scoringKind === "placement_only";
  const teamLine = (i: 0 | 1) => match.slots[i]?.teamName ?? match.slots[i]?.placeholder ?? "TBD";
  const showScores = match.status === "live" || match.status === "final";

  const btn = "inline-flex min-h-[52px] items-center justify-center rounded-xl px-3 text-sm font-bold text-center";
  const actions = (() => {
    if (match.status === "cancelled") return null;
    if (isPlacement) {
      return (
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/console/matches/${match.id}`} className={`${btn} bg-crimson-800 text-white`}>Enter results</Link>
          {match.status === "scheduled"
            ? <Link href={`/console/fixtures?edit=${match.id}`} className={`${btn} bg-white border-2 border-navy-800 text-navy-950`}>Reschedule</Link>
            : <Link href={`/matches/${match.id}`} className={`${btn} bg-white border border-navy-100 text-navy-900`}>Public view</Link>}
        </div>
      );
    }
    if (match.status === "final") {
      return (
        <div className="grid grid-cols-1 gap-2">
          <Link href={`/console/matches/${match.id}`} className={`${btn} bg-navy-950 text-white`}>Result &amp; corrections</Link>
        </div>
      );
    }
    if (match.status === "live") {
      return (
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/console/matches/${match.id}/scoreboard`} className={`${btn} bg-crimson-600 text-white`}>● Scoreboard</Link>
          <Link href={`/console/matches/${match.id}`} className={`${btn} bg-white border-2 border-navy-800 text-navy-950`}>Score / Winner</Link>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-3 gap-2">
        <Link href={`/console/matches/${match.id}/scoreboard`} className={`${btn} bg-navy-950 text-white`}>Scoreboard</Link>
        <Link href={`/console/matches/${match.id}`} className={`${btn} bg-white border-2 border-navy-800 text-navy-950`}>Score / Winner</Link>
        <Link href={`/console/fixtures?edit=${match.id}`} className={`${btn} bg-white border border-navy-100 text-navy-900`}>Reschedule</Link>
      </div>
    );
  })();

  return (
    <article className="relative overflow-hidden rounded-2xl border border-navy-100 bg-white p-4 pl-5 shadow-sm">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: identity.tint }} aria-hidden="true" />
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
          <span style={{ color: identity.tint }}><SportIcon sport={sport} className="h-4 w-4" /></span>
          <span className="truncate">{sport?.name} · {division?.name} · {match.label}</span>
        </span>
        <StatusPill status={match.status} needsReview={match.needsReview} />
      </div>

      {isPlacement ? (
        <p className="py-2 text-[15px] font-medium text-navy-900">
          {(entrants?.length ?? match.slots.length)} teams entered
          <span className="block truncate text-xs text-neutral-500">{match.slots.map((s) => s.teamName).filter(Boolean).join(" · ")}</span>
        </p>
      ) : (
        <div className="py-1.5">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-0.5">
              <span className={`truncate text-[15px] ${match.status === "final" && match.winnerEntryId && match.slots[i]?.entryId === match.winnerEntryId ? "font-bold text-navy-950" : "font-medium text-navy-900"}`}>
                {teamLine(i as 0 | 1)}
              </span>
              {showScores && score && (
                <span className="font-display tracking-tight text-2xl font-bold leading-none tabular-nums text-navy-950">{i === 0 ? score.a : score.b}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="pb-3 text-xs text-neutral-500">
        {fmtTime(match.startsAt)}{match.venue ? <> · {match.venue}</> : null}
      </p>
      {actions}
    </article>
  );
}
