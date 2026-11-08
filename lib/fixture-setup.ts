// Fixture-setup helpers for session-sport brackets (Mobile Games).
//
// ML / CODM run single elimination in one venue session: each team plays
// ONCE per round, winners go up to the next round, and matches are set up
// without fixed times. These pure helpers drive the fixture form's
// pickers: which teams are already used in a round, and which teams have
// advanced out of the earlier rounds.

import { computedWinner } from "./standings";
import type { DivisionInfo, MatchInfo, MatchStage } from "./types";

/** Elimination progression order. Bronze sits beside gold (both are
 *  finals-day matches fed by the semifinals). */
export const ELIM_STAGE_ORDER: MatchStage[] = [
  "round_robin",
  "quarterfinal",
  "semifinal",
  "bronze",
  "gold",
];

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
  const winnerOf = (m: MatchInfo) =>
    m.winnerEntryId ?? computedWinner(m, divById.get(m.divisionId)).winnerEntryId;
  const earlier = matches
    .filter(
      (m) =>
        m.divisionId === divisionId &&
        m.status === "final" &&
        !!winnerOf(m) &&
        ELIM_STAGE_ORDER.includes(m.stage) &&
        ELIM_STAGE_ORDER.indexOf(m.stage) < targetIdx,
    )
    .sort((a, b) => {
      const byStage = ELIM_STAGE_ORDER.indexOf(a.stage) - ELIM_STAGE_ORDER.indexOf(b.stage);
      if (byStage !== 0) return byStage;
      return (a.startsAt ?? "").localeCompare(b.startsAt ?? "");
    });
  return [...new Set(earlier.map((m) => winnerOf(m)!))];
}
