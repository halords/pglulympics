import { describe, expect, it } from "vitest";
import { lineupsForMatch, lineupsFromViewRows } from "./lineups";
import type { MatchInfo, Snapshot } from "./types";

const div = (id: string, sportId: string, name: string, slug: string, scoringKind: "simple" | "placement_only") => ({
  id, sportId, name, slug, scoringKind, scoringConfig: {}, standingsConfig: {}, medalPolicy: {},
});
const entry = (id: string, divisionId: string, teamId: string) => ({ id, divisionId, teamId, rosterStatus: "unknown" as const });
const match = (over: Partial<MatchInfo>): MatchInfo => ({
  id: "m1", divisionId: "div:vb:mens", stage: "round_robin", status: "scheduled", label: "1",
  slots: [], segments: [], revision: 0, ...over,
});

const snap: Snapshot = {
  event: { id: "e", slug: "ev", name: "Ev", startDate: "2026-11-09", endDate: "2026-11-26", goldPoints: 5, silverPoints: 3, bronzePoints: 1, pointsProvisional: true },
  teams: [
    { id: "team:red", name: "CODE RED", slug: "code-red" },
    { id: "team:blue", name: "BLUE", slug: "blue" },
    { id: "team:green", name: "GREEN", slug: "green" },
  ],
  sports: [{ id: "sport:vb", name: "Volleyball", slug: "volleyball", defaultDurationMinutes: 60 }],
  divisions: [
    div("div:vb:mens", "sport:vb", "Men's", "mens", "simple"),
    div("div:laro:pat", "sport:vb", "Patintero", "patintero", "placement_only"),
  ],
  groups: [],
  entries: [
    entry("e:red-vb", "div:vb:mens", "team:red"),
    entry("e:blue-vb", "div:vb:mens", "team:blue"),
    entry("e:red-pat", "div:laro:pat", "team:red"),
    entry("e:blue-pat", "div:laro:pat", "team:blue"),
    entry("e:green-pat", "div:laro:pat", "team:green"),
  ],
  matches: [],
  awards: [],
  players: [
    { id: "p1", name: "Zoe Lim" },
    { id: "p2", name: "Ana Reyes" },
    { id: "p3", name: "Mark Uy" },
  ],
  rosters: {
    "e:red-vb": ["p1", "p2"], // intentionally unsorted input
    "e:blue-pat": ["p3"],
  },
  venues: [],
  revision: 0,
};

describe("lineupsForMatch", () => {
  it("head-to-head: one column per slotted team, players name-sorted", () => {
    const m = match({ slots: [{ slotNo: 2, entryId: "e:blue-vb" }, { slotNo: 1, entryId: "e:red-vb" }] });
    const out = lineupsForMatch(snap, m);
    expect(out.map((t) => t.teamName)).toEqual(["CODE RED", "BLUE"]); // slot order, not input order
    expect(out[0].players).toEqual(["Ana Reyes", "Zoe Lim"]);
    expect(out[1].players).toEqual([]); // roster not submitted yet
  });

  it("skips TBD slots with no resolved entry", () => {
    const m = match({ slots: [{ slotNo: 1, entryId: "e:red-vb" }, { slotNo: 2, entryId: null, placeholder: "Winner · SF1" }] });
    expect(lineupsForMatch(snap, m).map((t) => t.teamName)).toEqual(["CODE RED"]);
  });

  it("placement: every entered team of the division, grouped with its players", () => {
    const m = match({ id: "m2", divisionId: "div:laro:pat", stage: "placement" });
    const out = lineupsForMatch(snap, m);
    expect(out.map((t) => t.teamName)).toEqual(["CODE RED", "BLUE", "GREEN"]);
    expect(out[1].players).toEqual(["Mark Uy"]);
    expect(out[0].players).toEqual([]);
    expect(out[2].players).toEqual([]);
  });
});

describe("lineupsFromViewRows", () => {
  it("groups rows by match and team, sorts players, keeps empty teams", () => {
    const out = lineupsFromViewRows([
      { match_id: "m1", entry_id: "e1", team_name: "CODE RED", player_name: "Zoe Lim" },
      { match_id: "m1", entry_id: "e1", team_name: "CODE RED", player_name: "Ana Reyes" },
      { match_id: "m1", entry_id: "e2", team_name: "BLUE", player_name: null },
      { match_id: "m2", entry_id: "e3", team_name: "GREEN", player_name: "Mark Uy" },
    ]);
    expect(out.m1).toEqual([
      { entryId: "e1", teamName: "CODE RED", players: ["Ana Reyes", "Zoe Lim"] },
      { entryId: "e2", teamName: "BLUE", players: [] },
    ]);
    expect(out.m2).toEqual([{ entryId: "e3", teamName: "GREEN", players: ["Mark Uy"] }]);
  });
});
