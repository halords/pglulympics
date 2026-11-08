import { describe, expect, it } from "vitest";
import { normName, parseMatrixTab, parseRacketTab, parseSheetDate, parseSheetTime, parseTrackerTab } from "./parse";
import type { Grid } from "./types";

// Synthetic grids mirroring the documented layouts (data/sheet-extract.md).

const VB_HEADER = ["", "ID", "Team Name", "Played", "Wins", "Losses", "Win Pct", "", "", "Date", "Time", "Venue", "Match #", "Team A", "Team B", "Winner (Enter Team #)", "", "Team A", "Team B", "Team A", "Team B"];
function vbRow(partial: Record<number, string>): string[] {
  const row = new Array(21).fill("");
  for (const [k, v] of Object.entries(partial)) row[Number(k)] = v;
  return row;
}

describe("parseTrackerTab (volleyball layout)", () => {
  const grid: Grid = [
    vbRow({ 2: "ignored title row" }),
    vbRow({ 1: "VOLLEYBALL MEN'S" }),
    VB_HEADER,
    vbRow({ 1: "BRACKET A", 8: "Mens Volleyball", 9: "November 9, 2026", 10: "1:00 PM", 11: "DMMMSU Covered Court", 12: "1", 13: "CODE RED", 14: "THE CODE BLUES", 15: "1", 17: "25", 18: "20", 19: "25", 20: "22" }),
    vbRow({ 1: "1", 2: "CODE RED", 8: "Mens Volleyball", 9: "November 9, 2026", 10: "2:00 PM", 11: "DMMMSU Covered Court", 12: "2", 13: "ELYUNITED HEALTH WARRIORS", 14: "TRIFORCE BANNUARS" }),
    vbRow({ 1: "2", 2: "ELYUNITED HEALTH WARRIORS", 8: "Mens Volleyball", 9: "November 25, 2026", 10: "12:30 PM", 11: "DMMMSU Covered Court", 12: "Semis G1" }),
    vbRow({ 1: "3", 2: "TRIFORCE BANNUARS" }),
    vbRow({ 1: "4", 2: "THE CODE BLUES" }),
  ];
  const state = parseTrackerTab(grid, "volleyball", "Volleyball");

  it("parses standings entries with bracket groups", () => {
    expect(state.entries).toHaveLength(4);
    expect(state.entries[0]).toMatchObject({ divisionKey: "mens", teamName: "CODE RED", groupName: "Bracket A" });
  });

  it("parses fixtures with per-set score pairs and sheet instants", () => {
    const f1 = state.fixtures.find((f) => f.label === "1")!;
    expect(f1.teamA).toBe("CODE RED");
    expect(f1.startsAt).toBe("2026-11-09T13:00:00+08:00");
    expect(f1.venue).toBe("DMMMSU Covered Court");
    expect(f1.scorePairs).toEqual([[25, 20], [25, 22]]);
    const f2 = state.fixtures.find((f) => f.label === "2")!;
    expect(f2.scorePairs).toBeNull();
  });

  it("resolves the Winner column's team # through the standings block", () => {
    const f1 = state.fixtures.find((f) => f.label === "1")!;
    expect(f1.winnerName).toBe("CODE RED");
  });

  it("parses playoff rows (label in Match #, teams blank)", () => {
    const sf = state.fixtures.find((f) => f.label === "Semis G1")!;
    expect(sf.stage).toBe("semifinal");
    expect(sf.teamA).toBeNull();
  });
});

describe("parseTrackerTab (basketball labels + totals)", () => {
  const grid: Grid = [
    VB_HEADER,
    vbRow({ 1: "BASKETBALL MEN'S" }),
    vbRow({ 1: "BRACKET A", 8: "Basketball Mens", 9: "November 9, 2026", 10: "1:00 PM", 11: "DMMMSU Gym", 12: "2", 13: "AGKAYSA GUARDians", 14: "THE CODE BLUES", 17: "80", 18: "71" }),
    vbRow({ 1: "1", 2: "AGKAYSA GUARDians" }),
  ];
  const state = parseTrackerTab(grid, "basketball", "Basketball");
  it("maps the sheet-global match # to the DB label 'Match N'", () => {
    expect(state.fixtures[0].label).toBe("Match 2");
    expect(state.fixtures[0].scorePairs).toEqual([[80, 71]]);
  });
});

describe("parseRacketTab", () => {
  // matrix header + one team row; fixture header with two parallel blocks;
  // one data row carrying BOTH courts; a playoff row; a walkover row.
  const grid: Grid = [
    ["", "November 16 and 18", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["ID", "Team Name", "Executive Boys", "40 Boys", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["1", "TEAM 4-MIDABLE", "1", "1", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["2", "ECO-AGKAYSA", "", "1", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "Date", "Time", "Venue", "Match #", "Team A", "Team B", "", "", "Date", "Time", "Venue", "Match #", "Team A", "Team B", ""],
    ["", "11/16/2026", "8:00 AM", "Heritage 2500", "40 Boys", "TEAM 4-MIDABLE", "ECO-AGKAYSA", "", "", "11/16/2026", "8:00 AM", "Heritage 2500", "40 Boys", "ECO-AGKAYSA", "TEAM 4-MIDABLE", ""],
    ["", "11/18/2026", "5:00 PM", "Heritage 2500", "39 Boys", "SEMIFINAL 1: Bracket 1 – Rank 1", "Bracket 2 – Rank 2", "", "", "11/16/2026", "9:15 AM", "Heritage 2500", "Executive Boys", "TEAM 4-MIDABLE", "", ""],
  ];
  const state = parseRacketTab(grid, "pickleball", "Pickle Ball");

  it("parses the entry matrix", () => {
    const t4 = state.entries.filter((e) => e.teamName === "TEAM 4-MIDABLE");
    expect(t4.map((e) => e.divisionKey).sort()).toEqual(["40-boys", "executive-boys"]);
  });

  it("parses both parallel courts from shared rows; venue gains the court", () => {
    const rr = state.fixtures.filter((f) => f.label === null);
    expect(rr).toHaveLength(2);
    expect(rr.map((f) => f.venue).sort()).toEqual(["Heritage 2500 · Court 1", "Heritage 2500 · Court 2"]);
    expect(rr[0].startsAt).toBe("2026-11-16T08:00:00+08:00");
  });

  it("maps playoff text rows to stage labels with no pairing", () => {
    const sf = state.fixtures.find((f) => f.label === "Semifinal 1")!;
    expect(sf.stage).toBe("semifinal");
    expect(sf.teamA).toBeNull();
    expect(sf.divisionKey).toBe("39-boys");
  });

  it("treats a one-team row as a walkover: warning + entry, no fixture", () => {
    expect(state.warnings.some((w) => /walkover/i.test(w))).toBe(true);
    expect(state.fixtures.some((f) => f.divisionKey === "executive-boys" && f.label === null)).toBe(false);
  });
});

describe("parseMatrixTab", () => {
  const grid: Grid = [
    ["", "November 25", "", ""],
    ["ID", "Team Name", "Executive Mixed", "40 Mixed"],
    ["1", "CODE RED", "Incomplete", "1"],
    ["2", "TEAM 4-MIDABLE", "1", ""],
    ["3", "Agkaysa FOURce", "", "1"],
  ];
  it("reads entries (1 / Incomplete count, blank does not)", () => {
    const state = parseMatrixTab(grid, "bowling", "Bowling", { placement: true });
    const exec = state.entries.filter((e) => e.divisionKey === "executive-mixed");
    expect(exec.map((e) => e.teamName).sort()).toEqual(["CODE RED", "TEAM 4-MIDABLE"]);
    expect(exec.every((e) => e.place === null)).toBe(true);
  });

  it("flips a column to PLACES once an ordinal / ≥2 cell appears", () => {
    const placed: Grid = [
      ["", "November 25", ""],
      ["ID", "Team Name", "Executive Mixed"],
      ["1", "CODE RED", "2"],
      ["2", "TEAM 4-MIDABLE", "1"],
      ["3", "Agkaysa FOURce", "3rd"],
    ];
    const state = parseMatrixTab(placed, "bowling", "Bowling", { placement: true });
    const byTeam = new Map(state.entries.map((e) => [e.teamName, e.place]));
    expect(byTeam.get("TEAM 4-MIDABLE")).toBe(1);
    expect(byTeam.get("CODE RED")).toBe(2);
    expect(byTeam.get("Agkaysa FOURce")).toBe(3);
  });

  it("never reads places for non-placement sports", () => {
    const g: Grid = [
      ["", "November 9", ""],
      ["ID", "Team Name", "Boys"],
      ["1", "CODE RED", "2"],
    ];
    const state = parseMatrixTab(g, "chess", "Chess", { placement: false });
    expect(state.entries[0].place).toBeNull();
  });
});

describe("helpers", () => {
  it("parses sheet dates and times", () => {
    expect(parseSheetDate("November 9, 2026")).toBe("2026-11-09");
    expect(parseSheetDate("11/16/2026")).toBe("2026-11-16");
    expect(parseSheetTime("1:00 PM")).toBe("13:00");
    expect(parseSheetTime("12:40 AM")).toBe("00:40");
    expect(parseSheetTime("12:00 PM")).toBe("12:00");
  });
  it("normalizes names and applies the documented typo alias", () => {
    expect(normName("PDRRMO HAZARD BREAKERSA")).toBe("PDRRMO HAZARD BREAKERS");
    expect(normName("  agkaysa   guardians ")).toBe("AGKAYSA GUARDIANS");
  });
});
