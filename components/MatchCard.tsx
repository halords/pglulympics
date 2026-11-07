"use client";
import Link from "next/link";
import type { DivisionInfo, MatchInfo } from "../lib/types";
import { setsWon } from "../lib/standings";
import { fmtDay, fmtTime } from "../lib/format";

export function StatusPill({ status, needsReview }: { status: MatchInfo["status"]; needsReview?: boolean }) {
  if (needsReview) return <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 text-gold-500 border border-gold-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">Under review</span>;
  switch (status) {
    case "live":
      return <span className="inline-flex items-center gap-1.5 rounded-full bg-crimson-600 text-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"><span className="live-dot inline-block h-2 w-2 rounded-full bg-white" />Live</span>;
    case "final":
      return <span className="rounded-full bg-navy-950 text-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">Final</span>;
    case "cancelled":
      return <span className="rounded-full bg-neutral-300 text-neutral-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide line-through">Cancelled</span>;
    default:
      return <span className="rounded-full bg-navy-100 text-navy-800 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">Scheduled</span>;
  }
}

function scoreText(m: MatchInfo, division?: DivisionInfo): { a: string; b: string } | null {
  if (division?.scoringKind === "set_based") {
    return { a: String(setsWon(m, 0)), b: String(setsWon(m, 1)) };
  }
  if (m.totals) return { a: String(m.totals[0] ?? 0), b: String(m.totals[1] ?? 0) };
  if (division?.scoringKind === "simple") {
    const closed = m.segments.filter((s) => s.status === "closed");
    if (!closed.length) return null;
    return { a: String(closed.reduce((x, s) => x + (s.points[0] ?? 0), 0)), b: String(closed.reduce((x, s) => x + (s.points[1] ?? 0), 0)) };
  }
  return null;
}

export default function MatchCard({ match, division, sportName }: { match: MatchInfo; division?: DivisionInfo; sportName?: string }) {
  const score = scoreText(match, division);
  const showScores = match.status === "live" || match.status === "final";
  const teamLine = (slotNo: 1 | 2) => {
    const slot = match.slots[slotNo - 1];
    const name = slot?.teamName ?? slot?.placeholder ?? "TBD";
    const isWinner = match.status === "final" && match.winnerEntryId && slot?.entryId === match.winnerEntryId;
    const segScores = division?.scoringKind === "set_based"
      ? match.segments.map((s) => s.points[slotNo - 1]).join(" · ")
      : null;
    return (
      <div className="flex items-center justify-between gap-2 py-1">
        <span className={`truncate text-[15px] ${isWinner ? "font-bold text-navy-950" : "font-medium text-navy-900"}`}>
          {name}
          {isWinner && <span className="ml-2 text-gold-500" aria-label="winner">●</span>}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {segScores && showScores && <span className="text-xs text-neutral-500 tabular-nums">{segScores}</span>}
          {showScores && score && <span className={`font-display text-2xl leading-none tabular-nums ${isWinner ? "text-navy-950 font-bold" : "text-navy-800"}`}>{slotNo === 1 ? score.a : score.b}</span>}
        </span>
      </div>
    );
  };
  return (
    <Link href={`/matches/${match.id}`} className="block rounded-xl border border-navy-100 bg-white p-3.5 shadow-sm hover:border-navy-800 hover:shadow transition">
      <div className="flex items-center justify-between gap-2 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          {[sportName, division?.name, match.label].filter(Boolean).join(" · ")}
        </span>
        <StatusPill status={match.status} needsReview={match.needsReview} />
      </div>
      {match.slots.length > 2 ? (
        <div className="py-1.5">
          <span className="text-[15px] font-medium text-navy-900">{match.slots.length} teams · placement event</span>
          <span className="block text-xs text-neutral-500 truncate">{match.slots.map((s) => s.teamName).filter(Boolean).join(" · ")}</span>
        </div>
      ) : (
        <>
          {teamLine(1)}
          <div className="border-t border-dashed border-navy-100" />
          {teamLine(2)}
        </>
      )}
      <div className="pt-1.5 text-xs text-neutral-500 flex justify-between">
        <span>{fmtDay(match.startsAt)} · {fmtTime(match.startsAt)}</span>
        <span className="truncate ml-2">{match.venue ?? ""}</span>
      </div>
    </Link>
  );
}
