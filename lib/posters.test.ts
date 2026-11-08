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
