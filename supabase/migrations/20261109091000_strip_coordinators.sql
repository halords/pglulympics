-- Migration 16: strip team coordinators from all rosters
-- User decision 2026-11-09: coordinators are not players — remove every roster
-- membership created for them by the migration 15 workbook import, including
-- their entries inside event blocks (not just the coordinator block, which was
-- never imported). Deletes the player records too once they hold no memberships.
-- Idempotent: safe to re-run.

delete from roster_memberships rm
using division_entries de, divisions d, sports s, teams t, players p, events e
where rm.entry_id = de.id
  and de.division_id = d.id and d.sport_id = s.id
  and de.team_id = t.id
  and rm.player_id = p.id and p.event_id = e.id and e.slug = 'pglulympics-2026'
  and (t.slug, s.slug, d.slug, lower(p.full_name)) in (values
  ('agkaysa-fource', 'badminton', '40-girls', 'jonalyn o. saranquin'),
  ('code-red', 'laro-ng-lahi', 'tumbang-preso', 'jamie rose n. mifa'),
  ('eco-agkaysa', 'laro-ng-lahi', 'sack-race', 'kyril raccine c. salanga'),
  ('economix', 'laro-ng-lahi', 'kadang-kadang', 'kyla cyrine r. avelino'),
  ('economix', 'laro-ng-lahi', 'sack-race', 'kyla cyrine r. avelino'),
  ('pdrrmo-hazard-breakers', 'athletics', '200-boys', 'derrick wesley o. atijera'),
  ('pdrrmo-hazard-breakers', 'athletics', '4x100-mixed', 'derrick wesley o. atijera'),
  ('pdrrmo-hazard-breakers', 'athletics', '800-boys', 'derrick wesley o. atijera'),
  ('pdrrmo-hazard-breakers', 'basketball', 'mens', 'derrick wesley o. atijera'),
  ('pdrrmo-hazard-breakers', 'laro-ng-lahi', 'tumbang-preso', 'derrick wesley o. atijera'),
  ('pdrrmo-hazard-breakers', 'pickleball', '39-boys', 'derrick wesley o. atijera'),
  ('team-4-midable', 'mobile-games', 'ml', 'kim han piell p. carmelo'),
  ('team-4-midable', 'pickleball', 'executive-boys', 'kim han piell p. carmelo')
  );

delete from players p
using events e
where p.event_id = e.id and e.slug = 'pglulympics-2026'
  and lower(p.full_name) in (values
  ('derrick wesley o. atijera'),
  ('jamie rose n. mifa'),
  ('jonalyn o. saranquin'),
  ('kim han piell p. carmelo'),
  ('kyla cyrine r. avelino'),
  ('kyril raccine c. salanga')
  )
  and not exists (select 1 from roster_memberships rm where rm.player_id = p.id);
