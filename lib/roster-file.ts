// Roster import — browser-side I/O: parse an uploaded .xlsx/.csv into raw
// rows, download the controlled template, and commit a confirmed preview
// through the same provider write paths the manual roster editor uses
// (upsertPlayer + setEntryRoster). Validation lives in lib/roster-import.ts
// (pure); this file only moves bytes.

import {
  ROSTER_CSV_SKELETON, importCommitPlan, templateListsFromSnapshot,
  type PreviewRow, type RawImportRow,
} from "./roster-import";
import type { DataProvider, Snapshot } from "./types";

// ---------------- parsing ----------------

/** Extract raw rows from a cell grid: finds the header row (Player Name /
 *  Sport / Team / Division — columns may be in template order or any
 *  order) within the first rows, then reads every row below it. */
export function rowsFromGrid(grid: string[][]): RawImportRow[] {
  let headerAt = -1;
  let cols = { name: -1, sport: -1, team: -1, division: -1 };
  for (let i = 0; i < Math.min(grid.length, 8); i++) {
    const cells = grid[i].map((c) => c.trim().toLowerCase());
    const found = {
      name: cells.findIndex((c) => c.startsWith("player") || c === "name"),
      sport: cells.findIndex((c) => c === "sport"),
      team: cells.findIndex((c) => c === "team"),
      division: cells.findIndex((c) => c.startsWith("division")),
    };
    if (found.name >= 0 && found.sport >= 0 && found.team >= 0) { headerAt = i; cols = found; break; }
  }
  if (headerAt < 0) {
    throw new Error("Could not find the header row — the file must have Player Name, Sport, Team and Division columns (use the template).");
  }
  const rows: RawImportRow[] = [];
  for (let i = headerAt + 1; i < grid.length; i++) {
    const g = grid[i];
    const get = (c: number) => (c >= 0 ? (g[c] ?? "").trim() : "");
    rows.push({
      rowNo: i + 1,
      name: get(cols.name), sport: get(cols.sport), team: get(cols.team), division: get(cols.division),
    });
  }
  return rows;
}

/** Minimal RFC-4180 CSV tokenizer (quotes, escaped quotes, CRLF). */
export function csvToGrid(text: string): string[][] {
  const grid: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      grid.push(row); row = [];
    } else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); grid.push(row); }
  return grid;
}

export function parseCsvText(text: string): RawImportRow[] {
  return rowsFromGrid(csvToGrid(text));
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (typeof v.text === "string") return v.text;
    if ("result" in v) return cellText(v.result);
  }
  return "";
}

export async function parseRosterFile(file: File): Promise<RawImportRow[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) return parseCsvText(await file.text());
  if (!lower.endsWith(".xlsx")) throw new Error("Upload the filled template (.xlsx) or a .csv file.");
  const mod = (await import("exceljs")) as unknown as { default?: typeof import("exceljs"); Workbook?: unknown };
  const ExcelJS = (mod.default ?? mod) as typeof import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet("Roster") ?? wb.worksheets[0];
  if (!ws) throw new Error("The workbook has no sheets.");
  const grid: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    const values = row.values as unknown[];
    for (let c = 1; c < values.length; c++) cells.push(cellText(values[c]));
    grid.push(cells);
  });
  return rowsFromGrid(grid);
}

// ---------------- downloads ----------------

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** The controlled Excel template, baked from the CURRENT snapshot lists
 *  (sports limited to the caller's scope; teams event-wide). */
export async function downloadRosterTemplate(snap: Snapshot, sportIds: readonly string[]): Promise<void> {
  const { buildRosterTemplateBuffer } = await import("./roster-template");
  const buf = await buildRosterTemplateBuffer(templateListsFromSnapshot(snap, sportIds));
  saveBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "pglulympics-roster-template.xlsx",
  );
}

export function downloadCsvSkeleton(): void {
  saveBlob(new Blob([ROSTER_CSV_SKELETON], { type: "text/csv" }), "pglulympics-roster-template.csv");
}

// ---------------- commit ----------------

export interface ImportCommitSummary {
  /** New roster memberships actually written. */
  added: number;
  entriesUpdated: number;
  failed: { entryLabel: string; message: string }[];
}

/** Write the confirmed preview: for each affected entry, upsert the new
 *  players (dedupe by name inside the event, handled by the provider) and
 *  save the merged roster — exactly the manual editor's write path. A
 *  failure on one entry does not stop the others. */
export async function commitRosterImport(
  provider: DataProvider, snap: Snapshot, preview: readonly PreviewRow[],
): Promise<ImportCommitSummary> {
  const plan = importCommitPlan(preview);
  const summary: ImportCommitSummary = { added: 0, entriesUpdated: 0, failed: [] };
  const labelOf = (entryId: string) => {
    const e = snap.entries.find((x) => x.id === entryId);
    const team = e ? snap.teams.find((t) => t.id === e.teamId)?.name : undefined;
    const div = e ? snap.divisions.find((d) => d.id === e.divisionId)?.name : undefined;
    return `${team ?? entryId} — ${div ?? ""}`;
  };
  for (const group of plan) {
    try {
      const ids = [...(snap.rosters[group.entryId] ?? [])];
      let newCount = 0;
      for (const name of group.names) {
        const player = await provider.upsertPlayer(name);
        if (!ids.includes(player.id)) { ids.push(player.id); newCount++; }
      }
      if (newCount > 0) {
        await provider.setEntryRoster(group.entryId, ids);
        summary.entriesUpdated++;
        summary.added += newCount;
      }
    } catch (e) {
      summary.failed.push({ entryLabel: labelOf(group.entryId), message: e instanceof Error ? e.message : "Failed to save" });
    }
  }
  return summary;
}
