// Fixture-setup helpers for session-sport brackets (Mobile Games).
//
// ML / CODM run single elimination in one venue session: each team plays
// ONCE per round, winners go up to the next round, and matches are set up
// without fixed times. These pure helpers drive the fixture form's
// pickers: which teams are already used in a round, and which teams have
// advanced out of the earlier rounds.

import { computedWinner } from "./standings";
import type { DivisionInfo, EntryInfo, MatchInfo, MatchStage } from "./types";

/** The winner of one match: the stored winnerEntryId (covers forfeits),
 *  else computed from the score under the division's scoring kind. */
function winnerOf(m: MatchInfo, divById: Map<string, DivisionInfo>): string | null {
  return m.winnerEntryId ?? computedWinner(m, divById.get(m.divisionId)).winnerEntryId;
}

/** Elimination progression order. Bronze sits beside gold (both are
 *  finals-day matches fed by the semifinals). */
export const ELIM_STAGE_ORDER: MatchStage[] = [
  "round_robin",
  "quarterfinal",
  "semifinal",
  "bronze",
  "gold",
];

export const STAGE_TITLES: Record<MatchStage, string> = {
  round_robin: "Round",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  bronze: "Bronze match",
  gold: "Gold match",
  placement: "Placement",
  exhibition: "Exhibition",
};

/** Entry ids already placed in a non-cancelled match of this division at
 *  this stage — a team cannot be picked twice in the same round. */
export function usedEntryIdsInStage(
  matches: MatchInfo[],
  divisionId: string,
  stage: MatchStage,
): Set<string> {
  const used = new Set<string>();
  for (const m of matches) {
    if (m.divisionId !== divisionId || m.stage !== stage || m.status === "cancelled") continue;
    for (const s of m.slots) {
      if (s.entryId) used.add(s.entryId);
    }
  }
  return used;
}

/** Entry ids that have WON a final in an earlier elimination stage of
 *  this division — the teams that go up into `stage`. Ordered by the
 *  stage they won, then by match start. The stored winnerEntryId wins
 *  (it covers forfeits); otherwise the winner is computed from the
 *  score using the division's scoring kind. */
export function advancedEntryIds(
  matches: MatchInfo[],
  divisions: DivisionInfo[],
  divisionId: string,
  stage: MatchStage,
): string[] {
  const targetIdx = ELIM_STAGE_ORDER.indexOf(stage);
  if (targetIdx <= 0) return [];
  const divById = new Map(divisions.map((d) => [d.id, d]));
  const earlier = matches
    .filter(
      (m) =>
        m.divisionId === divisionId &&
        m.status === "final" &&
        !!winnerOf(m, divById) &&
        ELIM_STAGE_ORDER.includes(m.stage) &&
        ELIM_STAGE_ORDER.indexOf(m.stage) < targetIdx,
    )
    .sort((a, b) => {
      const byStage = ELIM_STAGE_ORDER.indexOf(a.stage) - ELIM_STAGE_ORDER.indexOf(b.stage);
      if (byStage !== 0) return byStage;
      return (a.startsAt ?? "").localeCompare(b.startsAt ?? "");
    });
  return [...new Set(earlier.map((m) => winnerOf(m, divById)!))];
}

/** Winners of FINAL matches in exactly `stage` of this division. */
export function stageWinners(
  matches: MatchInfo[],
  divisions: DivisionInfo[],
  divisionId: string,
  stage: MatchStage,
): string[] {
  const divById = new Map(divisions.map((d) => [d.id, d]));
  return matches
    .filter((m) => m.divisionId === divisionId && m.stage === stage && m.status === "final")
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""))
    .map((m) => winnerOf(m, divById))
    .filter((id): id is string => !!id);
}

/** The losing side of FINAL matches in exactly `stage` (bronze pool). */
export function stageLosers(
  matches: MatchInfo[],
  divisions: DivisionInfo[],
  divisionId: string,
  stage: MatchStage,
): string[] {
  const divById = new Map(divisions.map((d) => [d.id, d]));
  const losers: string[] = [];
  for (const m of matches) {
    if (m.divisionId !== divisionId || m.stage !== stage || m.status !== "final") continue;
    const w = winnerOf(m, divById);
    if (!w) continue;
    for (const s of m.slots) {
      if (s.entryId && s.entryId !== w) losers.push(s.entryId);
    }
  }
  return [...new Set(losers)];
}

/**
 * The pool of teams that can be paired into NEW matches of `stage` in a
 * single-elimination bracket — the one-time setup generator's input:
 * - opening rounds (round_robin / quarterfinal): every entered team not
 *   already placed in this stage;
 * - semifinal: winners of the earlier rounds PLUS teams that never played
 *   (they held the byes), not already placed in a semifinal;
 * - gold: the semifinal winners; bronze: the semifinal losers.
 * Order: advancers first (in the order they won), then bye teams in entry
 * order — pairUp() pairs neighbours, so this order is the draw.
 */
export function bracketPool(
  matches: MatchInfo[],
  divisions: DivisionInfo[],
  entries: EntryInfo[],
  divisionId: string,
  stage: MatchStage,
): string[] {
  const idx = ELIM_STAGE_ORDER.indexOf(stage);
  const used = usedEntryIdsInStage(matches, divisionId, stage);
  const entryIds = entries.filter((e) => e.divisionId === divisionId).map((e) => e.id);
  const keep = (ids: string[]) => ids.filter((id) => entryIds.includes(id) && !used.has(id));
  if (idx <= 1 || stage === "placement" || stage === "exhibition") return keep(entryIds);
  if (stage === "gold") {
    const pool = keep(stageWinners(matches, divisions, divisionId, "semifinal"));
    if (pool.length === 1) {
      // One semifinal only (e.g. CODM's 6-team draw): the team still
      // waiting from the semifinal round — it advanced out of the
      // earlier rounds but never got a semifinal match — takes the
      // open final slot. The semifinal pool IS that waiting set, in
      // draw order.
      for (const id of bracketPool(matches, divisions, entries, divisionId, "semifinal")) {
        if (pool.length >= 2) break;
        if (!pool.includes(id)) pool.push(id);
      }
    }
    return pool;
  }
  if (stage === "bronze") return keep(stageLosers(matches, divisions, divisionId, "semifinal"));
  // semifinal
  const advanced = advancedEntryIds(matches, divisions, divisionId, stage);
  const playedEarlier = new Set<string>();
  for (const m of matches) {
    if (m.divisionId !== divisionId || m.status === "cancelled") continue;
    if (!ELIM_STAGE_ORDER.includes(m.stage) || ELIM_STAGE_ORDER.indexOf(m.stage) >= idx) continue;
    for (const s of m.slots) if (s.entryId) playedEarlier.add(s.entryId);
  }
  const byes = entryIds.filter((id) => !playedEarlier.has(id));
  return keep([...advanced, ...byes]);
}

/** Pair a pool off in order: [0v1, 2v3, …]; an odd team is the leftover
 *  (the bye / the team still waiting for an opponent). */
export function pairUp(pool: string[]): { pairs: [string, string][]; leftover: string | null } {
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < pool.length; i += 2) pairs.push([pool[i], pool[i + 1]]);
  return { pairs, leftover: pool.length % 2 === 1 ? pool[pool.length - 1] : null };
}
