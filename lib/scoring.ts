// Courtside scorer logic (pure, unit-tested) — the state transitions behind
// /console/matches/[id]/scoreboard. The scoreboard keeps a local draft for
// optimistic taps and persists full state through provider.saveScore, so
// these helpers only shape segments/totals; they never talk to the provider.
import type { DivisionInfo, SegmentInfo } from "./types";
import { setsWon } from "./standings";

export type ScorerMode = "rally" | "periods" | "totals" | "placement";

/** Which courtside control set a division gets: rally points for set-based
 *  sports (volleyball/badminton/pickleball), periods for basketball, plain
 *  totals for the other simple sports (chess, mobile games), and no
 *  scoreboard at all for placement events. */
export function scorerMode(division: DivisionInfo, sportSlug: string): ScorerMode {
  if (division.scoringKind === "placement_only") return "placement";
  if (division.scoringKind === "set_based") return "rally";
  return sportSlug === "basketball" ? "periods" : "totals";
}

export interface RallyConfig {
  bestOf: number;
  setTarget: number;
  decidingTarget: number;
  winBy: number;
  cap: number | null;
}

export function rallyConfig(division: DivisionInfo): RallyConfig {
  const cfg = (division.scoringConfig ?? {}) as {
    best_of?: number; set_target?: number; deciding_set_target?: number;
    win_by?: number; cap?: number | null;
  };
  const setTarget = cfg.set_target ?? 25;
  return {
    bestOf: cfg.best_of ?? 3,
    setTarget,
    decidingTarget: cfg.deciding_set_target ?? setTarget,
    winBy: cfg.win_by ?? 2,
    cap: cfg.cap ?? null,
  };
}

/** Target for a 0-based segment index — the last possible set is the decider. */
export function setTargetFor(cfg: RallyConfig, segmentIndex: number): number {
  return segmentIndex === cfg.bestOf - 1 ? cfg.decidingTarget : cfg.setTarget;
}

/** Winner of one rally segment, or null while it is still in play. Reaching
 *  the cap wins outright (badminton's 30); otherwise target + win-by margin. */
export function segmentWinner(points: readonly number[], target: number, winBy: number, cap: number | null): 0 | 1 | null {
  const [a, b] = [points[0] ?? 0, points[1] ?? 0];
  for (const [side, mine, theirs] of [[0, a, b], [1, b, a]] as const) {
    if (cap != null && mine >= cap) return side;
    if (mine >= target && mine - theirs >= winBy) return side;
  }
  return null;
}

/** Side that has won enough closed segments to take the match, if any. */
export function rallyMatchWinner(segments: SegmentInfo[], cfg: RallyConfig): 0 | 1 | null {
  const needed = Math.floor(cfg.bestOf / 2) + 1;
  const probe = { segments } as Parameters<typeof setsWon>[0];
  if (setsWon(probe, 0) >= needed) return 0;
  if (setsWon(probe, 1) >= needed) return 1;
  return null;
}

const cloneSegs = (segments: SegmentInfo[]): SegmentInfo[] => segments.map((s) => ({ ...s, points: [...s.points] }));

/**
 * Apply one rally tap (+1 / −1) for a side. Points land in the current open
 * segment — a fresh segment starts automatically when the previous one has
 * closed and the match is not decided. A segment closes itself the moment
 * its score is a winning one. A −1 tap on a just-closed segment reopens it
 * (correcting the winning point) when no open segment has points yet.
 */
export function applyRallyPoint(segments: SegmentInfo[], side: 0 | 1, delta: 1 | -1, cfg: RallyConfig): SegmentInfo[] {
  const segs = cloneSegs(segments);
  if (delta === 1) {
    let cur = segs[segs.length - 1];
    if (!cur || cur.status === "closed") {
      if (rallyMatchWinner(segs, cfg) != null || segs.length >= cfg.bestOf) return segs;
      cur = { segmentNo: segs.length + 1, kind: "set", status: "open", points: [0, 0] };
      segs.push(cur);
    }
    cur.points[side] = (cur.points[side] ?? 0) + 1;
    const target = setTargetFor(cfg, cur.segmentNo - 1);
    if (segmentWinner(cur.points, target, cfg.winBy, cfg.cap) != null) cur.status = "closed";
    return segs;
  }
  // correction: walk back to the newest segment holding a point for this side
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i];
    if ((seg.points[side] ?? 0) <= 0) continue;
    if (seg.status === "closed" && i < segs.length - 1) break; // an older closed set: leave history alone
    seg.points[side] -= 1;
    seg.status = "open"; // a decremented set is by definition not won anymore
    return segs;
  }
  return segs;
}

/** Basketball-style: points (+1/+2/+3, −1 correction) land in the current
 *  (last, open) period; a new period opens automatically only via
 *  advancePeriod — scoring never silently crosses a period boundary. */
export function applyPeriodPoints(segments: SegmentInfo[], side: 0 | 1, delta: number): SegmentInfo[] {
  const segs = cloneSegs(segments);
  let cur = segs[segs.length - 1];
  if (!cur || cur.status === "closed") {
    cur = { segmentNo: segs.length + 1, kind: "period", status: "open", points: [0, 0] };
    segs.push(cur);
  }
  cur.points[side] = Math.max(0, (cur.points[side] ?? 0) + delta);
  return segs;
}

/** Close the current period and open the next one. */
export function advancePeriod(segments: SegmentInfo[], maxPeriods = 8): SegmentInfo[] {
  const segs = cloneSegs(segments);
  const cur = segs[segs.length - 1];
  if (cur && cur.status === "open") cur.status = "closed";
  if (segs.length < maxPeriods) {
    segs.push({ segmentNo: segs.length + 1, kind: "period", status: "open", points: [0, 0] });
  }
  return segs;
}

/** Running totals for simple scoring = the sum over ALL segments (the open
 *  period included — the board shows the live score, not just closed ones). */
export function segmentTotals(segments: SegmentInfo[]): [number, number] {
  return [
    segments.reduce((a, s) => a + (s.points[0] ?? 0), 0),
    segments.reduce((a, s) => a + (s.points[1] ?? 0), 0),
  ];
}
