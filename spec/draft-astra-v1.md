# PGLUlympics — Build Specification

| Item | Decision |
|---|---|
| Product / event | **PGLUlympics** / **PGLU Olympics**, Provincial Government of La Union inter-office sports fest |
| Repository | `halords/pglulympics`, branch `main` |
| Event dates | November 9–26, 2026; first matches Monday, November 9, **13:00 Asia/Manila** |
| Architecture | Next.js App Router + TypeScript on Vercel; Supabase Postgres, Auth, RLS, Realtime |
| Development requirement | Entire public, coordinator, and admin UI works without Supabase credentials using persistent mock data |
| Data principle | Sports, formats, participants, fixtures, scoring, and advancement are configuration—not sport-name conditionals |
| Authority | Imported sheet records, then audited app mutations. Never present generated demo fixtures or assumptions as official data |
| Delivery | Application, migrations, seed SQL/JSON, importer/validator, tests, `.env.example`, and non-expert setup guide |

## 1. Data Model and Domain Rules

### 1.1 Conventions and enums

- PostgreSQL UUID primary keys unless specified; `timestamptz` for instants, UTC storage, **Asia/Manila** display and date filtering.
- Mutable entity tables have `created_at`, `updated_at`. Append-only records have `created_at` only.
- Importable entities have nullable `external_key text` and `source_ref jsonb` containing non-sensitive tab/row references. External keys are unique within their parent.
- All foreign keys indexed; public lists indexed by publication, parent, status, and scheduled time.
- Monetary types are unnecessary. Scores/counts use nonnegative integers; metrics use `numeric`; revisions use `bigint`.
- Configuration JSON must pass server-side versioned schema validation; arbitrary executable expressions are prohibited.
- Deletion: restrict referenced competitive data; archive instead. Cascade only unused draft children or retention-managed technical records.

| Enum | Values |
|---|---|
| `account_role` | `super_admin`, `coordinator` |
| `match_status` | `scheduled`, `live`, `final`, `cancelled` |
| `match_stage` | `round_robin`, `semifinal`, `bronze`, `gold`, `placement` |
| `scoring_kind` | `set_based`, `simple`, `placement_only` |
| `segment_kind` | `set`, `period` |
| `segment_status` | `open`, `closed` |
| `slot_source` | `entry`, `group_rank`, `match_outcome` |
| `source_outcome` | `winner`, `loser` |
| `match_outcome` | `win`, `draw`, `forfeit`, `placements` |
| `finish_status` | `finished`, `dnf`, `dns`, `dq` |
| `medal` | `gold`, `silver`, `bronze` |
| `award_state` | `draft`, `confirmed`, `needs_review`, `void` |
| `award_source` | `manual`, `playoff`, `placement` |

Postponement is a scheduling change with an explanatory note, not another score state.

### 1.2 Application tables

The following is the complete application-owned table inventory. Supabase owns `auth.*`.

| Table | Columns beyond conventions | Keys, relations, constraints |
|---|---|---|
| `events` | `id`, `slug`, `name`, `organizer`, `start_date`, `end_date`, `first_match_at`, `timezone`, `published`, `gold_points`, `silver_points`, `bronze_points`, `points_provisional` | Unique slug; dates ordered; points ≥0. Seed timezone `Asia/Manila` |
| `event_revisions` | `event_id`, `revision` | PK/FK event; starts at 0; serializes event mutations |
| `teams` | `id`, `event_id`, `name`, `short_name`, `slug`, `color`, `logo_url`, `display_order`, `archived` | Unique event/slug; represents the **overall delegation**, not a sport-specific roster |
| `sports` | `id`, `event_id`, `name`, `slug`, `icon_key`, `display_order`, `published`, `archived` | Unique event/slug; icon has generic fallback |
| `scoring_profiles` | `id`, `sport_id`, `name`, `kind`, `version`, `config jsonb`, `provisional` | Unique sport/name/version; immutable configuration once used by live/final match |
| `divisions` | `id`, `sport_id`, `name`, `slug`, `default_profile_id`, `standings_rules jsonb`, `medal_policy jsonb`, `placement_medal_match_id nullable`, `published`, `display_order`, `archived` | Unique sport/slug; profile belongs to sport; configured placement source belongs to division |
| `groups` | `id`, `division_id`, `name`, `expected_entry_count nullable`, `display_order`, `tie_resolution jsonb nullable` | Unique division/name; tie resolution contains ordered entry IDs, standings hash, reason |
| `division_entries` | `id`, `division_id`, `team_id`, `group_id nullable`, `label`, `bib nullable`, `active` | Overall team belongs to same event; group belongs to division. Head-to-head divisions permit one entry/team; placement divisions may permit multiple named entries/team |
| `matches` | `id`, `division_id`, `group_id nullable`, `scoring_profile_id`, `label`, `stage`, `status`, `starts_at nullable`, `estimated_duration_minutes nullable`, `venue`, `court nullable`, `schedule_note nullable`, `display_order`,
