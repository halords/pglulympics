import { describe, expect, it } from "vitest";
import {
  importCommitPlan, templateListsFromSnapshot, validateImportRows, type RawImportRow,
} from "./roster-import";
import type { Snapshot } from "./types";

const div = (id: string, sportId: string, name: string, slug: string) => ({
  id, sportId, name, slug, scoringKind: "simple" as const, scoringConfig: {}, standingsConfig: {}, medalPolicy: {},
});
const entry = (id: string, divisionId: string, teamId: string) => ({ id, divisionId, teamId, rosterStatus: "unknown" as const });

const snap: Snapshot = {
  event: { id: "e", slug: "ev", name: "Ev", startDate: "2026-11-09", endDate: "2026-11-26", goldPoints: 5, silverPoints: 3, bronzePoints: 1, pointsProvisional: true },
  teams: [
    { id: "team:code-red", name: "CODE RED", slug: "code-red" },
    { id: "team:blue", name: "BLUE", slug: "blue" },
    { id: "team:green", name: "GREEN", slug: "green" },
  ],
  sports: [
    { id: "sport:volleyball", name: "Volleyball", slug: "volleyball", defaultDurationMinutes: 60 },
    { id: "sport:chess", name: "Chess", slug: "chess", defaultDurationMinutes: 60 },
    { id: "sport:basketball", name: "Basketball", slug: "basketball", defaultDurationMinutes: 60 },
  ],
  divisions: [
    div("div:vb:mens", "sport:volleyball", "Men's", "mens"),
    div("div:vb:womens", "sport:volleyball", "Women's", "womens"),
    div("div:chess:boys", "sport:chess", "Boys", "boys"),
    div("div:bb:mens", "sport:basketball", "Men's", "mens"),
  ],
  groups: [],
  entries: [
    entry("entry:vb-mens-codered", "div:vb:mens", "team:code-red"),
    entry("entry:vb-womens-codered", "div:vb:womens", "team:code-red"),
    entry("entry:vb-mens-blue", "div:vb:mens", "team:blue"),
    entry("entry:chess-boys-blue", "div:chess:boys", "team:blue"),
    entry("entry:chess-boys-green", "div:chess:boys", "team:green"),
    entry("entry:bb-mens-green", "div:bb:mens", "team:green"),
  ],
  matches: [],
  awards: [],
  players: [{ id: "player:1", name: "Juan Dela Cruz" }],
  rosters: { "entry:vb-mens-blue": ["player:1"] },
  venues: [],
  revision: 0,
};

const COORD_SCOPE = ["sport:volleyball", "sport:chess"];
const ADMIN_SCOPE = ["sport:volleyball", "sport:chess", "sport:basketball"];
const row = (r: Partial<RawImportRow> & { rowNo: number }): RawImportRow => ({ name: "", sport: "", team: "", division: "", ...r });
const one = (r: RawImportRow, scope = COORD_SCOPE) => validateImportRows([r], snap, scope)[0];

describe("validateImportRows", () => {
  it("accepts a clean row and resolves all ids", () => {
    const p = one(row({ rowNo: 4, name: "Maria Clara", sport: "Volleyball", team: "CODE RED", division: "Men's" }));
    expect(p.status).toBe("ok");
    expect(p.entryId).toBe("entry:vb-mens-codered");
    expect(p.sportId).toBe("sport:volleyball");
    expect(p.playerName).toBe("Maria Clara");
  });

  it("flags a typo'd team from a CSV (no dropdowns there) as an error", () => {
    const p = one(row({ rowNo: 5, name: "Maria Clara", sport: "Volleyball", team: "CODE RD", division: "Men's" }));
    expect(p.status).toBe("error");
    expect(p.reason).toMatch(/unknown team/i);
  });

  it("resolves case/whitespace drift in names and list values", () => {
    const p = one(row({ rowNo: 6, name: "  maria   clara ", sport: "volleyball", team: "code red", division: "men's" }));
    expect(p.status).toBe("ok");
    expect(p.entryId).toBe("entry:vb-mens-codered");
    expect(p.playerName).toBe("maria clara");
  });

  it("resolves values given as slugs", () => {
    const p = one(row({ rowNo: 7, name: "Ana Reyes", sport: "chess", team: "green", division: "boys" }));
    expect(p.status).toBe("ok");
    expect(p.entryId).toBe("entry:chess-boys-green");
  });

  it("marks the second copy of a duplicated row in the file as a skip", () => {
    const r = row({ rowNo: 8, name: "Maria Clara", sport: "Volleyball", team: "CODE RED", division: "Men's" });
    const out = validateImportRows([r, { ...r, rowNo: 9 }], snap, COORD_SCOPE);
    expect(out.map((x) => x.status)).toEqual(["ok", "skip"]);
    expect(out[1].reason).toMatch(/duplicate/i);
  });

  it("marks a name already on that roster as a skip, not an error", () => {
    const p = one(row({ rowNo: 10, name: "JUAN DELA CRUZ", sport: "Volleyball", team: "BLUE", division: "Men's" }));
    expect(p.status).toBe("skip");
    expect(p.reason).toMatch(/already on this roster/i);
  });

  it("registers the same person in a different sport independently", () => {
    const p = one(row({ rowNo: 11, name: "Juan Dela Cruz", sport: "Chess", team: "BLUE", division: "Boys" }));
    expect(p.status).toBe("ok");
    expect(p.entryId).toBe("entry:chess-boys-blue");
  });

  it("auto-places a blank division when the team has exactly one entry in the sport", () => {
    const p = one(row({ rowNo: 12, name: "Ana Reyes", sport: "Volleyball", team: "BLUE", division: "" }));
    expect(p.status).toBe("ok");
    expect(p.entryId).toBe("entry:vb-mens-blue");
    expect(p.reason).toMatch(/auto-filled: Men's/i);
  });

  it("errors on a blank division when the team plays in several divisions of the sport", () => {
    const p = one(row({ rowNo: 13, name: "Ana Reyes", sport: "Volleyball", team: "CODE RED", division: "" }));
    expect(p.status).toBe("error");
    expect(p.reason).toMatch(/division required/i);
  });

  it("errors when the team has no entry in the named division", () => {
    const p = one(row({ rowNo: 14, name: "Ana Reyes", sport: "Volleyball", team: "GREEN", division: "Men's" }));
    expect(p.status).toBe("error");
    expect(p.reason).toMatch(/has no entry/i);
  });

  it("errors on an unknown division for the sport", () => {
    const p = one(row({ rowNo: 15, name: "Ana Reyes", sport: "Volleyball", team: "BLUE", division: "Seniors" }));
    expect(p.status).toBe("error");
    expect(p.reason).toMatch(/unknown division/i);
  });

  it("errors when the sport is outside the coordinator's scope, and passes for admin", () => {
    const r = row({ rowNo: 16, name: "Ana Reyes", sport: "Basketball", team: "GREEN", division: "Men's" });
    const asCoord = one(r, COORD_SCOPE);
    expect(asCoord.status).toBe("error");
    expect(asCoord.reason).toMatch(/not one of your assigned sports/i);
    const asAdmin = one(r, ADMIN_SCOPE);
    expect(asAdmin.status).toBe("ok");
    expect(asAdmin.entryId).toBe("entry:bb-mens-green");
  });

  it("errors when the player name is missing but other cells are filled", () => {
    const p = one(row({ rowNo: 17, name: " ", sport: "Volleyball", team: "BLUE", division: "Men's" }));
    expect(p.status).toBe("error");
    expect(p.reason).toMatch(/name is required/i);
  });

  it("drops fully blank template rows silently", () => {
    const out = validateImportRows([row({ rowNo: 18 }), row({ rowNo: 19 })], snap, COORD_SCOPE);
    expect(out).toEqual([]);
  });
});

describe("importCommitPlan", () => {
  it("groups ok rows per entry and dedupes names", () => {
    const preview = validateImportRows([
      row({ rowNo: 4, name: "Maria Clara", sport: "Volleyball", team: "CODE RED", division: "Men's" }),
      row({ rowNo: 5, name: "Ana Reyes", sport: "Volleyball", team: "CODE RED", division: "Men's" }),
      row({ rowNo: 6, name: "Maria Clara", sport: "Volleyball", team: "CODE RED", division: "Women's" }),
      row({ rowNo: 7, name: "Bad Row", sport: "Volleyball", team: "NOPE", division: "Men's" }),
    ], snap, COORD_SCOPE);
    const plan = importCommitPlan(preview);
    expect(plan).toEqual([
      { entryId: "entry:vb-mens-codered", names: ["Maria Clara", "Ana Reyes"] },
      { entryId: "entry:vb-womens-codered", names: ["Maria Clara"] },
    ]);
  });
});

describe("templateListsFromSnapshot", () => {
  it("bakes only the caller's sports, with that sport's divisions", () => {
    const lists = templateListsFromSnapshot(snap, COORD_SCOPE);
    expect(lists.sports.map((s) => s.name)).toEqual(["Volleyball", "Chess"]);
    expect(lists.sports[0].divisions).toEqual(["Men's", "Women's"]);
    expect(lists.teams).toEqual(["CODE RED", "BLUE", "GREEN"]);
  });
  it("admin gets every sport", () => {
    const lists = templateListsFromSnapshot(snap, ADMIN_SCOPE);
    expect(lists.sports.map((s) => s.name)).toEqual(["Volleyball", "Chess", "Basketball"]);
  });
});
