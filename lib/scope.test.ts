import { describe, expect, it } from "vitest";
import { canAccessSport, consoleScopeSportIds, demoScopeSportIds, divisionsInScope, effectiveSportIds } from "./scope";

const ALL = ["vb", "bb", "pb", "bd"];
const admin = { role: "admin" as const, sportIds: [] as string[] };
const coord = (sportIds: string[]) => ({ role: "coordinator" as const, sportIds });
const anon = { role: null, sportIds: [] as string[] };

describe("effectiveSportIds", () => {
  it("admin sees every sport regardless of assignments", () => {
    expect(effectiveSportIds(admin, ALL)).toEqual(ALL);
    expect(effectiveSportIds({ role: "admin", sportIds: ["vb"] }, ALL)).toEqual(ALL);
  });
  it("coordinator sees exactly their assigned set", () => {
    expect(effectiveSportIds(coord(["bb", "vb"]), ALL)).toEqual(["bb", "vb"]);
  });
  it("drops stale/unknown ids and duplicates", () => {
    expect(effectiveSportIds(coord(["vb", "gone", "vb", "bd"]), ALL)).toEqual(["vb", "bd"]);
  });
  it("coordinator with no assignments sees nothing", () => {
    expect(effectiveSportIds(coord([]), ALL)).toEqual([]);
  });
  it("signed-out sees nothing", () => {
    expect(effectiveSportIds(anon, ALL)).toEqual([]);
    expect(effectiveSportIds({ role: null, sportIds: ["vb"] }, ALL)).toEqual([]);
  });
});

describe("canAccessSport / divisionsInScope", () => {
  const divs = [
    { id: "d1", sportId: "vb" }, { id: "d2", sportId: "bb" }, { id: "d3", sportId: "pb" },
  ];
  it("canAccessSport follows the effective set", () => {
    expect(canAccessSport(coord(["vb", "pb"]), "pb", ALL)).toBe(true);
    expect(canAccessSport(coord(["vb", "pb"]), "bb", ALL)).toBe(false);
    expect(canAccessSport(admin, "bb", ALL)).toBe(true);
    expect(canAccessSport(anon, "vb", ALL)).toBe(false);
  });
  it("divisionsInScope filters by sport", () => {
    expect(divisionsInScope(divs, coord(["vb", "pb"]), ALL).map((d) => d.id)).toEqual(["d1", "d3"]);
    expect(divisionsInScope(divs, admin, ALL)).toHaveLength(3);
    expect(divisionsInScope(divs, anon, ALL)).toHaveLength(0);
  });
});

describe("consoleScopeSportIds", () => {
  it("mock demo coordinator gets the demo subset, mock demo admin gets all", () => {
    expect(consoleScopeSportIds({ role: "coordinator", sportIds: [], isMock: true }, ALL)).toEqual(["vb", "bb"]);
    expect(consoleScopeSportIds({ role: "admin", sportIds: [], isMock: true }, ALL)).toEqual(ALL);
  });
  it("live sessions resolve from assignments", () => {
    expect(consoleScopeSportIds({ role: "coordinator", sportIds: ["pb"], isMock: false }, ALL)).toEqual(["pb"]);
    expect(consoleScopeSportIds({ role: null, sportIds: [], isMock: false }, ALL)).toEqual([]);
  });
});

describe("demoScopeSportIds", () => {
  it("takes the first N sports, clamped", () => {
    expect(demoScopeSportIds(ALL)).toEqual(["vb", "bb"]);
    expect(demoScopeSportIds(["vb"])).toEqual(["vb"]);
    expect(demoScopeSportIds(ALL, 0)).toEqual([]);
  });
});
