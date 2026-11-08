-- PGLUlympics — migration 12: public team entries projection.
--
-- Why: division_entries is staff-only (RLS staff_read_entries), so the
-- anonymous snapshot synthesizes entries from awards and the public site
-- shows NO entrants until medals exist. But team-level entries (team X
-- entered division Y) are announcement data — the province prints them on
-- the official posters — and the portal's downloadable posters need them.
-- This view exposes ONLY the entry's id / division / team / group. Roster
-- and player data stays staff-only (rosters hang off players, not here).
-- Same pattern as migration 10 (public_lineups). Idempotent.

create or replace view public_entries as
select e.id, e.division_id, e.team_id, e.group_id
from division_entries e;

grant select on public_entries to anon, authenticated;
