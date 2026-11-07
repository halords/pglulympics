import { describe, expect, it } from "vitest";
import { buildScheduleSections, nextUpFixtures } from "./schedule";
import { dedupeLabel } from "./format";
import type { MatchInfo } from "./types";

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

describe("buildScheduleSections — audience-first ordering", () => {
  it("unscheduled (TBA) matches go last, never first, regardless of input order", () => {
    const tbaFirst = [mk({ startsAt: null }), mk({ startsAt: at("09", "13:00") }), mk({ startsAt: null })];
    const s = buildScheduleSections(tbaFirst, "2026-11-07");
    expect(s.tba).toHaveLength(2);
    expect(s.days.map((d) => d.key)).toEqual(["2026-11-09"]);
    expect(s.days[0].matches).toHaveLength(1);
  });

  it("live matches are pinned into their own lead section", () => {
    const live = mk({ status: "live", startsAt: at("11", "10:00") });
    const s = buildScheduleSections([mk({ startsAt: at("11", "09:00") }), live], "2026-11-11");
    expect(s.live).toEqual([live]);
    expect(s.days[0].matches).toHaveLength(1);
    expect(s.days[0].matches[0].status).toBe("scheduled");
  });

  it("during the event, today leads, future days ascend, past days follow most-recent-first", () => {
    const s = buildScheduleSections([
      mk({ startsAt: at("09", "09:00"), status: "final" }),
      mk({ startsAt: at("16", "09:00") }),
      mk({ startsAt: at("11", "15:00") }),
      mk({ startsAt: at("10", "09:00"), status: "final" }),
      mk({ startsAt: at("11", "09:00") }),
    ], "2026-11-11");
    expect(s.days.map((d) => d.key)).toEqual(["2026-11-11", "2026-11-16", "2026-11-10", "2026-11-09"]);
    expect(s.days.map((d) => d.isPast)).toEqual([false, false, true, true]);
  });

  it("before the event, Day 1 leads and days ascend", () => {
    const s = buildScheduleSections([
      mk({ startsAt: at("16", "09:00") }),
      mk({ startsAt: at("09", "13:00") }),
      mk({ startsAt: at("11", "09:00") }),
    ], "2026-11-07");
    expect(s.days.map((d) => d.key)).toEqual(["2026-11-09", "2026-11-11", "2026-11-16"]);
  });

  it("within a day, upcoming fixtures come before finished ones", () => {
    const fin = mk({ startsAt: at("11", "09:00"), status: "final" });
    const up = mk({ startsAt: at("11", "15:00"), status: "scheduled" });
    const s = buildScheduleSections([fin, up], "2026-11-11");
    expect(s.days[0].matches).toEqual([up, fin]);
  });
});

describe("nextUpFixtures — standings-first pages' up-next rail", () => {
  it("separates live matches for pinning and never mixes them into upcoming", () => {
    const live = mk({ status: "live", startsAt: at("11", "10:00") });
    const next = mk({ startsAt: at("11", "13:00") });
    const r = nextUpFixtures([next, live], "2026-11-11", 8);
    expect(r.live).toEqual([live]);
    expect(r.upcoming).toEqual([next]);
  });

  it("returns upcoming fixtures chronologically across days, nearest day first", () => {
    const d16 = mk({ startsAt: at("16", "09:00") });
    const d09late = mk({ startsAt: at("09", "15:00") });
    const d09early = mk({ startsAt: at("09", "13:00") });
    const r = nextUpFixtures([d16, d09late, d09early], "2026-11-07", 8);
    expect(r.upcoming).toEqual([d09early, d09late, d16]);
  });

  it("excludes finished matches and past days mid-event", () => {
    const past = mk({ startsAt: at("09", "09:00"), status: "scheduled" });
    const finToday = mk({ startsAt: at("11", "09:00"), status: "final" });
    const upToday = mk({ startsAt: at("11", "15:00"), status: "scheduled" });
    const r = nextUpFixtures([past, finToday, upToday], "2026-11-11", 8);
    expect(r.upcoming).toEqual([upToday]);
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 12 }, (_, i) => mk({ startsAt: at("09", `${String(8 + i).padStart(2, "0")}:00`) }));
    expect(nextUpFixtures(many, "2026-11-07", 8).upcoming).toHaveLength(8);
    expect(nextUpFixtures(many, "2026-11-07").upcoming).toHaveLength(8); // default limit
  });

  it("TBA fixtures only fill slots left over by dated ones", () => {
    const tba = mk({ startsAt: null });
    const dated = mk({ startsAt: at("09", "13:00") });
    expect(nextUpFixtures([tba, dated], "2026-11-07", 8).upcoming).toEqual([dated, tba]);
    expect(nextUpFixtures([tba, dated], "2026-11-07", 1).upcoming).toEqual([dated]);
  });
});

describe("dedupeLabel", () => {
  it("drops exact duplicates in the label path", () => {
    expect(dedupeLabel(["Laro ng Lahi", "Patintero", "Patintero"])).toBe("Laro ng Lahi · Patintero");
  });
  it("is case-insensitive and trims", () => {
    expect(dedupeLabel(["Volleyball", " volleyball ", "Women's"])).toBe("Volleyball · Women's");
  });
  it("drops empty and missing parts", () => {
    expect(dedupeLabel([undefined, "", null, "Schedule"])).toBe("Schedule");
    expect(dedupeLabel([undefined, null])).toBe("");
  });
  it("keeps distinct parts in order", () => {
    expect(dedupeLabel(["Basketball", "Bracket A", "Match 3"])).toBe("Basketball · Bracket A · Match 3");
  });
});
