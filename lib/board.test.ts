import { describe, expect, it } from "vitest";
import { boardContext, boardScore, boardView, divisionBoard, isSessionSport } from "./board";
import type { DivisionInfo, MatchInfo, Snapshot } from "./types";

const div = (partial: Partial<DivisionInfo>): DivisionInfo => ({
  id: "d1", sportId: "s1", name: "Men's", slug: "mens", scoringKind: "set_based",
  scoringConfig: { best_of: 3 }, standingsConfig: {}, medalPolicy: {}, ...partial,
});
const setDiv = div({});
const simpleDiv = div({ id: "d2", name: "Mobile Legends", slug: "ml", scoringKind: "simple", scoringConfig: {} });
const placementDiv = div({ id: "d3", name: "Executive Mixed", slug: "exec", scoringKind: "placement_only", scoringConfig: {} });

let n = 0;
const mk = (partial: Partial<MatchInfo>): MatchInfo => {
  n += 1;
  return {
    id: `m${n}`, divisionId: "d1", stage: "round_robin", status: "scheduled",
    label: `Match ${n}`, startsAt: null, slots: [], segments: [], revision: 0,
    ...partial,
  };
};
const twoSlots = (a: [string, string], b: [string, string]) => [
  { slotNo: 1, entryId: a[0], teamName: a[1] },
  { slotNo: 2, entryId: b[0], teamName: b[1] },
];
const seg = (segmentNo: number, status: "open" | "closed", a: number, b: number) => ({
  segmentNo, kind: "set" as const, status, points: [a, b],
});

describe("boardScore — mirrors the public score derivation", () => {
  it("set-based shows sets won (closed sets only)", () => {
    const m = mk({ segments: [seg(1, "closed", 25, 20), seg(2, "closed", 25, 22), seg(3, "open", 10, 5)] });
    expect(boardScore(m, setDiv)).toEqual({ a: "2", b: "0" });
  });

  it("simple shows recorded totals when present", () => {
    const m = mk({ divisionId: "d2", totals: [88, 80] });
    expect(boardScore(m, simpleDiv)).toEqual({ a: "88", b: "80" });
  });

  it("simple without totals sums closed segments; nothing closed → null", () => {
    const closed = mk({ divisionId: "d2", segments: [seg(1, "closed", 20, 18), seg(2, "closed", 15, 15), seg(3, "open", 4, 2)] });
    expect(boardScore(closed, simpleDiv)).toEqual({ a: "35", b: "33" });
    const openOnly = mk({ divisionId: "d2", segments: [seg(1, "open", 4, 2)] });
    expect(boardScore(openOnly, simpleDiv)).toBeNull();
  });
});

describe("boardView — per-match screen states", () => {
  it("scheduled versus: placeholders resolve, no winner concept", () => {
    const m = mk({
      slots: [{ slotNo: 1, entryId: null, placeholder: "Bracket A #1" }, { slotNo: 2, entryId: null, placeholder: "Bracket B #2" }],
    });
    const v = boardView(m, setDiv);
    expect(v.kind).toBe("versus");
    expect(v.state).toBe("scheduled");
    expect(v.teams).toEqual(["Bracket A #1", "Bracket B #2"]);
    expect(v.winnerSide).toBeNull();
    expect(v.isDraw).toBe(false);
  });

  it("live: a leading side is never a winner yet", () => {
    const m = mk({
      status: "live",
      slots: twoSlots(["e1", "Alpha"], ["e2", "Bravo"]),
      segments: [seg(1, "closed", 25, 10), seg(2, "closed", 25, 10)],
    });
    const v = boardView(m, setDiv);
    expect(v.state).toBe("live");
    expect(v.winnerSide).toBeNull();
    expect(v.score).toEqual({ a: "2", b: "0" });
  });

  it("final: recorded winnerEntryId drives the emphasis (slot 2)", () => {
    const m = mk({
      status: "final", winnerEntryId: "e2",
      slots: twoSlots(["e1", "Alpha"], ["e2", "Bravo"]),
      segments: [seg(1, "closed", 20, 25), seg(2, "closed", 18, 25)],
    });
    const v = boardView(m, setDiv);
    expect(v.winnerSide).toBe(1);
    expect(v.isDraw).toBe(false);
  });

  it("final: missing winner tag falls back to the score-derived winner", () => {
    const m = mk({
      status: "final",
      slots: twoSlots(["e1", "Alpha"], ["e2", "Bravo"]),
      segments: [seg(1, "closed", 25, 20), seg(2, "closed", 25, 22)],
    });
    expect(boardView(m, setDiv).winnerSide).toBe(0);
  });

  it("final: draw outcome is a draw", () => {
    const m = mk({
      status: "final", outcome: "draw", divisionId: "d2", totals: [70, 70],
      slots: twoSlots(["e1", "Alpha"], ["e2", "Bravo"]),
    });
    const v = boardView(m, simpleDiv);
    expect(v.isDraw).toBe(true);
    expect(v.winnerSide).toBeNull();
  });

  it("segment chips are labelled per kind with the open flag", () => {
    const m = mk({ status: "live", segments: [seg(1, "closed", 25, 20), seg(2, "open", 7, 3)] });
    expect(boardView(m, setDiv).segments).toEqual([
      { label: "S1", a: 25, b: 20, open: false },
      { label: "S2", a: 7, b: 3, open: true },
    ]);
    const b = mk({ divisionId: "d2", status: "live", segments: [{ segmentNo: 1, kind: "period", status: "open", points: [30, 28] }] });
    expect(boardView(b, simpleDiv).segments[0].label).toBe("Q1");
  });

  it("placement: entrants dedupe, placed rows sort first, unplaced follow", () => {
    const m = mk({
      divisionId: "d3", status: "final",
      slots: [
        { slotNo: 1, entryId: "e1", teamName: "Alpha" },
        { slotNo: 2, entryId: "e2", teamName: "Bravo" },
        { slotNo: 3, entryId: "e3", teamName: "Charlie" },
      ],
      placements: [
        { slotNo: 2, place: 2, finish: "2nd" },
        { slotNo: 1, place: 1, finish: "1st" },
      ],
    });
    const v = boardView(m, placementDiv);
    expect(v.kind).toBe("placement");
    expect(v.hasPlacements).toBe(true);
    expect(v.entrants).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(v.placementRows.map((r) => [r.teamName, r.place])).toEqual([
      ["Alpha", 1], ["Bravo", 2], ["Charlie", null],
    ]);
    const fresh = boardView(mk({ divisionId: "d3", slots: m.slots }), placementDiv);
    expect(fresh.hasPlacements).toBe(false);
    expect(fresh.placementRows).toHaveLength(3);
  });
});

describe("boardContext", () => {
  it("resolves match + division + sport; unknown id → null", () => {
    const snap = snapOf({
      sports: [{ id: "s1", name: "Volleyball", slug: "volleyball", defaultDurationMinutes: 60 }],
      divisions: [setDiv],
      matches: [mk({ id: "target" })],
    });
    const ctx = boardContext(snap, "target");
    expect(ctx?.match.id).toBe("target");
    expect(ctx?.division?.id).toBe("d1");
    expect(ctx?.sport?.name).toBe("Volleyball");
    expect(boardContext(snap, "nope")).toBeNull();
  });
});

describe("isSessionSport", () => {
  it("mobile-games only", () => {
    expect(isSessionSport({ slug: "mobile-games" })).toBe(true);
    expect(isSessionSport({ slug: "volleyball" })).toBe(false);
    expect(isSessionSport(null)).toBe(false);
    expect(isSessionSport(undefined)).toBe(false);
  });
});

/* ------------------------- teams board ------------------------- */

function snapOf(partial: Partial<Snapshot>): Snapshot {
  return {
    event: {
      id: "e1", slug: "pglulympics-2026", name: "PGLUlympics",
      startDate: "2026-11-09", endDate: "2026-11-26",
      goldPoints: 5, silverPoints: 3, bronzePoints: 1, pointsProvisional: true,
    },
    teams: [], sports: [], divisions: [], groups: [], entries: [], matches: [],
    awards: [], players: [], rosters: {}, venues: [], revision: 0,
    ...partial,
  };
}

const mlSnap = () => snapOf({
  sports: [{ id: "s9", name: "Mobile Games", slug: "mobile-games", defaultDurationMinutes: 45 }],
  divisions: [{ ...simpleDiv, id: "dml", sportId: "s9" }],
  teams: [
    { id: "t1", name: "Team One", slug: "team-one" },
    { id: "t2", name: "Team Two", slug: "team-two" },
    { id: "t3", name: "Team Three", slug: "team-three" },
    { id: "t4", name: "Team Four", slug: "team-four" },
  ],
  entries: [
    { id: "en1", divisionId: "dml", teamId: "t1", rosterStatus: "unknown" },
    { id: "en2", divisionId: "dml", teamId: "t2", rosterStatus: "unknown" },
    { id: "en3", divisionId: "dml", teamId: "t3", rosterStatus: "unknown" },
    { id: "en4", divisionId: "dml", teamId: "t4", rosterStatus: "unknown" },
  ],
  matches: [
    // Team One beat Team Three earlier (final, recorded winner).
    mk({
      id: "fin1", divisionId: "dml", status: "final", winnerEntryId: "en1",
      startsAt: "2026-11-09T09:00:00+08:00", totals: [2, 1],
      slots: twoSlots(["en1", "Team One"], ["en3", "Team Three"]),
    }),
    // Team One is LIVE against Team Two right now, trailing 0–1.
    mk({
      id: "live1", divisionId: "dml", status: "live",
      startsAt: "2026-11-09T13:00:00+08:00", totals: [0, 1],
      slots: twoSlots(["en2", "Team Two"], ["en1", "Team One"]),
    }),
    // A cancelled match must not count for anyone.
    mk({
      id: "cx1", divisionId: "dml", status: "cancelled",
      slots: twoSlots(["en3", "Team Three"], ["en4", "Team Four"]),
    }),
  ],
});

describe("divisionBoard — per-division teams board", () => {
  it("unknown division → null", () => {
    expect(divisionBoard(mlSnap(), "nope")).toBeNull();
  });

  it("lists only the division's teams, live first, with oriented live scores", () => {
    const b = divisionBoard(mlSnap(), "dml");
    expect(b).not.toBeNull();
    expect(b!.rows).toHaveLength(4);
    expect(b!.liveCount).toBe(1);
    const [r0, r1] = b!.rows;
    // Both live teams lead the board (name order inside the live group).
    expect([r0.teamName, r1.teamName].sort()).toEqual(["Team One", "Team Two"]);
    const one = b!.rows.find((r) => r.teamName === "Team One")!;
    const two = b!.rows.find((r) => r.teamName === "Team Two")!;
    expect(one.state).toBe("live");
    expect(one.liveMatchId).toBe("live1");
    expect(one.liveOpponent).toBe("Team Two");
    // Team One sits in slot 2 of the live match: score flips to its side.
    expect(one.liveScoreFor).toBe("1");
    expect(one.liveScoreAgainst).toBe("0");
    expect(two.liveScoreFor).toBe("0");
    expect(two.liveScoreAgainst).toBe("1");
  });

  it("records W/L so far with the latest result; untouched teams stay idle", () => {
    const b = divisionBoard(mlSnap(), "dml")!;
    const one = b.rows.find((r) => r.teamName === "Team One")!;
    expect(one.wins).toBe(1);
    expect(one.losses).toBe(0);
    expect(one.lastResult).toEqual({ outcome: "W", scoreFor: "2", scoreAgainst: "1", opponent: "Team Three" });
    const three = b.rows.find((r) => r.teamName === "Team Three")!;
    expect(three.state).toBe("played");
    expect(three.wins).toBe(0);
    expect(three.losses).toBe(1);
    expect(three.lastResult).toEqual({ outcome: "L", scoreFor: "1", scoreAgainst: "2", opponent: "Team One" });
    const four = b.rows.find((r) => r.teamName === "Team Four")!;
    expect(four.state).toBe("idle");
    expect(four.lastResult).toBeNull();
  });

  it("an ML board never leaks another division's teams or matches", () => {
    const snap = mlSnap();
    snap.divisions.push({ ...simpleDiv, id: "dcodm", sportId: "s9", name: "CODM", slug: "codm" });
    snap.teams.push({ id: "t9", name: "Codm Squad", slug: "codm-squad" });
    snap.entries.push({ id: "en9", divisionId: "dcodm", teamId: "t9", rosterStatus: "unknown" });
    snap.matches.push(mk({
      id: "codm-live", divisionId: "dcodm", status: "live", totals: [3, 3],
      slots: twoSlots(["en9", "Codm Squad"], ["en1", "Team One"]),
    }));
    const ml = divisionBoard(snap, "dml")!;
    expect(ml.rows.map((r) => r.teamName)).not.toContain("Codm Squad");
    expect(ml.liveCount).toBe(1); // still only the ML live match
    const codm = divisionBoard(snap, "dcodm")!;
    expect(codm.rows.map((r) => r.teamName)).toEqual(["Codm Squad"]);
  });
});
