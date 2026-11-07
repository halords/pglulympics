"use client";
// Bulk roster import UI (console Roster page): download the controlled
// template → encoder fills names only → upload → PREVIEW every row
// (nothing is written yet) → confirm → commit through the provider's
// roster write paths. Validation rules live in lib/roster-import.ts.
import { useMemo, useRef, useState } from "react";
import { useProvider } from "../lib/data/context";
import { validateImportRows, type PreviewRow } from "../lib/roster-import";
import {
  commitRosterImport, downloadCsvSkeleton, downloadRosterTemplate, parseRosterFile,
  type ImportCommitSummary,
} from "../lib/roster-file";
import type { Snapshot } from "../lib/types";

export default function RosterImport({ snap, scopeSportIds }: { snap: Snapshot; scopeSportIds: string[] }) {
  const provider = useProvider();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"template" | "parse" | "commit" | null>(null);
  const [summary, setSummary] = useState<(ImportCommitSummary & { skipped: number; errors: number }) | null>(null);

  const counts = useMemo(() => ({
    ok: preview?.filter((r) => r.status === "ok").length ?? 0,
    skip: preview?.filter((r) => r.status === "skip").length ?? 0,
    error: preview?.filter((r) => r.status === "error").length ?? 0,
  }), [preview]);

  const scopeNames = snap.sports.filter((s) => scopeSportIds.includes(s.id)).map((s) => s.name).join(", ");
  const btn = "rounded-xl px-5 py-3 font-bold text-sm min-h-[48px] disabled:opacity-60 inline-flex items-center justify-center";
  const inputCls = "block w-full text-sm rounded-lg border border-navy-100 bg-white px-3 py-3 min-h-[48px]";

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy("parse"); setError(null); setSummary(null); setPreview(null); setFileName(file.name);
    try {
      const raw = await parseRosterFile(file);
      setPreview(validateImportRows(raw, snap, scopeSportIds));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onCommit = async () => {
    if (!preview) return;
    setBusy("commit"); setError(null);
    try {
      const result = await commitRosterImport(provider, snap, preview);
      setSummary({ ...result, skipped: counts.skip, errors: counts.error });
      setPreview(null); setFileName(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    }
    setBusy(null);
  };

  const statusCell = (r: PreviewRow) => {
    if (r.status === "ok") return <span className="font-semibold text-navy-950">Ready{r.reason ? <span className="block font-normal text-neutral-500">{r.reason}</span> : null}</span>;
    if (r.status === "skip") return <span className="text-neutral-500">Skip — {r.reason}</span>;
    return <span className="font-medium text-crimson-800">{r.reason}</span>;
  };

  return (
    <section className="rounded-2xl border border-navy-100 bg-white p-4 space-y-4">
      <div>
        <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950">IMPORT ROSTERS (EXCEL / CSV)</h2>
        <p className="text-sm text-neutral-600 mt-1">
          Download the template — encoders type <strong>only the player name</strong>; Sport, Team and Division are
          picked from dropdowns baked from the real lists, so they can&apos;t be misspelled. A player is registered
          <strong> per sport</strong> (one row per sport they play). Upload the filled file, check the preview, then
          confirm — nothing is saved before you confirm.
          {scopeNames && <> Your import scope: <strong>{scopeNames}</strong>.</>}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button disabled={busy !== null} className={`${btn} bg-navy-950 text-white`}
          onClick={() => { setBusy("template"); setError(null); void downloadRosterTemplate(snap, scopeSportIds).catch((e) => setError(e instanceof Error ? e.message : "Template failed")).finally(() => setBusy(null)); }}>
          {busy === "template" ? "Building…" : "Download Excel template (.xlsx)"}
        </button>
        <button disabled={busy !== null} className={`${btn} bg-white border border-navy-100 text-navy-950`}
          onClick={() => downloadCsvSkeleton()}>
          Download CSV skeleton
        </button>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1" htmlFor="roster-import-file">Filled roster file (.xlsx or .csv)</label>
        <input id="roster-import-file" ref={fileRef} type="file" accept=".xlsx,.csv" disabled={busy !== null}
          className={inputCls} onChange={(e) => void onFile(e.target.files?.[0])} />
        {busy === "parse" && <p className="text-sm text-neutral-500 mt-1">Reading {fileName}…</p>}
      </div>

      {error && <p className="rounded-lg bg-crimson-100 border border-crimson-600 text-crimson-800 px-3 py-2 text-sm">{error}</p>}

      {summary && (
        <div className="rounded-lg bg-navy-50 border border-navy-100 px-3 py-2 text-sm space-y-1">
          <p><strong>Import done:</strong> added <strong>{summary.added}</strong> player{summary.added === 1 ? "" : "s"} across {summary.entriesUpdated} roster{summary.entriesUpdated === 1 ? "" : "s"}.
            {summary.skipped > 0 && <> {summary.skipped} row{summary.skipped === 1 ? "" : "s"} skipped (already listed / duplicates).</>}
            {summary.errors > 0 && <> {summary.errors} row{summary.errors === 1 ? "" : "s"} had errors and were not imported — fix them in the file and re-upload just those rows.</>}
          </p>
          {summary.failed.map((f) => (
            <p key={f.entryLabel} className="text-crimson-800">Couldn&apos;t save {f.entryLabel}: {f.message}</p>
          ))}
        </div>
      )}

      {preview && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-navy-950 text-white px-3 py-1 font-bold">{counts.ok} ready</span>
            <span className="rounded-full bg-navy-50 border border-navy-100 px-3 py-1 font-semibold">{counts.skip} already listed / duplicate</span>
            <span className="rounded-full bg-crimson-100 border border-crimson-600 text-crimson-800 px-3 py-1 font-semibold">{counts.error} with errors</span>
          </div>
          {preview.length === 0 && <p className="text-sm text-neutral-500">No data rows found — the file looks empty below the header.</p>}
          {preview.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-navy-100">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-navy-800 text-white text-left">
                    <th className="px-3 py-2">Row</th><th className="px-3 py-2">Player</th><th className="px-3 py-2">Sport</th>
                    <th className="px-3 py-2">Team</th><th className="px-3 py-2">Division</th><th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.rowNo} className="border-t border-navy-100 align-top">
                      <td className="px-3 py-2 text-neutral-500">{r.rowNo}</td>
                      <td className="px-3 py-2 font-medium">{r.name || <span className="text-crimson-800">(blank)</span>}</td>
                      <td className="px-3 py-2">{r.sport}</td>
                      <td className="px-3 py-2">{r.team}</td>
                      <td className="px-3 py-2">{r.division || <span className="text-neutral-400">—</span>}</td>
                      <td className="px-3 py-2">{statusCell(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button disabled={busy !== null || counts.ok === 0} className={`${btn} bg-crimson-800 text-white`}
              onClick={() => void onCommit()}>
              {busy === "commit" ? "Importing…" : `Confirm import — add ${counts.ok} player${counts.ok === 1 ? "" : "s"}`}
            </button>
            <button disabled={busy !== null} className={`${btn} bg-white border border-navy-100 text-navy-950`}
              onClick={() => { setPreview(null); setFileName(null); }}>
              Discard
            </button>
          </div>
          {counts.error > 0 && <p className="text-xs text-neutral-500">Rows with errors are never imported. Ready rows can be imported now; fix the error rows in the file and upload them again separately.</p>}
        </div>
      )}
    </section>
  );
}
