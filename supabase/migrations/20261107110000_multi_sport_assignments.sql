-- PGLUlympics — migration 8: multi-sport coordinator assignments + in-app scheduling of teams
-- Coordinators may now handle MULTIPLE sports, and multiple coordinators may share a
-- sport. Scope moves from the single legacy column account_profiles.sport_id to the
-- join table account_sport_assignments. The legacy column stays (nullable, unused by
-- new code) so older rows remain readable; the backfill below copies it across.
-- Also adds set_fixture_teams(): change the teams of a not-yet-started fixture with
-- the same conflict warn/acknowledge protocol as create_fixture/update_fixture.
-- Idempotent: safe to re-run (the GitHub integration applies it once; guards keep a
-- manual re-run harmless).

-- ---------- 1. join table ----------
create table if not exists account_sport_assignments (
  user_id uuid not null references account_profiles(user_id) on delete cascade,
  sport_id uuid not null references sports(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, sport_id)
);
create index if not exists idx_assignments_sport on account_sport_assignments(sport_id);

-- backfill from the legacy single-sport column
insert into account_sport_assignments (user_id, sport_id)
select user_id, sport_id from account_profiles
where role = 'coordinator' and sport_id is not null
on conflict do nothing;

-- ---------- 2. relax the legacy single-sport constraints ----------
-- one coordinator per sport is gone: coordinators <> sports is now many-to-many
drop index if exists uq_one_coordinator_per_sport;

-- the table-level CHECK ((coordinator and sport_id not null) or (super_admin and
-- sport_id null)) no longer holds; drop whichever check constraint encodes it
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.account_profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%sport_id is not null%'
  loop
    execute format('alter table public.account_profiles drop constraint %I', c);
  end loop;
end $$;

-- ---------- 3. set-valued scope helpers ----------
-- A coordinator's effective scope = their assignment set. Enforced in RLS via
-- coordinates_sport(), which every existing policy and RPC already calls.
create or replace function my_sport_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select a.sport_id
  from account_sport_assignments a
  join account_profiles p on p.user_id = a.user_id
  where a.user_id = auth.uid() and p.role = 'coordinator' and p.active
$$;

create or replace function has_sport_access(p_sport_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_sport_id is not null and exists (select 1 from my_sport_ids() s where s = p_sport_id)
$$;

-- coordinates_sport keeps its name/signature (all policies + RPCs call it) but is
-- now set-valued underneath.
create or replace function coordinates_sport(p_sport_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_sport_access(p_sport_id)
$$;

-- legacy shim: anything still calling my_sport_id() gets one assigned sport
-- (list_conflicts below no longer uses it; kept so nothing else can break).
create or replace function my_sport_id() returns uuid
language sql stable security definer set search_path = public as $$
  select * from my_sport_ids() limit 1
$$;

-- ---------- 4. RLS + grants for the join table ----------
alter table account_sport_assignments enable row level security;
drop policy if exists read_own_assignments on account_sport_assignments;
create policy read_own_assignments on account_sport_assignments for select to authenticated
  using (user_id = auth.uid() or is_admin());
drop policy if exists admin_write_assignments on account_sport_assignments;
create policy admin_write_assignments on account_sport_assignments for all to authenticated
  using (is_admin()) with check (is_admin());

revoke all on account_sport_assignments from anon, authenticated;
grant select on account_sport_assignments to authenticated;
grant insert, update, delete on account_sport_assignments to authenticated; -- RLS-gated above

-- ---------- 5. list_conflicts: set-valued scope (was: sa.id = my single sport) ----------
create or replace function list_conflicts() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_admin boolean := is_admin(); v_mine uuid[] := array(select my_sport_ids()); v_event uuid;
begin
  select id into v_event from events order by created_at limit 1;
  return (select coalesce(jsonb_agg(row order by (row->>'starts_at')), '[]'::jsonb) from (
    select jsonb_build_object(
      'kind', 'player', 'player_name', pl.full_name, 'player_id', pl.id,
      'match_id', a.id, 'label', a.label, 'sport', sa.name, 'division', da.name,
      'starts_at', a.starts_at,
      'ends_at', a.starts_at + make_interval(mins => coalesce(a.duration_minutes, sa.default_duration_minutes)),
      'other_match_id', b.id, 'other_label', b.label, 'other_sport', sb.name,
      'other_starts_at', b.starts_at,
      'other_ends_at', b.starts_at + make_interval(mins => coalesce(b.duration_minutes, sb.default_duration_minutes)),
      'acked', (a.conflict_ack is not null or b.conflict_ack is not null)
    ) as row
    from matches a
    join divisions da on da.id = a.division_id join sports sa on sa.id = da.sport_id
    join matches b on b.id > a.id
    join divisions db on db.id = b.division_id join sports sb on sb.id = db.sport_id
    join match_slots sla on sla.match_id = a.id
    join match_slots slb on slb.match_id = b.id
    join roster_memberships rma on rma.entry_id = effective_entry_id(sla)
    join roster_memberships rmb on rmb.player_id = rma.player_id and rmb.entry_id = effective_entry_id(slb)
    join players pl on pl.id = rma.player_id
    where sa.event_id = v_event and sb.event_id = v_event
      and a.status <> 'cancelled' and b.status <> 'cancelled'
      and a.starts_at is not null and b.starts_at is not null
      and a.starts_at < b.starts_at + make_interval(mins => coalesce(b.duration_minutes, sb.default_duration_minutes))
      and b.starts_at < a.starts_at + make_interval(mins => coalesce(a.duration_minutes, sa.default_duration_minutes))
      and (v_admin or sa.id = any(v_mine) or sb.id = any(v_mine))
    union all
    select jsonb_build_object(
      'kind', 'venue', 'player_name', null, 'player_id', null,
      'match_id', a.id, 'label', a.label, 'sport', sa.name, 'division', da.name,
      'starts_at', a.starts_at,
      'ends_at', a.starts_at + make_interval(mins => coalesce(a.duration_minutes, sa.default_duration_minutes)),
      'other_match_id', b.id, 'other_label', b.label, 'other_sport', sb.name,
      'other_starts_at', b.starts_at,
      'other_ends_at', b.starts_at + make_interval(mins => coalesce(b.duration_minutes, sb.default_duration_minutes)),
      'acked', (a.conflict_ack is not null or b.conflict_ack is not null)
    )
    from matches a
    join divisions da on da.id = a.division_id join sports sa on sa.id = da.sport_id
    join matches b on b.id > a.id
    join divisions db on db.id = b.division_id join sports sb on sb.id = db.sport_id
    where sa.event_id = v_event and sb.event_id = v_event
      and a.venue_id is not null and a.venue_id = b.venue_id
      and a.status <> 'cancelled' and b.status <> 'cancelled'
      and a.starts_at is not null and b.starts_at is not null
      and a.starts_at < b.starts_at + make_interval(mins => coalesce(b.duration_minutes, sb.default_duration_minutes))
      and b.starts_at < a.starts_at + make_interval(mins => coalesce(a.duration_minutes, sa.default_duration_minutes))
      and (v_admin or sa.id = any(v_mine) or sb.id = any(v_mine))
  ) q);
end $$;

-- ---------- 6. set_fixture_teams: change teams of a scheduled fixture ----------
-- Only for matches that have not started (status 'scheduled') whose slots are all
-- manual entry slots (bracket-derived slots come from group ranks / match outcomes
-- and are changed by fixing the source, not here). Same warn/ack hash protocol and
-- per-event advisory lock as create_fixture/update_fixture.
create or replace function set_fixture_teams(
  p_match_id uuid, p_entry_ids uuid[], p_ack_hash text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_match matches%rowtype; v_event uuid; v_conflicts jsonb; v_hash text; v_canonical text; i int;
begin
  perform _assert_match_writer(p_match_id);
  select * into v_match from matches where id = p_match_id for update;
  if v_match.status <> 'scheduled' then
    raise exception 'teams can only be changed before the match starts';
  end if;
  if exists (select 1 from match_slots where match_id = p_match_id and (source <> 'entry' or frozen_entry_id is not null)) then
    raise exception 'this fixture has bracket-derived or frozen slots; teams cannot be changed directly';
  end if;
  if coalesce(array_length(p_entry_ids, 1), 0) <> (select count(*) from match_slots where match_id = p_match_id) then
    raise exception 'team count must match the fixture slot count';
  end if;
  if exists (select 1 from division_entries e where e.id = any(p_entry_ids) and e.division_id <> v_match.division_id) then
    raise exception 'entries must belong to the fixture division';
  end if;
  v_event := _event_of_division(v_match.division_id);
  perform pg_advisory_xact_lock(hashtextextended('fixture-save-' || v_event::text, 0));
  v_conflicts := _check_conflicts(v_event, p_match_id, v_match.division_id, v_match.starts_at,
                                  v_match.duration_minutes, v_match.venue_id, p_entry_ids);
  v_canonical := v_match.division_id || '|' || v_match.label || '|' || v_match.stage || '|' ||
                 coalesce(v_match.group_id::text,'') || '|' || coalesce(v_match.starts_at::text,'') || '|' ||
                 coalesce(v_match.duration_minutes::text,'') || '|' || coalesce(v_match.venue_id::text,'') || '|' ||
                 (select string_agg(x, ',' order by x) from unnest(p_entry_ids) x);
  v_hash := _conflict_hash(v_canonical, v_conflicts);
  if (jsonb_array_length(v_conflicts->'playerClashes') > 0 or jsonb_array_length(v_conflicts->'venueClashes') > 0
      or jsonb_array_length(v_conflicts->'incomplete') > 0)
     and p_ack_hash is distinct from v_hash then
    return jsonb_build_object('status', 'warning', 'ack_hash', v_hash, 'conflicts', v_conflicts);
  end if;
  for i in 1 .. array_length(p_entry_ids, 1) loop
    update match_slots
       set source_entry_id = p_entry_ids[i], resolved_entry_id = p_entry_ids[i],
           override_entry_id = null, override_reason = null
     where match_id = p_match_id and slot_no = i;
  end loop;
  update matches
     set conflict_ack = case when p_ack_hash is not null
                             then jsonb_build_object('hash', v_hash, 'by', auth.uid(), 'at', now())
                             else conflict_ack end,
         revision = revision + 1
   where id = p_match_id;
  perform _audit(v_event, match_sport_id(p_match_id), 'fixture.teams', 'match', p_match_id, null,
    jsonb_build_object('entry_ids', to_jsonb(p_entry_ids)), null);
  perform _emit_update(v_event, array[p_match_id], array[v_match.division_id], array['fixture']);
  return jsonb_build_object('status', 'ok', 'match_id', p_match_id);
end $$;

grant execute on function set_fixture_teams(uuid, uuid[], text) to authenticated;
