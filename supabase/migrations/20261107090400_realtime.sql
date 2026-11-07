-- PGLUlympics — migration 5: Realtime publication for the public outbox — SPEC §3.2
-- event_updates rows are public-safe by contract; anon holds SELECT via RLS (migration 2),
-- which is what authorizes anonymous Postgres Changes subscriptions.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table event_updates;
  end if;
exception when duplicate_object then
  null; -- already in the publication
end $$;

alter table event_updates replica identity full;
