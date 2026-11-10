import { describe, expect, it } from "vitest";
import { computeStandings } from "./standings";
import type { DivisionInfo, EntryInfo, MatchInfo, TeamInfo } from "./types";

const division: DivisionInfo = {
  id: "d-basketball-men", sportId: "s-basketball", name: "Men's", slug: "mens",
  scoringKind: "simple", scoringConfig: {}, standingsConfig: {}, medalPolicy: {},
};
const teams: TeamInfo[] = [
  { id: "t-guardians", name: "AGKAYSA GUARDians", slug: "agkaysa-guardians" },
  { id: "t-code-blues", name: "THE CODE BLUES", slug: "the-code-blues" },
];
const entries: EntryInfo[] = [
  { id: "e-guardians", divisionId: division.id, teamId: "t-guardians", rosterStatus: "unknown" },
  { id: "e-code-blues", divisionId: division.id, teamId: "t-code-blues", rosterStatus: "unknown" },
];

describe("computeStandings", () => {
  it("uses recorded totals for points for/against when a final has no segments", () => {
    const match: MatchInfo = {
      id: "m1", divisionId: division.id, stage: "round_robin", status: "final",
      label: "Match 2", startsAt: "2026-11-09T13:00:00+08:00",
      slots: [
        { slotNo: 1, entryId: "e-guardians", teamName: "AGKAYSA GUARDians" },
        { slotNo: 2, entryId: "e-code-blues", teamName: "THE CODE BLUES" },
      ],
      segments: [], totals: [61, 76], winnerEntryId: "e-code-blues", outcome: "win", revision: 3,
    };

    const rows = computeStandings(division, entries, [match], teams);
    const guardians = rows.find((r) => r.entryId === "e-guardians");
    const codeBlues = rows.find((r) => r.entryId === "e-code-blues");

    expect(guardians).toMatchObject({ played: 1, wins: 0, losses: 1, pointsFor: 61, pointsAgainst: 76 });
    expect(codeBlues).toMatchObject({ played: 1, wins: 1, losses: 0, pointsFor: 76, pointsAgainst: 61 });
  });

  it("does not double-count totals when closed period segments are present", () => {
    const match: MatchInfo = {
      id: "m2", divisionId: division.id, stage: "round_robin", status: "final",
      label: "Match 3", startsAt: "2026-11-09T14:00:00+08:00",
      slots: [
        { slotNo: 1, entryId: "e-guardians", teamName: "AGKAYSA GUARDians" },
        { slotNo: 2, entryId: "e-code-blues", teamName: "THE CODE BLUES" },
      ],
      segments: [
        { segmentNo: 1, kind: "period", status: "closed", points: [30, 40] },
        { segmentNo: 2, kind: "period", status: "closed", points: [31, 36] },
      ],
      totals: [61, 76], winnerEntryId: "e-code-blues", outcome: "win", revision: 3,
    };

    const rows = computeStandings(division, entries, [match], teams);
    expect(rows.find((r) => r.entryId === "e-code-blues")).toMatchObject({ pointsFor: 76, pointsAgainst: 61 });
  });
});
