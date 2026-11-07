-- PGLUlympics — migration 10: public lineups projection — user request 2026-11-07
-- The public match page shows each team's lineup. Base roster tables
-- (players, roster_memberships, division_entries) stay staff-only by RLS;
-- this view is the narrow, deliberate exception: for PUBLISHED matches it
-- exposes ONLY match/division/entry ids + team and player DISPLAY names
-- (the same names printed in the source workbook). Views run with owner
-- privileges (the established projection pattern from migration 3); anon
-- gets this sanitized shape, never the base tables. Idempotent.

create or replace view public_lineups as
with match_teams as (
  -- teams slotted into the match (head-to-head: the resolved entries;
  -- placement events: the slotted field)
  select m.id as match_id, m.division_id, effective_entry_id(sl) as entry_id
  from matches m
  join match_slots sl on sl.match_id = m.id
  where m.published and effective_entry_id(sl) is not null
  union
  -- placement events: every entered team in the division is part of the
  -- event, whether or not it also sits in a slot row
  select m.id as match_id, m.division_id, e.id as entry_id
  from matches m
  join divisions d on d.id = m.division_id
  join division_entries e on e.division_id = m.division_id and e.active
  where m.published and d.scoring_kind = 'placement_only'
)
select mt.match_id, mt.division_id, mt.entry_id,
       t.name as team_name, p.full_name as player_name
from match_teams mt
join division_entries e on e.id = mt.entry_id
join teams t on t.id = e.team_id
left join roster_memberships rm on rm.entry_id = mt.entry_id
left join players p on p.id = rm.player_id;

grant select on public_lineups to anon, authenticated;
