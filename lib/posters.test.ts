import { describe, expect, it } from "vitest";
import { entriesPoster, posterKind, schedulePosterDays } from "./posters";
import type { MatchInfo, Snapshot, SportInfo } from "./types";

let n = 0;
function mk(partial: Partial<MatchInfo>): MatchInfo {
  n += 1;
  return {
    id: `m${n}`, divisionId: "d1", stage: "round_robin", status: "scheduled",
    label: `Match ${n}`, startsAt: null, slots: [], segments: [], revision: 0,
    ...partial,
  };
}
const at = (day: string, time: string) => `2026-11-${day}T${time}:00+08:00`;
const vs = (a: string, b: string) => [{ slotNo: 1, teamName: a }, { slotNo: 2, teamName: b }];

const sport: SportInfo = { id: "s1", name: "Basketball", slug: "basketball", defaultDurationMinutes: 60 };
const matrixSport: SportInfo = { id: "s2", name: "Laro ng Lahi", slug: "laro-ng-lahi", defaultDurationMinutes: 60 };

function snap(partial: Partial<Snapshot>): Snapshot {
  return {
    event: { id: "e1", slug: "pglulympics", name: "PGLUlympics 2026", startDate: "2026-11-09", endDate: "2026-11-26", goldPoints: 5, silverPoints: 3, bronzePoints: 1, pointsProvisional: true },
    teams: [
      { id: "t1", name: "CODE RED", slug: "code-red" },
      { id: "t2", name: "TEAM 4-MIDABLE", slug: "team-4" },
      { id: "t3", name: "ECO-AGKAYSA", slug: "eco" },
    ],
    sports: [sport, matrixSport],
    divisions: [
      { id: "d1", sportId: "s1", name: "Men", slug: "men", scoringKind: "simple", scoringConfig: {}, standingsConfig: {}, medalPolicy: {} },
      { id: "d2", sportId: "s2", name: "Kadang-Kadang", slug: "kadang", scoringKind: "placement_only", scoringConfig: {}, standingsConfig: {}, medalPolicy: {} },
      { id: "d3", sportId: "s2", name: "Shatong", slug: "shatong", scoringKind: "placement_only", scoringConfig: {}, standingsConfig: {}, medalPolicy: {} },
    ],
    groups: [],
    entries: [
      { id: "e1", divisionId: "d2", teamId: "t1", rosterStatus: "unknown" },
      { id: "e2", divisionId: "d3", teamId: "t1", rosterStatus: "unknown" },
      { id: "e3", divisionId: "d2", teamId: "t3", rosterStatus: "unknown" },
    ],
    matches: [],
    awards: [],
    players: [],
    rosters: {},
    venues: [],
    revision: 1,
    ...partial,
  };
}

describe("posterKind", () => {
  it("dated head-to-head matches -> schedule poster", () => {
    const s = snap({ matches: [mk({ startsAt: at("09", "13:00"), slots: vs("A", "B") })] });
    expect(posterKind(s, sport)).toBe("schedule");
  });

  it("entries-only sport -> entries poster", () => {
    expect(posterKind(snap({}), matrixSport)).toBe("entries");
  });

  it("placement events (many slots) do not make a schedule poster", () => {
    const s = snap({
      matches: [mk({
        divisionId: "d2", startsAt: at("09", "09:00"),
        slots: [{ slotNo: 1, teamName: "A" }, { slotNo: 2, teamName: "B" }, { slotNo: 3, teamName: "C" }],
      })],
    });
    expect(posterKind(s, matrixSport)).toBe("entries");
  });
});

describe("schedulePosterDays", () => {
  it("groups by Manila day, numbers matches in start order, skips cancelled + undated", () => {
    const s = snap({
      matches: [
        mk({ startsAt: at("09", "14:00"), slots: vs("CODE RED", "ECO-AGKAYSA"), venue: "DMMMSU Gym" }),
        mk({ startsAt: at("09", "12:50"), slots: vs("TEAM 4-MIDABLE", "CODE RED"), venue: "DMMMSU Gym" }),
        mk({ startsAt: at("10", "09:00"), slots: vs("A", "B") }),
        mk({ startsAt: at("09", "16:00"), slots: vs("X", "Y"), status: "cancelled" }),
        mk({ startsAt: null, slots: vs("X", "Y") }),
      ],
    });
    const days = schedulePosterDays(s, sport);
    expect(days.map((d) => d.dayKey)).toEqual(["2026-11-09", "2026-11-10"]);
    expect(days[0].dateLabel).toContain("November 9, 2026");
    expect(days[0].venueLine).toBe("DMMMSU Gym");
    expect(days[0].rows.map((r) => [r.matchNo, r.teamA])).toEqual([
      [1, "TEAM 4-MIDABLE"],
      [2, "CODE RED"],
    ]);
    expect(days[0].rows[0].time).toContain("12:50");
  });

  it("dense days paginate at 12 matches per poster page, order + numbering preserved", () => {
    const matches = Array.from({ length: 25 }, (_, i) =>
      mk({
        startsAt: at("16", `${String(8 + Math.floor(i / 4)).padStart(2, "0")}:${i % 4 === 0 ? "00" : i % 4 === 1 ? "15" : i % 4 === 2 ? "30" : "45"}`),
        slots: vs(`Team ${i + 1}A`, `Team ${i + 1}B`),
      }),
    );
    const s = snap({ matches });
    const [day] = schedulePosterDays(s, sport);
    expect(day.rows).toHaveLength(25);
    const pageCounts = day.pages.map((pg) => pg.reduce((n, g) => n + g.rows.length, 0));
    expect(pageCounts).toEqual([12, 12, 1]);
    expect(day.pages[1][0].rows[0].matchNo).toBe(13);
    expect(day.pages[2][0].rows[0].teamA).toBe("Team 25A");
    expect(day.showVenueBanners).toBe(false);
  });

  it("multi-venue days group matches under venue banners; the venue leaves the header", () => {
    const s = snap({
      matches: [
        mk({ startsAt: at("16", "08:00"), slots: vs("A", "B"), venue: "Court 1" }),
        mk({ startsAt: at("16", "08:15"), slots: vs("C", "D"), venue: "Court 2" }),
        mk({ startsAt: at("16", "08:30"), slots: vs("E", "F"), venue: "Court 1" }),
      ],
    });
    const [day] = schedulePosterDays(s, sport);
    expect(day.showVenueBanners).toBe(true);
    expect(day.venueLine).toBe("");
    const [page] = day.pages;
    expect(page.map((g) => g.venue)).toEqual(["Court 1", "Court 2"]);
    // Chronological match numbers are kept inside each venue group.
    expect(page[0].rows.map((r) => r.matchNo)).toEqual([1, 3]);
    expect(page[1].rows.map((r) => r.matchNo)).toEqual([2]);
  });

  it("banner pages: a banner costs one unit and repeats when its group spills", () => {
    const mkVenue = (venue: string, count: number, startMin: number) =>
      Array.from({ length: count }, (_, i) =>
        mk({
          startsAt: at("16", `${String(8 + Math.floor((startMin + i * 15) / 60)).padStart(2, "0")}:${String((startMin + i * 15) % 60).padStart(2, "0")}`),
          slots: vs(`${venue} A${i}`, `${venue} B${i}`),
          venue,
        }),
      );
    const s = snap({ matches: [...mkVenue("Court 1", 15, 0), ...mkVenue("Court 2", 3, 300)] });
    const [day] = schedulePosterDays(s, sport);
    const shape = day.pages.map((pg) => pg.map((g) => [g.venue, g.rows.length]));
    // Page 1: Court 1 banner + 11 matches (12 units). Page 2: Court 1 banner
    // repeated + remaining 4, then Court 2 banner + its 3.
    expect(shape).toEqual([
      [["Court 1", 11]],
      [["Court 1", 4], ["Court 2", 3]],
    ]);
  });

  it("final matches carry their totals as scores", () => {
    const s = snap({
      matches: [mk({ startsAt: at("09", "13:00"), slots: vs("A", "B"), status: "final", totals: [87, 79] })],
    });
    const [day] = schedulePosterDays(s, sport);
    expect(day.rows[0]).toMatchObject({ scoreA: 87, scoreB: 79 });
  });
});

describe("entriesPoster", () => {
  it("builds the team x division boolean matrix (no raw 1s anywhere in the model)", () => {
    const p = entriesPoster(snap({}), matrixSport);
    expect(p.columns).toEqual(["Kadang-Kadang", "Shatong"]);
    expect(p.rows.map((r) => [r.teamName, r.entered])).toEqual([
      ["CODE RED", [true, true]],
      ["TEAM 4-MIDABLE", [false, false]],
      ["ECO-AGKAYSA", [true, false]],
    ]);
    expect(p.enteredCount).toBe(3);
  });
});
