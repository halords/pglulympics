import { describe, expect, it } from "vitest";
import { gamesWon, pyramidBracket } from "./bracket";
import type { MatchInfo, Snapshot } from "./types";

const TEAMS = Array.from({ length: 10 }, (_, i) => ({
  id: `t${i + 1}`, name: `Team ${i + 1}`, slug: `team-${i + 1}`, color: null,
}));
const ENTRIES = TEAMS.map((t, i) => ({
  id: `e${i + 1}`, divisionId: "ml", teamId: t.id, rosterStatus: "unknown" as const,
}));

let n = 0;
function mk(partial: Partial<MatchInfo>): MatchInfo {
  n += 1;
  return {
    id: `m${n}`, divisionId: "ml", stage: "quarterfinal", status: "scheduled",
    label: `Quarterfinal ${n}`, startsAt: null, slots: [], segments: [], revision: 0,
    ...partial,
  };
}
const vs = (a: number, b: number) => [
  { slotNo: 1, entryId: `e${a}`, teamName: `Team ${a}` },
  { slotNo: 2, entryId: `e${b}`, teamName: `Team ${b}` },
];

function snap(matches: MatchInfo[], entries = ENTRIES): Snapshot {
  return {
    event: { id: "ev", name: "PGLUlympics", slug: "pglulympics-2026" },
    teams: TEAMS,
    sports: [{ id: "mg", name: "Mobile Games", slug: "mobile-games" }],
    divisions: [{ id: "ml", sportId: "mg", name: "Mobile Legends", slug: "ml", scoringKind: "simple", scoringConfig: {}, standingsConfig: {}, medalPolicy: {} }],
    groups: [], entries, matches, awards: [], players: [], rosters: {}, venues: [], revision: 1,
  } as unknown as Snapshot;
}

describe("gamesWon — series score", () => {
  it("prefers totals, else counts won segments", () => {
    expect(gamesWon(mk({ totals: [2, 1] }), 0)).toBe(2);
    expect(gamesWon(mk({ segments: [
      { segmentNo: 1, kind: "set", status: "closed", points: [1, 0] },
      { segmentNo: 2, kind: "set", status: "closed", points: [0, 1] },
      { segmentNo: 3, kind: "set", status: "closed", points: [1, 0] },
    ] }), 0)).toBe(2);
  });
});

describe("pyramidBracket — projection with no matches", () => {
  it("10 teams → 5 projected QF, SF ghosts fed by winner labels, gold ghost, bronze ghosts", () => {
    const p = pyramidBracket(snap([]), "ml")!;
    expect(p.projectedOnly).toBe(true);
    expect(p.levels.map((l) => l.stage)).toEqual(["quarterfinal", "semifinal", "gold"]);
    expect(p.levels[0].matches).toHaveLength(5);
    expect(p.levels[0].matches[0].slots.map((s) => s.name)).toEqual(["Team 1", "Team 2"]);
    expect(p.levels[1].matches).toHaveLength(2);
    expect(p.levels[1].matches[0].slots.map((s) => s.name)).toEqual(["Winner QF1", "Winner QF2"]);
    // 5 QF winners → 2 SF pairs + 1 waiting winner.
    expect(p.levels[1].waiting).toHaveLength(1);
    expect(p.levels[1].waiting[0].name).toBe("Winner QF5");
    // The waiting winner is NOT carried into the gold pool (semifinal
    // winners only) — no duplicate waiting chip at the final.
    expect(p.levels[2].waiting).toHaveLength(0);
    expect(p.levels[2].matches).toHaveLength(1);
    expect(p.levels[2].matches[0].tag).toBe("FINAL");
    expect(p.bronze?.slots.map((s) => s.name)).toEqual(["Loser SF1", "Loser SF2"]);
    expect(p.champion).toBeNull();
  });

  it("9 teams → 4 projected QF + the odd team is the bye: it waits at the semifinal level", () => {
    const p = pyramidBracket(snap([], ENTRIES.slice(0, 9)), "ml")!;
    expect(p.levels[0].matches).toHaveLength(4);
    expect(p.levels[0].waiting[0].name).toBe("Team 9");
    const sf = p.levels[1];
    // SF pool: 4 QF-winner labels + Team 9 (bye) → 2 pairs + Team 9 waiting
    // again with its bye flag set — the same shape bracketPool/pairUp gives.
    expect(sf.matches).toHaveLength(2);
    expect(sf.waiting).toHaveLength(1);
    expect(sf.waiting[0].name).toBe("Team 9");
    expect(sf.waiting[0].isBye).toBe(true);
  });
});

describe("pyramidBracket — live progression", () => {
  it("decided QF winners appear by name in the SF ghosts; QF losers are eliminated, SF losers are not", () => {
    const matches = [
      mk({ status: "final", slots: vs(1, 2), totals: [2, 0], winnerEntryId: "e1", label: "Quarterfinal 1" }),
      mk({ status: "live", slots: vs(3, 4), totals: [1, 0], label: "Quarterfinal 2" }),
      mk({ status: "final", slots: vs(1, 3), stage: "semifinal", totals: [1, 2], winnerEntryId: "e3", label: "Semifinal 1" }),
    ];
    const p = pyramidBracket(snap(matches), "ml")!;
    expect(p.projectedOnly).toBe(false);
    const qf1 = p.levels[0].matches[0];
    expect(qf1.slots[0].isWinner).toBe(true);
    expect(qf1.slots[0].games).toBe(2);
    expect(qf1.slots[1].isEliminated).toBe(true);
    const sf1 = p.levels[1].matches[0];
    expect(sf1.slots[0].name).toBe("Team 1");
    expect(sf1.slots[0].isEliminated).toBe(false); // SF loser drops to bronze
    expect(sf1.slots[1].isWinner).toBe(true);
    // Bronze projection names the decided SF loser.
    expect(p.bronze?.slots[0].name).toBe("Team 1");
    // Gold ghost is fed by the SF winner's name.
    const gold = p.levels[2].matches[0];
    expect(gold.slots[0].name).toBe("Team 3");
  });

  it("champion, runner-up and 3rd place resolve from the finals", () => {
    const matches = [
      mk({ stage: "gold", status: "final", slots: vs(5, 6), totals: [2, 1], winnerEntryId: "e5", label: "Gold" }),
      mk({ stage: "bronze", status: "final", slots: vs(7, 8), totals: [2, 0], winnerEntryId: "e7", label: "Bronze" }),
      mk({ stage: "semifinal", status: "final", slots: vs(5, 7), totals: [2, 0], winnerEntryId: "e5", label: "Semifinal 1" }),
    ];
    const p = pyramidBracket(snap(matches), "ml")!;
    expect(p.champion).toBe("Team 5");
    expect(p.runnerUp).toBe("Team 6");
    expect(p.thirdPlace).toBe("Team 7");
  });

  it("returns null for a division with no entries", () => {
    expect(pyramidBracket(snap([], []), "ml")).toBeNull();
  });

  it("CODM shape (6 teams): the waiting QF winner takes the open final slot; no bronze pair", () => {
    const p = pyramidBracket(snap([], ENTRIES.slice(0, 6)), "ml")!;
    expect(p.levels[0].matches).toHaveLength(3);
    expect(p.levels[1].matches).toHaveLength(1);
    // Winner QF3 waited at the semifinal level, then filled the final —
    // so its waiting chip is gone and the FINAL card exists.
    expect(p.levels[1].waiting).toHaveLength(0);
    expect(p.levels[2].matches).toHaveLength(1);
    expect(p.levels[2].matches[0].slots.map((s) => s.name)).toEqual(["Winner SF1", "Winner QF3"]);
    // A single semifinal produces one SF loser — no bronze pairing.
    expect(p.bronze).toBeNull();
  });
});
