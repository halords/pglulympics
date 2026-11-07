"use client";
import { useMemo, useState } from "react";
import { useSnapshot } from "../../lib/data/context";
import { manilaDayKey, fmtDayLong } from "../../lib/format";
import { buildScheduleSections } from "../../lib/schedule";
import MatchCard, { divisionEntrantNames } from "../../components/MatchCard";
import type { MatchInfo } from "../../lib/types";

export default function SchedulePage() {
  const snap = useSnapshot();
  const [day, setDay] = useState<string>("all");
  const [sportId, setSportId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [tbaOpen, setTbaOpen] = useState(false);

  const data = useMemo(() => {
    if (!snap) return null;
    const divById = new Map(snap.divisions.map((d) => [d.id, d]));
    const sportByDiv = new Map(snap.divisions.map((d) => [d.id, snap.sports.find((s) => s.id === d.sportId)]));
    const entrantsByDiv = new Map(snap.divisions.map((d) => [d.id, divisionEntrantNames(snap.entries, snap.teams, d.id)]));
    const all = [...snap.matches];
    const days = [...new Set(all.map((m) => manilaDayKey(m.startsAt)))];
    let ms = all;
    if (day !== "all") ms = ms.filter((m) => manilaDayKey(m.startsAt) === day);
    if (sportId !== "all") ms = ms.filter((m) => sportByDiv.get(m.divisionId)?.id === sportId);
    if (status !== "all") ms = ms.filter((m) => m.status === status);

    // Audience-first ordering (SPEC addendum), via lib/schedule.
    const today = manilaDayKey(new Date().toISOString());
    const { live, days: orderedDays, tba } = buildScheduleSections(ms, today);
    return { divById, sportByDiv, entrantsByDiv, days, live, orderedDays, tba, total: ms.length, today };
  }, [snap, day, sportId, status]);

  if (!snap || !data) return <p className="text-neutral-500 py-10 text-center">Loading…</p>;

  const sel = "rounded-lg border border-navy-100 bg-white px-2.5 py-2 text-sm font-medium min-h-[44px] max-w-full";
  const card = (m: MatchInfo) => (
    <MatchCard
      key={m.id}
      match={m}
      division={data.divById.get(m.divisionId)}
      sportName={data.sportByDiv.get(m.divisionId)?.name}
      entrants={data.entrantsByDiv.get(m.divisionId)}
    />
  );
  const dayTitle = (key: string) =>
    `${fmtDayLong(`${key}T12:00:00+08:00`)}${key === data.today ? " — Today" : ""}`;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-4xl font-bold text-navy-950">SCHEDULE & RESULTS</h1>
      <div className="flex flex-wrap gap-2">
        <select className={sel} value={day} onChange={(e) => setDay(e.target.value)} aria-label="Filter by day">
          <option value="all">All days</option>
          {data.days.filter((d) => d !== "tba").map((d) => (
            <option key={d} value={d}>{fmtDayLong(`${d}T12:00:00+08:00`)}</option>
          ))}
        </select>
        <select className={sel} value={sportId} onChange={(e) => setSportId(e.target.value)} aria-label="Filter by sport">
          <option value="all">All sports</option>
          {snap.sports.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="live">Live</option>
          <option value="scheduled">Upcoming</option>
          <option value="final">Finished</option>
        </select>
        <span className="self-center text-sm text-neutral-500">{data.total} matches</span>
      </div>

      {data.live.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold text-crimson-600 mb-2 flex items-center gap-2">
            <span className="live-dot inline-block h-2.5 w-2.5 rounded-full bg-crimson-600" /> LIVE NOW
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">{data.live.map(card)}</div>
        </section>
      )}

      {data.orderedDays.map(({ key, matches, isPast }) => (
        <section key={key}>
          <h2 className={`sticky top-[60px] z-10 -mx-1 px-1 py-2 bg-navy-50/95 backdrop-blur-sm font-display text-xl font-bold mb-2 ${isPast ? "text-navy-800/70" : "text-navy-800"}`}>
            {dayTitle(key)}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">{matches.map(card)}</div>
        </section>
      ))}

      {data.tba.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setTbaOpen((v) => !v)}
            aria-expanded={tbaOpen}
            className="flex min-h-[44px] w-full items-center justify-between gap-2 py-2 text-left"
          >
            <span className="font-display text-xl font-bold text-navy-800">
              To be scheduled{" "}
              <span className="ml-1 rounded-full bg-navy-100 px-2 py-0.5 text-xs font-sans font-bold text-navy-800 align-middle">{data.tba.length}</span>
            </span>
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={`h-5 w-5 shrink-0 text-navy-800 transition-transform ${tbaOpen ? "rotate-180" : ""}`}>
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>
          {tbaOpen && <div className="grid gap-3 sm:grid-cols-2 mt-1">{data.tba.map(card)}</div>}
        </section>
      )}

      {data.total === 0 && <p className="text-neutral-500">No matches match those filters.</p>}
    </div>
  );
}
