"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useSnapshot } from "../../../../lib/data/context";
import { useSession } from "../../../../lib/data/session";
import { consoleScopeSportIds } from "../../../../lib/scope";
import SportSwitcher from "../../../../components/SportSwitcher";

export default function RosterPage() {
  const snap = useSnapshot();
  const session = useSession();
  const [sportFilter, setSportFilter] = useState<string>("all");

  const scopeIds = useMemo(
    () => (snap ? consoleScopeSportIds(session, snap.sports.map((s) => s.id)) : []),
    [snap, session],
  );
  const scopeSports = useMemo(
    () => (snap ? snap.sports.filter((s) => scopeIds.includes(s.id)) : []),
    [snap, scopeIds],
  );

  const data = useMemo(() => {
    if (!snap) return null;
    const scope = new Set(scopeIds);
    const divs = snap.divisions.filter((d) => scope.has(d.sportId) && (sportFilter === "all" || d.sportId === sportFilter));
    return divs.map((div) => ({
      div,
      entries: snap.entries.filter((e) => e.divisionId === div.id),
    }));
  }, [snap, scopeIds, sportFilter]);

  if (!session.ready || !snap || !data) return <p className="text-neutral-500 py-10 text-center">Loading…</p>;
  if (!session.role) return <p className="py-10 text-center">Sign in first — <Link href="/login" className="underline font-semibold">go to sign-in</Link>.</p>;

  const playerName = (pid: string) => snap.players.find((p) => p.id === pid)?.name ?? pid;
  const teamName = (tid: string) => snap.teams.find((t) => t.id === tid)?.name ?? "";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="font-display tracking-tight text-4xl font-bold text-navy-950">TEAM ROSTERS</h1>
        <Link href="/console" className="text-sm font-semibold text-navy-800 underline">← Console</Link>
      </header>
      <SportSwitcher sports={scopeSports} value={sportFilter} onChange={setSportFilter} />
      <p className="text-sm text-neutral-600">Rosters power the cross-sport player conflict check. Only <strong>verified</strong> rosters are checked — an admin verifies each roster in the Admin page once the team list is final.</p>
      {data.map(({ div, entries }) => (
        <section key={div.id}>
          <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950 mb-2">{div.name}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {entries.map((e) => {
              const members = snap.rosters[e.id] ?? [];
              return (
                <div key={e.id} className="rounded-xl border border-navy-100 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{teamName(e.teamId)}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${e.rosterStatus === "verified" ? "bg-navy-950 text-white" : "bg-crimson-100 border border-crimson-600 text-crimson-800"}`}>
                      {e.rosterStatus}
                    </span>
                  </div>
                  {members.length === 0 ? (
                    <p className="text-sm text-neutral-500 mt-1">No players listed yet.</p>
                  ) : (
                    <ul className="mt-1 text-sm list-disc list-inside">
                      {members.map((pid) => <li key={pid}>{playerName(pid)}</li>)}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
