-- PGLUlympics — migration 3: derived read models + public projections — SPEC §1.2, §2
-- Views run with owner privileges (standard Supabase projection pattern): anon gets these
-- sanitized shapes only, never the base tables.

-- ---------- group standings (derived from FINAL valid round-robin matches only) ----------
create or replace view group_standings as
with rr as (
  select m.id as match_id, m.division_id, m.winner_entry_id, m.outcome
  from matches m
  where m.stage = 'round_robin' and m.status = 'final' and not m.needs_review
),
parts as (
  select rr.match_id, rr.division_id, effective_entry_id(s) as entry_id, s.id as slot_id,
         rr.winner_entry_id, rr.outcome
  from rr join match_slots s on s.match_id = rr.match_id
  where effective_entry_id(s) is not null
),
seg as (
  select p.entry_id,
    sum(case when ss.points > os.points then 1 else 0 end)::int as sets_won,
    sum(case when ss.points < os.points then 1 else 0 end)::int as sets_lost,
    sum(ss.points)::int as pts_for,
    sum(os.points)::int as pts_against
  from parts p
  join match_segments ms on ms.match_id = p.match_id and ms.status = 'closed'
  join segment_scores ss on ss.segment_id = ms.id and ss.slot_id = p.slot_id
  join match_slots osl on osl.match_id = p.match_id and osl.id <> p.slot_id
  join segment_scores os on os.segment_id = ms.id and os.slot_id = osl.id
  group by p.entry_id
)
select e.id as entry_id, e.division_id, e.group_id, e.team_id, t.name as team_name,
  d.standings_config,
  count(p.match_id)::int as played,
  count(p.match_id) filter (where p.winner_entry_id = e.id)::int as wins,
  count(p.match_id) filter (where p.outcome = 'draw')::int as draws,
  count(p.match_id) filter (where p.winner_entry_id is not null and p.winner_entry_id <> e.id)::int as losses,
  case when count(p.match_id) > 0
       then round(100.0 * count(p.match_id) filter (where p.winner_entry_id = e.id) / count(p.match_id), 1)
       else 0 end as win_pct,
  (count(p.match_id) filter (where p.winner_entry_id = e.id)) * coalesce((d.standings_config->'standings_points'->>'win')::int, 3)
  + (count(p.match_id) filter (where p.outcome = 'draw')) * coalesce((d.standings_config->'standings_points'->>'draw')::int, 1)
  as standings_points,
  coalesce(max(seg.sets_won), 0) as sets_won,
  coalesce(max(seg.sets_lost), 0) as sets_lost,
  coalesce(max(seg.pts_for), 0) as points_for,
  coalesce(max(seg.pts_against), 0) as points_against
from division_entries e
join teams t on t.id = e.team_id
join divisions d on d.id = e.division_id
left join parts p on p.entry_id = e.id
left join seg on seg.entry_id = e.id
where e.active
group by e.id, e.division_id, e.group_id, e.team_id, t.name, d.standings_config;

-- ---------- overall medal tally (CONFIRMED awards only) ----------
create or replace view overall_tally as
with agg as (
  select t.id as team_id, t.name as team_name, t.color, t.display_order, t.event_id,
    count(r.id) filter (where r.medal = 'gold')::int as gold,
    count(r.id) filter (where r.medal = 'silver')::int as silver,
    count(r.id) filter (where r.medal = 'bronze')::int as bronze,
    (count(r.id) filter (where r.medal = 'gold') * ev.gold_points
     + count(r.id) filter (where r.medal = 'silver') * ev.silver_points
     + count(r.id) filter (where r.medal = 'bronze') * ev.bronze_points)::int as points,
    ev.points_provisional
  from teams t
  join events ev on ev.id = t.event_id
  left join division_entries e on e.team_id = t.id
  left join division_results r on r.entry_id = e.id and r.state = 'confirmed'
  group by t.id, t.name, t.color, t.display_order, t.event_id, ev.gold_points, ev.silver_points, ev.bronze_points, ev.points_provisional
)
select *, rank() over (order by points desc, gold desc, silver desc, bronze desc, team_name) as rank
from agg;

-- ---------- public projections ----------
create or replace view public_divisions as
select d.id, d.sport_id, d.name, d.slug, d.scoring_kind, d.display_order,
       s.name as sport_name, s.slug as sport_slug
from divisions d join sports s on s.id = d.sport_id
where d.published and s.published;

create or replace view public_match_cards as
select m.id as match_id, m.division_id, d.name as division_name, d.slug as division_slug,
       d.scoring_kind, s.id as sport_id, s.name as sport_name, s.slug as sport_slug,
       g.name as group_name, m.stage, m.status, m.label, m.starts_at,
       coalesce(v.name, m.venue_text) as venue,
       m.winner_entry_id,
       wt.name as winner_team_name,
       s1.entry_id as slot1_entry_id, s1.team_name as slot1_team, s1.sets_won as slot1_sets, s1.total_points as slot1_points, s1.current_points as slot1_current,
       s2.entry_id as slot2_entry_id, s2.team_name as slot2_team, s2.sets_won as slot2_sets, s2.total_points as slot2_points, s2.current_points as slot2_current,
       m.display_order
from matches m
join divisions d on d.id = m.division_id
join sports s on s.id = d.sport_id
left join groups g on g.id = m.group_id
left join venues v on v.id = m.venue_id
left join division_entries we on we.id = m.winner_entry_id
left join teams wt on wt.id = we.team_id
left join lateral (
  select effective_entry_id(sl) as entry_id, t.name as team_name,
    (select count(*) from match_segments ms
       join segment_scores a on a.segment_id = ms.id and a.slot_id = sl.id
       join segment_scores b on b.segment_id = ms.id and b.slot_id <> sl.id
      where ms.match_id = m.id and ms.status = 'closed' and a.points > b.points)::int as sets_won,
    coalesce((select points from match_totals mt where mt.match_id = m.id and mt.slot_id = sl.id),
             (select sum(a.points) from match_segments ms join segment_scores a on a.segment_id = ms.id and a.slot_id = sl.id
               where ms.match_id = m.id and ms.status = 'closed'), 0)::int as total_points,
    (select a.points from match_segments ms join segment_scores a on a.segment_id = ms.id and a.slot_id = sl.id
      where ms.match_id = m.id and ms.status = 'open' order by ms.segment_no desc limit 1) as current_points
  from match_slots sl
  left join division_entries e on e.id = effective_entry_id(sl)
  left join teams t on t.id = e.team_id
  where sl.match_id = m.id and sl.slot_no = 1
) s1 on true
left join lateral (
  select effective_entry_id(sl) as entry_id, t.name as team_name,
    (select count(*) from match_segments ms
       join segment_scores a on a.segment_id = ms.id and a.slot_id = sl.id
       join segment_scores b on b.segment_id = ms.id and b.slot_id <> sl.id
      where ms.match_id = m.id and ms.status = 'closed' and a.points > b.points)::int as sets_won,
    coalesce((select points from match_totals mt where mt.match_id = m.id and mt.slot_id = sl.id),
             (select sum(a.points) from match_segments ms join segment_scores a on a.segment_id = ms.id and a.slot_id = sl.id
               where ms.match_id = m.id and ms.status = 'closed'), 0)::int as total_points,
    (select a.points from match_segments ms join segment_scores a on a.segment_id = ms.id and a.slot_id = sl.id
      where ms.match_id = m.id and ms.status = 'open' order by ms.segment_no desc limit 1) as current_points
  from match_slots sl
  left join division_entries e on e.id = effective_entry_id(sl)
  left join teams t on t.id = e.team_id
  where sl.match_id = m.id and sl.slot_no = 2
) s2 on true
where m.published and d.published and s.published;

create or replace view public_segment_scores as
select ms.match_id, ms.segment_no, ms.kind, ms.status,
       sl.slot_no, ss.points, t.name as team_name
from match_segments ms
join segment_scores ss on ss.segment_id = ms.id
join match_slots sl on sl.id = ss.slot_id
join matches m on m.id = ms.match_id and m.published
left join division_entries e on e.id = effective_entry_id(sl)
left join teams t on t.id = e.team_id;

create or replace view public_results as
select r.division_id, d.name as division_name, s.name as sport_name, s.slug as sport_slug,
       r.award_key, r.medal, t.name as team_name, r.entry_id
from division_results r
join divisions d on d.id = r.division_id and d.published
join sports s on s.id = d.sport_id and s.published
join division_entries e on e.id = r.entry_id
join teams t on t.id = e.team_id
where r.state = 'confirmed';

grant select on group_standings, overall_tally, public_divisions, public_match_cards,
  public_segment_scores, public_results to anon, authenticated;
