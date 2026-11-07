"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSnapshot } from "../lib/data/context";
import { computeTally } from "../lib/standings";
import { fmtDayLong } from "../lib/format";
import MatchCard, { divisionEntrantNames } from "../components/MatchCard";
import TallyTable from "../components/TallyTable";

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
    const live = sorted.filter((m) => m.status === "live");
    const upcoming = sorted.filter((m) => m.status === "scheduled" && m.startsAt && Date.parse(m.startsAt) >= now - 3 * 3600_000);
    const results = sorted.filter((m) => m.status === "final").slice(-6).reverse();
    const firstStart = sorted.find((m) => m.startsAt)?.startsAt ?? null;
    const tally = computeTally(snap.teams, snap.awards, snap.event,
      (entryId) => snap.entries.find((e) => e.id === entryId)?.teamId);
    return { divById, sportByDiv, entrantsByDiv, live, upcoming, results, firstStart, tally };
  }, [snap, now]);

  if (!snap || !data) return <p className="text-neutral-500 py-10 text-center">Loading the arena…</p>;

  const startsMs = data.firstStart ? Date.parse(data.firstStart) : null;
  const diff = startsMs ? startsMs - now : 0;
  const countdown = diff > 0 ? {
    d: Math.floor(diff / 86400_000), h: Math.floor(diff / 3600_000) % 24,
    m: Math.floor(diff / 60_000) % 60, s: Math.floor(diff / 1000) % 60,
  } : null;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-navy-950 text-white px-5 py-7 sm:px-8 relative overflow-hidden">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-navy-800/60 to-transparent pointer-events-none" />
        <p className="text-[11px] uppercase tracking-[0.25em] text-gold-500 font-bold">Provincial Government of La Union</p>
        <h1 className="font-display text-5xl sm:text-6xl font-bold leading-none mt-1">PGLU<span className="text-gold-500">LYMPICS</span></h1>
        <p className="mt-2 text-navy-100 max-w-xl">The PGLU sports fest — {snap.sports.length} sport{snap.sports.length === 1 ? "" : "s"}, {snap.teams.length} teams, one champion. Live scores, standings and the overall medal tally, updated the second they happen.</p>
        <p className="mt-1 text-sm text-navy-100">{fmtDayLong(snap.event.startDate + "T12:00:00+08:00")} – {fmtDayLong(snap.event.endDate + "T12:00:00+08:00")}</p>
        {countdown ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-xs uppercase tracking-widest text-navy-100">First serve in</span>
            <div className="flex gap-1.5 font-display text-2xl">
              {(["d", "h", "m", "s"] as const).map((u) => (
                <span key={u} className="bg-navy-800 rounded px-2 py-0.5 tabular-nums">{String(countdown[u]).padStart(2, "0")}<span className="text-xs text-navy-100 ml-0.5">{u}</span></span>
              ))}
            </div>
          </div>
        ) : data.live.length > 0 ? (
          <p className="mt-4 inline-flex items-center gap-2 text-crimson-600 bg-white rounded-full px-3 py-1 text-sm font-bold"><span className="live-dot h-2 w-2 rounded-full bg-crimson-600 inline-block" /> {data.live.length} match{data.live.length === 1 ? "" : "es"} live right now</p>
        ) : null}
      </section>

      {data.live.length > 0 && (
        <section>
          <h2 className="font-display text-2xl font-bold text-navy-950 mb-3 flex items-center gap-2"><span className="live-dot h-2.5 w-2.5 rounded-full bg-crimson-600 inline-block" /> LIVE NOW</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.live.map((m) => <MatchCard key={m.id} match={m} division={data.divById.get(m.divisionId)} sportName={data.sportByDiv.get(m.divisionId)} entrants={data.entrantsByDiv.get(m.divisionId)} />)}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display text-2xl font-bold text-navy-950 mb-3">SPORTS</h2>
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

      <div className="grid gap-8 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-display text-2xl font-bold text-navy-950">OVERALL MEDAL TALLY</h2>
            <Link href="/tally" className="text-sm font-semibold text-navy-800 underline">Full tally →</Link>
          </div>
          {snap.event.pointsProvisional && (
            <p className="text-xs text-neutral-500 mb-2">Points shown at {snap.event.goldPoints}/{snap.event.silverPoints}/{snap.event.bronzePoints} per gold/silver/bronze — provisional until confirmed by the organizers.</p>
          )}
          <TallyTable rows={data.tally} compact />
        </section>

        <section className="lg:col-span-2">
          <h2 className="font-display text-2xl font-bold text-navy-950 mb-3">UP NEXT</h2>
          <div className="space-y-3">
            {data.upcoming.slice(0, 4).map((m) => <MatchCard key={m.id} match={m} division={data.divById.get(m.divisionId)} sportName={data.sportByDiv.get(m.divisionId)} entrants={data.entrantsByDiv.get(m.divisionId)} />)}
            {data.upcoming.length === 0 && <p className="text-neutral-500 text-sm">No upcoming matches on the board.</p>}
          </div>
        </section>
      </div>

      {data.results.length > 0 && (
        <section>
          <h2 className="font-display text-2xl font-bold text-navy-950 mb-3">LATEST RESULTS</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.results.map((m) => <MatchCard key={m.id} match={m} division={data.divById.get(m.divisionId)} sportName={data.sportByDiv.get(m.divisionId)} entrants={data.entrantsByDiv.get(m.divisionId)} />)}
          </div>
        </section>
      )}
    </div>
  );
}
