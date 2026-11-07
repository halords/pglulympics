// Roster import TEMPLATE builder (exceljs).
//
// Produces the controlled .xlsx encoders fill in: they type ONLY the
// player name. Sport / Team / Division are Excel list validations backed
// by workbook-level named ranges baked from the system's REAL lists at
// download time, so those values cannot be mistyped:
//   B (Sport)    -> list: Sports          (named range on the Lists sheet)
//   C (Team)     -> list: Teams           (named range on the Lists sheet)
//   D (Division) -> list: INDIRECT("Div_"&SUBSTITUTE($B4," ","_"))
//                   — a dependent dropdown: the named range Div_<Sport>
//                   holds only that sport's divisions.
//
// This module statically imports exceljs (heavy) — always load it via a
// dynamic import() from UI code so it stays out of the main bundle. The
// standalone generator (scripts/gen-roster-template.mjs) compiles this
// file directly to produce the seed-based roster-template.xlsx.

import ExcelJS from "exceljs";
import type { RosterTemplateLists } from "./roster-import";

export type { RosterTemplateLists };

/** Layout contract shared with the parser (lib/roster-file.ts). */
export const ROSTER_SHEET_NAME = "Roster";
export const TEMPLATE_TITLE_ROW = 1;
export const TEMPLATE_HELP_ROW = 2;
export const TEMPLATE_HEADER_ROW = 3;
export const TEMPLATE_FIRST_DATA_ROW = 4;
export const TEMPLATE_ENTRY_ROWS = 200;
export const TEMPLATE_LAST_DATA_ROW = TEMPLATE_FIRST_DATA_ROW + TEMPLATE_ENTRY_ROWS - 1;

/** exceljs implements data validations at runtime but its bundled
 *  Worksheet type omits them — this is the typed doorway. */
export interface DataValidationRule {
  type: "list";
  allowBlank?: boolean;
  formulae?: string[];
  showErrorMessage?: boolean;
  errorTitle?: string;
  error?: string;
  showInputMessage?: boolean;
  promptTitle?: string;
  prompt?: string;
}
export interface WorksheetDataValidations {
  add(range: string, rule: DataValidationRule): void;
  readonly model: Record<string, DataValidationRule>;
}
export function dataValidationsOf(ws: ExcelJS.Worksheet): WorksheetDataValidations {
  return (ws as unknown as { dataValidations: WorksheetDataValidations }).dataValidations;
}

const NAVY = "FF061A3A";
const NAVY_LINE = "FFD9D2C2";
const WHITE = "FFFFFFFF";

/** Named-range-safe suffix for a sport: "Laro ng Lahi" -> "Laro_ng_Lahi". */
export function divisionRangeName(sportName: string): string {
  return `Div_${sportName.replace(/[^A-Za-z0-9]+/g, "_")}`;
}

function colLetter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

export async function buildRosterTemplateWorkbook(lists: RosterTemplateLists): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PGLUlympics";
  wb.created = new Date();

  // ---------- reference lists (hidden) ----------
  const listsSheet = wb.addWorksheet("Lists");
  listsSheet.state = "hidden";
  listsSheet.getCell("A1").value = "SPORTS";
  lists.sports.forEach((s, i) => { listsSheet.getCell(`A${i + 2}`).value = s.name; });
  listsSheet.getCell("C1").value = "TEAMS";
  lists.teams.forEach((t, i) => { listsSheet.getCell(`C${i + 2}`).value = t; });
  if (lists.sports.length) {
    wb.definedNames.add(`'Lists'!$A$2:$A$${lists.sports.length + 1}`, "Sports");
  }
  if (lists.teams.length) {
    wb.definedNames.add(`'Lists'!$C$2:$C$${lists.teams.length + 1}`, "Teams");
  }

  const divSheet = wb.addWorksheet("ListsDiv");
  divSheet.state = "hidden";
  lists.sports.forEach((s, i) => {
    const col = colLetter(i + 1);
    divSheet.getCell(`${col}1`).value = s.name;
    s.divisions.forEach((d, j) => { divSheet.getCell(`${col}${j + 2}`).value = d; });
    if (s.divisions.length) {
      wb.definedNames.add(`'ListsDiv'!$${col}$2:$${col}$${s.divisions.length + 1}`, divisionRangeName(s.name));
    }
  });

  // ---------- the sheet encoders fill ----------
  const ws = wb.addWorksheet(ROSTER_SHEET_NAME);
  ws.columns = [{ width: 34 }, { width: 20 }, { width: 32 }, { width: 22 }];

  ws.mergeCells("A1:D1");
  const title = ws.getCell("A1");
  title.value = "PGLUlympics — Roster Import Template";
  title.font = { name: "Calibri", size: 14, bold: true, color: { argb: WHITE } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  title.alignment = { vertical: "middle" };
  ws.getRow(1).height = 26;

  ws.mergeCells("A2:D2");
  const help = ws.getCell("A2");
  help.value = "Type ONLY the player name in column A. Pick Sport, Team and Division from the DROPDOWNS — do not type them, so team and sport names are never misspelled. "
    + "The Division dropdown follows the Sport you pick. One row per player PER SPORT: a player in 3 sports gets 3 rows. Leave Division blank only if the team plays in a single division of that sport. "
    + "When done, upload this file on the console Roster page (Import section).";
  help.alignment = { wrapText: true, vertical: "middle" };
  help.font = { name: "Calibri", size: 10, italic: true };
  ws.getRow(2).height = 42;

  const headers = ["Player Name", "Sport", "Team", "Division"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(TEMPLATE_HEADER_ROW, i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  ws.getRow(TEMPLATE_HEADER_ROW).height = 20;

  const thin = { style: "thin" as const, color: { argb: NAVY_LINE } };
  const border = { top: thin, bottom: thin, left: thin, right: thin };
  for (let r = TEMPLATE_FIRST_DATA_ROW; r <= TEMPLATE_LAST_DATA_ROW; r++) {
    for (let c = 1; c <= 4; c++) ws.getCell(r, c).border = border;
  }

  const listError = {
    showErrorMessage: true,
    errorTitle: "Pick from the list",
    error: "Please choose a value from the dropdown — typed values are rejected on import.",
    showInputMessage: true,
  };
  const dv = dataValidationsOf(ws);
  if (lists.sports.length) {
    dv.add(`B${TEMPLATE_FIRST_DATA_ROW}:B${TEMPLATE_LAST_DATA_ROW}`, {
      type: "list", allowBlank: true, formulae: ["Sports"],
      promptTitle: "Sport", prompt: "Pick the sport from the list.", ...listError,
    });
    dv.add(`D${TEMPLATE_FIRST_DATA_ROW}:D${TEMPLATE_LAST_DATA_ROW}`, {
      type: "list", allowBlank: true,
      formulae: [`INDIRECT("Div_"&SUBSTITUTE($B${TEMPLATE_FIRST_DATA_ROW}," ","_"))`],
      promptTitle: "Division", prompt: "Pick the division — the list follows the Sport in column B.", ...listError,
    });
  }
  if (lists.teams.length) {
    dv.add(`C${TEMPLATE_FIRST_DATA_ROW}:C${TEMPLATE_LAST_DATA_ROW}`, {
      type: "list", allowBlank: true, formulae: ["Teams"],
      promptTitle: "Team", prompt: "Pick the team from the list.", ...listError,
    });
  }

  ws.views = [{ state: "frozen", ySplit: TEMPLATE_HEADER_ROW, topLeftCell: `A${TEMPLATE_FIRST_DATA_ROW}` }];
  return wb;
}

/** Serialize a built template to a downloadable buffer. */
export async function buildRosterTemplateBuffer(lists: RosterTemplateLists): Promise<ArrayBuffer> {
  const wb = await buildRosterTemplateWorkbook(lists);
  return wb.xlsx.writeBuffer();
}
