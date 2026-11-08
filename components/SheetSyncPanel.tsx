"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase/client";
import type { SyncLogRow, SyncRunResult } from "../lib/sheet-sync/types";

/** Admin → Sheet sync panel (migration 11). Manual sync ONLY — the user
 *  cancelled automatic polling (2026-11-08), so nothing runs unless a
 *  super-admin presses the button. Calls /api/admin/sheet-sync with the
 *  session token; the server re-validates super_admin on every call. */
async function syncApi(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const sb = getSupabase();
  const { data } = sb ? await sb.auth.getSession() : { data: { session: null } };
  const token = data.session?.access_token;
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : `Request failed (${res.status})`);
  return body;
}

type LogRow = SyncLogRow & { runId?: string; createdAt?: string };

const KIND_LABEL: Record<SyncLogRow["kind"], string> = {
  fixture_schedule: "Schedule",
  fixture_result: "Result",
  placement: "Placement",
  entry: "Entry",
  conflict_skip: "Skipped — conflict",
  unmatched: "Unmatched",
  run_summary: "Run summary",
};

function LogList({ rows }: { rows: LogRow[] }) {
  if (!rows.length) return <p className="text-sm text-neutral-500">No changes recorded yet.</p>;
  return (
    <ul className="divide-y divide-navy-100 border-t border-navy-100 mt-2">
      {rows.map((r, i) => (
        <li key={i} className="py-2 text-sm flex flex-wrap gap-x-3 gap-y-0.5 items-baseline">
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.kind === "conflict_skip" ? "bg-crimson-100 text-crimson-800" : r.kind === "run_summary" ? "bg-navy-950 text-white" : "bg-navy-50 text-navy-900"}`}>
            {KIND_LABEL[r.kind]}
          </span>
          <span className="min-w-0">
            {r.field ? <strong>{r.field}: </strong> : null}
            {r.oldValue ? <span className="text-neutral-500 line-through decoration-neutral-300">{r.oldValue}</span> : null}
            {r.oldValue && r.newValue ? " → " : null}
            {r.newValue ? <strong>{r.newValue}</strong> : null}
            {r.detail ? <span className="text-neutral-600"> — {r.detail}</span> : null}
            {r.sourceRef ? <span className="text-neutral-400"> ({r.sourceRef})</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function SheetSyncPanel({ isMock }: { isMock: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncRunResult | null>(null);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [lastRun, setLastRun] = useState<LogRow | null>(null);
  const [degraded, setDegraded] = useState(false);

  const refreshLog = async () => {
    const body = await syncApi("/api/admin/sheet-sync");
    setRows((body.rows as LogRow[]) ?? []);
    setLastRun((body.lastRun as LogRow | null) ?? null);
    setDegraded(Boolean(body.degraded));
  };

  useEffect(() => {
    if (isMock) return;
    let alive = true;
    void (async () => {
      try { await refreshLog(); } catch { if (alive) setDegraded(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMock]);

  const runSync = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const body = await syncApi("/api/admin/sheet-sync", { method: "POST" });
      setResult(body as unknown as SyncRunResult);
      await refreshLog().catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sheet sync failed.");
    }
    setBusy(false);
  };

  return (
    <section className="rounded-2xl border border-navy-100 bg-white p-4">
      <h2 className="font-display tracking-tight text-2xl font-bold mb-2">SHEET SYNC</h2>
      {isMock ? (
        <p className="text-sm text-neutral-600">
          Sheet sync runs against the live Supabase project, so it is unavailable in demo mode.
          In production, a super-admin can fold the organizers&apos; workbook changes
          (schedule moves, recorded results, entry changes) into the portal with one press —
          manually, never automatically.
        </p>
      ) : (
        <>
          <p className="text-sm text-neutral-600 mb-3">
            Pulls the source workbook (<em>Game Tracker PGLU Olympics.xlsx</em>) and applies what changed:
            fixture times/venues, recorded finals (as <strong>unconfirmed</strong> finals — medal
            confirmation stays manual), placements, and entry changes. It <strong>never</strong> overwrites
            a live match or a confirmed result; disagreements are logged below as skips for human review.
          </p>
          {error && <p className="rounded-lg bg-crimson-100 border border-crimson-600 text-crimson-800 px-3 py-2 text-sm mb-3">{error}</p>}
          {degraded && (
            <p className="rounded-lg bg-navy-50 border border-navy-100 px-3 py-2 text-sm mb-3">
              The sync log table (migration 11) is not applied yet — runs still work, but the history
              below only shows the latest run until it lands.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <button type="button" disabled={busy} onClick={() => void runSync()}
              className="rounded-xl bg-crimson-800 text-white px-5 py-3 font-bold text-sm min-h-[48px] disabled:opacity-60">
              {busy ? "Syncing…" : "Sync now"}
            </button>
            {lastRun && !result && (
              <span className="text-sm text-neutral-600">
                Last run {lastRun.createdAt ? new Date(lastRun.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : ""} — {lastRun.detail}
              </span>
            )}
          </div>
          {result && (
            <div className="rounded-lg bg-navy-50 border border-navy-100 px-3 py-2 text-sm mb-2">
              <strong>Run complete:</strong> {result.applied} applied · {result.skipped} skipped (conflicts) ·{" "}
              {result.failed} failed · {result.unmatched} unmatched.
              <div className="flex flex-wrap gap-1.5 mt-2">
                {result.perTab.map((t) => (
                  <span key={t.tab} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.status === "ok" ? "bg-white border border-navy-100" : "bg-crimson-100 text-crimson-800"}`}>
                    {t.tab}: {t.status === "ok" ? `${t.fixtures} fixtures · ${t.entries} entries` : `failed — ${t.error}`}
                  </span>
                ))}
              </div>
              {!result.logPersisted && <p className="mt-2 text-neutral-600">Log table not applied yet (migration 11) — this run&apos;s log is shown below but won&apos;t persist.</p>}
            </div>
          )}
          <LogList rows={result ? result.changes : rows} />
        </>
      )}
    </section>
  );
}
