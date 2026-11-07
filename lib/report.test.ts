import { describe, expect, it } from "vitest";
import { buildTop3Report, top3SheetRows } from "./report";
import { MockProvider } from "./data/mock";
import type { AwardInfo, Snapshot } from "./types";

const div = (id: string, sportId: string, name: string, slug: string, scoringKind: "simple" | "placement_only") => ({
  id, sportId, name, slug, scoringKind, scoringConfig: {}, standingsConfig: {}, medalPolicy: {},
});
const entry = (id: string, divisionId: string, teamId: string) => ({ id, divisionId, teamId, rosterStatus: "unknown" as const });
const award = (over: Partial<AwardInfo>): AwardInfo => ({
  divisionId: "div:vb:mens", awardKey: "gold", medal: "gold", entryId: "e:red-vb", state: "confirmed", source: "playoff", ...over,
});

function baseSnap(awards: AwardInfo[]): Snapshot {
  return {
    event: { id: "e", slug: "ev", name: "PGLUlympics", startDate: "2026-11-09", endDate: "2026-11-26", goldPoints: 5, silverPoints: 3, bronzePoints: 1, pointsProvisional: true },
    teams: [
      { id: "team:red", name: "CODE RED", slug: "code-red" },
      { id: "team:blue", name: "BLUE", slug: "blue" },
      { id: "team:green", name: "GREEN", slug: "green" },
      { id: "team:gold", name: "GOLD RUSH", slug: "gold-rush" },
    ],
    sports: [
      { id: "sport:vb", name: "Volleyball", slug: "volleyball", defaultDurationMinutes: 60 },
      { id: "sport:laro", name: "Laro ng Lahi", slug: "laro", defaultDurationMinutes: 30 },
    ],
    divisions: [
      div("div:vb:mens", "sport:vb", "Men's", "mens", "simple"),
      div("div:vb:womens", "sport:vb", "Women's", "womens", "simple"),
      div("div:laro:pat", "sport:laro", "Patintero", "patintero", "placement_only"),
    ],
    groups: [],
    entries: [
      entry("e:red-vb", "div:vb:mens", "team:red"),
      entry("e:blue-vb", "div:vb:mens", "team:blue"),
      entry("e:green-vb", "div:vb:mens", "team:green"),
      entry("e:gold-vb", "div:vb:mens", "team:gold"),
      entry("e:red-pat", "div:laro:pat", "team:red"),
      entry("e:blue-pat", "div:laro:pat", "team:blue"),
      entry("e:green-pat", "div:laro:pat", "team:green"),
    ],
    matches: [],
    awards,
    players: [
      { id: "p1", name: "Zoe Lim" },
      { id: "p2", name: "Ana Reyes" },
      { id: "p3", name: "Mark Uy" },
    ],
    rosters: { "e:red-vb": ["p1", "p2"], "e:blue-pat": ["p3"] },
    venues: [],
    revision: 0,
  };
}

describe("buildTop3Report", () => {
  it("extracts the top 3 from CONFIRMED awards only — drafts and voids never appear", () => {
    const report = buildTop3Report(baseSnap([
      award({ awardKey: "gold", medal: "gold", entryId: "e:red-vb" }),
      award({ awardKey: "silver", medal: "silver", entryId: "e:blue-vb" }),
      award({ awardKey: "bronze", medal: "bronze", entryId: "e:green-vb" }),
      // a draft gold for GOLD RUSH and a void silver must not leak in
      award({ awardKey: "gold", medal: "gold", entryId: "e:gold-vb", state: "draft" }),
      award({ awardKey: "silver", medal: "silver", entryId: "e:gold-vb", state: "void" }),
    ]));
    const mens = report.sports[0].divisions[0];
    expect(mens.decided).toBe(true);
    expect(mens.places.map((p) => [p.place, p.teams.map((t) => t.teamName)])).toEqual([
      [1, ["CODE RED"]],
      [2, ["BLUE"]],
      [3, ["GREEN"]],
    ]);
    // GOLD RUSH appears nowhere in the division's places
    expect(mens.places.flatMap((p) => p.teams.map((t) => t.teamName))).not.toContain("GOLD RUSH");
  });

  it("reads placement divisions from their confirmed placement awards", () => {
    const report = buildTop3Report(baseSnap([
      award({ divisionId: "div:laro:pat", awardKey: "gold", medal: "gold", entryId: "e:blue-pat", source: "placement" }),
      award({ divisionId: "div:laro:pat", awardKey: "silver", medal: "silver", entryId: "e:red-pat", source: "placement" }),
      award({ divisionId: "div:laro:pat", awardKey: "bronze", medal: "bronze", entryId: "e:green-pat", source: "placement" }),
    ]));
    const pat = report.sports[1].divisions[0];
    expect(pat.scoringKind).toBe("placement_only");
    expect(pat.decided).toBe(true);
    expect(pat.places.map((p) => p.teams[0].teamName)).toEqual(["BLUE", "CODE RED", "GREEN"]);
  });

  it("partitions decided vs not-yet-decided divisions and counts coverage", () => {
    const report = buildTop3Report(baseSnap([
      award({ awardKey: "gold", medal: "gold", entryId: "e:red-vb" }),
    ]));
    expect(report.totalDivisions).toBe(3);
    expect(report.decidedCount).toBe(1);
    expect(report.pending).toEqual([
      { sportName: "Volleyball", divisionName: "Women's" },
      { sportName: "Laro ng Lahi", divisionName: "Patintero" },
    ]);
    // a lone confirmed gold still decides the division (partial podium kept)
    expect(report.sports[0].divisions[0].places).toHaveLength(1);
  });

  it("keeps shared medals: two teams at the same place both list", () => {
    const report = buildTop3Report(baseSnap([
      award({ awardKey: "bronze", medal: "bronze", entryId: "e:green-vb" }),
      award({ awardKey: "bronze-2", medal: "bronze", entryId: "e:gold-vb" }),
    ]));
    const bronze = report.sports[0].divisions[0].places.find((p) => p.place === 3);
    expect(bronze?.teams.map((t) => t.teamName)).toEqual(["GOLD RUSH", "GREEN"]);
  });

  it("attaches the winning entry's roster players, name-sorted, when loaded", () => {
    const report = buildTop3Report(baseSnap([
      award({ awardKey: "gold", medal: "gold", entryId: "e:red-vb" }),
      award({ divisionId: "div:laro:pat", awardKey: "gold", medal: "gold", entryId: "e:blue-pat", source: "placement" }),
    ]));
    expect(report.sports[0].divisions[0].places[0].teams[0].players).toEqual(["Ana Reyes", "Zoe Lim"]);
    expect(report.sports[1].divisions[0].places[0].teams[0].players).toEqual(["Mark Uy"]);
    // an entry with no roster loaded yields an empty list, not an error
    const report2 = buildTop3Report(baseSnap([
      award({ awardKey: "gold", medal: "gold", entryId: "e:green-vb" }),
    ]));
    expect(report2.sports[0].divisions[0].places[0].teams[0].players).toEqual([]);
  });

  it("reuses the medal tally (computeTally over the same confirmed set)", () => {
    const report = buildTop3Report(baseSnap([
      award({ awardKey: "gold", medal: "gold", entryId: "e:red-vb" }),
      award({ awardKey: "silver", medal: "silver", entryId: "e:blue-vb" }),
      award({ divisionId: "div:laro:pat", awardKey: "gold", medal: "gold", entryId: "e:blue-pat", source: "placement" }),
      award({ awardKey: "bronze", medal: "bronze", entryId: "e:green-vb", state: "draft" }), // must not count
    ]));
    const byTeam = new Map(report.tally.map((r) => [r.teamName, r]));
    expect(byTeam.get("CODE RED")).toMatchObject({ gold: 1, silver: 0, bronze: 0, points: 5, rank: 2 });
    expect(byTeam.get("BLUE")).toMatchObject({ gold: 1, silver: 1, bronze: 0, points: 8 });
    expect(byTeam.get("GREEN")).toMatchObject({ gold: 0, silver: 0, bronze: 0, points: 0 });
    // BLUE outranks CODE RED on points (8 vs 5)
    expect(report.tally[0].teamName).toBe("BLUE");
  });

  it("flattens to Excel rows in Sport | Division | Place | Team order", () => {
    const report = buildTop3Report(baseSnap([
      award({ awardKey: "gold", medal: "gold", entryId: "e:red-vb" }),
      award({ awardKey: "silver", medal: "silver", entryId: "e:blue-vb" }),
      award({ divisionId: "div:laro:pat", awardKey: "bronze", medal: "bronze", entryId: "e:green-pat", source: "placement" }),
    ]));
    expect(top3SheetRows(report)).toEqual([
      { sport: "Volleyball", division: "Men's", place: "1st", team: "CODE RED" },
      { sport: "Volleyball", division: "Men's", place: "2nd", team: "BLUE" },
      { sport: "Laro ng Lahi", division: "Patintero", place: "3rd", team: "GREEN" },
    ]);
  });

  it("on the real mock seed: 9 sports / 43 divisions, all pending pre-event", async () => {
    const provider = new MockProvider();
    const snap = await provider.getSnapshot();
    const report = buildTop3Report(snap);
    expect(report.sports).toHaveLength(9);
    expect(report.totalDivisions).toBe(43);
    expect(report.decidedCount).toBe(0);
    expect(report.pending).toHaveLength(43);
    expect(report.tally).toHaveLength(10);
  });
});
