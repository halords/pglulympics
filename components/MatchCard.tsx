"use client";
import Link from "next/link";
import type { DivisionInfo, EntryInfo, MatchInfo, TeamInfo } from "../lib/types";
import { setsWon } from "../lib/standings";
import { fmtDay, fmtTime, dedupeLabel } from "../lib/format";

export { dedupeLabel };

/** Entrant team names for a division, from the snapshot's entries
 *  (the same source the sport pages use for their entrant chips). */
export function divisionEntrantNames(entries: EntryInfo[], teams: TeamInfo[], divisionId: string): string[] {
  const nameOf = new Map(teams.map((t) => [t.id, t.name]));
  const out: string[] = [];
  for (const e of entries) {
    if (e.divisionId !== divisionId) continue;
    const n = nameOf.get(e.teamId);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

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

export default function MatchCard({ match, division, sportName, entrants }: { match: MatchInfo; division?: DivisionInfo; sportName?: string; entrants?: string[] }) {
  const score = scoreText(match, division);
  const showScores = match.status === "live" || match.status === "final";
  const isPlacement = division?.scoringKind === "placement_only";
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
  const label = dedupeLabel([sportName, division?.name, match.label]);
  const footer = (
    <div className="pt-1.5 text-xs text-neutral-500 flex justify-between gap-2">
      <span className="shrink-0">{fmtDay(match.startsAt)} · {fmtTime(match.startsAt)}</span>
      <span className="truncate">{match.venue ?? ""}</span>
    </div>
  );

  // Placement events are NOT head-to-head matches: render an event card with
  // the full entrant list as chips (same presentation as the sport pages).
  if (isPlacement) {
    const slotNames = match.slots.map((s) => s.teamName).filter((n): n is string => !!n);
    const chips = [...new Set([...(entrants ?? []), ...slotNames])];
    const placed = (match.placements ?? [])
      .filter((p) => p.place != null)
      .sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
      .slice(0, 3);
    return (
      <Link href={`/matches/${match.id}`} className="block rounded-xl border border-navy-100 bg-white p-3.5 shadow-sm hover:border-navy-800 hover:shadow transition">
        <div className="flex items-center justify-between gap-2 pb-1.5">
          <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
          <span className="shrink-0"><StatusPill status={match.status} needsReview={match.needsReview} /></span>
        </div>
        {placed.length > 0 ? (
          <ul className="py-1 space-y-0.5">
            {placed.map((p) => (
              <li key={p.slotNo} className="flex items-baseline gap-2 text-[15px]">
                <span className="font-display font-bold text-gold-500 w-7 shrink-0">#{p.place}</span>
                <span className="font-medium text-navy-900">{match.slots[p.slotNo - 1]?.teamName ?? "Entrant"}</span>
              </li>
            ))}
          </ul>
        ) : chips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 py-1">
            {chips.map((n) => (
              <span key={n} className="rounded-full bg-navy-50 border border-navy-100 px-2.5 py-0.5 text-[13px] font-medium text-navy-900">{n}</span>
            ))}
          </div>
        ) : (
          <p className="py-1 text-[15px] font-medium text-navy-900">Entrants to be announced</p>
        )}
        {footer}
      </Link>
    );
  }

  return (
    <Link href={`/matches/${match.id}`} className="block rounded-xl border border-navy-100 bg-white p-3.5 shadow-sm hover:border-navy-800 hover:shadow transition">
      <div className="flex items-center justify-between gap-2 pb-1.5">
        <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          {label}
        </span>
        <span className="shrink-0"><StatusPill status={match.status} needsReview={match.needsReview} /></span>
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
      {footer}
    </Link>
  );
}
