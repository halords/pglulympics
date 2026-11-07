You are CONTINUING the same spec document (parts 1-2 written). Part 2 ended mid-sentence in section 3.2 ('A low-frequency revision watchdog in realtime mode detects missed events. Initial...').
Output ONLY the continuation: finish 3.2, then 3.3 if needed, then sections 4-10 of the original brief (4 Public site, 5 Coordinator console, 6 Admin, 7 Advancement engine, 8 Seed format + Supabase setup checklist incl. supabase/migrations file breakdown, 9 Build phases in dependency order, 10 Risks/open questions). THEN add section 11 covering ADDENDUM 2 below in full (data additions: players/rosters tables; fixture create/edit permissions; conflict-detection engine incl. venue double-booking, duration defaults per sport, save-time flow, override semantics, conflicts views; overlap utility + its unit tests). Mark section 11 header '(user-added scope)'. Write DENSE, tables over prose, max ~7,500 words. No repetition, no preamble.

=== ADDENDUM 2 ===
# ADDENDUM 2 (user-added scope, 2026-11-07) — binding; SPEC.md must flag this section "user-added"

1. **In-app scheduling**: super-admins, and coordinators for their OWN sport, can create/edit fixtures
   in-app (sport, division, teams, date/time, venue) — the seeded sheet fixtures are a starting point,
   not the only fixtures.
2. **Rosters**: players belong to teams (name-level records are enough). A player may appear on
   multiple teams across sports (normal in inter-office fests).
3. **Player conflict detection**: at fixture create/edit (save) time, cross-check every player on both
   teams against ALL other fixtures event-wide — ACROSS sports — for time overlaps. Flag conflicts
   inline at save: a warning listing the specific clashes (player, other match, sport, time).
   Admin may override and save anyway; coordinators see the warning for fixtures in their sport
   (override rights per spec decision — default: coordinators can save with warning acknowledged,
   admins can always override; spec may refine but must state it).
4. **Venue double-booking**: same check engine also flags same-venue overlapping fixtures.
5. **Conflicts view** in the console: per-player and per-team lists of clashes.
6. **Overlap utility**: implemented as a tested utility (unit tests required). Fixtures carry date +
   start time; match duration defaults are per-sport config (editable by admin) since most fixtures
   have no explicit end time. Overlap = intervals [start, start+duration) intersect.

=== SPEC SO FAR (parts 1+2, for continuity of terms) ===
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
 `revision`, `outcome nullable`, `winner_slot_id nullable`, `loser_slot_id nullable`, `result_reason nullable`, `finalized_at nullable`, `needs_review`, `published`, `archived` | Division/profile/group must agree; group required for round robin, otherwise nullable. Revision starts at 0. Winner/loser reference this match’s slots through deferred composite FKs. Final results must satisfy profile; no winner for draw/placements. `needs_review` blocks starting/finalizing |
| `match_slots` | `id`, `match_id`, `slot_no`, `label nullable`, `source`, `source_entry_id nullable`, `source_group_id nullable`, `source_rank nullable`, `source_match_id nullable`, `source_outcome nullable`, `resolved_entry_id nullable`, `resolved_from_hash nullable`, `override_active`, `override_entry_id nullable`, `override_reason nullable`, `resolution_state` | Unique match/slot number; unique match/id for composite FKs. Source fields follow tagged-union rules (§1.5). All referenced entries/groups/matches belong to target division. State CHECK: `pending/resolved/needs_review`. Effective entry = override entry when override active, otherwise resolved entry; unique non-null effective entry per match |
| `match_totals` | `match_id`, `slot_id`, `points` | PK match/slot; composite FK to slot. Authoritative only for simple profiles configured for direct totals; cannot coexist with period scoring |
| `match_segments` | `id`, `match_id`, `segment_no`, `kind`, `label nullable`, `status`, `is_tiebreak` | Unique match/segment number; unique match/id. Kind/config must agree. Sequential segments; at most one open segment. Tiebreak segments permitted only by simple profile |
| `segment_scores` | `segment_id`, `match_id`, `slot_id`, `points` | PK segment/slot; composite FKs ensure segment and slot belong to same match. Two score rows per head-to-head segment |
| `placement_results` | `match_id`, `slot_id`, `place nullable`, `metric nullable`, `finish_status`, `note nullable` | PK match/slot; composite FK to slot. Finished requires positive place when final; DNF/DNS/DQ require null place and cannot receive medals. Duplicate places allowed only by profile |
| `division_results` | `id`, `division_id`, `award_key`, `medal`, `entry_id`, `state`, `source`, `source_match_id nullable`, `source_revision nullable`, `source_hash nullable`, `reason nullable`, `confirmed_by nullable`, `confirmed_at nullable` | Unique division/award key; entry/source match in division. Unique entry among non-void awards in one division; distinct entries from same overall team may medal. Confirmer FK `auth.users`, ON DELETE SET NULL. Award keys support shared medals, e.g. `bronze:1`, `bronze:2` |
| `account_profiles` | `user_id`, `role`, `sport_id nullable`, `display_name`, `active` | PK/FK `auth.users`; coordinator requires sport, super-admin requires null sport. Partial unique sport where active coordinator: **one active coordinator account per sport**. Not public |
| `audit_log` | `id`, `event_id nullable`, `sport_id nullable`, `actor_id nullable`, `request_id nullable`, `action`, `entity_type`, `entity_id nullable`, `before jsonb`, `after jsonb`, `reason nullable` | Append-only; actor FK with ON DELETE SET NULL. Event/sport nullable for account/bootstrap operations. Exclude credentials, tokens, and unnecessary personal data |
| `mutation_requests` | `actor_id`, `request_id`, `event_id nullable`, `request_hash`, `response jsonb`, `event_revision nullable` | PK actor/request; idempotency records inserted in same transaction as successful domain command. Same key with different request hash rejected. Restricted technical data; retain at least seven days |
| `event_updates` | `event_id`, `revision`, `changed_sport_ids uuid[]`, `changed_division_ids uuid[]`, `changed_match_ids uuid[]`, `topics text[]`, `payload jsonb` | PK event/revision; append-only public invalidation/outbox record, committed with mutation. Payload contains only public-safe patches, never audit/account data. Retain seven days; stale clients reload snapshots |

**Additional constraints:** deferred constraint triggers enforce cross-table invariants that CHECK constraints cannot: matching ancestry, valid slot graph, profile compatibility, complete final results, effective-entry uniqueness, and medal-policy limits. Composite references to matches/slots prevent scores silently attaching to a different contest. Add indexes for slot source group/match, audit event/time and sport/time, and update event/revision.

**Read models, not additional stored tables:** `match_summaries`, `group_standings`, `public_division_results`, `overall_tally`, `public_schedule`. Views use `security_invoker = true`; snapshot RPCs read these under the caller’s RLS. No materialized tally requiring asynchronous refresh.

#### Scoring profile configuration

All profiles include `schema_version`; reject unknown keys, invalid combinations, and unsupported versions. A division selects a default; each fixture references a concrete immutable profile version.

| Kind | Required/configurable fields | Storage, computation, final validation |
|---|---|---|
| `set_based` | Odd `best_of`; regular and deciding-set `target`; `win_by`; nullable `cap`; whether forfeits allowed | Segment per set; points per slot. Set ends at target plus required margin, or cap if configured. Cap must be ≥target; reaching cap wins regardless of margin. Winner first to `floor(best_of/2)+1` closed sets. No tied closed sets, unfinished sets, or sets after victory |
| `simple` | `entry_mode: total/periods`; period labels/count; optional extra periods; `allow_draw`; `tie_break: none/extra_periods/separate_decider`; standings points for win/draw/loss/forfeit | Direct `match_totals` **or** sum of closed regulation/overtime segments, never both. Separate-decider segments are displayed separately and excluded from main score; they determine winner if aggregate tied. Final requires complete configured periods and a permitted outcome |
| `placement_only` | `ranking_input: places/metric`; metric label/unit/precision/direction when used; `allow_ties`; `rank_style: competition/dense`; permitted finish statuses | N slots; one placement result per entrant. Metric mode computes places from numeric metrics, excluding DNF/DNS/DQ. Manual-place mode validates entered ranks. Final requires every entrant accounted for and ties consistent with policy |

- Head-to-head profiles require exactly two resolved, distinct entries before starting; placement requires at least one. Scheduled fixtures may retain TBD slots.
- Volleyball’s set format is **unconfirmed**. Supply a provisional demonstration profile, best-of-three, 25-point regular sets, 15-point deciding set, win-by-two, no cap. An admin must confirm or replace it before official scoring.
- Profiles may be changed on unstarted fixtures; clone/version rather than edit a used profile. Division medal and standings policies likewise require reviewed changes once competition starts.
- A forfeit is a final head-to-head outcome with explicit winner/loser and required reason. Do not fabricate points or sets; profile determines standings credit. Cancellation has no winner, standings contribution, or advancement.
- Configurable fixtures may use different profiles for round robin and finals. The rendering/scoring switch is by `kind`, never sport name.

### 1.3 Standings computation

| Concern | Rule |
|---|---|
| Included fixtures | Final round-robin matches in the selected division/group, not archived, with valid results and `needs_review=false`. Publication controls visibility, not official computation. Live scores never affect official standings |
| Core values | Played = eligible finals participated in; Wins/Losses from result; Draws additionally shown when supported. Win% = `100 × wins / played`; display one decimal, use exact fraction for comparisons; no games displays `—` |
| Set/point aggregates | Sets won/lost from closed eligible sets; points for/against from validated segments/totals. Separate deciders excluded from ordinary points. Scoreless forfeits contribute W/L but not invented ratios |
| Default volleyball ordering | Win% descending → wins descending → head-to-head → set ratio → point ratio. Rules are admin-configurable ordered metric/direction lists, with supported metrics including standings points and score differential |
| Ratios | Positive numerator/zero denominator = infinity; 0/0 = 0. Compute without floating-point tie drift |
| Head-to-head | Two-way tie: their eligible encounter(s). Multi-way tie: mini-table using only tied entries; require complete encounters, otherwise skip criterion. Evaluate subsequent criteria within remaining tied cohorts |
| Simple sports | Configured win/draw/loss table produces standings points. Default simple ordering: standings points → score differential → points scored → head-to-head. Display draws and points where applicable |
| Unresolved ties | Share competition rank; stable team-name ordering is presentation only. A tie crossing qualification/seeding positions blocks automatic resolution. Admin records `groups.tie_resolution` with entry order, standings hash, and reason |
| Placement sports | Show final/live placement tables, not misleading W/L standings. Different heats/finals are separate fixtures; division explicitly selects its medal-producing fixture |
| Completion | For default single round robin, active group size must match expected count and every unordered pair must have one final fixture. A division may configure cycles or a declared-fixture completion policy. Cancelled required fixtures block completion unless admin explicitly approves a cancellation policy, with audit |
| Corrections | Recompute from current authoritative data; never increment persistent W/L counters. A changed standings hash invalidates manual tie resolution and affected seed provenance |

For each volleyball division, A(5) produces `5×4/2 = 10` fixtures; B(4) produces `4×3/2 = 6`: **16 round-robin fixtures**, plus four playoffs = **20**, **40 across both divisions**.

### 1.4 Champions, medals, points, and ranks

| Concern | Decision |
|---|---|
| Stored authority | Store reviewed medal assignments in `division_results`; derive counts and tally. This supports owner confirmation, manual awards, shared bronze, and corrections without counter drift |
| Automatic candidates | Gold final proposes gold winner/silver loser; bronze final proposes bronze winner. Placement source proposes awards according to `medal_policy.place_to_medal`, default 1→gold, 2→silver, 3→bronze |
| Confirmation | Engine creates/updates **draft** candidates. Only super-admin confirms champions; coordinator finalization alone does not grant official medals |
| Manual awards | Admin selects division entry, medal, award key, and reason; permitted without a scored playoff when official results come externally. Validate policy and conflicts; never award an unregistered overall team |
| Tie/multiple-medal policy | Define allowed counts per medal, shared places, and vacancies in `medal_policy`. Standard competition places 1,1,3 yield two gold and one bronze only if explicitly allowed; do not invent a silver. No automatic award beyond configured places |
| Tally | Confirmed results from published divisions/sports/events only. Join entry→overall team; count medals, including separate eligible entries from one delegation |
| Points | `gold_count×gold_points + silver_count×silver_points + bronze_count×bronze_points`. Seed provisional **3/2/1**; admin edits nonnegative integers and clears `points_provisional` after approval |
| Rank | Points descending → gold → silver → bronze. Exact ties share competition rank, e.g. 1,1,3; name orders tied display rows only. Include all ten delegations with zero counts; show rank `—` before any confirmed medals |
| Changed results | Changed beneficiary/medal/source validity marks confirmed dependent award `needs_review`, immediately excluding it from tally. Unchanged beneficiary may retain confirmation while refreshing provenance, with audit. Admin reconfirms or voids; never silently transfers a confirmed medal |
| Points edits | Recalculate all current confirmed awards immediately; no per-award historical points snapshot. Publicly label provisional weights |

### 1.5 Advancement storage and transactions

`match_slots` stores both **the rule** and **its current resolution**; no separate bracket table or client-owned advancement state.

| Source | Required fields | Resolution |
|---|---|---|
| `entry` | `source_entry_id`, nullable only for a scheduled placeholder; other source fields null | Fixed division entry |
| `group_rank` | `source_group_id`, positive `source_rank`; entry/match fields null | Completed, unambiguous standings position |
| `match_outcome` | `source_match_id`, `source_outcome=winner/loser`; entry/group/rank fields null | Valid final source match’s winner/loser; draw/cancelled/unresolved source produces no entrant |
| Manual override | `override_active=true`, required reason; nullable override entry allows an intentionally held TBD slot | Takes precedence without deleting underlying rule. Persist until admin explicitly clears it |

`resolved_from_hash` identifies rules plus qualifying results/standings; it detects stale resolutions. Acyclic source dependencies and same-division references are mandatory. Overrides do not legalize cycles or duplicate participants.

Every command: authenticate → lock `event_revisions` row → validate expected revisions → update scores/results/config → recompute affected resolutions and awards → write audit/idempotency record → increment event revision → insert one sanitized `event_updates` row → commit. Lock affected matches in UUID order. No external calls or background advancement inside this transaction.

## 2. Auth, Authorization, and RLS

### 2.1 Identity and provisioning

| Topic | Requirement |
|---|---|
| Roles | `super_admin`: all administration/scoring; `coordinator`: one assigned sport, scoring only. Anonymous users: published public data |
| Login | Supabase email/password with invite/reset flow; public self-signup disabled. Server validates identity using Supabase Auth, not a client-provided role or merely decoded JWT |
| Authority | Role/scope/active state from `account_profiles`, never editable user metadata. Missing/inactive profile denies console and writes immediately, including with an otherwise valid JWT |
| Bootstrap | Owner creates first Auth user in dashboard, then runs documented SQL assigning that exact UUID `super_admin`. No seeded password or migration-created `auth.users` row |
| Provisioning | Authenticated admin calls protected Next.js server endpoint. Validate origin/session/admin status; server-only service-role client invokes Auth Admin invite API. Ordinary authenticated admin RPC creates the scoped profile |
| Partial failure | Invite without profile has no privileges. Show recoverable pending provisioning; retry profile creation for known returned UUID or delete/disable orphan. Never enable a second active coordinator for a sport |
| Rotation | Reset password rather than create extra active accounts. Reassignment/disable is audited; revoke sessions when appropriate. Admin UI must prevent removal of the last active super-admin |
| Shared sport identity | One sport login means audit identifies account, not individual operator. Warn about simultaneous use; revisions prevent overwrites. Optional operator label is descriptive, not authenticated identity |
| Route protection | Server-side guards for `/coordinator/**`, `/admin/**`, and mutation endpoints; RLS remains authoritative. Public bundles contain no service-role secret |

### 2.2 Policy matrix

“Published” means event, sport, division, and match publication/archival predicates, as applicable. Staff may additionally read their permitted unpublished scope. Child reads follow their parent; a published child never exposes an unpublished parent.

| Tables/read models | Anonymous/public read | Coordinator write | Super-admin write |
|---|---|---|---|
| `events` | Published | None, including point values | CRUD/configure |
| `teams` | Published event, unarchived | None | CRUD/archive |
| `sports`, `scoring_profiles`, `divisions`, `groups`, `division_entries` | Published parent chain; profile only if exposed by a published division/fixture | None | CRUD/configure with competition locks |
| `matches` | Published chain and match | Own-sport score/status/correction fields through commands; no arbitrary scheduling/config edits | All validated operations |
| `match_slots` | Visible parent match | No manual/rule edits; engine may resolve own-sport downstream slots within scoring command | Configure/override/reset |
| `match_totals`, `match_segments`, `segment_scores`, `placement_results` | Visible parent match | Own sport through score commands | Any sport through commands |
| `division_results` | Confirmed, published parent only | No manual award or confirmation; engine may maintain draft/review state for own sport | Record/confirm/void |
| `event_revisions` | Published event | Internal command increment for event containing assigned sport | Internal command increment |
| `event_updates` | Published event, sanitized records | Internal append only | Internal append only |
| `account_profiles` | None; authenticated user may read own row | None | Provision/update/disable |
| `audit_log` | None | Read own sport; internal append | Read all; internal append |
| `mutation_requests` | None | Own requests only; internal insert | Own requests; technical diagnostics as explicitly authorized |
| Derived views/snapshots | Same policies as underlying data | Read own unpublished scope through staff snapshot | Read all |

**Enforcement implementation:**

- Enable RLS on every application table. Revoke direct DML from `anon` and `authenticated`; expose named command RPCs, not generic table-update endpoints. Grant only required SELECT/EXECUTE.
- Use a dedicated `NOLOGIN NOBYPASSRLS` command-owner role that does **not** own tables. SECURITY DEFINER command functions owned by this role receive limited DML grants and remain subject to RLS using the caller’s `auth.uid()`.
- Role/scope helpers avoid profile-policy recursion; narrowly scoped SECURITY DEFINER helpers return only caller authorization predicates. Pin search paths, fully qualify objects, revoke PUBLIC execution, and prohibit caller-supplied SQL.
- Both `USING` and `WITH CHECK` scope writes through authoritative ancestry. IDs supplied by clients cannot change sport ownership. Command-level checks further distinguish score, configuration, award confirmation, and internal advancement permissions.
- Deny updates/deletes on append-only tables except owner-controlled retention jobs. Service role is for Auth lifecycle only, never ordinary scoring or public reads.
- Test REST, RPC, guessed UUIDs, child-row ancestry swaps, unpublished reads, inactive users, and concurrent requests—not just route/UI hiding.

## 3. Realtime, Polling, and Data Transport

### 3.1 One contract, three adapters

`NEXT_PUBLIC_DATA_TRANSPORT=mock|polling|realtime` selects an adapter. Missing keys are valid in mock mode; non-mock startup reports configuration errors without silently switching to fake data.

```ts
interface TrackerData {
  snapshot(scope: ViewScope, knownRevision?: string): Promise<SnapshotResponse>;
  subscribe(scope: ViewScope, onChange: (change: ChangeEnvelope) => void): () => void;
  command(command: DomainCommand): Promise<CommandResult>;
}
```

| Shared payload | Contents |
|---|---|
| Snapshot | Schema version, event ID, decimal-string event revision, server time, normalized entities/derived read models for requested scope. Staff/private fields are explicitly separated |
| Command | Type, request UUID, event ID, target IDs, expected affected match/config revisions, validated input; correction/override reason where applicable |
| Success | Request ID, committed event revision, changed match revisions, authoritative patches and affected-resource IDs |
| Conflict | HTTP 409 / typed RPC error, current revision and permitted current state; no partial mutation |
| Change envelope | `{eventId, revision, topics, sportIds, divisionIds, matchIds, patch?}`; match patches include match revision, status, participants, score summary, winner, timestamp |
| Config concurrency | Compare expected event revision for structural/configuration changes; score commands compare target match revision after acquiring event lock |

Use decimal strings for `bigint` over JSON. Public and staff snapshot functions must obtain revision and data from one database statement/snapshot. Next.js live-data endpoints are dynamic with `Cache-Control: no-store`; do not serve score responses from ISR/CDN caches.

### 3.2 Subscriptions and recovery

Publish **only `event_updates`** for the MVP. Subscribe to INSERTs filtered by event ID on `pglulympics:{eventId}`. One provider/channel per browser tab; views multiplex and locally filter. Do not assume arbitrary array filters are supported by Realtime.

| View | Relevant topics/IDs | Refresh behavior |
|---|---|---|
| Home | Live/results/schedule/catalog/tally across event | Apply safe patches; refresh affected lists/tally |
| Sport/division | Assigned sport/division, related groups/matches; catalog | Refresh its cards, standings, bracket, schedule |
| Match detail | Match and dependency changes | Replace newer score summary; fetch full segments/placements if absent |
| Overall tally | Awards/points/publication | Replace complete derived tally |
| Coordinator/admin | Public event signal plus mutation responses | Own private state fetched with authenticated snapshot; foreground revision checks catch unpublished changes |

- Subscribe and buffer first, then fetch initial snapshot; discard buffered revisions ≤snapshot and process newer ones in order. Ignore duplicate/older match revisions.
- Patches are an optimization, not authority. Coalesce notifications for 50–100 ms and request one affected-scope snapshot. Large transactions emit IDs plus `refresh_required`, not unbounded patches.
- Detect revision gaps; fetch a snapshot rather than requiring historical event replay. Reconnect with jittered backoff, show connection state, and resnapshot on resubscription/focus.
- A low-frequency revision watchdog in realtime mode detects missed events. Initial
