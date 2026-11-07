import { describe, expect, it } from "vitest";
import { commitRosterImport, parseCsvText, rowsFromGrid } from "./roster-file";
import { validateImportRows, type RawImportRow } from "./roster-import";
import { MockProvider } from "./data/mock";

describe("rowsFromGrid", () => {
  it("finds the header under the template's instruction rows", () => {
    const rows = rowsFromGrid([
      ["PGLUlympics — Roster Import Template", "", "", ""],
      ["Type ONLY the player name…", "", "", ""],
      ["Player Name", "Sport", "Team", "Division"],
      ["Maria Clara", "Volleyball", "CODE RED", "Men's"],
      ["", "", "", ""],
    ]);
    expect(rows[0]).toEqual({ rowNo: 4, name: "Maria Clara", sport: "Volleyball", team: "CODE RED", division: "Men's" });
    expect(rows[1].rowNo).toBe(5);
  });

  it("maps columns in any order and tolerates a missing Division column", () => {
    const rows = rowsFromGrid([
      ["Team", "Player Name", "Sport"],
      ["BLUE", "Ana Reyes", "Chess"],
    ]);
    expect(rows[0]).toEqual({ rowNo: 2, name: "Ana Reyes", sport: "Chess", team: "BLUE", division: "" });
  });

  it("throws a helpful error when no header row exists", () => {
    expect(() => rowsFromGrid([["a", "b"], ["c", "d"]])).toThrow(/header row/i);
  });
});

describe("commitRosterImport (mock provider, full loop)", () => {
  it("writes confirmed rows via upsertPlayer + setEntryRoster; a re-import then reads as already-listed", async () => {
    const provider = new MockProvider();
    const snap = await provider.getSnapshot();
    const allSports = snap.sports.map((s) => s.id);
    const rows: RawImportRow[] = [
      { rowNo: 4, name: "Maria Clara", sport: "Volleyball", team: "CODE RED", division: "Men's" },
      { rowNo: 5, name: "Maria Clara", sport: "Chess", team: "CODE RED", division: "Boys" },
    ];
    const preview = validateImportRows(rows, snap, allSports);
    expect(preview.map((r) => r.status)).toEqual(["ok", "ok"]); // same person, two sports — both register

    const summary = await commitRosterImport(provider, snap, preview);
    expect(summary.failed).toEqual([]);
    expect(summary.added).toBe(2);
    expect(summary.entriesUpdated).toBe(2);

    const after = await provider.getSnapshot();
    const vbEntry = preview[0].entryId!;
    const names = (after.rosters[vbEntry] ?? []).map((pid) => after.players.find((p) => p.id === pid)?.name);
    expect(names).toEqual(["Maria Clara"]);
    // one player record was created and reused across both sports
    expect(after.players.filter((p) => p.name === "Maria Clara")).toHaveLength(1);

    const again = validateImportRows(rows, after, allSports);
    expect(again.map((r) => r.status)).toEqual(["skip", "skip"]);
  });
});

describe("parseCsvText", () => {
  it("handles quoted commas, escaped quotes and CRLF", () => {
    const rows = parseCsvText('Player Name,Sport,Team,Division\r\n"Dela Cruz, Juan",Volleyball,CODE RED,Men\'s\r\n"Say ""Hi"" Ho",Chess,BLUE,Boys\n');
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("Dela Cruz, Juan");
    expect(rows[1].name).toBe('Say "Hi" Ho');
    expect(rows[1].division).toBe("Boys");
  });
});
