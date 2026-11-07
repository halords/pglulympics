// Admin TOP-3 REPORT derivation — pure, snapshot in / report out.
//
// The single source of truth is the CONFIRMED award set — the exact same
// rows computeTally counts (state === "confirmed" only; drafts and voids
// never appear). That covers every division kind uniformly: playoff
// divisions confirm gold/silver/bronze from their finals, placement_only
// divisions confirm from their recorded placements (award source
// "placement", drafted from the placement results and confirmed the same
// way). A division with no confirmed award yet is "not yet decided".
import { computeTally } from "./standings";
import type { AwardInfo, ScoringKind, Snapshot, TallyRow } from "./types";

export type Medal = AwardInfo["medal"];
export const MEDALS: Medal[] = ["gold", "silver", "bronze"];
export const MEDAL_PLACE: Record<Medal, 1 | 2 | 3> = { gold: 1, silver: 2, bronze: 3 };
export const PLACE_LABEL: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd" };

export interface ReportTeamPlace {
  entryId: string;
  teamId: string | null;
  teamName: string;
  /** Roster names for the winning entry (name-sorted); empty when no
   *  roster is loaded for the entry. Comes straight off the snapshot. */
  players: string[];
}
export interface ReportPlace {
  place: 1 | 2 | 3;
  medal: Medal;
  teams: ReportTeamPlace[];
}
export interface ReportDivision {
  divisionId: string;
  divisionName: string;
  scoringKind: ScoringKind;
  decided: boolean;
  /** Confirmed places only, ascending (1st → 3rd); a place lists every
   *  team holding it (shared medals produce several). */
  places: ReportPlace[];
}
export interface ReportSport {
  sportId: string;
  sportName: string;
  divisions: ReportDivision[];
}
export interface PendingDivision { sportName: string; divisionName: string }
export interface Top3Report {
  eventName: string;
  sports: ReportSport[];
  pending: PendingDivision[];
  decidedCount: number;
  totalDivisions: number;
  /** The overall medal tally — computeTally itself, not a re-derivation. */
  tally: TallyRow[];
}

export function buildTop3Report(snap: Snapshot): Top3Report {
  const entryById = new Map(snap.entries.map((e) => [e.id, e]));
  const teamById = new Map(snap.teams.map((t) => [t.id, t]));
  const playerName = new Map(snap.players.map((p) => [p.id, p.name]));

  const confirmedByDivision = new Map<string, AwardInfo[]>();
  for (const a of snap.awards) {
    if (a.state !== "confirmed") continue;
    const list = confirmedByDivision.get(a.divisionId) ?? [];
    list.push(a);
    confirmedByDivision.set(a.divisionId, list);
  }

  const teamPlace = (a: AwardInfo): ReportTeamPlace => {
    const entry = entryById.get(a.entryId);
    const team = entry ? teamById.get(entry.teamId) : undefined;
    const players = (snap.rosters[a.entryId] ?? [])
      .map((pid) => playerName.get(pid))
      .filter((n): n is string => Boolean(n))
      .sort((x, y) => x.localeCompare(y));
    return {
      entryId: a.entryId,
      teamId: entry?.teamId ?? null,
      teamName: a.teamName ?? team?.name ?? entry?.label ?? a.entryId,
      players,
    };
  };

  const sports: ReportSport[] = snap.sports.map((sp) => ({
    sportId: sp.id,
    sportName: sp.name,
    divisions: snap.divisions
      .filter((d) => d.sportId === sp.id)
      .map((d) => {
        const confirmed = confirmedByDivision.get(d.id) ?? [];
        const places: ReportPlace[] = MEDALS
          .map((medal) => ({
            place: MEDAL_PLACE[medal],
            medal,
            teams: confirmed
              .filter((a) => a.medal === medal)
              .map(teamPlace)
              .sort((x, y) => x.teamName.localeCompare(y.teamName)),
          }))
          .filter((p) => p.teams.length > 0);
        return {
          divisionId: d.id,
          divisionName: d.name,
          scoringKind: d.scoringKind,
          decided: places.length > 0,
          places,
        };
      }),
  }));

  const pending: PendingDivision[] = [];
  let decidedCount = 0;
  for (const sp of sports) {
    for (const d of sp.divisions) {
      if (d.decided) decidedCount++;
      else pending.push({ sportName: sp.sportName, divisionName: d.divisionName });
    }
  }

  return {
    eventName: snap.event.name,
    sports,
    pending,
    decidedCount,
    totalDivisions: snap.divisions.length,
    tally: computeTally(snap.teams, snap.awards, snap.event,
      (entryId) => entryById.get(entryId)?.teamId),
  };
}

/** Flat rows for the Excel "Top 3" sheet: Sport | Division/Category |
 *  Place | Team — one row per team-place, in report order. */
export interface Top3SheetRow { sport: string; division: string; place: string; team: string }
export function top3SheetRows(report: Top3Report): Top3SheetRow[] {
  const rows: Top3SheetRow[] = [];
  for (const sp of report.sports) {
    for (const d of sp.divisions) {
      for (const p of d.places) {
        for (const t of p.teams) {
          rows.push({ sport: sp.sportName, division: d.divisionName, place: PLACE_LABEL[p.place], team: t.teamName });
        }
      }
    }
  }
  return rows;
}
