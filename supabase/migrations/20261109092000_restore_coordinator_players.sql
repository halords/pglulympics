-- Migration 17: restore coordinators who ARE registered as players
-- Sheet check (user request, 2026-11-09): the workbook itself shows these six
-- coordinators registered in event blocks with player data — waiver/medical
-- "Fit to participate" clearances (Mifa, Carmelo, Saranquin, Avelino) and full
-- player rows (Atijera x6, Salanga x1). Migration 16's strip rested on a
-- blanket premise the sheet contradicts; per the user's condition ("remove
-- them only if they're not playing") the 13 memberships are restored.
-- Idempotent: safe to re-run.

insert into players(event_id, full_name)
select e.id, v.full_name from (values
  ('Derrick Wesley O. Atijera'),
  ('Jamie Rose N. Mifa'),
  ('Jonalyn O. Saranquin'),
  ('Kim Han Piell P. Carmelo'),
  ('Kyla Cyrine R. Avelino'),
  ('Kyril Raccine C. Salanga')
) v(full_name) cross join events e
where e.slug = 'pglulympics-2026'
  and not exists (select 1 from players p where p.event_id = e.id and lower(p.full_name) = lower(v.full_name));

insert into roster_memberships(entry_id, player_id)
select de.id, p.id from (values
  ('athletics', '200-boys', 'pdrrmo-hazard-breakers', 'Derrick Wesley O. Atijera'),
  ('athletics', '4x100-mixed', 'pdrrmo-hazard-breakers', 'Derrick Wesley O. Atijera'),
  ('athletics', '800-boys', 'pdrrmo-hazard-breakers', 'Derrick Wesley O. Atijera'),
  ('badminton', '40-girls', 'agkaysa-fource', 'Jonalyn O. Saranquin'),
  ('basketball', 'mens', 'pdrrmo-hazard-breakers', 'Derrick Wesley O. Atijera'),
  ('laro-ng-lahi', 'kadang-kadang', 'economix', 'Kyla Cyrine R. Avelino'),
  ('laro-ng-lahi', 'sack-race', 'eco-agkaysa', 'Kyril Raccine C. Salanga'),
  ('laro-ng-lahi', 'sack-race', 'economix', 'Kyla Cyrine R. Avelino'),
  ('laro-ng-lahi', 'tumbang-preso', 'code-red', 'Jamie Rose N. Mifa'),
  ('laro-ng-lahi', 'tumbang-preso', 'pdrrmo-hazard-breakers', 'Derrick Wesley O. Atijera'),
  ('mobile-games', 'ml', 'team-4-midable', 'Kim Han Piell P. Carmelo'),
  ('pickleball', '39-boys', 'pdrrmo-hazard-breakers', 'Derrick Wesley O. Atijera'),
  ('pickleball', 'executive-boys', 'team-4-midable', 'Kim Han Piell P. Carmelo')
) v(sport_slug, division_slug, team_slug, full_name)
join sports s on s.slug = v.sport_slug
join divisions d on d.sport_id = s.id and d.slug = v.division_slug
join teams t on t.slug = v.team_slug
join division_entries de on de.division_id = d.id and de.team_id = t.id
join events e on e.slug = 'pglulympics-2026'
join players p on p.event_id = e.id and lower(p.full_name) = lower(v.full_name)
on conflict do nothing;
