// Sheet sync — workbook fetching (SERVER ONLY). One fetch per tab per run;
// a failed tab is reported and skipped, never fatal to the run.
//
// Transport choice (verified 2026-11-08): the CSV export endpoint returns
// the grid verbatim (identical to the Phase-0 pulls the seed was built
// from), while the gviz JSON endpoint folds this workbook's title/merged
// rows into column labels and drops rows — so CSV is PRIMARY and gviz is
// only a fallback when the export endpoint errors.
import { parseMatrixTab, parseRacketTab, parseTrackerTab } from "./parse";
import { SHEET_ID, SHEET_TABS, type Grid } from "./types";
import type { ParsedTab } from "./engine";

const TIMEOUT_MS = 20_000;
const PLACEMENT_SPORTS = new Set(["bowling", "athletics", "laro-ng-lahi"]);

async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Minimal RFC-4180 CSV tokenizer (quoted fields, "" escapes, CRLF). */
export function parseCsv(text: string): Grid {
  const rows: Grid = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field.trim()); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length || row.length) pushRow();
  // drop fully-empty trailing rows (export pads the grid)
  while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  return rows;
}

export function parseGviz(text: string): Grid {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("gviz: no JSON payload");
  const j = JSON.parse(text.slice(start, end + 1)) as {
    table?: { rows?: { c?: ({ v?: unknown; f?: string } | null)[] }[] };
  };
  const rows = j.table?.rows ?? [];
  return rows.map((r) => (r.c ?? []).map((c) => {
    if (!c) return "";
    if (typeof c.f === "string" && c.f !== "") return c.f.trim();
    return c.v === null || c.v === undefined ? "" : String(c.v).trim();
  }));
}

async function fetchTabGrid(tab: (typeof SHEET_TABS)[number]): Promise<Grid> {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${tab.gid}`;
  try {
    return parseCsv(await fetchText(csvUrl));
  } catch {
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=0&sheet=${encodeURIComponent(tab.name)}`;
    return parseGviz(await fetchText(gvizUrl));
  }
}

/** Fetch + parse every tab. Never throws: per-tab failures ride along as
 *  { error } entries so the engine can isolate them. */
export async function fetchAllTabs(): Promise<ParsedTab[]> {
  const out: ParsedTab[] = [];
  for (const tab of SHEET_TABS) {
    try {
      const grid = await fetchTabGrid(tab);
      if (!tab.sportSlug) {
        // SUM is the derived medal tally — fetched for health reporting,
        // NEVER parsed into changes.
        out.push({ name: tab.name, sportSlug: null, state: { fixtures: [], entries: [], warnings: [] } });
        continue;
      }
      const state =
        tab.sportSlug === "volleyball" || tab.sportSlug === "basketball"
          ? parseTrackerTab(grid, tab.sportSlug, tab.name)
          : tab.sportSlug === "pickleball" || tab.sportSlug === "badminton"
            ? parseRacketTab(grid, tab.sportSlug, tab.name)
            : parseMatrixTab(grid, tab.sportSlug, tab.name, { placement: PLACEMENT_SPORTS.has(tab.sportSlug) });
      out.push({ name: tab.name, sportSlug: tab.sportSlug, state });
    } catch (e) {
      out.push({
        name: tab.name, sportSlug: tab.sportSlug,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return out;
}
