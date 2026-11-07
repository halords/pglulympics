// Admin Top-3 report — Excel workbook builder (exceljs).
//
// This module statically imports exceljs (heavy) — always load it via a
// dynamic import() from UI code (see lib/report-file.ts) so it stays out
// of the main bundle, same pattern as lib/roster-template.ts.
import ExcelJS from "exceljs";
import { top3SheetRows, type Top3Report } from "./report";

const NAVY = "FF061A3A";
const NAVY_LINE = "FFD9D2C2";
const WHITE = "FFFFFFFF";

function headerRow(ws: ExcelJS.Worksheet, headers: string[]) {
  headers.forEach((h, i) => {
    const cell = ws.getCell(1, i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  ws.getRow(1).height = 20;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

const thin = { style: "thin" as const, color: { argb: NAVY_LINE } };
const border = { top: thin, bottom: thin, left: thin, right: thin };

/** Workbook with two sheets:
 *  - "Top 3": Sport | Division/Category | Place | Team (one row per
 *    team-place, report order; undecided divisions are absent — their
 *    absence plus the tally sheet is the coverage picture).
 *  - "Medal Tally": Rank | Team | Gold | Silver | Bronze | Points. */
export async function buildTop3WorkbookBuffer(report: Top3Report): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PGLUlympics";
  wb.created = new Date();

  const top3 = wb.addWorksheet("Top 3");
  top3.columns = [{ width: 22 }, { width: 30 }, { width: 8 }, { width: 34 }];
  headerRow(top3, ["Sport", "Division/Category", "Place", "Team"]);
  top3SheetRows(report).forEach((r, i) => {
    const row = top3.getRow(i + 2);
    row.getCell(1).value = r.sport;
    row.getCell(2).value = r.division;
    row.getCell(3).value = r.place;
    row.getCell(3).alignment = { horizontal: "center" };
    row.getCell(4).value = r.team;
    row.eachCell((c) => { c.border = border; c.font = { name: "Calibri", size: 11 }; });
  });

  const tally = wb.addWorksheet("Medal Tally");
  tally.columns = [{ width: 8 }, { width: 34 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }];
  headerRow(tally, ["Rank", "Team", "Gold", "Silver", "Bronze", "Points"]);
  report.tally.forEach((r, i) => {
    const row = tally.getRow(i + 2);
    row.getCell(1).value = r.points > 0 ? r.rank : "—";
    row.getCell(2).value = r.teamName;
    row.getCell(3).value = r.gold;
    row.getCell(4).value = r.silver;
    row.getCell(5).value = r.bronze;
    row.getCell(6).value = r.points;
    row.eachCell((c) => { c.border = border; c.font = { name: "Calibri", size: 11 }; });
    row.getCell(2).font = { name: "Calibri", size: 11, bold: true };
  });

  return wb.xlsx.writeBuffer();
}
