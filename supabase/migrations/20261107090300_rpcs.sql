-- PGLUlympics — migration 4: command RPCs — SPEC §2, §5, §6, §7, §11
-- All multi-table writes live here as SECURITY DEFINER functions with pinned search_path.
-- Internals (prefix _) have EXECUTE revoked from everyone; the public RPCs re-check the
-- caller via auth.uid() helpers before doing anything.

-- ============================== internals ==============================
create or replace function _event_of_division(p_division_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.event_id from divisions d join sports s on s.id = d.sport_id where d.id = p_division_id
$$;

create or replace function _assert_match_writer(p_match_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_sport uuid;
begin
  v_sport := match_sport_id(p_match_id);
  if v_sport is null then raise exception 'match not found'; end if;
  if not (is_admin() or coordinates_sport(v_sport)) then
    raise exception 'not authorized to score this match' using errcode = '42501';
  end if;
  return v_sport;
end $$;

create or replace function _audit(p_event uuid, p_sport uuid, p_action text, p_entity text,
                                p_entity_id uuid, p_before jsonb, p_after jsonb, p_reason text default null)
returns void language sql security definer set search_path = public as $$
  insert into audit_log(event_id, sport_id, actor_id, action, entity_type, entity_id, before, after, reason)
  values (p_event, p_sport, auth.uid(), p_action, p_entity, p_entity_id, p_before, p_after, p_reason)
$$;

-- Public-safe patch: ONLY whitelisted card fields (SPEC §2 contract on event_updates).
create or replace function _public_patch(p_match_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'match_id', match_id, 'status', status, 'stage', stage, 'label', label,
    'sport_slug', sport_slug, 'division_slug', division_slug, 'starts_at', starts_at,
    'slot1_team', slot1_team, 'slot1_sets', slot1_sets, 'slot1_points', slot1_points, 'slot1_current', slot1_current,
    'slot2_team', slot2_team, 'slot2_sets', slot2_sets, 'slot2_points', slot2_points, 'slot2_current', slot2_current,
    'winner_team_name', winner_team_name)), '[]'::jsonb)
  from public_match_cards where match_id = any(p_match_ids)
$$;

create or replace function _emit_update(p_event uuid, p_match_ids uuid[], p_division_ids uuid[], p_topics text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into event_updates(event_id, changed_match_ids, changed_division_ids, topics, patch)
  values (p_event, p_match_ids, p_division_ids, p_topics, _public_patch(p_match_ids));
end $$;

-- Winner from current scores: (winner_entry_id, is_draw). Null winner + not draw = undecided.
create or replace function _computed_winner(p_match_id uuid) returns table(winner uuid, is_draw boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_kind scoring_kind; v_cfg jsonb; v_best_of int; v_needed int;
  s1 int; s2 int; e1 uuid; e2 uuid; t1 int; t2 int;
begin
  select d.scoring_kind, d.scoring_config into v_kind, v_cfg
  from matches m join divisions d on d.id = m.division_id where m.id = p_match_id;
  select effective_entry_id(sl) into e1 from match_slots sl where sl.match_id = p_match_id and sl.slot_no = 1;
  select effective_entry_id(sl) into e2 from match_slots sl where sl.match_id = p_match_id and sl.slot_no = 2;
  if v_kind = 'set_based' then
    v_best_of := coalesce((v_cfg->>'best_of')::int, 3);
    v_needed := v_best_of / 2 + 1;
    select count(*) filter (where a.points > b.points), count(*) filter (where b.points > a.points)
      into s1, s2
    from match_segments ms
    join match_slots sl1 on sl1.match_id = p_match_id and sl1.slot_no = 1
    join match_slots sl2 on sl2.match_id = p_match_id and sl2.slot_no = 2
    join segment_scores a on a.segment_id = ms.id and a.slot_id = sl1.id
    join segment_scores b on b.segment_id = ms.id and b.slot_id = sl2.id
    where ms.match_id = p_match_id and ms.status = 'closed';
    if s1 >= v_needed then return query select e1, false; return; end if;
    if s2 >= v_needed then return query select e2, false; return; end if;
    return query select null::uuid, false; return;
  elsif v_kind = 'simple' then
    select coalesce((select points from match_totals where match_id = p_match_id and slot_id = sl.id),
      (select coalesce(sum(a.points),0) from match_segments ms join segment_scores a on a.segment_id = ms.id and a.slot_id = sl.id
        where ms.match_id = p_match_id and ms.status = 'closed'), 0)
      into t1 from match_slots sl where sl.match_id = p_match_id and sl.slot_no = 1;
    select coalesce((select points from match_totals where match_id = p_match_id and slot_id = sl.id),
      (select coalesce(sum(a.points),0) from match_segments ms join segment_scores a on a.segment_id = ms.id and a.slot_id = sl.id
        where ms.match_id = p_match_id and ms.status = 'closed'), 0)
      into t2 from match_slots sl where sl.match_id = p_match_id and sl.slot_no = 2;
    if t1 is null or t2 is null then return query select null::uuid, false; return; end if;
    if t1 > t2 then return query select e1, false; return; end if;
    if t2 > t1 then return query select e2, false; return; end if;
    return query select null::uuid, true; return;
  end if;
  return query select null::uuid, false;
end $$;

-- Award drafts from finals (SPEC §1.3): gold final -> gold/silver drafts; bronze final -> bronze draft;
-- placement medal match -> drafts per medal_policy.place_to_medal.
create or replace function _propose_awards(p_match_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match matches%rowtype; v_loser uuid; v_policy jsonb; v_src text;
begin
  select * into v_match from matches where id = p_match_id;
  if v_match.status <> 'final' or v_match.winner_entry_id is null then return; end if;
  select effective_entry_id(sl) into v_loser from match_slots sl
   where sl.match_id = p_match_id and effective_entry_id(sl) is not null
     and effective_entry_id(sl) <> v_match.winner_entry_id limit 1;
  select medal_policy into v_policy from divisions where id = v_match.division_id;
  v_src := case when v_match.stage = 'placement' then 'placement' else 'playoff' end;
  if v_match.stage = 'gold' then
    insert into division_results(division_id, award_key, medal, entry_id, state, source, source_match_id)
    values (v_match.division_id, 'gold', 'gold', v_match.winner_entry_id, 'draft', v_src, p_match_id)
    on conflict (division_id, award_key) where state = 'draft' do update set entry_id = excluded.entry_id, source_match_id = excluded.source_match_id;
    if v_loser is not null then
      insert into division_results(division_id, award_key, medal, entry_id, state, source, source_match_id)
      values (v_match.division_id, 'silver', 'silver', v_loser, 'draft', v_src, p_match_id)
      on conflict (division_id, award_key) where state = 'draft' do update set entry_id = excluded.entry_id, source_match_id = excluded.source_match_id;
    end if;
  elsif v_match.stage = 'bronze' then
    insert into division_results(division_id, award_key, medal, entry_id, state, source, source_match_id)
    values (v_match.division_id, 'bronze', 'bronze', v_match.winner_entry_id, 'draft', v_src, p_match_id)
    on conflict (division_id, award_key) where state = 'draft' do update set entry_id = excluded.entry_id, source_match_id = excluded.source_match_id;
  elsif v_match.stage = 'placement' then
    insert into division_results(division_id, award_key, medal, entry_id, state, source, source_match_id)
    select v_match.division_id, 'place:' || pr.place, v_policy->'place_to_medal'->>pr.place::text,
           effective_entry_id(sl), 'draft', 'placement', p_match_id
    from placement_results pr join match_slots sl on sl.id = pr.slot_id
    where pr.match_id = p_match_id and pr.finish = 'finished' and pr.place is not null
      and (v_policy->'place_to_medal'->>pr.place::text) is not null
    on conflict (division_id, award_key) where state = 'draft' do update set entry_id = excluded.entry_id, source_match_id = excluded.source_match_id;
  end if;
end $$;

-- Draft-award partial unique indexes (needed by _propose_awards upserts)
create unique index if not exists uq_results_draft_key
  on division_results(division_id, award_key) where state = 'draft';

-- Advancement propagation (SPEC §7): re-resolve dependents of a source match / group standings.
create or replace function _propagate_from_match(p_match_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_src matches%rowtype; v_winner uuid; v_loser uuid; r record; v_entry uuid;
begin
  select * into v_src from matches where id = p_match_id;
  if v_src.status = 'final' and not v_src.needs_review and v_src.outcome is distinct from 'draw' then
    v_winner := v_src.winner_entry_id;
    select effective_entry_id(sl) into v_loser from match_slots sl
     where sl.match_id = p_match_id and effective_entry_id(sl) is not null
       and effective_entry_id(sl) <> v_winner limit 1;
  end if;
  for r in select sl.*, dm.status as dep_status, dm.id as dep_match_id
           from match_slots sl join matches dm on dm.id = sl.match_id
           where sl.source_match_id = p_match_id loop
    v_entry := case r.source_outcome when 'winner' then v_winner else v_loser end;
    if r.dep_status = 'scheduled' then
      update match_slots set resolved_entry_id = v_entry where id = r.id;
    elsif v_entry is distinct from coalesce(r.frozen_entry_id, r.override_entry_id, r.resolved_entry_id) then
      update matches set needs_review = true where id = r.dep_match_id;
    end if;
  end loop;
end $$;

create or replace function _propagate_group_ranks(p_division_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_entry uuid; v_complete boolean; v_tie jsonb;
begin
  for r in select sl.*, dm.status as dep_status, dm.id as dep_match_id
           from match_slots sl join matches dm on dm.id = sl.match_id
           where sl.source = 'group_rank' and dm.division_id = p_division_id loop
    -- group complete? all RR matches of the group final
    select bool_and(m.status = 'final') into v_complete
    from matches m where m.division_id = p_division_id and m.group_id = r.source_group_id and m.stage = 'round_robin';
    v_entry := null;
    if coalesce(v_complete, false) then
      select tie_resolution into v_tie from groups where id = r.source_group_id;
      if v_tie is not null and v_tie ? 'order' then
        v_entry := (v_tie->'order'->>(r.source_rank - 1))::uuid;
      else
        -- deterministic order; a tie AT the requested rank leaves the slot pending (SPEC §7)
        with ranked as (
          select entry_id, win_pct, wins,
                 case when sets_lost = 0 then null else sets_won::numeric / sets_lost end as set_ratio,
                 case when points_against = 0 then null else points_for::numeric / points_against end as point_ratio,
                 rank() over (order by win_pct desc, wins desc,
                   case when sets_lost = 0 then null else sets_won::numeric / sets_lost end desc nulls first,
                   case when points_against = 0 then null else points_for::numeric / points_against end desc nulls first) as rnk,
                 count(*) over (partition by win_pct, wins,
                   case when sets_lost = 0 then null else sets_won::numeric / sets_lost end,
                   case when points_against = 0 then null else points_for::numeric / points_against end) as cohort
          from group_standings where division_id = p_division_id and group_id = r.source_group_id
        )
        select entry_id into v_entry from ranked where rnk = r.source_rank and cohort = 1;
      end if;
    end if;
    if r.dep_status = 'scheduled' then
      update match_slots set resolved_entry_id = v_entry where id = r.id;
    elsif v_entry is not null and v_entry is distinct from coalesce(r.frozen_entry_id, r.override_entry_id, r.resolved_entry_id) then
      update matches set needs_review = true where id = r.dep_match_id;
    end if;
  end loop;
end $$;

-- ============================== scoring ==============================
create or replace function save_score(p_match_id uuid, p_expected_revision int, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sport uuid; v_match matches%rowtype; v_seg jsonb; v_slot_id uuid; v_key text; v_val int;
begin
  v_sport := _assert_match_writer(p_match_id);
  select * into v_match from matches where id = p_match_id for update;
  if v_match.revision <> p_expected_revision then
    raise exception 'stale revision: server is at %', v_match.revision using errcode = '40001';
  end if;
  if v_match.status not in ('live','scheduled') then
    raise exception 'scores can only be edited before final (status %)', v_match.status;
  end if;
  -- segments (full-state replace)
  delete from match_segments where match_id = p_match_id;
  for v_seg in select * from jsonb_array_elements(coalesce(p_payload->'segments', '[]'::jsonb)) loop
    insert into match_segments(match_id, segment_no, kind, status)
    values (p_match_id, (v_seg->>'segment_no')::int, coalesce(v_seg->>'kind','set'), coalesce(v_seg->>'status','open'));
    for v_key, v_val in select k, v::int from jsonb_each_text(v_seg->'scores') as t(k, v) loop
      select id into v_slot_id from match_slots where match_id = p_match_id and slot_no = v_key::int;
      insert into segment_scores(segment_id, slot_id, points)
      select ms.id, v_slot_id, v_val from match_segments ms
      where ms.match_id = p_match_id and ms.segment_no = (v_seg->>'segment_no')::int;
    end loop;
  end loop;
  -- totals (simple kind)
  if p_payload ? 'totals' and p_payload->'totals' is not null then
    delete from match_totals where match_id = p_match_id;
    for v_key, v_val in select k, v::int from jsonb_each_text(p_payload->'totals') as t(k, v) loop
      select id into v_slot_id from match_slots where match_id = p_match_id and slot_no = v_key::int;
      insert into match_totals(match_id, slot_id, points) values (p_match_id, v_slot_id, v_val);
    end loop;
  end if;
  -- placements
  if p_payload ? 'placements' and p_payload->'placements' is not null then
    delete from placement_results where match_id = p_match_id;
    for v_seg in select * from jsonb_array_elements(p_payload->'placements') loop
      select id into v_slot_id from match_slots where match_id = p_match_id and slot_no = (v_seg->>'slot_no')::int;
      insert into placement_results(match_id, slot_id, place, finish, note)
      values (p_match_id, v_slot_id, (v_seg->>'place')::int,
              coalesce((v_seg->>'finish')::finish_status, 'finished'), v_seg->>'note');
    end loop;
  end if;
  update matches set revision = revision + 1 where id = p_match_id returning * into v_match;
  perform _emit_update(_event_of_division(v_match.division_id), array[p_match_id], array[v_match.division_id], array['scores']);
  return jsonb_build_object('ok', true, 'revision', v_match.revision);
end $$;

create or replace function set_match_status(p_match_id uuid, p_status match_status,
  p_outcome text default null, p_winner_entry_id uuid default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sport uuid; v_match matches%rowtype; v_kind scoring_kind; v_winner uuid; v_draw boolean; v_event uuid;
begin
  v_sport := _assert_match_writer(p_match_id);
  select * into v_match from matches where id = p_match_id for update;
  v_event := _event_of_division(v_match.division_id);
  select scoring_kind into v_kind from divisions where id = v_match.division_id;

  if p_status = 'live' then
    if v_match.status <> 'scheduled' then raise exception 'only a scheduled match can start'; end if;
    if exists (select 1 from match_slots where match_id = p_match_id and effective_entry_id(match_slots) is null)
       and v_kind <> 'placement_only' then
      raise exception 'both contestants must be resolved before starting';
    end if;
    update match_slots set frozen_entry_id = effective_entry_id(match_slots)
     where match_id = p_match_id;
    update matches set status = 'live', revision = revision + 1 where id = p_match_id;
  elsif p_status = 'final' then
    if v_match.status <> 'live' then raise exception 'only a live match can be finalized'; end if;
    if p_outcome = 'forfeit' then
      if p_winner_entry_id is null then raise exception 'forfeit requires a winner'; end if;
      v_winner := p_winner_entry_id; v_draw := false;
    else
      select winner, is_draw into v_winner, v_draw from _computed_winner(p_match_id);
      if v_kind in ('set_based','simple') and v_winner is null and not v_draw then
        raise exception 'no winner determined by the current scores';
      end if;
      if v_kind = 'simple' and v_draw and p_outcome is distinct from 'draw' then
        raise exception 'scores are tied; pass outcome=draw if draws are allowed';
      end if;
      if v_kind = 'placement_only' and exists (
        select 1 from match_slots sl where sl.match_id = p_match_id
          and not exists (select 1 from placement_results pr where pr.match_id = p_match_id and pr.slot_id = sl.id)) then
        raise exception 'every entrant needs a placement result before final';
      end if;
    end if;
    update matches set status = 'final', winner_entry_id = v_winner,
      outcome = case when p_outcome = 'forfeit' then 'forfeit' when v_draw then 'draw' else 'win' end,
      result_reason = p_reason, finalized_at = now(), revision = revision + 1
     where id = p_match_id;
    perform _propagate_from_match(p_match_id);
    perform _propagate_group_ranks(v_match.division_id);
    perform _propose_awards(p_match_id);
  elsif p_status = 'scheduled' then
    -- reopen / correction path: admin only; invalidity propagates (SPEC §7)
    if not is_admin() then raise exception 'only an admin can reopen a final match' using errcode = '42501'; end if;
    if v_match.status <> 'final' then raise exception 'only a final match can be reopened'; end if;
    update matches set status = 'scheduled', winner_entry_id = null, outcome = null,
      finalized_at = null, needs_review = false, revision = revision + 1 where id = p_match_id;
    perform _propagate_from_match(p_match_id);
    perform _propagate_group_ranks(v_match.division_id);
    -- awards derived from this match revert to review (excluded from tally via state change)
    update division_results set state = 'void'
     where source_match_id = p_match_id and state in ('draft','confirmed');
    perform _audit(v_event, v_sport, 'match.reopen', 'match', p_match_id,
      jsonb_build_object('status','final'), jsonb_build_object('status','scheduled'), p_reason);
  elsif p_status = 'cancelled' then
    if v_match.status = 'final' and not is_admin() then
      raise exception 'only an admin can cancel a final match' using errcode = '42501';
    end if;
    update matches set status = 'cancelled', revision = revision + 1 where id = p_match_id;
    perform _propagate_from_match(p_match_id);
  end if;
  perform _emit_update(v_event, array[p_match_id], array[v_match.division_id], array['status']);
  select * into v_match from matches where id = p_match_id;
  return jsonb_build_object('ok', true, 'revision', v_match.revision, 'status', v_match.status);
end $$;

create or replace function request_correction(p_match_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_match matches%rowtype;
begin
  perform _assert_match_writer(p_match_id);
  update matches set needs_review = true, revision = revision + 1
   where id = p_match_id and status = 'final' returning * into v_match;
  if v_match.id is null then raise exception 'only a final match can be flagged for correction'; end if;
  -- a needs_review source is unusable (SPEC §7): unstarted dependents lose resolution,
  -- started/final dependents are flagged by the propagators.
  perform _propagate_from_match(p_match_id);
  perform _propagate_group_ranks(v_match.division_id);
  perform _audit(_event_of_division(v_match.division_id), match_sport_id(p_match_id),
    'match.correction_requested', 'match', p_match_id, null, null, p_reason);
  perform _emit_update(_event_of_division(v_match.division_id), array[p_match_id], array[v_match.division_id], array['review']);
  return jsonb_build_object('ok', true);
end $$;

create or replace function reset_match(p_match_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_match matches%rowtype;
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into v_match from matches where id = p_match_id;
  -- mandatory descendant closure: matches whose slots depend on this one, transitively
  with recursive closure(id) as (
    select p_match_id
    union
    select distinct sl.match_id from match_slots sl join closure c on sl.source_match_id = c.id
  )
  select array_agg(id) into v_ids from closure;
  delete from match_segments where match_id = any(v_ids);
  delete from match_totals where match_id = any(v_ids);
  delete from placement_results where match_id = any(v_ids);
  update match_slots set frozen_entry_id = null
   where match_id = any(v_ids) and match_id <> p_match_id;
  update match_slots set resolved_entry_id = null
   where source_match_id = any(v_ids) and match_id = any(v_ids);
  update matches set status = 'scheduled', winner_entry_id = null, outcome = null,
    finalized_at = null, needs_review = false, revision = revision + 1
   where id = any(v_ids);
  update division_results set state = 'void' where source_match_id = any(v_ids) and state <> 'void';
  perform _audit(_event_of_division(v_match.division_id), match_sport_id(p_match_id),
    'match.reset_closure', 'match', p_match_id, null,
    jsonb_build_object('affected', v_ids), p_reason);
  perform _emit_update(_event_of_division(v_match.division_id), v_ids, array[v_match.division_id], array['reset']);
  return jsonb_build_object('ok', true, 'affected', v_ids);
end $$;

-- ============================== awards ==============================
create or replace function confirm_awards(p_division_id uuid, p_awards jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sport uuid; a jsonb;
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  v_sport := division_sport_id(p_division_id);
  update division_results set state = 'void' where division_id = p_division_id and state = 'confirmed';
  delete from division_results where division_id = p_division_id and state = 'draft';
  for a in select * from jsonb_array_elements(p_awards) loop
    insert into division_results(division_id, award_key, medal, entry_id, state, source, source_match_id, reason, confirmed_by, confirmed_at)
    values (p_division_id, a->>'award_key', a->>'medal', (a->>'entry_id')::uuid, 'confirmed',
            coalesce(a->>'source', 'manual'), (a->>'source_match_id')::uuid, a->>'reason', auth.uid(), now());
  end loop;
  perform _audit(_event_of_division(p_division_id), v_sport, 'awards.confirm', 'division', p_division_id, null, p_awards, null);
  perform _emit_update(_event_of_division(p_division_id), '{}', array[p_division_id], array['awards']);
  return jsonb_build_object('ok', true);
end $$;

-- ============================== §11 conflicts ==============================
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

  -- player clashes: same player, overlapping other fixture, event-wide
  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_players from (
    select distinct jsonb_build_object(
      'player_id', pl.id, 'player_name', pl.full_name,
      'other_match_id', om.id, 'other_label', om.label,
      'other_sport', os.name, 'other_starts_at', om.starts_at,
      'other_ends_at', om.starts_at + make_interval(mins => coalesce(om.duration_minutes, os.default_duration_minutes))
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

  -- venue clashes
  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_venues from (
    select jsonb_build_object(
      'venue_id', p_venue_id, 'venue_name', vn.name,
      'other_match_id', om.id, 'other_label', om.label,
      'other_sport', os.name, 'other_starts_at', om.starts_at,
      'other_ends_at', om.starts_at + make_interval(mins => coalesce(om.duration_minutes, os.default_duration_minutes))
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

create or replace function _conflict_hash(p_canonical text, p_conflicts jsonb) returns text
language sql security definer set search_path = public as $$
  select encode(sha256(convert_to(p_canonical || '|' ||
    (select coalesce(string_agg(k, ',' order by k), '') from (
      select (c->>'player_id') || '@' || (c->>'other_match_id') as k from jsonb_array_elements(p_conflicts->'playerClashes') c
      union all
      select 'venue@' || (c->>'other_match_id') from jsonb_array_elements(p_conflicts->'venueClashes') c
      union all
      select 'inc:' || i from jsonb_array_elements_text(p_conflicts->'incomplete') i
    ) q), 'UTF8')), 'hex')
$$;

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
  if (jsonb_array_length(v_conflicts->'playerClashes') > 0 or jsonb_array_length(v_conflicts->'venueClashes') > 0
      or jsonb_array_length(v_conflicts->'incomplete') > 0)
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
  return jsonb_build_object('status', 'ok', 'match_id', v_match_id);
end $$;

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
  if (jsonb_array_length(v_conflicts->'playerClashes') > 0 or jsonb_array_length(v_conflicts->'venueClashes') > 0
      or jsonb_array_length(v_conflicts->'incomplete') > 0)
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
  return jsonb_build_object('status', 'ok', 'match_id', p_match_id);
end $$;

create or replace function list_conflicts() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_admin boolean := is_admin(); v_mine uuid := my_sport_id(); v_event uuid;
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
      and (v_admin or sa.id = v_mine or sb.id = v_mine)
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
      and (v_admin or sa.id = v_mine or sb.id = v_mine)
  ) q);
end $$;

-- ============================== grants ==============================
revoke execute on function _event_of_division(uuid), _assert_match_writer(uuid), _audit(uuid,uuid,text,text,uuid,jsonb,jsonb,text),
  _public_patch(uuid[]), _emit_update(uuid,uuid[],uuid[],text[]), _computed_winner(uuid),
  _propose_awards(uuid), _propagate_from_match(uuid), _propagate_group_ranks(uuid),
  _check_conflicts(uuid,uuid,uuid,timestamptz,int,uuid,uuid[]), _conflict_hash(text,jsonb)
  from public, anon, authenticated;
grant execute on function save_score(uuid,int,jsonb), set_match_status(uuid,match_status,text,uuid,text),
  request_correction(uuid,text), reset_match(uuid,text), confirm_awards(uuid,jsonb),
  create_fixture(uuid,text,match_stage,uuid,timestamptz,int,uuid,text,uuid[],text),
  update_fixture(uuid,timestamptz,int,uuid,text,text,text), list_conflicts()
  to authenticated;
