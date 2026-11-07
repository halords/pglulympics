import { describe, expect, it } from "vitest";
import {
  advancePeriod, applyPeriodPoints, applyRallyPoint, rallyConfig, rallyMatchWinner,
  scorerMode, segmentTotals, segmentWinner, setTargetFor, type RallyConfig,
} from "./scoring";
import type { DivisionInfo, SegmentInfo } from "./types";

const div = (partial: Partial<DivisionInfo>): DivisionInfo => ({
  id: "d", sportId: "s", name: "Div", slug: "div", scoringKind: "set_based",
  scoringConfig: {}, standingsConfig: {}, medalPolicy: {}, ...partial,
});
const seg = (a: number, b: number, status: "open" | "closed" = "open", kind: "set" | "period" = "set", segmentNo = 1): SegmentInfo =>
  ({ segmentNo, kind, status, points: [a, b] });

const tap = (segs: SegmentInfo[], side: 0 | 1, times: number, cfg: RallyConfig) => {
  let out = segs;
  for (let i = 0; i < times; i++) out = applyRallyPoint(out, side, 1, cfg);
  return out;
};

describe("scorerMode", () => {
  it("routes each sport to its courtside controls", () => {
    expect(scorerMode(div({ scoringKind: "set_based" }), "volleyball")).toBe("rally");
    expect(scorerMode(div({ scoringKind: "set_based" }), "pickleball")).toBe("rally");
    expect(scorerMode(div({ scoringKind: "simple" }), "basketball")).toBe("periods");
    expect(scorerMode(div({ scoringKind: "simple" }), "chess")).toBe("totals");
    expect(scorerMode(div({ scoringKind: "simple" }), "mobile-games")).toBe("totals");
    expect(scorerMode(div({ scoringKind: "placement_only" }), "athletics")).toBe("placement");
  });
});

describe("rally scoring (volleyball profile: best-of-3, 25, decider 15, win by 2)", () => {
  const cfg = rallyConfig(div({ scoringConfig: { best_of: 3, set_target: 25, deciding_set_target: 15, win_by: 2, cap: null } }));
  it("reads the config and targets", () => {
    expect(cfg).toMatchObject({ bestOf: 3, setTarget: 25, decidingTarget: 15, winBy: 2, cap: null });
    expect(setTargetFor(cfg, 0)).toBe(25);
    expect(setTargetFor(cfg, 2)).toBe(15);
  });
  it("accumulates points in the open set and closes it at target + margin", () => {
    let segs = tap([], 0, 24, cfg);
    segs = tap(segs, 1, 23, cfg);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ status: "open", points: [24, 23] });
    segs = applyRallyPoint(segs, 0, 1, cfg); // 25-23: set won
    expect(segs[0]).toMatchObject({ status: "closed", points: [25, 23] });
    segs = applyRallyPoint(segs, 1, 1, cfg); // next tap starts set 2
    expect(segs).toHaveLength(2);
    expect(segs[1]).toMatchObject({ status: "open", points: [0, 1] });
  });
  it("deuce extends past the target until the margin is reached", () => {
    let segs = tap([], 0, 24, cfg);
    segs = tap(segs, 1, 24, cfg);
    segs = applyRallyPoint(segs, 0, 1, cfg); // 25-24: not enough
    expect(segs[0].status).toBe("open");
    segs = applyRallyPoint(segs, 0, 1, cfg); // 26-24: won
    expect(segs[0]).toMatchObject({ status: "closed", points: [26, 24] });
  });
  it("deciding set uses the deciding target", () => {
    const twoSets = [seg(25, 20, "closed", "set", 1), seg(20, 25, "closed", "set", 2)];
    let segs = tap(twoSets, 0, 14, cfg);
    segs = tap(segs, 1, 13, cfg);
    expect(segs[2]).toMatchObject({ status: "open", points: [14, 13] });
    segs = applyRallyPoint(segs, 0, 1, cfg); // 15-13 closes the decider
    expect(segs[2].status).toBe("closed");
    expect(rallyMatchWinner(segs, cfg)).toBe(0);
  });
  it("match winner needs the majority of sets; further taps are refused", () => {
    const won = [seg(25, 20, "closed", "set", 1), seg(25, 20, "closed", "set", 2)];
    expect(rallyMatchWinner(won, cfg)).toBe(0);
    expect(applyRallyPoint(won, 1, 1, cfg)).toEqual(won);
  });
  it("a −1 correction reopens the just-closed set", () => {
    let segs = tap([], 0, 25, cfg);
    expect(segs[0].status).toBe("closed");
    segs = applyRallyPoint(segs, 0, -1, cfg);
    expect(segs[0]).toMatchObject({ status: "open", points: [24, 0] });
  });
  it("a −1 with no points anywhere is a no-op", () => {
    expect(applyRallyPoint([], 0, -1, cfg)).toEqual([]);
  });
});

describe("rally scoring (badminton cap: 30 wins outright)", () => {
  const cfg = rallyConfig(div({ scoringConfig: { best_of: 3, set_target: 21, win_by: 2, cap: 30 } }));
  it("at 29-29 the next point takes the set despite a 1-point margin", () => {
    expect(segmentWinner([29, 29], 21, 2, 30)).toBeNull();
    expect(segmentWinner([30, 29], 21, 2, 30)).toBe(0);
    // alternate points so neither side ever leads by 2 on the way to 29-29
    let segs: SegmentInfo[] = [];
    for (let i = 0; i < 29; i++) {
      segs = applyRallyPoint(segs, 0, 1, cfg);
      segs = applyRallyPoint(segs, 1, 1, cfg);
    }
    expect(segs[0]).toMatchObject({ status: "open", points: [29, 29] });
    segs = applyRallyPoint(segs, 1, 1, cfg);
    expect(segs[0]).toMatchObject({ status: "closed", points: [29, 30] });
  });
});

describe("period scoring (basketball)", () => {
  it("points land in the current period; totals sum every period", () => {
    let segs = applyPeriodPoints([], 0, 2);
    segs = applyPeriodPoints(segs, 0, 3);
    segs = applyPeriodPoints(segs, 1, 2);
    expect(segs).toHaveLength(1);
    expect(segs[0].points).toEqual([5, 2]);
    segs = advancePeriod(segs);
    expect(segs[0].status).toBe("closed");
    expect(segs[1]).toMatchObject({ segmentNo: 2, status: "open", points: [0, 0] });
    segs = applyPeriodPoints(segs, 1, 3);
    expect(segmentTotals(segs)).toEqual([5, 5]);
  });
  it("corrections never drop a score below zero", () => {
    const segs = applyPeriodPoints([seg(1, 0, "open", "period")], 0, -3);
    expect(segs[0].points).toEqual([0, 0]);
  });
  it("scoring after the last period closes opens a fresh one (overtime)", () => {
    const segs = applyPeriodPoints([seg(20, 18, "closed", "period")], 0, 2);
    expect(segs).toHaveLength(2);
    expect(segs[1]).toMatchObject({ status: "open", points: [2, 0] });
  });
});
