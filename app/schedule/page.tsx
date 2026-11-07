"use client";
import { useMemo, useState } from "react";
import { useSnapshot } from "../../lib/data/context";
import { manilaDayKey, fmtDayLong } from "../../lib/format";
import MatchCard from "../../components/MatchCard";

export default function SchedulePage() {
  const snap = useSnapshot();
  const [day, setDay] = useState<string>("all");
  const [sportId, setSportId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const data = useMemo(() => {
    if (!snap) return null;
    const divById = new Map(snap.divisions.map((d) => [d.id, d]));
    const sportByDiv = new Map(snap.divisions.map((d) => [d.id, snap.sports.find((s) => s.id === d.sportId)]));
    let ms = [...snap.matches].sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
    const days = [...new Set(ms.map((m) => manilaDayKey(m.startsAt)))];
    if (day !== "all") ms = ms.filter((m) => manilaDayKey(m.startsAt) === day);
    if (sportId !== "all") ms = ms.filter((m) => sportByDiv.get(m.divisionId)?.id === sportId);
    if (status !== "all") ms = ms.filter((m) => m.status === status);
    const byDay = new Map<string, typeof ms>();
    for (const m of ms) (byDay.get(manilaDayKey(m.startsAt)) ?? byDay.set(manilaDayKey(m.startsAt), []).get(manilaDayKey(m.startsAt))!).push(m);
    return { divById, days, byDay, total: ms.length };
  }, [snap, day, sportId, status]);

  if (!snap || !data) return <p className="text-neutral-500 py-10 text-center">Loading…</p>;

  const sel = "rounded-lg border border-navy-100 bg-white px-2.5 py-2 text-sm font-medium min-h-[44px]";

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
      {[...data.byDay.entries()].map(([d, ms]) => (
        <section key={d}>
          <h2 className="font-display text-xl font-bold text-navy-800 mb-2">{d === "tba" ? "To be scheduled" : fmtDayLong(ms[0].startsAt)}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {ms.map((m) => <MatchCard key={m.id} match={m} division={data.divById.get(m.divisionId)} sportName={snap.sports.find((s) => s.id === data.divById.get(m.divisionId)?.sportId)?.name} />)}
          </div>
        </section>
      ))}
      {data.total === 0 && <p className="text-neutral-500">No matches match those filters.</p>}
    </div>
  );
}
