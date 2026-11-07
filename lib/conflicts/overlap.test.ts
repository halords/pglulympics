import { describe, it, expect } from "vitest";
import { intervalOf, overlaps, checkFixtureConflicts, type FixtureLike, type RosterLike } from "./overlap";

// SPEC §11.6 binding test list.
const MNL = (d: string, t: string) => new Date(`${d}T${t}:00+08:00`).toISOString(); // Asia/Manila wall time -> UTC instant

describe("intervalOf / overlaps (half-open)", () => {
  it("touching boundaries do NOT overlap", () => {
    const a = intervalOf(MNL("2026-11-09", "13:00"), 60);
    const b = intervalOf(MNL("2026-11-09", "14:00"), 60);
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(b, a)).toBe(false);
  });
  it("partial overlap and containment overlap", () => {
    const a = intervalOf(MNL("2026-11-09", "13:00"), 60);
    expect(overlaps(a, intervalOf(MNL("2026-11-09", "13:30"), 60))).toBe(true);
    expect(overlaps(a, intervalOf(MNL("2026-11-09", "13:15"), 10))).toBe(true);
    expect(overlaps(a, intervalOf(MNL("2026-11-09", "12:00"), 30))).toBe(false);
  });
  it("identical intervals overlap", () => {
    const a = intervalOf(MNL("2026-11-09", "13:00"), 60);
    expect(overlaps(a, intervalOf(MNL("2026-11-09", "13:00"), 60))).toBe(true);
  });
  it("midnight crossing works on instants", () => {
    const a = intervalOf(MNL("2026-11-09", "23:30"), 60); // ends 00:30 next day Manila
    const b = intervalOf(MNL("2026-11-10", "00:15"), 30);
    expect(overlaps(a, b)).toBe(true);
  });
  it("Manila wall time converts to the right UTC instant", () => {
    const a = intervalOf("2026-11-09T13:00:00+08:00", 60);
    expect(new Date(a.start).toISOString()).toBe("2026-11-09T05:00:00.000Z");
  });
  it("invalid duration rejected", () => {
    expect(() => intervalOf(MNL("2026-11-09", "13:00"), 0)).toThrow();
    expect(() => intervalOf(MNL("2026-11-09", "13:00"), -5)).toThrow();
  });
});

const rosters: RosterLike = {
  byEntry: { e1: ["p1", "p2"], e2: ["p3"], e3: ["p1"], e4: [] },
  statusByEntry: { e1: "verified", e2: "verified", e3: "verified", e4: "unknown" },
  playerName: { p1: "Juan Cruz", p2: "Ana Reyes", p3: "Jose Lim" },
};
function fx(partial: Partial<FixtureLike>): FixtureLike {
  return {
    id: "fx-new", label: "1", sportName: "Volleyball", divisionId: "d1",
    startsAt: MNL("2026-11-09", "13:00"), durationMinutes: 60,
    venueId: "v1", venueName: "DMMMSU Covered Court", entryIds: ["e1", "e2"], ...partial,
  };
}

describe("checkFixtureConflicts (SPEC §11.3)", () => {
  it("flags a cross-sport player clash with specifics", () => {
    const other = fx({ id: "fx-bball", label: "7", sportName: "Basketball", startsAt: MNL("2026-11-09", "13:30"), entryIds: ["e3"] });
    const r = checkFixtureConflicts(fx({}), [other], rosters);
    expect(r.playerClashes).toHaveLength(1);
    expect(r.playerClashes[0].player_name).toBe("Juan Cruz");
    expect(r.playerClashes[0].other_sport).toBe("Basketball");
  });
  it("excludes the fixture itself", () => {
    const self = fx({});
    const r = checkFixtureConflicts(fx({}), [self], rosters);
    expect(r.playerClashes).toHaveLength(0);
    expect(r.venueClashes).toHaveLength(0);
  });
  it("flags a venue clash without any player clash", () => {
    const other = fx({ id: "fx-other", startsAt: MNL("2026-11-09", "13:45"), entryIds: ["e4"] });
    const r = checkFixtureConflicts(fx({ entryIds: ["e2"] }), [other], rosters);
    expect(r.venueClashes).toHaveLength(1);
    expect(r.playerClashes).toHaveLength(0);
  });
  it("no clash when back-to-back at the same venue", () => {
    const other = fx({ id: "fx-next", startsAt: MNL("2026-11-09", "14:00"), entryIds: ["e3"] });
    const r = checkFixtureConflicts(fx({}), [other], rosters);
    expect(r.playerClashes).toHaveLength(0);
    expect(r.venueClashes).toHaveLength(0);
  });
  it("same player on both sides is an anomaly, not a clash", () => {
    const r = checkFixtureConflicts(fx({ entryIds: ["e1", "e3"] }), [], rosters);
    expect(r.anomalies).toHaveLength(1);
    expect(r.anomalies[0].player_name).toBe("Juan Cruz");
  });
  it("unverified roster and unmapped venue are incomplete signals", () => {
    const r = checkFixtureConflicts(fx({ entryIds: ["e4", "e2"], venueId: null }), [], rosters);
    expect(r.incomplete).toContain("roster_unverified");
    expect(r.incomplete).toContain("venue_unmapped");
  });
});
