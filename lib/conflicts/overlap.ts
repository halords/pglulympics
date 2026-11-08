// Overlap + conflict detection — SPEC §11.3/§11.6 (binding utility, unit-tested).
// The SQL checker in supabase/migrations/20261107090300_rpcs.sql implements the identical
// predicate: half-open intervals, [start, start + duration).

export interface Interval { start: number; end: number } // epoch ms

export function intervalOf(startsAtISO: string, durationMinutes: number): Interval {
  const start = Date.parse(startsAtISO);
  if (Number.isNaN(start)) throw new Error(`invalid start time: ${startsAtISO}`);
  if (!durationMinutes || durationMinutes <= 0) throw new Error("duration must be positive");
  return { start, end: start + durationMinutes * 60_000 };
}

/** Half-open overlap: touching boundaries do NOT conflict. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export interface FixtureLike {
  id: string;
  label: string;
  sportName: string;
  divisionId: string;
  startsAt?: string | null;
  durationMinutes?: number | null; // effective duration already resolved (override ?? sport default)
  venueId?: string | null;
  venueName?: string | null;
  entryIds: string[]; // effective entries
}

export interface RosterLike {
  /** entryId -> player ids */
  byEntry: Record<string, string[]>;
  /** entryId -> roster status */
  statusByEntry: Record<string, "unknown" | "verified">;
  playerName: Record<string, string>;
}

export interface ConflictReportTS {
  playerClashes: {
    player_id: string; player_name: string; other_match_id: string; other_label: string;
    other_sport: string; other_starts_at: string; other_ends_at: string;
    severity: "major";
  }[];
  venueClashes: {
    venue_id: string; venue_name: string; other_match_id: string; other_label: string;
    other_sport: string; other_starts_at: string; other_ends_at: string;
    severity: "minor";
  }[];
  anomalies: { player_id: string; player_name: string; match_id: string }[];
  incomplete: string[];
}

/** Severity model (user re-tier): player overlaps = MAJOR (the only blocking
 *  conflicts); venue double-bookings = MINOR (multi-court venues — notes
 *  only). Derived from the clash kind everywhere, never stored separately. */
export function severityOfKind(kind: "player" | "venue"): "major" | "minor" {
  return kind === "player" ? "major" : "minor";
}

/** A report blocks a save (warn → acknowledge) only on MAJOR content. */
export function hasMajorConflicts(report: { playerClashes: readonly unknown[] }): boolean {
  return report.playerClashes.length > 0;
}

/** True when the report carries MINOR information worth surfacing after a
 *  save that did not warn (venue overlaps and/or coverage notes). */
export function hasMinorNotes(report: { venueClashes: readonly unknown[]; incomplete: readonly string[] }): boolean {
  return report.venueClashes.length > 0 || report.incomplete.length > 0;
}

function iso(ms: number): string { return new Date(ms).toISOString(); }

/**
 * Check one proposed fixture against all others (SPEC §11.3 inclusion contract:
 * timed, non-cancelled fixtures event-wide; the caller pre-filters cancelled/archived
 * and passes effective durations + effective entries).
 */
export function checkFixtureConflicts(
  proposed: FixtureLike,
  others: FixtureLike[],
  rosters: RosterLike,
): ConflictReportTS {
  const report: ConflictReportTS = { playerClashes: [], venueClashes: [], anomalies: [], incomplete: [] };
  if (!proposed.startsAt || !proposed.durationMinutes) {
    report.incomplete.push("uncheckable_no_time");
    return report;
  }
  const mine = intervalOf(proposed.startsAt, proposed.durationMinutes);

  // participants of the proposed fixture
  const myPlayers = new Map<string, string[]>(); // playerId -> entryIds in this fixture
  for (const entryId of proposed.entryIds) {
    for (const pid of rosters.byEntry[entryId] ?? []) {
      myPlayers.set(pid, [...(myPlayers.get(pid) ?? []), entryId]);
    }
    if ((rosters.statusByEntry[entryId] ?? "unknown") === "unknown") {
      if (!report.incomplete.includes("roster_unverified")) report.incomplete.push("roster_unverified");
    }
  }
  // same player on both sides of this fixture
  for (const [pid, entries] of myPlayers) {
    if (new Set(entries).size > 1) {
      report.anomalies.push({ player_id: pid, player_name: rosters.playerName[pid] ?? pid, match_id: proposed.id });
    }
  }
  if (!proposed.venueId) report.incomplete.push("venue_unmapped");

  let sawUnresolvedOther = false;
  for (const other of others) {
    if (other.id === proposed.id) continue; // self-exclusion
    if (!other.startsAt || !other.durationMinutes) continue;
    const theirs = intervalOf(other.startsAt, other.durationMinutes);
    if (!overlaps(mine, theirs)) continue;
    if (other.entryIds.length === 0) sawUnresolvedOther = true;
    // venue clash
    if (proposed.venueId && other.venueId && proposed.venueId === other.venueId) {
      report.venueClashes.push({
        venue_id: proposed.venueId,
        venue_name: proposed.venueName ?? other.venueName ?? "",
        other_match_id: other.id, other_label: other.label, other_sport: other.sportName,
        other_starts_at: iso(theirs.start), other_ends_at: iso(theirs.end),
        severity: "minor",
      });
    }
    // player clashes
    const otherPlayers = new Set<string>();
    for (const entryId of other.entryIds) {
      for (const pid of rosters.byEntry[entryId] ?? []) otherPlayers.add(pid);
    }
    for (const pid of otherPlayers) {
      if (myPlayers.has(pid)) {
        report.playerClashes.push({
          player_id: pid, player_name: rosters.playerName[pid] ?? pid,
          other_match_id: other.id, other_label: other.label, other_sport: other.sportName,
          other_starts_at: iso(theirs.start), other_ends_at: iso(theirs.end),
          severity: "major",
        });
      }
    }
  }
  if (sawUnresolvedOther) report.incomplete.push("participants_unresolved_elsewhere");
  return report;
}

/** Deterministic hash binding an acknowledgement to proposed fields + the
 *  MAJOR clash set (SPEC §11.4). Since the severity re-tier, only player
 *  clashes are ever acknowledged — venue overlaps and coverage notes are
 *  informational and deliberately NOT part of the ack binding, so a minor
 *  note appearing/disappearing can never invalidate an acknowledgement. */
export function conflictAckHash(canonical: string, report: ConflictReportTS): string {
  const keys = [
    ...report.playerClashes.map((c) => `${c.player_id}@${c.other_match_id}`),
  ].sort();
  const s = canonical + "|" + keys.join(",");
  // FNV-1a (display/demo parity; the SQL side uses sha256 — the hash is only ever
  // compared against a value returned by the same implementation that computed it).
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function canonicalFixture(p: {
  divisionId: string; label: string; stage: string; groupId?: string | null;
  startsAt: string | null; durationMinutes?: number | null; venueId?: string | null; entryIds: string[];
}): string {
  return [p.divisionId, p.label, p.stage, p.groupId ?? "", p.startsAt,
    p.durationMinutes ?? "", p.venueId ?? "", [...p.entryIds].sort().join(",")].join("|");
}
