-- PGLUlympics — migration 2: authorization (helpers, RLS, grants) — SPEC §2
-- Pattern: base tables closed to anon; public reads via projection views (migration 3);
-- event_updates is the one public table (public-safe by contract); staff access via helpers;
-- all multi-table writes via SECURITY DEFINER RPCs (migration 4).

-- ---------- helpers (security definer: read account_profiles without recursive RLS) ----------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from account_profiles
                 where user_id = auth.uid() and role = 'super_admin' and active)
$$;

create or replace function my_sport_id() returns uuid
language sql stable security definer set search_path = public as $$
  select sport_id from account_profiles
  where user_id = auth.uid() and role = 'coordinator' and active
$$;

create or replace function coordinates_sport(p_sport_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_sport_id() = p_sport_id, false)
$$;

create or replace function match_sport_id(p_match_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select d.sport_id from matches m join divisions d on d.id = m.division_id where m.id = p_match_id
$$;

create or replace function division_sport_id(p_division_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select sport_id from divisions where id = p_division_id
$$;

create or replace function entry_sport_id(p_entry_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select d.sport_id from division_entries e join divisions d on d.id = e.division_id where e.id = p_entry_id
$$;

-- ---------- enable RLS everywhere ----------
do $$
declare t text;
begin
  foreach t in array array['events','teams','sports','divisions','groups','division_entries','players',
    'roster_memberships','venues','matches','match_slots','match_segments','segment_scores','match_totals',
    'placement_results','division_results','account_profiles','audit_log','event_updates']
  loop
    execute format('alter table %s enable row level security', t);
  end loop;
end $$;

-- ---------- safe static tables: public read ----------
create policy pub_read_events on events for select to anon, authenticated using (published);
create policy pub_read_teams on teams for select to anon, authenticated using (true);
create policy pub_read_sports on sports for select to anon, authenticated using (published);
create policy pub_read_groups on groups for select to anon, authenticated using (true);
create policy pub_read_venues on venues for select to anon, authenticated using (true);

-- ---------- event_updates: PUBLIC projection (SPEC §2 ◆) ----------
create policy pub_read_updates on event_updates for select to anon, authenticated
  using (exists (select 1 from events e where e.id = event_updates.event_id and e.published));
-- no insert/update/delete policies for anon/authenticated: RPCs (definer) write it.

-- ---------- divisions: staff read (configs are staff-only; public names via view) ----------
create policy staff_read_divisions on divisions for select to authenticated
  using (is_admin() or coordinates_sport(sport_id));

-- ---------- competitive tables: staff-scoped read ----------
create policy staff_read_entries on division_entries for select to authenticated
  using (is_admin() or coordinates_sport(division_sport_id(division_id)));
create policy staff_read_matches on matches for select to authenticated
  using (is_admin() or coordinates_sport(division_sport_id(division_id)));
create policy staff_read_slots on match_slots for select to authenticated
  using (is_admin() or coordinates_sport(match_sport_id(match_id)));
create policy staff_read_segments on match_segments for select to authenticated
  using (is_admin() or coordinates_sport(match_sport_id(match_id)));
create policy staff_read_segment_scores on segment_scores for select to authenticated
  using (is_admin() or coordinates_sport((select match_sport_id(ms.match_id) from match_segments ms where ms.id = segment_scores.segment_id)));
create policy staff_read_totals on match_totals for select to authenticated
  using (is_admin() or coordinates_sport(match_sport_id(match_id)));
create policy staff_read_placements on placement_results for select to authenticated
  using (is_admin() or coordinates_sport(match_sport_id(match_id)));
create policy staff_read_results on division_results for select to authenticated
  using (is_admin() or coordinates_sport(division_sport_id(division_id)));

-- ---------- players & rosters: admin all; coordinator own-sport only ----------
create policy staff_read_players on players for select to authenticated
  using (is_admin() or exists (
    select 1 from roster_memberships rm
    where rm.player_id = players.id and coordinates_sport(entry_sport_id(rm.entry_id))));
create policy staff_read_roster on roster_memberships for select to authenticated
  using (is_admin() or coordinates_sport(entry_sport_id(entry_id)));

-- ---------- accounts & audit ----------
create policy read_own_profile on account_profiles for select to authenticated
  using (user_id = auth.uid() or is_admin());
create policy admin_read_audit on audit_log for select to authenticated using (is_admin());

-- ---------- direct DML: admin-only CRUD on simple entities (SPEC §2/§6) ----------
do $$
declare t text;
begin
  foreach t in array array['events','teams','sports','divisions','groups','division_entries','players','venues']
  loop
    execute format('create policy admin_write_%s on %s for all to authenticated using (is_admin()) with check (is_admin())', t, t);
  end loop;
end $$;
-- roster memberships: admin writes (MVP, SPEC §11.2)
create policy admin_write_roster on roster_memberships for all to authenticated
  using (is_admin()) with check (is_admin());
-- account profiles: admin manages
create policy admin_write_profiles on account_profiles for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------- grants ----------
revoke all on all tables in schema public from anon, authenticated;
grant select on events, teams, sports, groups, venues, event_updates to anon, authenticated;
grant select on divisions, division_entries, matches, match_slots, match_segments, segment_scores,
  match_totals, placement_results, division_results, players, roster_memberships, account_profiles
  to authenticated;
grant insert, update, delete on events, teams, sports, divisions, groups, division_entries, players,
  venues, roster_memberships, account_profiles to authenticated;  -- still gated by RLS policies above
grant select on audit_log to authenticated;
-- RPCs (migration 4) are granted individually there.
