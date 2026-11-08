import { NextResponse } from "next/server";
import { requireSuperAdmin } from "../../../../lib/supabase/server";
import { fetchAllTabs } from "../../../../lib/sheet-sync/fetch";
import { runSheetSync } from "../../../../lib/sheet-sync/engine";
import { createLiveSyncStore } from "../../../../lib/sheet-sync/store";

// Sheet sync (migration 11) — MANUAL only (user decision 2026-11-08: no
// automatic polling, no shared-secret endpoint). Every call re-validates
// the caller's session + super_admin profile via requireSuperAdmin, then
// the engine folds the source workbook's schedule/recorded-result/entry
// changes into the database through the service-role store. The sync
// never overwrites a live match or a confirmed result; disagreements are
// logged as conflict skips for human review.

export async function GET(req: Request) {
  const gate = await requireSuperAdmin(req);
  if (!gate.ok) return gate.response;
  try {
    const store = createLiveSyncStore(gate.svc);
    const log = await store.readLog(80);
    return NextResponse.json({
      degraded: log === null, // sheet_sync_log not there yet (migration 11 pending)
      rows: log?.rows ?? [],
      lastRun: log?.lastRun ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to read the sync log." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const gate = await requireSuperAdmin(req);
  if (!gate.ok) return gate.response;
  try {
    const tabs = await fetchAllTabs();
    const store = createLiveSyncStore(gate.svc);
    const result = await runSheetSync({ tabs, store, runId: crypto.randomUUID() });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sheet sync failed." }, { status: 500 });
  }
}
