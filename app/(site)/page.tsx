"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSnapshot } from "../../lib/data/context";
import { computeTally } from "../../lib/standings";
import { fmtDayLong, manilaDayKey } from "../../lib/format";
import { nextUpFixtures } from "../../lib/schedule";
import MatchCard, { divisionEntrantNames } from "../../components/MatchCard";
import TallyTable from "../../components/TallyTable";

function useNow() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const kick = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(kick); clearInterval(t); };
  }, []);
  return now;
}

export default function HomePage() {
  const snap = useSnapshot();
  const now = useNow();
  const data = useMemo(() => {
    if (!snap) return null;
    const divById = new Map(snap.divisions.map((d) => [d.id, d]));
    const sportByDiv = new Map(snap.divisions.map((d) => [d.id, snap.sports.find((s) => s.id === d.sportId)?.name]));
    const entrantsByDiv = new Map(snap.divisions.map((d) => [d.id, divisionEntrantNames(snap.entries, snap.teams, d.id)]));
    const sorted = [...snap.matches].sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
    const firstStart = sorted.find((m) => m.startsAt)?.startsAt ?? null;
    // Standings-first IA: live matches pin above the Up Next rail, which
    // takes the next 8 scheduled fixtures chronologically (lib/schedule).
    // now = 0 only until the mount effect ticks; epoch reads as "before the
    // event", so every day counts as upcoming for that first paint.
    const today = manilaDayKey(new Date(now).toISOString());
    const { live, upcoming } = nextUpFixtures(snap.matches, today, 8);
    const tally = computeTally(snap.teams, snap.awards, snap.event,
      (entryId) => snap.entries.find((e) => e.id === entryId)?.teamId);
    return { divById, sportByDiv, entrantsByDiv, live, upcoming, firstStart, tally };
  }, [snap, now]);

  if (!snap || !data) return <p className="text-neutral-500 py-10 text-center">Loading the arena…</p>;

  const startsMs = data.firstStart ? Date.parse(data.firstStart) : null;
  const diff = startsMs ? startsMs - now : 0;
  const countdown = diff > 0 ? {
    d: Math.floor(diff / 86400_000), h: Math.floor(diff / 3600_000) % 24,
    m: Math.floor(diff / 60_000) % 60, s: Math.floor(diff / 1000) % 60,
  } : null;
  const card = (m: (typeof data.upcoming)[number]) => (
    <MatchCard key={m.id} match={m} division={data.divById.get(m.divisionId)} sportName={data.sportByDiv.get(m.divisionId)} entrants={data.entrantsByDiv.get(m.divisionId)} />
  );

  return (
    <div className="space-y-8">
      {/* Compact hero strip — name, dates, countdown; standings stay in view. */}
      <section className="rounded-2xl bg-navy-950 text-white px-5 py-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-navy-800/60 to-transparent pointer-events-none" />
        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-crimson-400 font-bold">Provincial Government of La Union</p>
            <h1 className="font-display tracking-tight text-4xl font-bold leading-none mt-0.5">PGLU<span className="text-crimson-400">LYMPICS</span></h1>
          </div>
          <p className="text-sm text-navy-100">
            {fmtDayLong(snap.event.startDate + "T12:00:00+08:00")} – {fmtDayLong(snap.event.endDate + "T12:00:00+08:00")}
            <span className="block text-xs">{snap.sports.length} sport{snap.sports.length === 1 ? "" : "s"} · {snap.teams.length} teams · one champion</span>
          </p>
          {countdown ? (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[11px] uppercase tracking-widest text-navy-100">First serve in</span>
              <div className="flex gap-1 font-display tracking-tight text-lg font-semibold">
                {(["d", "h", "m", "s"] as const).map((u) => (
                  <span key={u} className="bg-crimson-800 rounded px-1.5 py-0.5 tabular-nums">{String(countdown[u]).padStart(2, "0")}<span className="text-[10px] text-navy-100 ml-0.5">{u}</span></span>
                ))}
              </div>
            </div>
          ) : data.live.length > 0 ? (
            <p className="ml-auto inline-flex items-center gap-2 text-crimson-600 bg-white rounded-full px-3 py-1 text-sm font-bold"><span className="live-dot h-2 w-2 rounded-full bg-crimson-600 inline-block" /> {data.live.length} match{data.live.length === 1 ? "" : "es"} live right now</p>
          ) : null}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950">OVERALL STANDINGS</h2>
          <Link href="/tally" className="text-sm font-semibold text-navy-800 underline">Medals by sport →</Link>
        </div>
        {snap.event.pointsProvisional && (
          <p className="text-xs text-neutral-500 mb-2">Points shown at {snap.event.goldPoints}/{snap.event.silverPoints}/{snap.event.bronzePoints} per gold/silver/bronze — provisional until confirmed by the organizers.</p>
        )}
        <TallyTable rows={data.tally} />
      </section>

      <section>
        <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950 mb-3">SPORTS</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snap.sports.map((sp) => {
            const divs = snap.divisions.filter((d) => d.sportId === sp.id);
            const ms = snap.matches.filter((m) => divs.some((d) => d.id === m.divisionId));
            const liveCount = ms.filter((m) => m.status === "live").length;
            const golds = snap.awards.filter((a) => divs.some((d) => d.id === a.divisionId) && a.state === "confirmed").length;
            return (
              <Link key={sp.id} href={`/sports/${sp.slug}`} className="rounded-xl bg-navy-900 text-white p-4 shadow hover:bg-navy-800 transition block">
                <div className="flex items-center justify-between">
                  <span className="font-display text-2xl font-bold uppercase tracking-wide">{sp.name}</span>
                  {liveCount > 0 && <span className="inline-flex items-center gap-1.5 bg-crimson-600 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase"><span className="live-dot h-1.5 w-1.5 rounded-full bg-white inline-block" />{liveCount} live</span>}
                </div>
                <p className="text-sm text-navy-100 mt-1">{divs.length > 3 ? `${divs.length} categories` : divs.map((d) => d.name).join(" · ")}</p>
                <p className="text-xs text-navy-100 mt-2">{ms.length} matches · {golds} medals decided</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950 mb-3">UP NEXT</h2>
        {data.live.length > 0 && (
          <>
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-crimson-600 mb-2"><span className="live-dot h-2 w-2 rounded-full bg-crimson-600 inline-block" /> Live now</p>
            <div className="grid gap-3 sm:grid-cols-2 mb-3">
              {data.live.map(card)}
            </div>
          </>
        )}
        {data.upcoming.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.upcoming.map(card)}
          </div>
        ) : data.live.length === 0 ? (
          <p className="text-neutral-500 text-sm">No upcoming matches on the board.</p>
        ) : null}
      </section>
    </div>
  );
}
