"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useProvider, useSnapshot } from "../../../lib/data/context";
import { useSession } from "../../../lib/data/session";
import { consoleScopeSportIds } from "../../../lib/scope";
import { isSessionSport } from "../../../lib/board";
import { fmtDayLong, isTodayManila, manilaDayKey } from "../../../lib/format";
import { SportIcon } from "../../../lib/sport-identity";
import { divisionEntrantNames } from "../../../components/MatchCard";
import ConsoleMatchCard from "../../../components/ConsoleMatchCard";
import SportSwitcher from "../../../components/SportSwitcher";
import type { ConflictRow } from "../../../lib/types";

// Coordinator console = OPERATIONS DESK (not a conflicts page): a matchday
// strip up top, then live + today's matches as action cards (scoreboard /
// score & winner / reschedule), up next after that, and conflicts demoted
// to a one-line summary. Sign-out lives in the account block at the bottom,
// behind a two-step confirm — never beside the work actions.
export default function ConsoleHomePage() {
  const snap = useSnapshot();
  const provider = useProvider();
  const session = useSession();
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [conflictRows, setConflictRows] = useState<ConflictRow[] | null>(null);
  const [confirmingOut, setConfirmingOut] = useState(false);

  // Scope = the caller's assigned sports (admin: all; demo coordinator: the
  // demo subset). The switcher narrows the view to one of them at a time.
  const scopeIds = useMemo(
    () => (snap ? consoleScopeSportIds(session, snap.sports.map((s) => s.id)) : []),
    [snap, session],
  );
  const scopeSports = useMemo(
    () => (snap ? snap.sports.filter((s) => scopeIds.includes(s.id)) : []),
    [snap, scopeIds],
  );
  const viewIds = sportFilter === "all" ? scopeIds : scopeIds.filter((id) => id === sportFilter);
  const data = useMemo(() => {
    if (!snap) return null;
    const view = new Set(viewIds);
    const inScope = (divisionId: string) => {
      const div = snap.divisions.find((d) => d.id === divisionId);
      return !!div && view.has(div.sportId);
    };
    const mine = snap.matches.filter((m) => inScope(m.divisionId))
      .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
    const todayKey = manilaDayKey(new Date().toISOString());
    const live = mine.filter((m) => m.status === "live");
    const liveIds = new Set(live.map((m) => m.id));
    const today = mine.filter((m) => isTodayManila(m.startsAt) && !liveIds.has(m.id));
    const upcoming = mine.filter((m) => m.status === "scheduled" && !isTodayManila(m.startsAt)
      && (!m.startsAt || manilaDayKey(m.startsAt) >= todayKey)).slice(0, 6);
    return {
      today, live, upcoming,
      review: mine.filter((m) => m.needsReview),
      divById: new Map(snap.divisions.map((d) => [d.id, d])),
      sportByDiv: new Map(snap.divisions.map((d) => [d.id, snap.sports.find((s) => s.id === d.sportId)])),
      entrantsByDiv: new Map(snap.divisions.map((d) => [d.id, divisionEntrantNames(snap.entries, snap.teams, d.id)])),
    };
  }, [snap, viewIds]);

  // Compact conflict summary (major = player, minor = venue) — the detail
  // lives on the conflicts page; the desk only carries the counts.
  useEffect(() => {
    if (!session.role) return;
    provider.listConflicts()
      .then((rows) => {
        if (!snap) { setConflictRows(rows); return; }
        // rows are already server-scoped to the caller's sports; narrow to
        // the switcher's current view by sport name (unique per event).
        const viewNames = new Set(snap.sports.filter((s) => viewIds.includes(s.id)).map((s) => s.name));
        setConflictRows(rows.filter((r) => viewNames.has(r.sport) || viewNames.has(r.otherSport)));
      })
      .catch(() => setConflictRows(null));
  }, [provider, session.role, snap, viewIds]);

  // Two-step sign-out: the confirm state lapses on its own.
  useEffect(() => {
    if (!confirmingOut) return;
    const t = setTimeout(() => setConfirmingOut(false), 4000);
    return () => clearTimeout(t);
  }, [confirmingOut]);

  if (!session.ready || !snap || !data) return <p className="text-neutral-500 py-10 text-center">Loading…</p>;
  if (!session.role) {
    return (
      <div className="max-w-md mx-auto text-center space-y-3 py-8">
        <h1 className="font-display tracking-tight text-3xl font-bold text-navy-950">COORDINATOR CONSOLE</h1>
        <p className="text-neutral-600">You need a staff account to update scores.</p>
        <Link href="/login" className="inline-block rounded-xl bg-crimson-800 text-white px-6 py-3 font-semibold">Go to sign-in</Link>
      </div>
    );
  }

  const majorCount = conflictRows?.filter((r) => r.severity === "major").length ?? null;
  const minorCount = conflictRows?.filter((r) => r.severity === "minor").length ?? null;
  const card = (m: (typeof data.today)[number]) => (
    <ConsoleMatchCard key={m.id} match={m} division={data.divById.get(m.divisionId)}
      sport={data.sportByDiv.get(m.divisionId)} entrants={data.entrantsByDiv.get(m.divisionId)} />
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display tracking-tight text-4xl font-bold text-navy-950">COORDINATOR CONSOLE</h1>
        <nav className="flex flex-wrap gap-2">
          <Link href="/console/fixtures" className="rounded-lg bg-navy-800 text-white px-4 py-2.5 font-semibold text-sm min-h-[44px] inline-flex items-center">Fixtures</Link>
          <Link href="/console/conflicts" className="rounded-lg bg-white border border-navy-100 px-4 py-2.5 font-semibold text-sm min-h-[44px] inline-flex items-center">Conflicts</Link>
          <Link href="/console/roster" className="rounded-lg bg-white border border-navy-100 px-4 py-2.5 font-semibold text-sm min-h-[44px] inline-flex items-center">Rosters</Link>
          {session.role === "admin" && <Link href="/admin" className="rounded-lg bg-crimson-800 text-white px-4 py-2.5 font-semibold text-sm min-h-[44px] inline-flex items-center">Admin</Link>}
        </nav>
      </header>

      {/* matchday strip */}
      <section className="rounded-2xl bg-navy-950 text-white px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-crimson-400">Matchday</p>
            <p className="font-display tracking-tight text-3xl font-bold leading-tight">{fmtDayLong(new Date().toISOString())}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-crimson-600 px-3.5 py-1.5 text-sm font-bold">
              <span className="live-dot block h-2 w-2 rounded-full bg-white" />{data.live.length} live
            </span>
            <span className="inline-flex items-center rounded-full bg-navy-800 px-3.5 py-1.5 text-sm font-bold">{data.today.length + data.live.length} today</span>
            <span className="inline-flex items-center rounded-full bg-navy-800 px-3.5 py-1.5 text-sm font-bold">{data.upcoming.length} up next</span>
            {data.review.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-white text-crimson-800 px-3.5 py-1.5 text-sm font-bold">{data.review.length} need review</span>
            )}
          </div>
        </div>
        {scopeSports.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-navy-800 pt-3">
            {scopeSports.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-navy-900 px-2.5 py-1 text-xs font-semibold text-navy-100">
                <SportIcon sport={s} className="h-3.5 w-3.5" />{s.name}
              </span>
            ))}
            <span className="inline-flex items-center px-1 text-xs text-navy-100">
              {session.role === "admin" ? "Super admin — all sports" : "Your assigned sports"}
            </span>
          </div>
        )}
      </section>

      <SportSwitcher sports={scopeSports} value={sportFilter} onChange={setSportFilter} />

      {/* Session-sport teams boards — one per game/division (Mobile
          Legends and CODM are separate boards, never merged). */}
      {snap.divisions.filter((d) => scopeIds.includes(d.sportId) && isSessionSport(snap.sports.find((s) => s.id === d.sportId))).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Session boards</span>
          {snap.divisions
            .filter((d) => scopeIds.includes(d.sportId) && isSessionSport(snap.sports.find((s) => s.id === d.sportId)))
            .map((d) => (
              <Link key={d.id} href={`/board/division/${d.id}`} target="_blank"
                className="inline-flex min-h-[40px] items-center rounded-lg bg-navy-950 px-3.5 py-2 text-sm font-bold text-white">
                {d.name} — Teams board ↗
              </Link>
            ))}
        </div>
      )}

      {/* conflicts: a summary line, not the headline act */}
      {majorCount !== null && minorCount !== null && (
        <Link href="/console/conflicts" className="flex flex-wrap items-center gap-2 rounded-xl border border-navy-100 bg-white px-4 py-3 text-sm hover:border-crimson-600 transition">
          <span className="font-display tracking-tight text-base font-bold text-navy-950">Scheduling conflicts</span>
          {majorCount > 0
            ? <span className="inline-flex items-center rounded-full bg-crimson-800 text-white px-2.5 py-0.5 text-xs font-bold">⚠ {majorCount} major — players double-booked</span>
            : <span className="inline-flex items-center rounded-full bg-navy-50 border border-navy-100 px-2.5 py-0.5 text-xs font-semibold text-navy-900">No player conflicts</span>}
          {minorCount > 0 && (
            <span className="text-xs text-neutral-500">{minorCount} minor venue overlap{minorCount === 1 ? "" : "s"} — multi-court venues, notes only</span>
          )}
          <span className="ml-auto font-semibold text-navy-800">View →</span>
        </Link>
      )}

      {data.review.length > 0 && (
        <section className="rounded-xl border border-crimson-600 bg-crimson-100 p-4">
          <h2 className="font-display tracking-tight text-xl font-bold">NEEDS REVIEW ({data.review.length})</h2>
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
          <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950 mb-2">
            <span className="mr-2 inline-block h-3 w-3 rounded-full bg-crimson-600 live-dot align-middle" />LIVE NOW — TAP TO SCORE
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">{data.live.map(card)}</div>
        </section>
      )}

      <section>
        <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950 mb-2">TODAY&apos;S MATCHES</h2>
        {data.today.length === 0
          ? <p className="text-neutral-500 text-sm">{data.live.length > 0 ? "Everything else today is done — the live matches above are what's running." : "No matches today in the selected scope."}</p>
          : <div className="grid gap-3 sm:grid-cols-2">{data.today.map(card)}</div>}
      </section>

      {data.upcoming.length > 0 && (
        <section>
          <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950 mb-2">UP NEXT</h2>
          <div className="grid gap-3 sm:grid-cols-2">{data.upcoming.map(card)}</div>
        </section>
      )}

      {/* account block — visually separated from the work; sign-out needs a
          deliberate second tap so it can't be hit by accident mid-match. */}
      <section className="rounded-2xl border border-dashed border-navy-100 bg-white/60 px-4 py-3.5 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-navy-950">{session.email}</p>
          <p className="text-xs text-neutral-500">
            Signed in · {session.role === "admin" ? "Super admin" : scopeSports.length ? `Coordinator — ${scopeSports.map((s) => s.name).join(", ")}` : "Coordinator — no sports assigned yet"}
          </p>
        </div>
        {confirmingOut ? (
          <button onClick={() => void session.signOut()}
            className="rounded-lg bg-crimson-800 text-white px-4 py-2.5 font-bold text-sm min-h-[44px]">
            Tap again to confirm sign-out
          </button>
        ) : (
          <button onClick={() => setConfirmingOut(true)}
            className="rounded-lg bg-white border border-neutral-300 text-neutral-500 px-4 py-2.5 font-semibold text-sm min-h-[44px]">
            Sign out
          </button>
        )}
      </section>
    </div>
  );
}
