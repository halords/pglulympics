// Public match LINEUPS — pure assembly shared by the match detail page.
//
// Two data sources, one shape (LineupTeam[]):
//  - lineupsForMatch: derived from a snapshot that carries entries /
//    players / rosters (mock mode and signed-in staff in live mode).
//  - lineupsFromViewRows: built from the public_lineups projection
//    (migration 10) — the only roster data an anonymous visitor may read
//    in live mode (division_entries / players / roster_memberships are
//    staff-only by RLS). The view exposes display names only.
//
// Head-to-head matches list the two slotted entries; placement events
// list every team entered in the division. A team whose roster has not
// been encoded yet simply has an empty players list — the page renders
// "Roster not yet submitted" for it, and the panel lights up as rosters
// and imports land.

import type { LineupTeam, MatchInfo, Snapshot } from "./types";

const byName = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });

export function lineupsForMatch(snap: Snapshot, match: MatchInfo): LineupTeam[] {
  const division = snap.divisions.find((d) => d.id === match.divisionId);
  const isPlacement = division?.scoringKind === "placement_only";
  const playerName = new Map(snap.players.map((p) => [p.id, p.name]));
  const teamNameOf = (entryId: string) => {
    const e = snap.entries.find((x) => x.id === entryId);
    return e ? snap.teams.find((t) => t.id === e.teamId)?.name : undefined;
  };
  const playersOf = (entryId: string) =>
    (snap.rosters[entryId] ?? [])
      .map((pid) => playerName.get(pid))
      .filter((n): n is string => !!n)
      .sort(byName);

  if (isPlacement) {
    return snap.entries
      .filter((e) => e.divisionId === match.divisionId)
      .map((e) => ({
        entryId: e.id,
        teamName: snap.teams.find((t) => t.id === e.teamId)?.name ?? "Entrant",
        players: playersOf(e.id),
      }));
  }

  const seen = new Set<string>();
  const teams: LineupTeam[] = [];
  for (const slot of [...match.slots].sort((a, b) => a.slotNo - b.slotNo)) {
    if (!slot.entryId || seen.has(slot.entryId)) continue;
    seen.add(slot.entryId);
    const teamName = teamNameOf(slot.entryId) ?? slot.teamName ?? undefined;
    if (!teamName) continue; // TBD slot — no lineup to show yet
    teams.push({ entryId: slot.entryId, teamName, players: playersOf(slot.entryId) });
  }
  return teams;
}

export interface PublicLineupRow {
  match_id: string;
  division_id?: string | null;
  entry_id: string;
  team_name: string;
  player_name: string | null;
}

/** Group flat public_lineups rows into matchId -> teams (first-seen team
 *  order preserved; players name-sorted; a team with no memberships yet
 *  appears once with a null player and ends with an empty list). */
export function lineupsFromViewRows(rows: readonly PublicLineupRow[]): Record<string, LineupTeam[]> {
  const byMatch = new Map<string, Map<string, LineupTeam>>();
  for (const r of rows) {
    let teams = byMatch.get(r.match_id);
    if (!teams) { teams = new Map(); byMatch.set(r.match_id, teams); }
    let team = teams.get(r.entry_id);
    if (!team) { team = { entryId: r.entry_id, teamName: r.team_name, players: [] }; teams.set(r.entry_id, team); }
    if (r.player_name) team.players.push(r.player_name);
  }
  const out: Record<string, LineupTeam[]> = {};
  for (const [matchId, teams] of byMatch) {
    out[matchId] = [...teams.values()].map((t) => ({ ...t, players: [...t.players].sort(byName) }));
  }
  return out;
}
