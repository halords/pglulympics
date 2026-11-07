// Sport-scope resolution (multi-sport coordinators).
// Pure helpers shared by the console pages; the database enforces the same
// scope in RLS (my_sport_ids()/has_sport_access, migration 8) — these only
// decide what the UI shows.

export interface ScopeSession {
  role: "admin" | "coordinator" | null;
  /** Assigned sports for a coordinator; ignored for admins. */
  sportIds: readonly string[];
}

/**
 * Effective sport scope:
 * - admin → every known sport
 * - coordinator → assigned ∩ known (stale ids dropped, duplicates removed)
 * - signed out / no profile → none
 */
export function effectiveSportIds(session: ScopeSession, allSportIds: readonly string[]): string[] {
  if (!session.role) return [];
  if (session.role === "admin") return [...allSportIds];
  const known = new Set(allSportIds);
  return [...new Set(session.sportIds)].filter((id) => known.has(id));
}

export function canAccessSport(session: ScopeSession, sportId: string, allSportIds: readonly string[]): boolean {
  return effectiveSportIds(session, allSportIds).includes(sportId);
}

export function divisionsInScope<T extends { sportId: string }>(
  divisions: readonly T[], session: ScopeSession, allSportIds: readonly string[],
): T[] {
  const scope = new Set(effectiveSportIds(session, allSportIds));
  return divisions.filter((d) => scope.has(d.sportId));
}

/** Demo (mock) mode has no accounts; the demo coordinator is scoped to the
 *  first `count` sports so the multi-sport switcher stays exercisable. */
export function demoScopeSportIds(allSportIds: readonly string[], count = 2): string[] {
  return allSportIds.slice(0, Math.max(0, count));
}

/** The scope the console pages should use for this session + snapshot:
 *  live sessions resolve from assignments; the mock demo coordinator gets the
 *  demo subset; mock demo admin gets everything. */
export function consoleScopeSportIds(
  session: ScopeSession & { isMock: boolean }, allSportIds: readonly string[],
): string[] {
  if (session.isMock && session.role === "coordinator") return demoScopeSportIds(allSportIds);
  return effectiveSportIds(session, allSportIds);
}
