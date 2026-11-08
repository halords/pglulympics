// Sheet sync — pure grid parsers. Encode the tab layouts documented in
// data/sheet-extract.md (verified against live pulls 2026-11-08):
//
// TRACKER tabs (Volleyball, Basketball): one shared header row carries the
// standings block (ID | Team Name | Played | Wins | Losses | Win Pct, with
// "BRACKET X" separators and a "<SPORT> <MEN'S|WOMEN'S>" title per block)
// on the left and the fixture block on the right:
//   <division tag> | Date | Time | Venue | Match # | Team A | Team B |
//   Winner (Enter Team #) | <blank> | SCORES Team A | Team B | (set pairs…)
// Fixture Match # is per-division for Volleyball ("1".."16") and sheet-global
// for Basketball (DB labels "Match N"). Playoff rows carry their label in
// Match # ("Semis G1", "Bronze Match", "Gold Match") with teams blank.
//
// RACKET tabs (Pickle Ball, Badminton): entry matrix on top (ID | Team Name |
// <9 category columns>, cells "1" / "Incomplete" / blank), then fixture lists
// in TWO parallel blocks (left = Court 1, right = Court 2) with columns
// Date | Time | Venue | Match # | Team A | Team B — where "Match #" holds the
// CATEGORY, and the venue cell is just "Heritage 2500" (court from the
// block). Playoff rows put text slot descriptors in Team A ("SEMIFINAL 1:
// Bracket 1 – Rank 1", "THIRD-PLACE: …", "CHAMPIONSHIP: …"). NO score
// columns exist on these tabs (documented quirk) — schedule + entries only.
//
// MATRIX tabs (Bowling, Athletics, Laro ng Lahi, Mobile Games, Chess):
// banner date row, then ID | Team Name | <division columns>, cells
// "1" / "Incomplete" (any case) / blank. For placement_only sports the
// matrix doubles as the results sheet: once ANY cell in a division column
// is an ordinal ("2nd") or an integer ≥ 2, that column is read as PLACES
// ("1" = champion) instead of mere entries.
import type { Grid, SheetEntry, SheetFixture, SheetState } from "./types";

// ---------------- shared helpers ----------------

/** Name comparison key: case/punctuation-insensitive, with the workbook's
 *  known typo aliased to the seeded name ("PDRRMO HAZARD BREAKERSA"). */
const NAME_ALIASES: Record<string, string> = {
  "PDRRMO HAZARD BREAKERSA": "PDRRMO HAZARD BREAKERS",
};
export function normName(raw: string | null | undefined): string {
  const n = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return NAME_ALIASES[n] ?? n;
}
export function slugify(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** "November 9, 2026" | "11/16/2026" | "November 25" (event year) → yyyy-mm-dd. */
export function parseSheetDate(raw: string | null | undefined, year = 2026): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = t.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) return `${m[3] ?? year}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

/** "1:00 PM" → "13:00" (24h). Null when unparseable. */
export function parseSheetTime(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toUpperCase();
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[3];
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** Date + time → ISO instant with the Asia/Manila offset the seed used. */
export function sheetInstant(date: string | null, time: string | null): string | null {
  if (!date) return null;
  if (!time) return null;
  return `${date}T${time}:00+08:00`;
}

const cell = (row: string[] | undefined, i: number): string => (row?.[i] ?? "").trim();
const isInt = (s: string) => /^\d+$/.test(s);
const numOrNull = (s: string): number | null => {
  if (!/^-?\d+$/.test(s.trim())) return null;
  return Number(s);
};

// ---------------- tracker tabs (volleyball / basketball) ----------------

function trackerDivisionKey(tag: string): string | null {
  if (/women/i.test(tag)) return "womens";
  if (/men/i.test(tag)) return "mens";
  return null;
}

export function parseTrackerTab(grid: Grid, sportSlug: string, tabName: string): SheetState {
  const fixtures: SheetFixture[] = [];
  const entries: SheetEntry[] = [];
  const warnings: string[] = [];
  const ref = (r: number) => `${tabName} · row ${r + 1}`;

  const headerIdx = grid.findIndex((row) => row.some((c) => c.trim() === "Match #"));
  if (headerIdx < 0) throw new Error(`no fixture header row found`);
  const header = grid[headerIdx];
  const colOf = (label: string, from = 0) => header.findIndex((c, i) => i >= from && c.trim() === label);
  const idCol = colOf("ID");
  const nameCol = colOf("Team Name");
  const matchCol = colOf("Match #");
  const dateCol = colOf("Date");
  const timeCol = colOf("Time");
  const venueCol = colOf("Venue");
  const teamACol = colOf("Team A");
  const teamBCol = colOf("Team B");
  const winnerCol = colOf("Winner (Enter Team #)");
  const tagCol = dateCol - 1;
  // SCORES pairs start at the next "Team A" header right of the winner column.
  const scoreStart = winnerCol >= 0 ? colOf("Team A", winnerCol + 1) : -1;

  // --- standings blocks → entries + winner-id maps ---
  const winnerIds = new Map<string, Map<number, string>>();
  let curDiv: string | null = null;
  let curGroup: string | null = null;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    const leftText = row.slice(0, 8).join(" ");
    const title = leftText.match(/(VOLLEYBALL|BASKETBALL)\s+(MEN|WOMEN)/i);
    if (title) { curDiv = trackerDivisionKey(title[2]); curGroup = null; continue; }
    const bracket = row.slice(0, 8).map((c) => c.trim()).find((c) => /^BRACKET\s+\S+$/i.test(c));
    if (bracket) { curGroup = bracket.replace(/\s+/g, " ").replace(/^BRACKET/i, "Bracket"); continue; }
    if (curDiv && idCol >= 0 && isInt(cell(row, idCol)) && cell(row, nameCol)) {
      const teamName = cell(row, nameCol);
      entries.push({ sportSlug, divisionKey: curDiv, teamName, groupName: curGroup, place: null, sourceRef: ref(r) });
      const map = winnerIds.get(curDiv) ?? new Map<number, string>();
      map.set(Number(cell(row, idCol)), teamName);
      winnerIds.set(curDiv, map);
    }
  }

  // --- fixture rows ---
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    const matchCell = cell(row, matchCol);
    if (!matchCell) continue;
    const divKey = trackerDivisionKey(cell(row, tagCol));
    if (!divKey) { warnings.push(`${ref(r)}: fixture row without a recognizable division tag — skipped`); continue; }
    const label = isInt(matchCell)
      ? (sportSlug === "basketball" ? `Match ${matchCell}` : matchCell)
      : matchCell.replace(/\s+/g, " ");
    const stage: SheetFixture["stage"] =
      /^semis/i.test(label) ? "semifinal" : /^bronze/i.test(label) ? "bronze" : /^gold/i.test(label) ? "gold" : "round_robin";
    // recorded score pairs
    let scorePairs: [number, number][] | null = null;
    if (scoreStart >= 0) {
      const pairs: [number, number][] = [];
      for (let c = scoreStart; c + 1 < row.length + 1 && c < scoreStart + 12; c += 2) {
        const a = numOrNull(cell(row, c));
        const b = numOrNull(cell(row, c + 1));
        if (a === null && b === null) break;
        if (a === null || b === null) { warnings.push(`${ref(r)}: partial score pair ignored`); break; }
        pairs.push([a, b]);
      }
      if (pairs.length) scorePairs = pairs;
    }
    // winner (corroboration only): team # via the standings id map, else a name
    let winnerName: string | null = null;
    const w = cell(row, winnerCol);
    if (w) {
      winnerName = isInt(w) ? (winnerIds.get(divKey)?.get(Number(w)) ?? null) : w;
      if (isInt(w) && !winnerName) warnings.push(`${ref(r)}: winner team #${w} not in the standings block`);
    }
    fixtures.push({
      sportSlug, divisionKey: divKey, label, stage,
      teamA: cell(row, teamACol) || null,
      teamB: cell(row, teamBCol) || null,
      startsAt: sheetInstant(parseSheetDate(cell(row, dateCol)), parseSheetTime(cell(row, timeCol))),
      venue: cell(row, venueCol) || null,
      scorePairs, winnerName,
      sourceRef: ref(r),
    });
  }
  return { fixtures, entries, warnings };
}

// ---------------- racket tabs (pickleball / badminton) ----------------

function parseMatrixRows(
  grid: Grid, sportSlug: string, tabName: string,
  opts: { placement: boolean },
): { byDivision: Map<string, SheetEntry[]>; headerIdx: number } {
  const headerIdx = grid.findIndex((row) => row.some((c) => c.trim() === "ID") && row.some((c) => c.trim() === "Team Name"));
  if (headerIdx < 0) throw new Error("no entry-matrix header row found");
  const header = grid[headerIdx];
  const idCol = header.findIndex((c) => c.trim() === "ID");
  const nameCol = header.findIndex((c) => c.trim() === "Team Name");
  const divCols: { col: number; key: string }[] = [];
  for (let c = nameCol + 1; c < header.length; c++) {
    if (header[c].trim()) divCols.push({ col: c, key: slugify(header[c]) });
  }
  const byDivision = new Map<string, SheetEntry[]>();
  for (const { col, key } of divCols) {
    const rows: { teamName: string; raw: string; r: number }[] = [];
    for (let r = headerIdx + 1; r < grid.length; r++) {
      const row = grid[r];
      if (!isInt(cell(row, idCol)) || !cell(row, nameCol)) continue;
      const raw = cell(row, col);
      if (raw) rows.push({ teamName: cell(row, nameCol), raw, r });
    }
    // places mode: any ordinal or integer ≥ 2 flips the whole column
    const placesMode = opts.placement && rows.some(({ raw }) =>
      /^\d+(st|nd|rd|th)$/i.test(raw) || (isInt(raw) && Number(raw) >= 2));
    const list: SheetEntry[] = rows.map(({ teamName, raw, r }) => {
      let place: number | null = null;
      if (placesMode) {
        const ord = raw.match(/^(\d+)(st|nd|rd|th)$/i);
        if (ord) place = Number(ord[1]);
        else if (isInt(raw)) place = Number(raw);
      }
      return { sportSlug, divisionKey: key, teamName, groupName: null, place, sourceRef: `${tabName} · row ${r + 1}` };
    });
    byDivision.set(key, list);
  }
  return { byDivision, headerIdx };
}

export function parseRacketTab(grid: Grid, sportSlug: string, tabName: string): SheetState {
  const warnings: string[] = [];
  const { byDivision } = parseMatrixRows(grid, sportSlug, tabName, { placement: false });
  const entries: SheetEntry[] = [...byDivision.values()].flat();
  const fixtures: SheetFixture[] = [];
  const ref = (r: number) => `${tabName} · row ${r + 1}`;

  // fixture block headers: rows with Date + Match # column pairs
  const blockStarts: { headerRow: number; col: number; court: number }[] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    let court = 0;
    for (let c = 0; c + 3 < row.length; c++) {
      if (row[c].trim() === "Date" && row[c + 3]?.trim() === "Match #") {
        court += 1;
        blockStarts.push({ headerRow: r, col: c, court });
      }
    }
  }
  for (const block of blockStarts) {
    for (let r = block.headerRow + 1; r < grid.length; r++) {
      const row = grid[r];
      if (row.some((c) => c.trim() === "Match #") && r !== block.headerRow) break; // next block header row
      const dateRaw = cell(row, block.col);
      if (!dateRaw) continue;
      const category = cell(row, block.col + 3);
      const teamA = cell(row, block.col + 4) || null;
      const teamB = cell(row, block.col + 5) || null;
      if (!category) continue;
      const divisionKey = slugify(category);
      const venueBase = cell(row, block.col + 2) || "Heritage 2500";
      const venue = `${venueBase} · Court ${block.court}`;
      const startsAt = sheetInstant(parseSheetDate(dateRaw), parseSheetTime(cell(row, block.col + 1)));
      const playoff = teamA?.match(/^(SEMIFINAL|THIRD|CHAMPIONSHIP)/i);
      if (playoff) {
        const kind = playoff[1].toUpperCase();
        const label = kind === "SEMIFINAL"
          ? (/SEMIFINAL\s*1/i.test(teamA!) ? "Semifinal 1" : "Semifinal 2")
          : kind === "THIRD" ? "Third-Place Match" : "Championship";
        fixtures.push({
          sportSlug, divisionKey, label,
          stage: kind === "SEMIFINAL" ? "semifinal" : kind === "THIRD" ? "bronze" : "gold",
          teamA: null, teamB: null, startsAt, venue, scorePairs: null, winnerName: null,
          sourceRef: ref(r),
        });
        continue;
      }
      if (!teamA) continue;
      if (!teamB) {
        // walkover row — not a match (documented); the team still counts as entered
        warnings.push(`${ref(r)}: walkover row (${teamA}) is not a match — counted as an entry only`);
        if (!entries.some((e) => e.divisionKey === divisionKey && normName(e.teamName) === normName(teamA))) {
          entries.push({ sportSlug, divisionKey, teamName: teamA, groupName: null, place: null, sourceRef: ref(r) });
        }
        continue;
      }
      fixtures.push({
        sportSlug, divisionKey, label: null, stage: "round_robin",
        teamA, teamB, startsAt, venue, scorePairs: null, winnerName: null,
        sourceRef: ref(r),
      });
    }
  }
  return { fixtures, entries, warnings };
}

// ---------------- matrix-only tabs ----------------

export function parseMatrixTab(
  grid: Grid, sportSlug: string, tabName: string, opts: { placement: boolean },
): SheetState {
  const { byDivision } = parseMatrixRows(grid, sportSlug, tabName, opts);
  return { fixtures: [], entries: [...byDivision.values()].flat(), warnings: [] };
}
