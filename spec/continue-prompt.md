You are CONTINUING a spec document you started. The text so far ends mid-row in the section 1.2 table (matches table, at 'display_order,').
Output ONLY the continuation: finish the matches row and remaining tables of 1.2, then sections 1.3-1.5 (domain rules: standings computation, derived medals/tally, advancement storage) and sections 2-10 as listed in the original brief (2 Auth/RLS, 3 Realtime+polling, 4 Public site, 5 Coordinator console, 6 Admin, 7 Advancement engine, 8 Seed format + Supabase setup checklist incl. supabase/migrations breakdown, 9 Build phases, 10 Risks/open questions).
Write DENSE, tables over prose, max ~7,500 words. Do NOT repeat anything already written. Do NOT add preamble.

=== ORIGINAL BRIEF ===
CONSTRAINT: Write DENSE and compact — max ~7,500 words, tables over prose, no filler. Complete coverage of all 10 sections beats elaboration.

# BRIEF — Draft a build SPEC for the PGLU Olympics Live Tracker

You are drafting SPEC.md for a live sports-fest tracker webapp. Output ONLY the spec document (Markdown), complete and buildable — no preamble, no commentary.

## Event & source data
- Event: "PGLU Olympics" — inter-office sports fest, Provincial Government of La Union. Nov 9–26, 2026. First matches Mon Nov 9, 13:00.
- Source of truth today: a Google Sheet being replaced by this app.
- Overall teams (10): AGKAYSA GUARDians, CODE RED, TRIFORCE BANNUARS, TEAM 4-MIDABLE, Agkaysa FOURce, ELYUNITED HEALTH WARRIORS, THE CODE BLUES, ECO-AGKAYSA, EconoMIX, PDRRMO HAZARD BREAKERS.
- Overall tally model from sheet: per team GOLD / SILVER / BRONZE counts + POINTS + RANK. Points formula is NOT stated in the sheet — spec must make points configurable (admin-editable values per medal) and define a default ranking rule.
- Fully known sport: VOLLEYBALL (Men's + Women's divisions). Per division: 9 teams in Bracket A (5) / Bracket B (4); intra-bracket round robin (16 matches); then Semis G1/G2, Bronze Match, Gold Match. Standings: Played/Wins/Losses/Win%. Scoring: per-set points, winner by sets. All fixtures at "DMMMSU Covered Court", dated Nov 9–26 with times. Semifinal pairing not stated (assume crossover A1 vs B2, B1 vs A2 — must be admin-configurable, with manual override of any playoff slot).
- Other sports exist in the workbook but are NOT yet extracted. The design must be fully data-driven: a new sport = seed data (sport, divisions, groups/brackets, teams, fixtures, scoring profile), zero code changes. Scoring profiles must cover at least: (a) set-based (volleyball: sets of points), (b) simple points/goals (e.g. basketball/football: single score per side, maybe periods), (c) placement-only (races/athletics: finishing places feed medals directly). Spec the generic match/score model so all three fit.

## Product requirements (binding, from the owner)
- Public client site: live now-playing, up next, latest results, standings per sport/division/bracket, full schedules, per-sport display cards, and an overall medal tally (tally cards). Very interactive and informative; broadcast-level hype; mobile-first (most viewers on phones).
- Coordinator console: one account PER SPORT (multi-tenant-ish); a coordinator can only score their own sport. Big touch-friendly score steppers; set-by-set entry for set-based sports; match status flow scheduled → live → final; winner auto-advance into semis/bronze/gold slots where the bracket implies it.
- Super-admin: manages sports, divisions, teams, fixtures, accounts, medal point values, and can score any sport; records champions (gold/silver/bronze per division) which feed the overall tally.
- Real time: score changes reach all viewers in <1s (Supabase Realtime). A polling fallback (5s) behind a transport flag must work with the same UI if realtime is unavailable.

## Architecture (decided — spec within it, don't re-litigate)
- Next.js (App Router, TypeScript) deployed on Vercel.
- Supabase: Postgres, Supabase Auth, Realtime, Row Level Security enforcing per-sport scoping.
- Supabase project/keys are created by the owner at deploy time. Everything must run locally BEFORE keys exist: a fixtures/mock data layer + transport flag (mock | polling | realtime) with identical UI.
- Palette: dark blue + white + dark red core; gold complementary for medals/highlights. (This is a public event site; do not use a bone/charcoal editorial system.)
- Deliverables also include: seed SQL/JSON generated from sheet data; a non-expert Supabase setup checklist.

## Spec must cover
1. Data model: every table, columns, keys, relations, enums (match status, stage: round_robin/semifinal/bronze/gold/placement, scoring profile). How sets/periods/placements are stored. How champions/medals/points are derived vs stored (derived tally from division results preferred — argue if you disagree).
2. Auth & authorization: roles (super_admin, coordinator w/ sport scope), Supabase Auth + RLS policies per table (read public, write scoped), account provisioning flow by super-admin.
3. Realtime design: channels/subscriptions per view, payload shape, reconnect behavior; polling fallback mechanics + flag; optimistic UI for coordinators.
4. Public site: page/section inventory, components (live card, display cards per sport, tally card, standings table, schedule), interactions, empty/pre-event states, countdown to first match.
5. Coordinator console: screens, score entry UX per scoring profile, status transitions, undo/correction flow, advancement triggers.
6. Admin: CRUD surfaces, champion/medal recording, points config.
7. Advancement engine: how RR standings seed playoff slots (crossover default), manual override, bronze = semifinal losers, gold = semifinal winners; what happens on corrections after advancement.
8. Seed format & setup checklist outline.
9. Build phases in dependency order, each verifiable.
10. Risks & open questions — flag anything in this brief that is internally inconsistent or unbuildable as stated.

Keep it tight but complete: a strong engineer should be able to build from it without asking you anything.

# ADDENDUM to brief.md (user update, 2026-11-07) — binding, overrides brief where in conflict

1. Product name: **PGLUlympics**. Repo: halords/pglulympics, branch main.
2. Schema delivery: the repo is connected to the owner's Supabase project via Supabase's GitHub
   integration. The spec's data model must therefore be delivered as timestamped SQL migration
   files under `supabase/migrations/` plus a `supabase/seed.sql`, and the spec must state the
   migration file breakdown (schema, RLS policies, realtime publication, seed) and any
   dashboard-only steps the integration cannot do (e.g. enabling Realtime on tables if not
   expressible in SQL, creating the first auth user).
3. Everything else in brief.md stands.

=== SPEC SO FAR ===
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
