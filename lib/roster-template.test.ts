import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  TEMPLATE_FIRST_DATA_ROW, TEMPLATE_LAST_DATA_ROW, buildRosterTemplateWorkbook, dataValidationsOf, divisionRangeName,
} from "./roster-template";

const lists = {
  sports: [
    { name: "Volleyball", divisions: ["Men's", "Women's"] },
    { name: "Laro ng Lahi", divisions: ["Patintero", "Shatong"] },
  ],
  teams: ["CODE RED", "BLUE"],
};

describe("buildRosterTemplateWorkbook", () => {
  it("bakes named ranges for sports, teams and per-sport divisions", async () => {
    const wb = await buildRosterTemplateWorkbook(lists);
    const names = wb.definedNames.model.map((d) => d.name).sort();
    expect(names).toEqual(["Div_Laro_ng_Lahi", "Div_Volleyball", "Sports", "Teams"]);
    expect(divisionRangeName("Laro ng Lahi")).toBe("Div_Laro_ng_Lahi");
  });

  it("puts list validations on Sport/Team and an INDIRECT dependent validation on Division", async () => {
    const wb = await buildRosterTemplateWorkbook(lists);
    const ws = wb.getWorksheet("Roster")!;
    // Pre-write, exceljs keys the model by range; after a write/read round
    // trip (next test) it expands per cell over the same ranges.
    const model = dataValidationsOf(ws).model;
    const first = TEMPLATE_FIRST_DATA_ROW;
    const last = TEMPLATE_LAST_DATA_ROW;
    expect(model[`B${first}:B${last}`]?.type).toBe("list");
    expect(model[`B${first}:B${last}`]?.formulae).toEqual(["Sports"]);
    expect(model[`C${first}:C${last}`]?.formulae).toEqual(["Teams"]);
    expect(model[`D${first}:D${last}`]?.formulae).toEqual([`INDIRECT("Div_"&SUBSTITUTE($B${first}," ","_"))`]);
    expect(TEMPLATE_LAST_DATA_ROW - TEMPLATE_FIRST_DATA_ROW + 1).toBe(200);
  });

  it("survives a write/read round-trip with validations and lists intact", async () => {
    const wb = await buildRosterTemplateWorkbook(lists);
    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as ArrayBuffer);
    const ws = back.getWorksheet("Roster")!;
    const model = dataValidationsOf(ws).model;
    expect(model[`B${TEMPLATE_FIRST_DATA_ROW}`]?.formulae).toEqual(["Sports"]);
    expect(model[`D${TEMPLATE_FIRST_DATA_ROW}`]?.formulae?.[0]).toContain("INDIRECT");
    expect(back.definedNames.model.map((d) => d.name)).toContain("Div_Volleyball");
    const listsSheet = back.getWorksheet("Lists")!;
    expect(listsSheet.getCell("A2").value).toBe("Volleyball");
    expect(listsSheet.getCell("C3").value).toBe("BLUE");
    const divSheet = back.getWorksheet("ListsDiv")!;
    expect(divSheet.getCell("B2").value).toBe("Patintero");
  });
});
