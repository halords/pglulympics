import { describe, expect, it } from "vitest";
import { advancedEntryIds, bracketPool, pairUp, usedEntryIdsInStage } from "./fixture-setup";
import type { DivisionInfo, EntryInfo, MatchInfo } from "./types";

const ENTRIES: EntryInfo[] = Array.from({ length: 9 }, (_, i) => ({
  id: `e${i + 1}`, divisionId: "ml", teamId: `t${i + 1}`, rosterStatus: "unknown",
}));

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

describe("bracketPool + pairUp — one-time round setup", () => {
  it("opening round: all 9 teams pair into 4 matches with 1 bye", () => {
    const pool = bracketPool([], DIVS, ENTRIES, "ml", "quarterfinal");
    expect(pool).toHaveLength(9);
    const { pairs, leftover } = pairUp(pool);
    expect(pairs).toEqual([["e1", "e2"], ["e3", "e4"], ["e5", "e6"], ["e7", "e8"]]);
    expect(leftover).toBe("e9");
  });

  it("opening round shrinks as matches get placed", () => {
    const matches = [mk({ slots: vs("e1", "e2") }), mk({ slots: vs("e3", "e4") })];
    const pool = bracketPool(matches, DIVS, ENTRIES, "ml", "quarterfinal");
    expect(pool).toEqual(["e5", "e6", "e7", "e8", "e9"]);
  });

  it("semifinal pool = quarterfinal winners + the team that never played (the bye)", () => {
    const matches = [
      mk({ stage: "quarterfinal", status: "final", slots: vs("e1", "e2"), winnerEntryId: "e1" }),
      mk({ stage: "quarterfinal", status: "final", slots: vs("e3", "e4"), winnerEntryId: "e4" }),
      mk({ stage: "quarterfinal", status: "final", slots: vs("e5", "e6"), winnerEntryId: "e5" }),
      mk({ stage: "quarterfinal", status: "final", slots: vs("e7", "e8"), winnerEntryId: "e8" }),
    ];
    // e9 never played — it held the bye and joins the semifinal pool.
    const pool = bracketPool(matches, DIVS, ENTRIES, "ml", "semifinal");
    expect(pool).toEqual(["e1", "e4", "e5", "e8", "e9"]);
    const { pairs, leftover } = pairUp(pool);
    expect(pairs).toEqual([["e1", "e4"], ["e5", "e8"]]);
    expect(leftover).toBe("e9");
  });

  it("gold pool: a lone semifinal winner is joined by the waiting advancer (CODM shape)", () => {
    const matches = [
      mk({ stage: "quarterfinal", status: "final", slots: vs("e1", "e2"), winnerEntryId: "e1" }),
      mk({ stage: "quarterfinal", status: "final", slots: vs("e3", "e4"), winnerEntryId: "e3" }),
      mk({ stage: "quarterfinal", status: "final", slots: vs("e5", "e6"), winnerEntryId: "e5" }),
      mk({ stage: "semifinal", status: "final", slots: vs("e1", "e3"), winnerEntryId: "e1" }),
    ];
    // e5 won its quarterfinal but never got a semifinal match — it takes
    // the open final slot against the semifinal winner.
    expect(bracketPool(matches, DIVS, ENTRIES, "ml", "gold")).toEqual(["e1", "e5"]);
  });

  it("gold pool is semifinal winners only; bronze pool is semifinal losers", () => {
    const matches = [
      mk({ stage: "quarterfinal", status: "final", slots: vs("e1", "e2"), winnerEntryId: "e1" }),
      mk({ stage: "semifinal", status: "final", slots: vs("e1", "e4"), winnerEntryId: "e4" }),
      mk({ stage: "semifinal", status: "final", slots: vs("e5", "e8"), winnerEntryId: "e5" }),
    ];
    expect(bracketPool(matches, DIVS, ENTRIES, "ml", "gold")).toEqual(["e4", "e5"]);
    expect(bracketPool(matches, DIVS, ENTRIES, "ml", "bronze")).toEqual(["e1", "e8"]);
  });

  it("no gold matches can be generated before the semifinals finish", () => {
    const matches = [mk({ stage: "semifinal", status: "live", slots: vs("e1", "e4") })];
    expect(bracketPool(matches, DIVS, ENTRIES, "ml", "gold")).toEqual([]);
  });
});
