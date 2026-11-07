"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useSnapshot } from "../../lib/data/context";
import { useSession } from "../../lib/data/session";
import { isTodayManila } from "../../lib/format";
import MatchCard from "../../components/MatchCard";

export default function ConsoleHomePage() {
  const snap = useSnapshot();
  const session = useSession();

  // In live mode the coordinator's sport comes from their profile; in demo mode
  // the single seeded sport is the scope.
  const scopeSportId = session.isMock ? snap?.sports[0]?.id ?? null : session.sportId;
  const data = useMemo(() => {
    if (!snap) return null;
    const inScope = (divisionId: string) => {
      if (session.role === "admin") return true;
      const div = snap.divisions.find((d) => d.id === divisionId);
      return div?.sportId === scopeSportId;
    };
    const mine = snap.matches.filter((m) => inScope(m.divisionId))
      .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
    return {
      today: mine.filter((m) => isTodayManila(m.startsAt)),
      live: mine.filter((m) => m.status === "live"),
      upcoming: mine.filter((m) => m.status === "scheduled").slice(0, 8),
      review: mine.filter((m) => m.needsReview),
      divById: new Map(snap.divisions.map((d) => [d.id, d])),
    };
  }, [snap, session.role, scopeSportId]);

  if (!session.ready || !snap || !data) return <p className="text-neutral-500 py-10 text-center">Loading…</p>;
  if (!session.role) {
    return (
      <div className="max-w-md mx-auto text-center space-y-3 py-8">
        <h1 className="font-display text-3xl font-bold text-navy-950">COORDINATOR CONSOLE</h1>
        <p className="text-neutral-600">You need a staff account to update scores.</p>
        <Link href="/login" className="inline-block rounded-xl bg-navy-950 text-white px-6 py-3 font-semibold">Go to sign-in</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold text-navy-950">COORDINATOR CONSOLE</h1>
          <p className="text-sm text-neutral-600">{session.email} · {session.role === "admin" ? "Super admin — all sports" : `Scoped to ${snap.sports.find((s) => s.id === scopeSportId)?.name ?? "your sport"}`}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/console/fixtures" className="rounded-lg bg-navy-800 text-white px-4 py-2.5 font-semibold text-sm min-h-[44px] inline-flex items-center">Fixtures</Link>
          <Link href="/console/conflicts" className="rounded-lg bg-white border border-navy-100 px-4 py-2.5 font-semibold text-sm min-h-[44px] inline-flex items-center">Conflicts</Link>
          <Link href="/console/roster" className="rounded-lg bg-white border border-navy-100 px-4 py-2.5 font-semibold text-sm min-h-[44px] inline-flex items-center">Rosters</Link>
          {session.role === "admin" && <Link href="/admin" className="rounded-lg bg-crimson-800 text-white px-4 py-2.5 font-semibold text-sm min-h-[44px] inline-flex items-center">Admin</Link>}
          <button onClick={() => void session.signOut()} className="rounded-lg bg-white border border-navy-100 px-4 py-2.5 font-semibold text-sm min-h-[44px]">Sign out</button>
        </div>
      </header>

      {data.review.length > 0 && (
        <section className="rounded-xl border border-gold-500 bg-gold-100 p-4">
          <h2 className="font-display text-xl font-bold">NEEDS REVIEW ({data.review.length})</h2>
          <p className="text-sm">These finals were flagged — their results are held out of standings and advancement until resolved.</p>
          <div className="mt-2 space-y-1">
            {data.review.map((m) => (
              <Link key={m.id} href={`/console/matches/${m.id}`} className="block underline font-medium">{m.label} — {data.divById.get(m.divisionId)?.name}</Link>
            ))}
          </div>
        </section>
      )}

      {data.live.length > 0 && (
        <section>
          <h2 className="font-display text-2xl font-bold text-navy-950 mb-2">LIVE — TAP TO SCORE</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.live.map((m) => (
              <Link key={m.id} href={`/console/matches/${m.id}`} className="block">
                <MatchCard match={m} division={data.divById.get(m.divisionId)} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display text-2xl font-bold text-navy-950 mb-2">TODAY</h2>
        {data.today.length === 0 ? <p className="text-neutral-500 text-sm">No matches today for your sport.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.today.map((m) => (
              <Link key={m.id} href={`/console/matches/${m.id}`} className="block">
                <MatchCard match={m} division={data.divById.get(m.divisionId)} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl font-bold text-navy-950 mb-2">UPCOMING</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.upcoming.map((m) => (
            <Link key={m.id} href={`/console/matches/${m.id}`} className="block">
              <MatchCard match={m} division={data.divById.get(m.divisionId)} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
