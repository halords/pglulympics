// Admin Top-3 report — browser-side download (mirrors lib/roster-file.ts:
// the heavy exceljs builder is dynamically imported so it code-splits).
import type { Top3Report } from "./report";

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

export async function downloadTop3Xlsx(report: Top3Report): Promise<void> {
  const { buildTop3WorkbookBuffer } = await import("./report-xlsx");
  const buf = await buildTop3WorkbookBuffer(report);
  saveBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "pglulympics-top3-report.xlsx",
  );
}
