# ADDENDUM 2 (user-added scope, 2026-11-07) — binding; SPEC.md must flag this section "user-added"

1. **In-app scheduling**: super-admins, and coordinators for their OWN sport, can create/edit fixtures
   in-app (sport, division, teams, date/time, venue) — the seeded sheet fixtures are a starting point,
   not the only fixtures.
2. **Rosters**: players belong to teams (name-level records are enough). A player may appear on
   multiple teams across sports (normal in inter-office fests).
3. **Player conflict detection**: at fixture create/edit (save) time, cross-check every player on both
   teams against ALL other fixtures event-wide — ACROSS sports — for time overlaps. Flag conflicts
   inline at save: a warning listing the specific clashes (player, other match, sport, time).
   Admin may override and save anyway; coordinators see the warning for fixtures in their sport
   (override rights per spec decision — default: coordinators can save with warning acknowledged,
   admins can always override; spec may refine but must state it).
4. **Venue double-booking**: same check engine also flags same-venue overlapping fixtures.
5. **Conflicts view** in the console: per-player and per-team lists of clashes.
6. **Overlap utility**: implemented as a tested utility (unit tests required). Fixtures carry date +
   start time; match duration defaults are per-sport config (editable by admin) since most fixtures
   have no explicit end time. Overlap = intervals [start, start+duration) intersect.
