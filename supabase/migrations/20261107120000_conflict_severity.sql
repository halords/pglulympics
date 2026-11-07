-- Migration 9 — conflict severity re-tier (user direction, 2026-11-07).
--
-- PLAYER overlaps are MAJOR: the only conflicts that block a fixture save
-- behind the warn → acknowledge protocol. VENUE double-bookings are MINOR:
-- a venue may have multiple courts, so they are informational notes only —
-- never blocking, never requiring acknowledgement. Coverage notes
-- (`incomplete`) are informational too.
--
-- Changes (all `create or replace`, so the file is idempotent):
--  1. _check_conflicts stamps 'severity' on every clash object
--     (player = 'major', venue = 'minor').
--  2. _conflict_hash binds ONLY the major (player) clash set — minor notes
--     entering/leaving can never invalidate an acknowledgement. Stored
--     conflict_ack hashes are never re-verified after their save, so no
--     data migration is needed for the formula change.
--  3. create_fixture / update_fixture / set_fixture_teams return a warning
--     ONLY when player clashes exist and the ack hash does not match. On a
--     clean save they return the minor side of the report as `notes` so the
--     UI can surface it as information.
--  4. list_conflicts rows carry 'severity' (player = 'major', venue =
--     'minor'); body otherwise identical to migration 8's set-scoped one.

-- ---------- 1. _check_conflicts: severity stamps ----------
create or replace function _check_conflicts(
  p_event_id uuid, p_exclude_match_id uuid, p_division_id uuid,
  p_starts_at timestamptz, p_duration_minutes int, p_venue_id uuid, p_entry_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sport uuid; v_dur int; v_end timestamptz;
  v_players jsonb; v_venues jsonb; v_incomplete jsonb := '[]'::jsonb; v_partial boolean := false;
begin
  select sport_id into v_sport from divisions where id = p_division_id;
  v_dur := coalesce(p_duration_minutes, (select default_duration_minutes from sports where id = v_sport));
  if p_starts_at is null or v_dur is null or v_dur <= 0 then
    return jsonb_build_object('playerClashes','[]'::jsonb,'venueClashes','[]'::jsonb,
      'anomalies','[]'::jsonb,'incomplete', jsonb_build_array('uncheckable_no_time'));
  end if;
  v_end := p_starts_at + make_interval(mins => v_dur);

  if exists (select 1 from division_entries e where e.id = any(p_entry_ids) and e.roster_status = 'unknown') then
    v_incomplete := v_incomplete || '"roster_unverified"'::jsonb;
  end if;
  if p_venue_id is null then v_incomplete := v_incomplete || '"venue_unmapped"'::jsonb; end if;

  -- player clashes: same player, overlapping other fixture, event-wide (MAJOR)
  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_players from (
    select distinct jsonb_build_object(
      'player_id', pl.id, 'player_name', pl.full_name,
      'other_match_id', om.id, 'other_label', om.label,
      'other_sport', os.name, 'other_starts_at', om.starts_at,
      'other_ends_at', om.starts_at + make_interval(mins => coalesce(om.duration_minutes, os.default_duration_minutes)),
      'severity', 'major'
    ) as row
    from matches om
    join divisions od on od.id = om.division_id
    join sports os on os.id = od.sport_id
    join match_slots osl on osl.match_id = om.id
    join roster_memberships rm on rm.entry_id = effective_entry_id(osl)
    join players pl on pl.id = rm.player_id
    where os.event_id = p_event_id
      and om.id is distinct from p_exclude_match_id
      and om.status <> 'cancelled' and om.starts_at is not null
      and om.starts_at < v_end
      and p_starts_at < om.starts_at + make_interval(mins => coalesce(om.duration_minutes, os.default_duration_minutes))
      and pl.id in (select rm2.player_id from roster_memberships rm2 where rm2.entry_id = any(p_entry_ids))
  ) q;

  -- venue clashes (MINOR — informational only)
  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_venues from (
    select jsonb_build_object(
      'venue_id', p_venue_id, 'venue_name', vn.name,
      'other_match_id', om.id, 'other_label', om.label,
      'other_sport', os.name, 'other_starts_at', om.starts_at,
      'other_ends_at', om.starts_at + make_interval(mins => coalesce(om.duration_minutes, os.default_duration_minutes)),
      'severity', 'minor'
    ) as row
    from matches om
    join divisions od on od.id = om.division_id
    join sports os on os.id = od.sport_id
    join venues vn on vn.id = p_venue_id
    where p_venue_id is not null and om.venue_id = p_venue_id
      and om.id is distinct from p_exclude_match_id
      and om.status <> 'cancelled' and om.starts_at is not null
      and om.starts_at < v_end
      and p_starts_at < om.starts_at + make_interval(mins => coalesce(om.duration_minutes, os.default_duration_minutes))
  ) q;

  -- partial: an overlapping fixture has unresolved contestants
  select exists (
    select 1 from matches om join divisions od on od.id = om.division_id join sports os on os.id = od.sport_id
    where os.event_id = p_event_id and om.id is distinct from p_exclude_match_id
      and om.status <> 'cancelled' and om.starts_at is not null
      and om.starts_at < v_end
      and p_starts_at < om.starts_at + make_interval(mins => coalesce(om.duration_minutes, os.default_duration_minutes))
      and exists (select 1 from match_slots sl where sl.match_id = om.id and effective_entry_id(sl) is null)
  ) into v_partial;
  if v_partial then v_incomplete := v_incomplete || '"participants_unresolved_elsewhere"'::jsonb; end if;

  return jsonb_build_object('playerClashes', v_players, 'venueClashes', v_venues,
    'anomalies', '[]'::jsonb, 'incomplete', v_incomplete);
end $$;

-- ---------- 2. _conflict_hash: major clash set only ----------
create or replace function _conflict_hash(p_canonical text, p_conflicts jsonb) returns text
language sql security definer set search_path = public as $$
  select encode(sha256(convert_to(p_canonical || '|' ||
    (select coalesce(string_agg(k, ',' order by k), '') from (
      select (c->>'player_id') || '@' || (c->>'other_match_id') as k from jsonb_array_elements(p_conflicts->'playerClashes') c
    ) q), 'UTF8')), 'hex')
$$;

-- ---------- 3a. create_fixture: warn on MAJOR only; minor rides as notes ----------
create or replace function create_fixture(
  p_division_id uuid, p_label text, p_stage match_stage, p_group_id uuid,
  p_starts_at timestamptz, p_duration_minutes int, p_venue_id uuid, p_venue_text text,
  p_entry_ids uuid[], p_ack_hash text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sport uuid; v_event uuid; v_conflicts jsonb; v_hash text; v_match_id uuid; i int;
  v_canonical text;
begin
  v_sport := division_sport_id(p_division_id);
  if not (is_admin() or coordinates_sport(v_sport)) then
    raise exception 'not authorized to schedule in this sport' using errcode = '42501';
  end if;
  if exists (select 1 from division_entries e where e.id = any(p_entry_ids) and e.division_id <> p_division_id) then
    raise exception 'entries must belong to the fixture division';
  end if;
  v_event := _event_of_division(p_division_id);
  perform pg_advisory_xact_lock(hashtextextended('fixture-save-' || v_event::text, 0));
  v_conflicts := _check_conflicts(v_event, null, p_division_id, p_starts_at, p_duration_minutes, p_venue_id, p_entry_ids);
  v_canonical := p_division_id || '|' || p_label || '|' || p_stage || '|' || coalesce(p_group_id::text,'') || '|' ||
                 coalesce(p_starts_at::text,'') || '|' || coalesce(p_duration_minutes::text,'') || '|' ||
                 coalesce(p_venue_id::text,'') || '|' || (select string_agg(x, ',' order by x) from unnest(p_entry_ids) x);
  v_hash := _conflict_hash(v_canonical, v_conflicts);
  if jsonb_array_length(v_conflicts->'playerClashes') > 0
     and p_ack_hash is distinct from v_hash then
    return jsonb_build_object('status', 'warning', 'ack_hash', v_hash, 'conflicts', v_conflicts);
  end if;
  insert into matches(division_id, group_id, stage, label, starts_at, duration_minutes, venue_id, venue_text,
                      conflict_ack)
  values (p_division_id, p_group_id, p_stage, p_label, p_starts_at, p_duration_minutes, p_venue_id, p_venue_text,
          case when p_ack_hash is not null then jsonb_build_object('hash', v_hash, 'by', auth.uid(), 'at', now()) end)
  returning id into v_match_id;
  for i in 1 .. coalesce(array_length(p_entry_ids, 1), 0) loop
    insert into match_slots(match_id, slot_no, source, source_entry_id, resolved_entry_id)
    values (v_match_id, i, 'entry', p_entry_ids[i], p_entry_ids[i]);
  end loop;
  perform _audit(v_event, v_sport, 'fixture.create', 'match', v_match_id, null,
    jsonb_build_object('label', p_label, 'stage', p_stage), null);
  perform _emit_update(v_event, array[v_match_id], array[p_division_id], array['fixture']);
  return jsonb_build_object('status', 'ok', 'match_id', v_match_id,
    'notes', case when jsonb_array_length(v_conflicts->'playerClashes') = 0
                   and (jsonb_array_length(v_conflicts->'venueClashes') > 0
                        or jsonb_array_length(v_conflicts->'incomplete') > 0)
                  then v_conflicts else null end);
end $$;

-- ---------- 3b. update_fixture: same severity gate ----------
create or replace function update_fixture(
  p_match_id uuid, p_starts_at timestamptz, p_duration_minutes int,
  p_venue_id uuid, p_venue_text text, p_label text default null, p_ack_hash text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_match matches%rowtype; v_event uuid; v_conflicts jsonb; v_hash text; v_entries uuid[]; v_canonical text;
begin
  perform _assert_match_writer(p_match_id);
  select * into v_match from matches where id = p_match_id for update;
  v_event := _event_of_division(v_match.division_id);
  perform pg_advisory_xact_lock(hashtextextended('fixture-save-' || v_event::text, 0));
  select array_agg(effective_entry_id(sl) order by sl.slot_no) into v_entries
  from match_slots sl where sl.match_id = p_match_id and effective_entry_id(sl) is not null;
  v_conflicts := _check_conflicts(v_event, p_match_id, v_match.division_id, p_starts_at,
                                  p_duration_minutes, p_venue_id, coalesce(v_entries, '{}'));
  v_canonical := v_match.division_id || '|' || coalesce(p_label, v_match.label) || '|' || v_match.stage || '|' ||
                 coalesce(v_match.group_id::text,'') || '|' || coalesce(p_starts_at::text,'') || '|' ||
                 coalesce(p_duration_minutes::text,'') || '|' || coalesce(p_venue_id::text,'') || '|' ||
                 (select coalesce(string_agg(x, ',' order by x), '') from unnest(coalesce(v_entries,'{}')) x);
  v_hash := _conflict_hash(v_canonical, v_conflicts);
  if jsonb_array_length(v_conflicts->'playerClashes') > 0
     and p_ack_hash is distinct from v_hash then
    return jsonb_build_object('status', 'warning', 'ack_hash', v_hash, 'conflicts', v_conflicts);
  end if;
  update matches set starts_at = p_starts_at, duration_minutes = p_duration_minutes,
    venue_id = p_venue_id, venue_text = p_venue_text,
    label = coalesce(p_label, label),
    conflict_ack = case when p_ack_hash is not null
                        then jsonb_build_object('hash', v_hash, 'by', auth.uid(), 'at', now())
                        else conflict_ack end,
    revision = revision + 1
   where id = p_match_id;
  perform _emit_update(v_event, array[p_match_id], array[v_match.division_id], array['fixture']);
  return jsonb_build_object('status', 'ok', 'match_id', p_match_id,
    'notes', case when jsonb_array_length(v_conflicts->'playerClashes') = 0
                   and (jsonb_array_length(v_conflicts->'venueClashes') > 0
                        or jsonb_array_length(v_conflicts->'incomplete') > 0)
                  then v_conflicts else null end);
end $$;

-- ---------- 3c. set_fixture_teams: same severity gate (body per migration 8) ----------
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
  if jsonb_array_length(v_conflicts->'playerClashes') > 0
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
  return jsonb_build_object('status', 'ok', 'match_id', p_match_id,
    'notes', case when jsonb_array_length(v_conflicts->'playerClashes') = 0
                   and (jsonb_array_length(v_conflicts->'venueClashes') > 0
                        or jsonb_array_length(v_conflicts->'incomplete') > 0)
                  then v_conflicts else null end);
end $$;

-- ---------- 4. list_conflicts: severity per row (body per migration 8) ----------
create or replace function list_conflicts() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_admin boolean := is_admin(); v_mine uuid[] := array(select my_sport_ids()); v_event uuid;
begin
  select id into v_event from events order by created_at limit 1;
  return (select coalesce(jsonb_agg(row order by (row->>'starts_at')), '[]'::jsonb) from (
    select jsonb_build_object(
      'kind', 'player', 'severity', 'major', 'player_name', pl.full_name, 'player_id', pl.id,
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
      'kind', 'venue', 'severity', 'minor', 'player_name', null, 'player_id', null,
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
