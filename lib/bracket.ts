// Pyramid (ladder) bracket view model for single-elimination divisions —
// Mobile Games (ML / CODM). Pure + unit-tested; the components only render.
//
// The format (organizers' rules, 2026-11-09):
// - Single elimination drawn as a pyramid: the opening round is the wide
//   base, winners climb one level per round, the gold match is the apex.
// - Every match is a best-of-3 series (first to 2 game wins).
// - Losers are eliminated — EXCEPT semifinal losers, who drop into the
//   bronze match for 3rd place.
// - When a round's team count is odd, the unpaired team gets a BYE: it
//   advances to the next round automatically and waits for an opponent.
//   The projection below mirrors lib/fixture-setup's bracketPool/pairUp
//   exactly (advancers in the order they won, then bye teams in entry
//   order, paired as neighbours), so the pyramid shows the same pairings
//   the console's one-time setup will create. Real matches always win
//   over projections.
import { ELIM_STAGE_ORDER } from "./fixture-setup";
import { computedWinner, setsWon } from "./standings";
import type { DivisionInfo, MatchInfo, MatchStage, Snapshot } from "./types";

export interface BracketSlot {
  entryId: string | null;
  /** Team name, or the feeder label ("Winner QF1") while undecided. */
  name: string;
  /** True when the name is a feeder label, not a team. */
  isFeederLabel: boolean;
  /** Advanced on a bye (no match in the earlier round). */
  isBye: boolean;
  /** Series score (games won) once the match has started; else null. */
  games: number | null;
  isWinner: boolean;
  isEliminated: boolean;
}

export interface BracketMatchView {
  matchId: string | null; // null = projected (not yet created in the console)
  stage: MatchStage;
  /** "QF1", "SF2", "FINAL", "BRONZE" */
  tag: string;
  status: "scheduled" | "live" | "final" | "projected";
  slots: [BracketSlot, BracketSlot];
}

export interface BracketLevel {
  stage: MatchStage;
  title: string;
  matches: BracketMatchView[];
  /** Teams that advanced out of this level's pool but have no match yet
   *  (odd team out) — they wait at the next level for an opponent. */
  waiting: { entryId: string | null; name: string; isBye: boolean }[];
}

export interface PyramidBracket {
  division: DivisionInfo;
  /** Levels ordered base → apex (opening round first, gold last). */
  levels: BracketLevel[];
  bronze: BracketMatchView | null;
  champion: string | null;
  runnerUp: string | null;
  thirdPlace: string | null;
  /** No real matches exist yet — levels are the projected opening round. */
  projectedOnly: boolean;
}

/** Series score for one slot: games won. Totals (when present) ARE the
 *  games-won count for simple divisions; otherwise count won segments. */
export function gamesWon(match: MatchInfo, slotIdx: number): number {
  if (match.totals) return match.totals[slotIdx] ?? 0;
  return setsWon(match, slotIdx);
}

const STAGE_TAG: Partial<Record<MatchStage, string>> = {
  round_robin: "R",
  quarterfinal: "QF",
  semifinal: "SF",
  gold: "FINAL",
  bronze: "BRONZE",
};

const LEVEL_TITLES: Partial<Record<MatchStage, string>> = {
  round_robin: "OPENING ROUND",
  quarterfinal: "QUARTERFINALS",
  semifinal: "SEMIFINALS",
  gold: "FINAL",
};

function slotOf(
  match: MatchInfo,
  idx: number,
  division: DivisionInfo,
  teamName: (entryId: string | null, m: MatchInfo, i: number) => string,
): BracketSlot {
  const slot = match.slots[idx];
  const entryId = slot?.entryId ?? null;
  const winnerId = match.status === "final"
    ? match.winnerEntryId ?? computedWinner(match, division).winnerEntryId
    : null;
  const isWinner = !!entryId && winnerId === entryId;
  const started = match.status === "live" || match.status === "final";
  return {
    entryId,
    name: teamName(entryId, match, idx),
    isFeederLabel: !entryId && !slot?.teamName,
    isBye: false,
    games: started ? gamesWon(match, idx) : null,
    isWinner,
    // Losers are eliminated — except semifinal losers, who play bronze.
    isEliminated: match.status === "final" && !!winnerId && !isWinner && match.stage !== "semifinal",
  };
}

function matchView(
  match: MatchInfo,
  tag: string,
  division: DivisionInfo,
  teamName: (entryId: string | null, m: MatchInfo, i: number) => string,
): BracketMatchView {
  return {
    matchId: match.id,
    stage: match.stage,
    tag,
    status: match.status === "live" ? "live" : match.status === "final" ? "final" : "scheduled",
    slots: [slotOf(match, 0, division, teamName), slotOf(match, 1, division, teamName)],
  };
}

interface PoolEntry { entryId: string | null; name: string; isBye: boolean; isFeederLabel: boolean }

/**
 * Build the pyramid for one division. Returns null when the division has
 * no entries at all (nothing to draw).
 */
export function pyramidBracket(snap: Snapshot, divisionId: string): PyramidBracket | null {
  const division = snap.divisions.find((d) => d.id === divisionId);
  if (!division) return null;
  const entries = snap.entries.filter((e) => e.divisionId === divisionId);
  if (entries.length === 0) return null;
  const teamNameOf = new Map(snap.teams.map((t) => [t.id, t.name]));
  const entryTeam = new Map(entries.map((e) => [e.id, teamNameOf.get(e.teamId) ?? "Team"]));

  const divMatches = snap.matches.filter(
    (m) => m.divisionId === divisionId && m.status !== "cancelled" && ELIM_STAGE_ORDER.includes(m.stage),
  );
  const byStage = new Map<MatchStage, MatchInfo[]>();
  for (const m of divMatches) {
    const arr = byStage.get(m.stage) ?? [];
    arr.push(m);
    byStage.set(m.stage, arr);
  }
  for (const arr of byStage.values()) {
    arr.sort((a, b) => (a.label || "").localeCompare(b.label || "") || (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
  }

  const teamName = (entryId: string | null, m: MatchInfo, i: number): string =>
    (entryId ? entryTeam.get(entryId) : null) ?? m.slots[i]?.teamName ?? m.slots[i]?.placeholder ?? "TBD";

  const winnerOfMatch = (m: MatchInfo): string | null =>
    m.status === "final" ? m.winnerEntryId ?? computedWinner(m, division).winnerEntryId : null;

  // Stages that form the climb: opening (earliest stage with matches, or
  // quarterfinal for the projection) up to gold. Bronze hangs off the side.
  const present = ELIM_STAGE_ORDER.filter((s) => s !== "bronze" && (byStage.get(s)?.length ?? 0) > 0);
  const projectedOnly = present.length === 0;
  const openingStage: MatchStage = present[0] ?? "quarterfinal";
  const climb = ELIM_STAGE_ORDER.slice(
    ELIM_STAGE_ORDER.indexOf(openingStage),
    ELIM_STAGE_ORDER.indexOf("gold") + 1,
  ).filter((s) => s !== "bronze");

  const levels: BracketLevel[] = [];
  // Pool feeding the NEXT level: decided winners (entry ids), feeder
  // labels for undecided matches, and bye teams — in bracketPool order.
  let feederPool: PoolEntry[] = [];
  // A semifinal-level waiting team consumed into the gold pool (below) —
  // its "waiting" chip is then removed from the semifinal level, since
  // it has its final slot.
  let consumedWaiting: { entryId: string | null; name: string } | null = null;

  for (const [levelIdx, stage] of climb.entries()) {
    const real = byStage.get(stage) ?? [];
    const placedIds = new Set<string>();
    for (const m of real) for (const s of m.slots) if (s.entryId) placedIds.add(s.entryId);

    const matches: BracketMatchView[] = real.map((m, i) =>
      matchView(m, stage === "gold" ? "FINAL" : `${STAGE_TAG[stage] ?? ""}${i + 1}`, division, teamName));

    // Project the un-created pairings for this level from the feeder pool
    // (level 0 has no feeder pool — its projection is the entry draw).
    let pool: PoolEntry[] = [];
    if (levelIdx === 0 && projectedOnly) {
      pool = entries.map((e) => ({ entryId: e.id, name: entryTeam.get(e.id) ?? "Team", isBye: false, isFeederLabel: false }));
    } else if (levelIdx > 0) {
      pool = feederPool.filter((p) => !p.entryId || !placedIds.has(p.entryId));
    }
    const waiting: BracketLevel["waiting"] = [];
    if (pool.length > 0) {
      const pairs: [PoolEntry, PoolEntry][] = [];
      for (let i = 0; i + 1 < pool.length; i += 2) pairs.push([pool[i], pool[i + 1]]);
      for (const [a, b] of pairs) {
        matches.push({
          matchId: null,
          stage,
          tag: stage === "gold" ? "FINAL" : `${STAGE_TAG[stage] ?? ""}${matches.length + 1}`,
          status: "projected",
          slots: [
            { entryId: a.entryId, name: a.name, isFeederLabel: a.isFeederLabel, isBye: a.isBye, games: null, isWinner: false, isEliminated: false },
            { entryId: b.entryId, name: b.name, isFeederLabel: b.isFeederLabel, isBye: b.isBye, games: null, isWinner: false, isEliminated: false },
          ],
        });
      }
      if (pool.length % 2 === 1) {
        const last = pool[pool.length - 1];
        waiting.push({ entryId: last.entryId, name: last.name, isBye: last.isBye });
      }
    }

    levels.push({ stage, title: LEVEL_TITLES[stage] ?? stage.toUpperCase(), matches, waiting });

    // Build the feeder pool for the next level, in bracketPool order:
    // winners of THIS level's matches first (decided winner by name, else
    // a "Winner QFn" feeder label), then this level's waiting team, then —
    // only into the semifinal — the BYE teams: entrants never placed in a
    // match at this stage or earlier (they sat the round out, so they are
    // already through and waiting). Dedupe by entry: the opening round's
    // unpaired leftover IS a bye team and must not appear twice.
    const playedEarlier = new Set<string>();
    for (const m of divMatches) {
      if (ELIM_STAGE_ORDER.indexOf(m.stage) <= ELIM_STAGE_ORDER.indexOf(stage)) {
        for (const s of m.slots) if (s.entryId) playedEarlier.add(s.entryId);
      }
    }
    if (projectedOnly && levelIdx === 0) {
      // Projected opening pairs count as "played" for the bye test — only
      // the unpaired leftover is a bye, not the whole entry list.
      for (const mv of matches) for (const s of mv.slots) if (s.entryId) playedEarlier.add(s.entryId);
    }
    const next: PoolEntry[] = [];
    for (const mv of matches) {
      if (mv.matchId) {
        const realMatch = real.find((m) => m.id === mv.matchId)!;
        const w = winnerOfMatch(realMatch);
        if (w) next.push({ entryId: w, name: entryTeam.get(w) ?? "Team", isBye: false, isFeederLabel: false });
        else next.push({ entryId: null, name: `Winner ${mv.tag}`, isBye: false, isFeederLabel: true });
      } else {
        next.push({ entryId: null, name: `Winner ${mv.tag}`, isBye: false, isFeederLabel: true });
      }
    }
    // The waiting team carries into the next pool when that pool admits
    // more than the round's winners — the semifinal does (it is where
    // bye/leftover teams wait). The gold pool is the semifinal winners
    // only (exactly like bracketPool), with ONE exception: when a lone
    // semifinal winner leaves a final slot open and a team is still
    // waiting from the semifinal round (it advanced but never got a
    // semifinal match — CODM's 6-team draw), that team takes the open
    // slot. With two semifinal winners the final is full and the
    // waiting team keeps its chip on the semifinal level.
    if (climb[levelIdx + 1] === "gold") {
      if (next.length === 1 && waiting.length > 0) {
        const w = waiting[0];
        next.push({
          entryId: w.entryId, name: w.name,
          isBye: !!w.entryId && !playedEarlier.has(w.entryId),
          isFeederLabel: !w.entryId,
        });
        consumedWaiting = { entryId: w.entryId, name: w.name };
      }
    } else {
      for (const w of waiting) {
        next.push({
          entryId: w.entryId, name: w.name,
          isBye: !!w.entryId && !playedEarlier.has(w.entryId),
          isFeederLabel: !w.entryId,
        });
      }
    }
    if (climb[levelIdx + 1] === "semifinal") {
      const inPool = new Set(next.map((p) => p.entryId).filter(Boolean));
      for (const e of entries) {
        if (!playedEarlier.has(e.id) && !inPool.has(e.id)) {
          next.push({ entryId: e.id, name: entryTeam.get(e.id) ?? "Team", isBye: true, isFeederLabel: false });
        }
      }
    }
    feederPool = next;
  }

  // A waiting team that took the open final slot no longer waits.
  if (consumedWaiting) {
    const sfLevel = levels.find((l) => l.stage === "semifinal");
    if (sfLevel) {
      sfLevel.waiting = sfLevel.waiting.filter(
        (w) => !(w.entryId === consumedWaiting!.entryId && w.name === consumedWaiting!.name),
      );
    }
  }

  // Bronze: the semifinal losers' match — real if created, else projected
  // from the semifinal level, and only when that level actually has two
  // matches (a one-semifinal draw has a single SF loser — no bronze pair).
  let bronze: BracketMatchView | null = null;
  const bronzeReal = (byStage.get("bronze") ?? [])[0];
  const sfLevelForBronze = levels.find((l) => l.stage === "semifinal");
  if (bronzeReal) {
    bronze = matchView(bronzeReal, "BRONZE", division, teamName);
  } else if (sfLevelForBronze && sfLevelForBronze.matches.length >= 2) {
    const sfMatches = byStage.get("semifinal") ?? [];
    const loserSlot = (m: MatchInfo | undefined, tag: string): BracketSlot => {
      if (m && m.status === "final") {
        const w = winnerOfMatch(m);
        const loserIdx = m.slots.findIndex((s) => s.entryId && s.entryId !== w);
        if (loserIdx >= 0) {
          const loserEntryId = m.slots[loserIdx].entryId ?? null;
          return { entryId: loserEntryId, name: teamName(loserEntryId, m, loserIdx), isFeederLabel: false, isBye: false, games: null, isWinner: false, isEliminated: false };
        }
      }
      return { entryId: null, name: `Loser ${tag}`, isFeederLabel: true, isBye: false, games: null, isWinner: false, isEliminated: false };
    };
    const sfViews = sfLevelForBronze.matches;
    bronze = {
      matchId: null,
      stage: "bronze",
      tag: "BRONZE",
      status: "projected",
      slots: [loserSlot(sfMatches[0], sfViews[0]?.tag ?? "SF1"), loserSlot(sfMatches[1], sfViews[1]?.tag ?? "SF2")],
    };
  }

  const goldMatch = (byStage.get("gold") ?? [])[0];
  let champion: string | null = null;
  let runnerUp: string | null = null;
  if (goldMatch && goldMatch.status === "final") {
    const w = winnerOfMatch(goldMatch);
    if (w) {
      champion = entryTeam.get(w) ?? null;
      const loser = goldMatch.slots.find((s) => s.entryId && s.entryId !== w);
      runnerUp = loser?.entryId ? entryTeam.get(loser.entryId) ?? null : null;
    }
  }
  const thirdPlace = bronze?.slots.find((s) => s.isWinner)?.name ?? null;

  return { division, levels, bronze, champion, runnerUp, thirdPlace, projectedOnly };
}
