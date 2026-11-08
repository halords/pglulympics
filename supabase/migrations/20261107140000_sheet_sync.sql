-- PGLUlympics — migration 11: sheet sync (user request 2026-11-08)
-- The portal can fold changes from the organizers' source workbook
-- ("Game Tracker PGLU Olympics.xlsx") into the database via a MANUAL,
-- super-admin-triggered sync (Admin → Sheet sync → "Sync now"). There is
-- NO automatic polling (user decision 2026-11-08 — cancelled).
--
-- This migration adds:
--   1. sheet_sync_log — one row per applied/skipped change per run, plus a
--      run_summary row. Written ONLY by the sync engine via the service
--      role; readable by super-admins (the Admin panel). The engine
--      degrades gracefully while this table is missing: it applies changes
--      and keeps the log in the run response only.
--   2. _assert_match_writer learns the service_role: the sync engine
--      drives the existing command RPCs (update_fixture / save_score /
--      set_match_status) with the service key so propagation, award
--      drafts and realtime emission behave exactly like coordinator
--      edits. The engine itself only ever runs behind the super-admin
--      session gate (/api/admin/sheet-sync). Until this migration lands,
--      those RPC calls raise 42501 and the engine logs them as failed
--      changes — reads, parsing and the log table path are unaffected.
-- Idempotent: safe to re-run.

-- ---------- 1. sync log ----------
create table if not exists sheet_sync_log (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  created_at timestamptz not null default now(),
  kind text not null check (kind in
    ('fixture_schedule','fixture_result','placement','entry',
     'conflict_skip','unmatched','run_summary')),
  fixture_id uuid references matches(id) on delete set null,
  division_id uuid references divisions(id) on delete set null,
  field text,
  old_value text,
  new_value text,
  source_ref text,
  detail text
);
create index if not exists idx_sheet_sync_log_created on sheet_sync_log(created_at desc);
create index if not exists idx_sheet_sync_log_run on sheet_sync_log(run_id);

alter table sheet_sync_log enable row level security;
drop policy if exists admin_read_sync_log on sheet_sync_log;
create policy admin_read_sync_log on sheet_sync_log for select to authenticated
  using (is_admin());
-- no insert/update/delete policies: writes are service-role only (the
-- engine), which bypasses RLS; anon gets nothing.
revoke all on sheet_sync_log from anon;
grant select on sheet_sync_log to authenticated;

-- ---------- 2. service-role write path for the sync engine ----------
create or replace function _assert_match_writer(p_match_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_sport uuid;
begin
  v_sport := match_sport_id(p_match_id);
  if v_sport is null then raise exception 'match not found'; end if;
  -- service_role: the server-side sheet-sync engine (super-admin gated at
  -- the API route). auth.role() is the PostgREST JWT role claim.
  if auth.role() = 'service_role' then return v_sport; end if;
  if not (is_admin() or coordinates_sport(v_sport)) then
    raise exception 'not authorized to score this match' using errcode = '42501';
  end if;
  return v_sport;
end $$;
