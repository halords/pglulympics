// End-to-end smoke test of the mock provider's domain semantics (SPEC §5/§7/§11):
// play a full division, verify advancement, medal drafts, tally inputs, and the
// conflict-warning -> acknowledge -> save flow.
import { describe, expect, it } from "vitest";
import { MockProvider } from "./mock";
import { computeTally } from "../standings";
import type { MatchInfo } from "../types";

async function playMatch(p: MockProvider, matchId: string, sets: [number, number][]) {
  let snap = await p.getSnapshot();
  let m = snap.matches.find((x) => x.id === matchId)!;
  await p.setMatchStatus(matchId, "live");
  snap = await p.getSnapshot();
  m = snap.matches.find((x) => x.id === matchId)!;
  await p.saveScore(matchId, m.revision, {
    segments: sets.map(([a, b], i) => ({
      segmentNo: i + 1, kind: "set" as const, status: "closed" as const, scores: { 1: a, 2: b },
    })),
  });
  await p.setMatchStatus(matchId, "final");
}

const slotEntry = (m: MatchInfo, n: number) => m.slots[n - 1]?.entryId ?? null;

describe("mock provider end-to-end", () => {
  it("seeds the official data", async () => {
    const p = new MockProvider();
    const snap = await p.getSnapshot();
    expect(snap.teams).toHaveLength(10);
    expect(snap.sports).toHaveLength(9);
    expect(snap.divisions).toHaveLength(43);
    expect(snap.matches).toHaveLength(276);
    const vb = snap.sports.find((s) => s.slug === "volleyball")!;
    const vbMatches = snap.matches.filter((m) => snap.divisions.find((d) => d.id === m.divisionId)?.sportId === vb.id);
    expect(vbMatches).toHaveLength(40);
    expect(vbMatches[0].startsAt).toBeTruthy();
    // placement-model sports carry entrant slots and no start time (sheet gives dates only)
    const athletics = snap.sports.find((s) => s.slug === "athletics")!;
    const athMatches = snap.matches.filter((m) => snap.divisions.find((d) => d.id === m.divisionId)?.sportId === athletics.id);
    expect(athMatches).toHaveLength(9);
    expect(athMatches[0].slots.length).toBeGreaterThan(2);
    expect(athMatches[0].startsAt).toBeNull();
  });

  it("plays a division through to medals and advances slots", async () => {
    const p = new MockProvider();
    let snap = await p.getSnapshot();
    const vb = snap.sports.find((s) => s.slug === "volleyball")!;
    const men = snap.divisions.find((d) => d.sportId === vb.id && d.name.includes("Men"))!;
    const rr = snap.matches.filter((m) => m.divisionId === men.id && m.stage === "round_robin");
    expect(rr).toHaveLength(16);
    // slot 1 wins every group match 2-0, with per-match varied loser points so
    // set/point ratios break any win% ties deterministically
    for (const [i, m] of rr.entries()) await playMatch(p, m.id, [[25, 4 + (i % 13)], [25, 3 + ((i * 7) % 17)]]);

    snap = await p.getSnapshot();
    const semis = snap.matches.filter((m) => m.divisionId === men.id && m.stage === "semifinal");
    expect(semis).toHaveLength(2);
    for (const s of semis) {
      expect(slotEntry(s, 1)).toBeTruthy();
      expect(slotEntry(s, 2)).toBeTruthy();
    }
    for (const s of semis) await playMatch(p, s.id, [[25, 20], [25, 20]]);

    snap = await p.getSnapshot();
    const gold = snap.matches.find((m) => m.divisionId === men.id && m.stage === "gold")!;
    const bronze = snap.matches.find((m) => m.divisionId === men.id && m.stage === "bronze")!;
    expect(slotEntry(gold, 1)).toBeTruthy();
    expect(slotEntry(bronze, 1)).toBeTruthy();
    await playMatch(p, gold.id, [[25, 15], [25, 15]]);
    await playMatch(p, bronze.id, [[25, 15], [25, 15]]);

    snap = await p.getSnapshot();
    const drafts = snap.awards.filter((a) => a.divisionId === men.id && a.state === "draft");
    expect(drafts.map((d) => d.medal).sort()).toEqual(["bronze", "gold", "silver"]);

    await p.confirmAwards(men.id, drafts.map((d) => ({ awardKey: d.awardKey, medal: d.medal, entryId: d.entryId, source: d.source })));
    snap = await p.getSnapshot();
    const tally = computeTally(snap.teams, snap.awards, snap.event,
      (entryId) => snap.entries.find((e) => e.id === entryId)?.teamId);
    expect(tally[0].points).toBe(5); // gold at provisional 5/3/1
    expect(tally[0].gold).toBe(1);
    expect(tally.reduce((a, r) => a + r.points, 0)).toBe(9);
  });

  it("warns on a cross-division player clash, then saves on acknowledgement", async () => {
    const p = new MockProvider();
    let snap = await p.getSnapshot();
    const vb = snap.sports.find((s) => s.slug === "volleyball")!;
    const men = snap.divisions.find((d) => d.sportId === vb.id && d.name.includes("Men"))!;
    const women = snap.divisions.find((d) => d.sportId === vb.id && d.name.includes("Women"))!;
    const menEntry = snap.entries.find((e) => e.divisionId === men.id)!;
    const womenEntry = snap.entries.find((e) => e.divisionId === women.id && e.teamId !== menEntry.teamId)
      ?? snap.entries.find((e) => e.divisionId === women.id)!;
    const otherWomenEntry = snap.entries.find((e) => e.divisionId === women.id && e.id !== womenEntry.id)!;
    const player = await p.upsertPlayer("Shared Player One");
    await p.setEntryRoster(menEntry.id, [player.id]);
    await p.setEntryRoster(womenEntry.id, [player.id]);
    await p.setEntryRosterStatus(menEntry.id, "verified");
    await p.setEntryRosterStatus(womenEntry.id, "verified");

    snap = await p.getSnapshot();
    const menMatch = snap.matches.find((m) => m.divisionId === men.id && m.slots.some((s) => s.entryId === menEntry.id))!;
    // schedule a women's fixture at exactly the men's match time
    const res = await p.createFixture({
      divisionId: women.id, label: "Clash Test", stage: "round_robin", groupId: null,
      startsAt: menMatch.startsAt!, durationMinutes: 60, venueId: null, venueText: "Elsewhere",
      entryIds: [womenEntry.id, otherWomenEntry.id],
    });
    expect(res.status).toBe("warning");
    if (res.status !== "warning") throw new Error("expected warning");
    expect(res.conflicts.playerClashes.length).toBeGreaterThan(0);
    expect(res.conflicts.playerClashes[0].player_name).toBe("Shared Player One");

    const ok = await p.createFixture({
      divisionId: women.id, label: "Clash Test", stage: "round_robin", groupId: null,
      startsAt: menMatch.startsAt!, durationMinutes: 60, venueId: null, venueText: "Elsewhere",
      entryIds: [womenEntry.id, otherWomenEntry.id],
    }, res.ackHash);
    expect(ok.status).toBe("ok");

    const conflicts = await p.listConflicts();
    expect(conflicts.some((c) => c.kind === "player" && c.playerName === "Shared Player One")).toBe(true);
  });
});
