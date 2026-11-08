import { describe, expect, it } from "vitest";
import { advancedEntryIds, usedEntryIdsInStage } from "./fixture-setup";
import type { DivisionInfo, MatchInfo } from "./types";

const DIVS: DivisionInfo[] = [
  { id: "ml", sportId: "mg", name: "Mobile Legends", slug: "ml", scoringKind: "simple", scoringConfig: {}, standingsConfig: {}, medalPolicy: {} },
  { id: "codm", sportId: "mg", name: "CODM", slug: "codm", scoringKind: "simple", scoringConfig: {}, standingsConfig: {}, medalPolicy: {} },
];

let n = 0;
function mk(partial: Partial<MatchInfo>): MatchInfo {
  n += 1;
  return {
    id: `m${n}`, divisionId: "ml", stage: "quarterfinal", status: "scheduled",
    label: `Match ${n}`, startsAt: null, slots: [], segments: [], revision: 0,
    ...partial,
  };
}
const vs = (a: string, b: string) => [
  { slotNo: 1, entryId: a, teamName: a },
  { slotNo: 2, entryId: b, teamName: b },
];

describe("usedEntryIdsInStage", () => {
  it("collects both slots of same-division, same-stage matches; skips cancelled + other stages", () => {
    const matches = [
      mk({ slots: vs("e1", "e2") }),
      mk({ slots: vs("e3", "e4") }),
      mk({ slots: vs("e5", "e6"), status: "cancelled" }),
      mk({ slots: vs("e7", "e8"), stage: "semifinal" }),
      mk({ slots: vs("e9", "e10"), divisionId: "codm" }),
    ];
    expect([...usedEntryIdsInStage(matches, "ml", "quarterfinal")].sort()).toEqual(["e1", "e2", "e3", "e4"]);
    expect(usedEntryIdsInStage(matches, "ml", "gold").size).toBe(0);
  });
});

describe("advancedEntryIds — winners go up", () => {
  it("returns winners of final earlier-stage matches, in stage order", () => {
    const matches = [
      mk({ stage: "quarterfinal", status: "final", slots: vs("e1", "e2"), winnerEntryId: "e2" }),
      mk({ stage: "quarterfinal", status: "final", slots: vs("e3", "e4"), winnerEntryId: "e3" }),
      mk({ stage: "quarterfinal", status: "scheduled", slots: vs("e5", "e6") }),
      mk({ stage: "semifinal", status: "final", slots: vs("e2", "e3"), winnerEntryId: "e2" }),
    ];
    // Semifinal picks see the quarterfinal winners only.
    expect(advancedEntryIds(matches, DIVS, "ml", "semifinal")).toEqual(["e2", "e3"]);
    // Gold picks see QF + SF winners (SF winner last — most recent round).
    expect(advancedEntryIds(matches, DIVS, "ml", "gold")).toEqual(["e2", "e3"]);
    // Nothing feeds the first round.
    expect(advancedEntryIds(matches, DIVS, "ml", "quarterfinal")).toEqual([]);
    expect(advancedEntryIds(matches, DIVS, "ml", "round_robin")).toEqual([]);
  });

  it("derives the winner from totals when winnerEntryId is unset", () => {
    const matches = [
      mk({ stage: "quarterfinal", status: "final", slots: vs("e1", "e2"), totals: [0, 1] }),
    ];
    expect(advancedEntryIds(matches, DIVS, "ml", "semifinal")).toEqual(["e2"]);
  });
});
