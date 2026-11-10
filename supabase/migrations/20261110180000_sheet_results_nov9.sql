-- Migration 18 — Game Tracker sheet results for Mon Nov 9, 2026 + volleyball venue move.
-- Source: "Game Tracker PGLU Olympics" workbook (the organizers' scoresheet), read live
-- 2026-11-10 on the user's directive ("check if there are updates on the scores — update
-- the portal"). The portal had NONE of Monday's results; the sheet had all 10 matches.
--
-- Basketball (simple scoring): finals written as match_totals, exactly the end state of
-- save_score + set_match_status('final'). Winner is resolved through the app's own
-- _computed_winner so the portal can never disagree with its own rules.
-- Volleyball (set_based): the sheet records SETS WON only (no rally points, no set
-- order). Segments therefore encode set wins as 1-0 closed sets — the same
-- representation the portal's series scorer uses for Mobile Games — so the computed
-- sets total, the winner (best-of-3, needs 2), and the public totals all match the
-- sheet exactly (1-2, 0-2, 0-2, 2-0). Slot-1 set wins are written first.
-- Venue: the sheet moved ALL round-robin volleyball on Nov 11/16/18/23 from
-- DMMMSU Covered Court to Brgy Lubing Covered Court (Nov 25 semis / Nov 26 finals
-- stay at DMMMSU). Applied to scheduled matches only.
-- All blocks are guarded on status='scheduled' so a re-run is a no-op. Round-robin
-- finals propose no medal awards (stage is round_robin); _propose_awards is still
-- called to mirror the normal finalize path exactly.

-- ---------- 1. Venue: Brgy Lubing Covered Court ----------
insert into venues (event_id, name)
select id, 'Brgy Lubing Covered Court' from events where slug = 'pglulympics-2026'
on conflict (event_id, name) do nothing;

update matches m
   set venue_id = v.id, venue_text = null, revision = m.revision + 1, updated_at = now()
  from divisions d, sports sp, venues v, events e
 where m.division_id = d.id
   and d.sport_id = sp.id and sp.slug = 'volleyball'
   and v.event_id = e.id and e.slug = 'pglulympics-2026'
   and v.name = 'Brgy Lubing Covered Court'
   and m.status = 'scheduled'
   and (m.starts_at at time zone 'Asia/Manila')::date
       in (date '2026-11-11', date '2026-11-16', date '2026-11-18', date '2026-11-23');

-- ---------- 2. Basketball finals (Nov 9) ----------
with results (division_name, label, t1, t2) as (values
    ('Women''s', 'Match 1', 5, 1),    -- TEAM 4-MIDABLE def. CODE RED (score as recorded in the sheet)
    ('Men''s',   'Match 2', 61, 76),  -- THE CODE BLUES def. AGKAYSA GUARDians
    ('Men''s',   'Match 3', 62, 78),  -- ECO-AGKAYSA def. CODE RED
    ('Women''s', 'Match 4', 2, 17),   -- THE CODE BLUES def. Agkaysa FOURce (score as recorded)
    ('Men''s',   'Match 5', 63, 55),  -- TRIFORCE BANNUARS def. Agkaysa FOURce
    ('Men''s',   'Match 6', 69, 77)   -- ELYUNITED HEALTH WARRIORS def. TEAM 4-MIDABLE
  ),
  target as (
    select m.id as match_id, r.t1, r.t2
      from matches m
      join divisions d on d.id = m.division_id
      join sports sp on sp.id = d.sport_id
      join results r on r.division_name = d.name and r.label = m.label
     where sp.slug = 'basketball'
       and m.status = 'scheduled'
       and (m.starts_at at time zone 'Asia/Manila')::date = date '2026-11-09'
  ),
  frozen as (
    update match_slots sl
       set frozen_entry_id = effective_entry_id(sl)
      from target t
     where sl.match_id = t.match_id
    returning sl.id
  )
insert into match_totals (match_id, slot_id, points)
select t.match_id, sl.id, case when sl.slot_no = 1 then t.t1 else t.t2 end
  from target t
  join match_slots sl on sl.match_id = t.match_id;

-- finalize in a SEPARATE statement: _computed_winner must see the totals
-- committed by the statement above (data-modifying CTEs share one snapshot,
-- so folding this update into the same statement resolves winners as 0-0).
update matches m
   set status = 'final', outcome = 'win', finalized_at = now(),
       revision = m.revision + 3, updated_at = now(),
       winner_entry_id = (select cw.winner from _computed_winner(m.id) cw)
 where m.status = 'scheduled'
   and (m.starts_at at time zone 'Asia/Manila')::date = date '2026-11-09'
   and exists (
     select 1 from match_totals mt where mt.match_id = m.id
   );

-- ---------- 3. Volleyball finals (Nov 9) ----------
with results (division_name, label, s1, s2) as (values
    ('Men''s',   '1', 1, 2),  -- THE CODE BLUES def. CODE RED (sets)
    ('Men''s',   '2', 0, 2),  -- TRIFORCE BANNUARS def. ELYUNITED HEALTH WARRIORS (sets)
    ('Women''s', '1', 0, 2),  -- THE CODE BLUES def. CODE RED (sets)
    ('Women''s', '2', 2, 0)   -- ELYUNITED HEALTH WARRIORS def. TRIFORCE BANNUARS (sets)
  ),
  target as (
    select m.id as match_id, r.s1, r.s2
      from matches m
      join divisions d on d.id = m.division_id
      join sports sp on sp.id = d.sport_id
      join results r on r.division_name = d.name and r.label = m.label
     where sp.slug = 'volleyball'
       and m.status = 'scheduled'
       and (m.starts_at at time zone 'Asia/Manila')::date = date '2026-11-09'
  ),
  frozen as (
    update match_slots sl
       set frozen_entry_id = effective_entry_id(sl)
      from target t
     where sl.match_id = t.match_id
    returning sl.id
  ),
  segs as (
    -- one closed 1-0 segment per set won; slot 1's sets first
    insert into match_segments (match_id, segment_no, kind, status)
    select t.match_id, g.n, 'set', 'closed'
      from target t
      cross join lateral (
        select row_number() over () as n,
               case when g2.k <= t.s1 then 1 else 2 end as winner_slot
          from generate_series(1, t.s1 + t.s2) as g2(k)
      ) g
    returning match_id, segment_no, id
  ),
  segmap as (
    select s.id as segment_id, s.match_id, s.segment_no,
           case when g.k <= t.s1 then 1 else 2 end as winner_slot
      from segs s
      join target t on t.match_id = s.match_id
      cross join lateral generate_series(1, t.s1 + t.s2) as g(k)
     where g.k = s.segment_no
  )
insert into segment_scores (segment_id, slot_id, points)
select sm.segment_id, sl.id,
       case when sl.slot_no = sm.winner_slot then 1 else 0 end
  from segmap sm
  join match_slots sl on sl.match_id = sm.match_id;

update matches m
   set status = 'final', outcome = 'win', finalized_at = now(),
       revision = m.revision + 3, updated_at = now(),
       winner_entry_id = (select cw.winner from _computed_winner(m.id) cw)
 where m.id in (
    select m2.id
      from matches m2
      join divisions d on d.id = m2.division_id
      join sports sp on sp.id = d.sport_id
     where sp.slug = 'volleyball'
       and m2.status = 'scheduled'
       and (m2.starts_at at time zone 'Asia/Manila')::date = date '2026-11-09'
       and exists (select 1 from match_segments ms where ms.match_id = m2.id)
  );

-- ---------- 4. Finalize side effects (mirror set_match_status('final')) ----------
do $$
declare r record;
begin
  for r in
    select m.id, m.division_id
      from matches m
     where m.status = 'final'
       and (m.starts_at at time zone 'Asia/Manila')::date = date '2026-11-09'
  loop
    perform _propagate_from_match(r.id);
    perform _propose_awards(r.id);
  end loop;
  for r in
    select distinct m.division_id
      from matches m
     where m.status = 'final'
       and (m.starts_at at time zone 'Asia/Manila')::date = date '2026-11-09'
  loop
    perform _propagate_group_ranks(r.division_id);
  end loop;
end $$;
