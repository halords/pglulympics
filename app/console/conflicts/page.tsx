"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useProvider, useSnapshot } from "../../../lib/data/context";
import { useSession } from "../../../lib/data/session";
import { fmtDay, fmtTime } from "../../../lib/format";
import type { ConflictRow } from "../../../lib/types";

export default function ConflictsPage() {
  const snap = useSnapshot();
  const provider = useProvider();
  const session = useSession();
  const [rows, setRows] = useState<ConflictRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"player" | "team" | "venue">("player");

  useEffect(() => {
    if (!session.role) return;
    provider.listConflicts().then(setRows).catch((e: Error) => setError(e.message));
  }, [provider, session.role, snap?.revision]);

  const grouped = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, ConflictRow[]>();
    for (const r of rows) {
      const key = groupBy === "player" ? (r.playerName ?? "— venue —")
        : groupBy === "venue" ? "Venue double-bookings"
        : r.label;
      (map.get(key) ?? map.set(key, []).get(key)!).push(r);
    }
    return [...map.entries()];
  }, [rows, groupBy]);

  if (!session.ready) return <p className="text-neutral-500 py-10 text-center">Loading…</p>;
  if (!session.role) return <p className="py-10 text-center">Sign in first — <Link href="/login" className="underline font-semibold">go to sign-in</Link>.</p>;

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-4xl font-bold text-navy-950">SCHEDULING CONFLICTS</h1>
        <Link href="/console" className="text-sm font-semibold text-navy-800 underline">← Console</Link>
      </header>
      <p className="text-sm text-neutral-600">
        Event-wide overlap scan across all sports: players double-booked across fixtures, and venues double-booked.
        Player checks cover <strong>verified rosters only</strong> — teams without a verified roster are a blind spot
        {snap ? <> ({snap.entries.filter((e) => e.rosterStatus !== "verified").length} of {snap.entries.length} entries unverified)</> : null}.
        Rows marked <em>acknowledged</em> were saved with the clash accepted.
      </p>
      <div className="flex gap-2">
        {(["player", "team", "venue"] as const).map((g) => (
          <button key={g} onClick={() => setGroupBy(g)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold min-h-[44px] ${groupBy === g ? "bg-navy-950 text-white" : "bg-white border border-navy-100"}`}>
            By {g}
          </button>
        ))}
      </div>
      {error && <p className="rounded-lg bg-crimson-800/10 border border-crimson-800 text-crimson-800 px-3 py-2 text-sm">{error}</p>}
      {!rows && !error && <p className="text-neutral-500">Scanning…</p>}
      {rows && rows.length === 0 && <p className="rounded-xl bg-white border border-navy-100 p-5 text-center font-medium">No conflicts on the current schedule. ✓</p>}
      {grouped.map(([key, rs]) => (
        <section key={key} className="rounded-xl border border-navy-100 bg-white p-4">
          <h2 className="font-display text-xl font-bold">{key} — {rs.length} clash{rs.length === 1 ? "" : "es"}</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {rs.map((r, i) => (
              <li key={i} className="rounded-lg bg-navy-50 px-3 py-2">
                <strong>{r.label}</strong> ({r.sport}) {fmtDay(r.startsAt)} {fmtTime(r.startsAt)}–{fmtTime(r.endsAt)}
                {" ↔ "}
                <strong>{r.otherLabel}</strong> ({r.otherSport}) {fmtDay(r.otherStartsAt)} {fmtTime(r.otherStartsAt)}–{fmtTime(r.otherEndsAt)}
                {r.kind === "player" && r.playerName && <> · player: <strong>{r.playerName}</strong></>}
                {r.acked && <span className="ml-2 rounded bg-gold-100 border border-gold-500 px-1.5 py-0.5 text-[11px] font-semibold">acknowledged</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
