// Roster bulk import — PURE logic (no I/O, no exceljs).
//
// Encoders fill the controlled template (lib/roster-template.ts): they type
// ONLY the player name; Sport / Team / Division come from dropdowns baked
// from the system's real lists, so those values can never be mistyped in
// Excel. CSV uploads have no dropdowns, so THIS module is the safety net:
// every row is resolved against the live snapshot before anything is
// written, and the UI shows a full preview (ok / skip / error per row) and
// writes nothing until the user confirms.
//
// A name is registered PER SPORT: the same person may legitimately appear
// in several sports (and several divisions). Identity inside one roster is
// the (entry, normalized name) pair — an entry is one team's slot in one
// division of one sport.

import type { Snapshot } from "./types";

/** One raw spreadsheet row (already extracted from xlsx/csv cells). */
export interface RawImportRow {
  rowNo: number; // 1-based row number in the source file, for error messages
  name: string;
  sport: string;
  team: string;
  division: string;
}

export type PreviewStatus = "ok" | "skip" | "error";

export interface PreviewRow {
  rowNo: number;
  /** Cell values as typed (trimmed). */
  name: string;
  sport: string;
  team: string;
  division: string;
  status: PreviewStatus;
  /** Why the row is skipped / rejected, or a note on an ok row. */
  reason?: string;
  /** Resolved ids (present when the row fully resolved). */
  sportId?: string;
  teamId?: string;
  divisionId?: string;
  entryId?: string;
  /** Cleaned display name that will be written (ok rows). */
  playerName?: string;
}

/** Trim, collapse internal whitespace, lowercase — the comparison key for
 *  names and list values. */
export function normalizeKey(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Key with spaces removed too — "Pickle Ball" ≡ "Pickleball". */
function looseKey(s: string): string {
  return normalizeKey(s).replace(/ /g, "");
}

/** Cleaned display name for writing: trimmed, single-spaced, casing kept. */
export function cleanDisplayName(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

interface Indexed<T> {
  byKey: Map<string, T>;
}

function indexBy<T extends { name: string; slug: string }>(items: readonly T[]): Indexed<T> {
  const byKey = new Map<string, T>();
  for (const it of items) {
    byKey.set(normalizeKey(it.name), it);
    byKey.set(looseKey(it.name), it);
    byKey.set(normalizeKey(it.slug), it);
    byKey.set(looseKey(it.slug), it);
  }
  return { byKey };
}

function resolve<T>(idx: Indexed<T>, raw: string): T | undefined {
  const k = normalizeKey(raw);
  if (!k) return undefined;
  return idx.byKey.get(k) ?? idx.byKey.get(looseKey(raw));
}

/**
 * Validate every row against the snapshot. `scopeSportIds` is the caller's
 * writable scope (coordinator = assigned sports, admin = all sports); a row
 * naming a sport outside it is an error, never silently widened.
 * Fully blank rows (the template ships 200 pre-formatted rows) are dropped.
 */
export function validateImportRows(
  rows: readonly RawImportRow[],
  snap: Snapshot,
  scopeSportIds: readonly string[],
): PreviewRow[] {
  const sportIdx = indexBy(snap.sports);
  const teamIdx = indexBy(snap.teams);
  const scope = new Set(scopeSportIds);
  const divIdxBySport = new Map<string, Indexed<(typeof snap.divisions)[number]>>();
  for (const sp of snap.sports) {
    divIdxBySport.set(sp.id, indexBy(snap.divisions.filter((d) => d.sportId === sp.id)));
  }
  const entryByDivTeam = new Map<string, string>();
  for (const e of snap.entries) entryByDivTeam.set(`${e.divisionId}|${e.teamId}`, e.id);
  const playerNameById = new Map(snap.players.map((p) => [p.id, p.name]));
  const rosterNames = new Map<string, Set<string>>();
  for (const [entryId, pids] of Object.entries(snap.rosters)) {
    rosterNames.set(entryId, new Set(pids.map((pid) => normalizeKey(playerNameById.get(pid) ?? pid))));
  }

  const out: PreviewRow[] = [];
  /** (entryId|normalized name) already resolved earlier in THIS file. */
  const seenInFile = new Set<string>();

  for (const raw of rows) {
    const base: PreviewRow = {
      rowNo: raw.rowNo,
      name: raw.name.trim(),
      sport: raw.sport.trim(),
      team: raw.team.trim(),
      division: raw.division.trim(),
      status: "error",
    };
    if (!base.name && !base.sport && !base.team && !base.division) continue; // blank template row
    const fail = (reason: string): PreviewRow => ({ ...base, status: "error", reason });
    const skip = (reason: string, extra: Partial<PreviewRow>): PreviewRow => ({ ...base, status: "skip", reason, ...extra });

    if (!base.name) { out.push(fail("Player name is required.")); continue; }
    if (!base.sport) { out.push(fail("Sport is required — pick it from the dropdown list.")); continue; }
    const sport = resolve(sportIdx, base.sport);
    if (!sport) { out.push(fail(`Unknown sport “${base.sport}” — use a value from the template list.`)); continue; }
    if (!scope.has(sport.id)) {
      out.push(fail(`“${sport.name}” is not one of your assigned sports — this row can't be imported by you.`));
      continue;
    }
    if (!base.team) { out.push(fail("Team is required — pick it from the dropdown list.")); continue; }
    const team = resolve(teamIdx, base.team);
    if (!team) { out.push(fail(`Unknown team “${base.team}” — use a value from the template list.`)); continue; }

    // Entries this team holds in this sport (one per division it plays in).
    const teamEntries = snap.entries.filter(
      (e) => e.teamId === team.id && snap.divisions.find((d) => d.id === e.divisionId)?.sportId === sport.id,
    );
    let entryId: string | undefined;
    let divisionId: string | undefined;
    let note: string | undefined;
    if (base.division) {
      const div = resolve(divIdxBySport.get(sport.id)!, base.division);
      if (!div) {
        out.push(fail(`Unknown division “${base.division}” for ${sport.name} — use a value from the template list.`));
        continue;
      }
      divisionId = div.id;
      entryId = entryByDivTeam.get(`${div.id}|${team.id}`);
      if (!entryId) {
        out.push(fail(`${team.name} has no entry in ${sport.name} — ${div.name}.`));
        continue;
      }
    } else {
      if (teamEntries.length === 0) {
        out.push(fail(`${team.name} has no entry in ${sport.name}.`));
        continue;
      }
      if (teamEntries.length > 1) {
        const names = teamEntries
          .map((e) => snap.divisions.find((d) => d.id === e.divisionId)?.name ?? e.divisionId)
          .join(", ");
        out.push(fail(`Division required — ${team.name} plays in ${teamEntries.length} ${sport.name} divisions (${names}). Pick one.`));
        continue;
      }
      entryId = teamEntries[0].id;
      divisionId = teamEntries[0].divisionId;
      const divName = snap.divisions.find((d) => d.id === divisionId)?.name;
      note = `Division auto-filled: ${divName}.`;
    }

    const resolved: Partial<PreviewRow> = { sportId: sport.id, teamId: team.id, divisionId, entryId };
    const playerName = cleanDisplayName(base.name);
    const nameKey = normalizeKey(playerName);
    const seenKey = `${entryId}|${nameKey}`;
    if (seenInFile.has(seenKey)) {
      out.push(skip("Duplicate row in this file — the first copy above is the one that counts.", resolved));
      continue;
    }
    seenInFile.add(seenKey);
    if (rosterNames.get(entryId!)?.has(nameKey)) {
      out.push(skip("Already on this roster — will be skipped.", resolved));
      continue;
    }
    out.push({ ...base, status: "ok", reason: note, playerName, ...resolved });
  }
  return out;
}

export interface ImportCommitGroup {
  entryId: string;
  /** Cleaned display names to add to this entry's roster. */
  names: string[];
}

/** Group the ok rows into per-entry name lists (deduped by normalized name). */
export function importCommitPlan(preview: readonly PreviewRow[]): ImportCommitGroup[] {
  const groups = new Map<string, Map<string, string>>();
  for (const row of preview) {
    if (row.status !== "ok" || !row.entryId || !row.playerName) continue;
    let g = groups.get(row.entryId);
    if (!g) { g = new Map(); groups.set(row.entryId, g); }
    g.set(normalizeKey(row.playerName), row.playerName);
  }
  return [...groups.entries()].map(([entryId, names]) => ({ entryId, names: [...names.values()] }));
}

export interface RosterTemplateLists {
  sports: { name: string; divisions: string[] }[];
  teams: string[];
}

/** The dropdown lists for the template, baked from a snapshot. Sports are
 *  limited to `sportIds` (a coordinator's template only offers their own
 *  sports); teams are event-wide (any team may enter any sport). */
export function templateListsFromSnapshot(snap: Snapshot, sportIds: readonly string[]): RosterTemplateLists {
  const wanted = new Set(sportIds);
  return {
    sports: snap.sports
      .filter((s) => wanted.has(s.id))
      .map((s) => ({
        name: s.name,
        divisions: snap.divisions.filter((d) => d.sportId === s.id).map((d) => d.name),
      })),
    teams: snap.teams.map((t) => t.name),
  };
}

/** Header row for the CSV skeleton download (encoders without Excel). */
export const ROSTER_CSV_SKELETON = "Player Name,Sport,Team,Division\n";
