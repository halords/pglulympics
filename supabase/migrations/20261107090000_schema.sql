-- PGLUlympics — migration 1: schema (all tables, enums, indexes, domain triggers)
-- Spec: SPEC.md §1, §11.2. All structure lands here; RLS in migration 2, views 3, RPCs 4, realtime 5, data 6.

create extension if not exists pgcrypto;

create type match_status as enum ('scheduled','live','final','cancelled');
create type match_stage as enum ('round_robin','semifinal','bronze','gold','placement');
create type scoring_kind as enum ('set_based','simple','placement_only');
create type award_state as enum ('draft','confirmed','void');
create type roster_status as enum ('unknown','verified');
create type slot_source as enum ('entry','group_rank','match_outcome');
create type finish_status as enum ('finished','dnf','dns','dq');

create table events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  organizer text,
  start_date date not null,
  end_date date not null,
  timezone text not null default 'Asia/Manila',
  gold_points int not null default 5 check (gold_points >= 0),
  silver_points int not null default 3 check (silver_points >= 0),
  bronze_points int not null default 1 check (bronze_points >= 0),
  points_provisional boolean not null default true,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete restrict,
  name text not null,
  slug text not null,
  color text,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, slug)
);

create table sports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete restrict,
  name text not null,
  slug text not null,
  icon_key text,
  display_order int not null default 0,
  default_duration_minutes int not null default 60 check (default_duration_minutes > 0),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, slug)
);

create table divisions (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references sports(id) on delete restrict,
  name text not null,
  slug text not null,
  scoring_kind scoring_kind not null,
  scoring_config jsonb not null default '{}',
  standings_config jsonb not null default '{}',
  medal_policy jsonb not null default '{}',
  display_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sport_id, slug)
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references divisions(id) on delete restrict,
  name text not null,
  display_order int not null default 0,
  tie_resolution jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (division_id, name)
);

create table division_entries (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references divisions(id) on delete restrict,
  team_id uuid not null references teams(id) on delete restrict,
  group_id uuid references groups(id) on delete restrict,
  label text,
  roster_status roster_status not null default 'unknown',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_entries_division on division_entries(division_id);
create index idx_entries_team on division_entries(team_id);
create index idx_entries_group on division_entries(group_id);

create table players (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete restrict,
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_players_event_name on players(event_id, full_name);

create table roster_memberships (
  entry_id uuid not null references division_entries(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, player_id)
);
create index idx_roster_player on roster_memberships(player_id);

create table venues (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  unique (event_id, name)
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references divisions(id) on delete restrict,
  group_id uuid references groups(id) on delete restrict,
  stage match_stage not null default 'round_robin',
  status match_status not null default 'scheduled',
  label text not null,
  starts_at timestamptz,
  duration_minutes int check (duration_minutes is null or duration_minutes > 0),
  venue_id uuid references venues(id) on delete set null,
  venue_text text,
  revision int not null default 0,
  needs_review boolean not null default false,
  published boolean not null default true,
  conflict_ack jsonb,
  winner_entry_id uuid references division_entries(id) on delete set null,
  outcome text check (outcome is null or outcome in ('win','draw','forfeit')),
  result_reason text,
  finalized_at timestamptz,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (division_id, label)
);
create index idx_matches_division on matches(division_id);
create index idx_matches_starts on matches(starts_at);
create index idx_matches_status on matches(status);

create table match_slots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  slot_no int not null check (slot_no >= 1),
  source slot_source not null default 'entry',
  source_entry_id uuid references division_entries(id) on delete restrict,
  source_group_id uuid references groups(id) on delete restrict,
  source_rank int,
  source_match_id uuid references matches(id) on delete restrict,
  source_outcome text check (source_outcome is null or source_outcome in ('winner','loser')),
  resolved_entry_id uuid references division_entries(id) on delete set null,
  override_entry_id uuid references division_entries(id) on delete set null,
  override_reason text,
  frozen_entry_id uuid references division_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, slot_no)
);
create index idx_slots_match on match_slots(match_id);
create index idx_slots_source_match on match_slots(source_match_id);
create index idx_slots_source_group on match_slots(source_group_id);

-- Effective entry of a slot: frozen ?? override ?? resolved (SPEC §1)
create or replace function effective_entry_id(s match_slots) returns uuid
language sql immutable as $$ select coalesce(s.frozen_entry_id, s.override_entry_id, s.resolved_entry_id, s.source_entry_id) $$;

create table match_segments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  segment_no int not null check (segment_no >= 1),
  kind text not null default 'set' check (kind in ('set','period')),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  unique (match_id, segment_no)
);

create table segment_scores (
  segment_id uuid not null references match_segments(id) on delete cascade,
  slot_id uuid not null references match_slots(id) on delete cascade,
  points int not null default 0 check (points >= 0),
  primary key (segment_id, slot_id)
);

create table match_totals (
  match_id uuid not null references matches(id) on delete cascade,
  slot_id uuid not null references match_slots(id) on delete cascade,
  points int not null default 0 check (points >= 0),
  primary key (match_id, slot_id)
);

create table placement_results (
  match_id uuid not null references matches(id) on delete cascade,
  slot_id uuid not null references match_slots(id) on delete cascade,
  place int check (place is null or place > 0),
  finish finish_status not null default 'finished',
  note text,
  primary key (match_id, slot_id)
);

create table division_results (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references divisions(id) on delete restrict,
  award_key text not null,
  medal text not null check (medal in ('gold','silver','bronze')),
  entry_id uuid not null references division_entries(id) on delete restrict,
  state award_state not null default 'draft',
  source text not null default 'manual' check (source in ('manual','playoff','placement')),
  source_match_id uuid references matches(id) on delete set null,
  reason text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Partial uniques: swaps work by voiding the old confirmed set first (SPEC §1.3)
create unique index uq_results_confirmed_key on division_results(division_id, award_key) where state = 'confirmed';
create unique index uq_results_confirmed_entry on division_results(division_id, entry_id) where state = 'confirmed';
create index idx_results_division on division_results(division_id);

create table account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin','coordinator')),
  sport_id uuid references sports(id) on delete restrict,
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((role = 'coordinator' and sport_id is not null) or (role = 'super_admin' and sport_id is null))
);
create unique index uq_one_coordinator_per_sport on account_profiles(sport_id) where role = 'coordinator' and active;

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete set null,
  sport_id uuid references sports(id) on delete set null,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index idx_audit_time on audit_log(created_at);

create sequence event_updates_revision_seq;

-- PUBLIC PROJECTION table (SPEC §2): rows contain ONLY public-safe patch data.
create table event_updates (
  event_id uuid not null references events(id) on delete cascade,
  revision bigint not null default nextval('event_updates_revision_seq'),
  changed_match_ids uuid[] not null default '{}',
  changed_division_ids uuid[] not null default '{}',
  topics text[] not null default '{}',
  patch jsonb not null default '[]',
  created_at timestamptz not null default now(),
  primary key (event_id, revision)
);

-- ◆ Division config lock (SPEC v2.1): once any match in the division is live/final,
-- scoring/standings/medal config cannot change — enforced at the database, not just RPCs.
create or replace function enforce_division_config_lock() returns trigger
language plpgsql as $$
begin
  if (new.scoring_config is distinct from old.scoring_config
      or new.standings_config is distinct from old.standings_config
      or new.medal_policy is distinct from old.medal_policy
      or new.scoring_kind is distinct from old.scoring_kind)
     and exists (select 1 from matches m where m.division_id = old.id and m.status in ('live','final')) then
    raise exception 'division configuration is locked once play has started';
  end if;
  return new;
end $$;

create trigger trg_division_config_lock
  before update on divisions
  for each row execute function enforce_division_config_lock();

-- updated_at maintenance
create or replace function touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['events','teams','sports','divisions','groups','division_entries','players','venues','matches','match_slots','division_results','account_profiles']
  loop
    execute format('create trigger trg_touch_%s before update on %s for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;
