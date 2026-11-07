load uses an immediate snapshot; the watchdog checks the revision every **30 seconds while visible**, with jitter, and requests a snapshot when it advances. Hidden tabs may suspend checks; returning to the foreground always triggers verification. Browser timers are not delivery guarantees.

- Show `Connected`, `Reconnecting`, `Polling`, or `Offline`, plus the last successful synchronization time—not merely the last score-change time. Retain readable cached data with a stale banner during outages.
- Never advance a local revision beyond the data actually applied. If a snapshot fails, retain the previous revision and retry.
- Unpublished/private mutations may issue a generic invalidation without entity IDs or patches. Public outbox rows must not reveal unpublished fixtures, roster names, account changes, conflict reports, or override reasons.
- Close subscriptions, timers, and pending requests when their provider unmounts. Authentication changes discard staff caches and establish a fresh authorized snapshot.

### 3.3 Polling, mock persistence, and command recovery

| Concern | Required behavior |
|---|---|
| Polling adapter | Immediate snapshot, then revision-aware polling every five seconds while visible, with ±20% jitter. Pause while hidden; resnapshot on focus. Only one request in flight per scope; back off to 30 seconds after repeated failures |
| Unchanged responses | Return a typed `not_modified` response when the known revision matches; retain the existing snapshot |
| Transport parity | Same command schemas, permissions, validation, revisions, derived calculations, errors, and UI components in all adapters |
| Mock store | Versioned IndexedDB database seeded from bundled JSON. Domain mutation, audit, request receipt, and revision changes commit atomically in one read/write transaction |
| Mock cross-tab behavior | IndexedDB transactions serialize competing writes; BroadcastChannel announces committed revisions. Other tabs reload authoritative state rather than applying unverified messages |
| Mock identity | Prominent **Demo / local data** banner and local role selector for public, super-admin, and each coordinator. No fake Supabase login; this selector never authorizes production endpoints |
| Reset/export | Mock-only reset confirmation and JSON export/import; preserve changes across reloads. Storage failure displays a clear warning rather than claiming persistence |
| Connection loss during command | Mark outcome unknown; retry the **same request UUID and payload**. A committed receipt returns the original success without repeating advancement or audit |
| Concurrent edit | On 409, show current permitted state and the user’s proposed changes. Require explicit reconciliation; never silently overwrite or automatically reapply a finalization |
| Offline writes | Disable production saves while offline; preserve an unsent local form draft. Do not queue scoring/finalization commands for automatic later execution |
| Runtime separation | Mock mode must not initialize Supabase or require its environment variables. Production builds cannot switch into privileged mock identity through a query parameter |
| Contract tests | Run common adapter scenarios against mock and local Supabase: scoring, scheduling, corrections, advancement, medals, revision races, and idempotent retries |

## 4. Public Site

### 4.1 Routes and content

| Route | Content and behavior |
|---|---|
| `/` | Event identity/date range; countdown before the first match; live matches; today’s schedule; latest final results; compact overall tally; sport navigation |
| `/schedule` | Event-wide schedule with Manila date, sport, division, team, status, and venue filters; chronological grouping; shareable query parameters |
| `/sports/[sportSlug]` | Sport overview, division tabs, live/upcoming/results, scoring-format explanation, and provisional-configuration labels |
| `/sports/[sportSlug]/[divisionSlug]` | Group standings or placement tables, fixtures/results, configured playoff bracket, and confirmed medalists |
| `/matches/[matchId]` | Participants or explicit TBD labels; stage/group; Manila date/time; venue/court; status; complete supported score detail; winner/result reason; last synchronization state |
| `/tally` | All ten delegations; rank, gold, silver, bronze, and points; confirmed-award drilldown; published points formula and provisional warning |
| `/teams/[teamSlug]` | Delegation identity, registered sport/division entries, filtered fixtures/results, and confirmed medals. No public player roster in the MVP |
| `/login` | Staff sign-in and password-reset entry; public navigation remains available |

| Display rule | Specification |
|---|---|
| Countdown | Target `events.first_match_at`, seeded to November 9, 2026, 13:00 Asia/Manila. Use snapshot server time to reduce client-clock error; stop at zero and show the active event state |
| Today | Manila calendar date, independent of the visitor’s device timezone. Outside event dates, offer the nearest scheduled date instead of an unexplained empty screen |
| Match cards | Sport/division, stage/group, teams/TBD, status, start time, venue, and concise score. Show cancellation/postponement notes where applicable |
| Time uncertainty | Null `starts_at` displays `Time TBA`; do not substitute midnight. Scheduling estimates are not actual finish times |
| Head-to-head scores | Set wins plus individual sets, or aggregate points plus periods/decider as applicable. Distinguish forfeits from scored wins |
| Placement scores | Ordered entrant results, metric/unit where configured, and DNF/DNS/DQ. A live placement table is explicitly provisional |
| Bracket | Render stored slot dependencies, not a hardcoded sport bracket. Pending slots display meaningful sources such as `Group A #1` or `Winner of SF1` |
| Standings | Desktop table and horizontally scrollable/mobile equivalent; explain ratios, qualification markers, unresolved ties, and manual tie decisions |
| Medals | Show only confirmed published assignments. Pending review is not an official medal or point |
| Publication changes | A newly private/archived record disappears on refresh. A direct hidden URL returns an unavailable/404 state without leaking its title |
| Empty states | Distinguish no imported fixtures, no matches matching filters, no final results, no confirmed medals, and temporary connection failure |

### 4.2 Presentation and accessibility

| Area | Acceptance requirement |
|---|---|
| Layout | Mobile-first, usable at 360 px; navigation, match cards, filters, and tally do not require page-wide horizontal scrolling |
| Identity | Consistent event branding; configurable delegation colors/logos; text/icon fallback for missing assets. Do not invent official logos |
| Accessibility | Semantic landmarks/tables, keyboard operation, visible focus, labeled inputs, WCAG AA contrast, reduced-motion support |
| Status cues | Never color alone; combine text, icon, and accessible labels |
| Live announcements | Polite, throttled announcements for relevant changes; do not repeatedly read entire tables or move focus |
| Loading/errors | Skeletons for initial load, inline refresh errors for retained data, useful retry action, and dedicated not-found states |
| Performance | One shared event subscription, bounded snapshots, lazy-loaded heavy console/bracket components, optimized image assets |
| Metadata | Route-specific title/description and event sharing image; no indexing of login, console, private fixtures, or personal roster data |

## 5. Coordinator Console

Section 11 extends the original scoring-only coordinator scope to **fixture creation/editing for the assigned sport**.

### 5.1 Routes and workflow

| Route / area | Function |
|---|---|
| `/coordinator` | Assigned-sport dashboard: live, upcoming, unfinished results, dependency-review flags, and scheduling conflicts |
| `/coordinator/matches` | Search/filter by division, group/stage, date, status, and venue; create fixture; open scoring or scheduling editor |
| `/coordinator/matches/[matchId]` | Authoritative match state, score controls, result preview, change history, and authorized scheduling controls |
| `/coordinator/conflicts` | Per-player and per-team clashes involving own-sport fixtures; scoped disclosure rules in §11 |
| Account | Assigned sport and active role are read-only; password reset/sign-out. No roster, account, award-confirmation, or sport-configuration controls |

| Scoring action | Behavior |
|---|---|
| Open match | Fetch current revision and full score state; display participants, profile/version, provisional flags, and dependency readiness |
| Start | Require scheduled, not cancelled/archived, valid resolved participants, confirmed usable scoring profile, and no `needs_review` block |
| Save progress | Explicit save of validated scores/segments; allow a clearly marked unsaved draft. Buttons may increment/decrement local values but cannot bypass server validation |
| Finalize | Show winner/result and downstream effects before confirmation. Server validates the complete result and advances dependencies atomically |
| Correct final | Require reason and dependency-impact preview. Coordinator may correct own-sport scores, but cannot perform admin-only destructive bracket resets or confirm changed awards |
| Cancel | Require reason and dependency preview. A cancellation that would require resetting started descendants is escalated to admin |
| Reopen | Audited correction command, not a client-side status toggle; invalidate dependent standings, seeds, and awards according to §7 |
| Scheduling | Create/edit permission, save warnings, and override behavior are defined in §11; no scheduling bypass through score endpoints |

### 5.2 Editors by scoring kind

| Kind | Controls and validation feedback |
|---|---|
| `set_based` | Sequential set rows, per-side numeric scores, close/reopen set controls, sets-won summary, deciding-set target, and explicit victory validation |
| `simple`, direct totals | Two totals, permitted draw/forfeit action, and separate-decider controls only if configured |
| `simple`, periods | Configured regulation periods, allowed overtime, aggregate preview, and distinct decider display; direct-total editing disabled |
| `placement_only` | Entrant grid with place or metric, finish status, unit/precision guidance, computed ranking preview, tie-policy errors |
| Forfeit | Select winner and enter reason; do not auto-fill fabricated points or sets |
| Validation | Field-level errors plus summary; preserve input on rejection. Impossible totals, duplicate entries, incomplete segments, or unsupported outcomes cannot be overridden |

**Operator safeguards:** disable duplicate submission while pending; show saved revision/time; warn before leaving a dirty form; retain the draft when another operator changes the match; visibly distinguish unsaved values from official scores. No hidden autosave of final results.

## 6. Admin

### 6.1 Administration surfaces

| Area | Required operations / safeguards |
|---|---|
| Event | Name, dates, timezone, first-match instant, publication, medal weights, provisional flags; preview tally impact before points changes |
| Delegations | Create/edit/archive identity, order, color/logo; protect referenced teams from deletion |
| Sports | Create/edit/archive/publish; icon; duration configuration from §11; generic support for new sports |
| Divisions/groups | Entries, groups, expected counts, standings rules, scoring defaults, completion policies, medal policies, ordering/publication |
| Scoring profiles | Schema-guided editor and example preview; clone used versions; confirm provisional rules; list affected unstarted fixtures before reassignment |
| Fixtures | Event-wide create/edit, slot sources, publication, scheduling conflicts, cancellation, corrections, and advanced dependency tools |
| Rosters/venues | Identity reconciliation, roster membership, and canonical venue management under §11 |
| Advancement | Dependency graph, unresolved ties, resolution provenance, manual override/clear, affected-descendant preview, and audited reset |
| Awards | Review automatic drafts; create manual assignments; confirm/reconfirm/void; show exact tally impact and invalid-policy errors |
| Accounts | Invite/reset, assign one coordinator per sport, activate/deactivate, recover incomplete provisioning; no password display |
| Import | Upload/validate, review source mapping and diffs, apply selected approved changes, view provenance and run report |
| Audit | Filter by actor, action, sport, match, date, and request; readable before/after diff. Sensitive roster details remain staff-only |
| Operations | Data transport/connection status, current event revision, incomplete configuration, missing fixtures, unresolved awards, and export |

### 6.2 Administrative safety

- Preview destructive or consequential commands with affected matches, standings, awards, and scheduling warnings.
- Require reasons for result corrections, tie decisions, overrides, resets, manual awards, and official-data replacement.
- Use optimistic concurrency even for super-admin. Administrative authority does not permit silent lost updates.
- Archive referenced entities; do not break historical URLs or delete audit history.
- New sports/divisions remain draft until their required configuration and entry mapping are valid. Publishing does not manufacture fixtures.
- CSV/JSON exports respect authorization and exclude credentials, tokens, and unnecessary personal data. Escape spreadsheet-formula prefixes in CSV output.
- Provide a non-expert operating checklist: verify configuration → publish schedule → update scores → review advancement → confirm awards → resolve flagged changes.

## 7. Advancement Engine

### 7.1 Inputs, outputs, and ordering

Implement a deterministic domain module used by mock commands and tested against the PostgreSQL command implementation. Inputs are authoritative entities/configuration; outputs are proposed slot changes, dependency flags, award changes, and an impact report. No network access, clock-based winner selection, or sport-name branching.

| Step | Rule |
|---|---|
| 1. Validate graph | Same-division references, valid source kinds/ranks, no cycles or self-reference; topological order with stable ID ordering |
| 2. Compute standings | Apply §1.3 to affected groups; calculate completion and canonical standings hash |
| 3. Resolve group seeds | Resolve only completed, unambiguous qualification positions; valid manual tie resolution may disambiguate |
| 4. Resolve outcome slots | A valid final head-to-head source supplies winner/loser; otherwise unresolved |
| 5. Apply overrides | Preserve active override and reason while still tracking underlying source resolution/provenance |
| 6. Validate destination | Effective entries must be distinct and eligible; impossible destinations are blocked, not assigned arbitrarily |
| 7. Propagate | Visit descendants until effective entries and validity stabilize |
| 8. Propose awards | Create/update drafts from configured medal sources; reconcile existing confirmed awards under §1.4 |
| 9. Recheck scheduling | Participant changes can create cross-sport clashes; recompute affected conflict views under §11 without altering the competitive result |
| 10. Commit | Persist changes, revision increments, audit, receipt, and one invalidation atomically |

Canonical hashes include relevant rules and authoritative competitive inputs, not display order, team color, or formatting. Use stable key ordering and normalized numeric representations.

### 7.2 Correction and reset semantics

| Destination state | Upstream change response |
|---|---|
| Scheduled; effective entrant unchanged | Refresh provenance; leave fixture and schedule intact |
| Scheduled; entrant changed/unresolved | Update/clear automatic resolution, preserve source rule and manual override, increment match revision |
| Live/final; effective entrant would change | Preserve participants and recorded scores as historical evidence; mark `needs_review`; stop normal start/finalize operations and invalidate dependent official contribution |
| Live/final; entrant unchanged | Refresh valid provenance without destroying results |
| Active override | Do not overwrite it. Surface underlying source changes and any required review |
| Confirmed award affected | Keep confirmed only when beneficiary/medal/source remains valid; otherwise `needs_review`, immediately excluded from tally |
| Reset requested | Admin previews descendants and awards, supplies reason, then atomically clears selected invalid results/statuses and reapplies resolution in dependency order |

A coordinator correction requiring destructive resets returns `ADMIN_REVIEW_REQUIRED` with a permitted impact summary; it does not partially commit. Admin may use one reviewed correction/reset command. After a reset, fixtures return to scheduled with preserved schedule and slot rules; scores, outcomes, and finalization metadata are cleared with audited before-images.

### 7.3 Bracket configuration and tests

| Concern | Requirement |
|---|---|
| Volleyball topology | Each supplied division has two semifinals, bronze, and gold fixtures. Proposed cross-over seeding is A1–B2 and B1–A2; confirm against the source before treating it as official |
| Final sources | Gold receives semifinal winners; bronze receives semifinal losers. Store these as `match_outcome` rules |
| Generic formats | Support configured group-rank and match-outcome dependencies; no assumption that every sport uses groups or awards through playoffs |
| Missing source | Show a precise blocker: incomplete group, unresolved tie, no valid winner, cancelled source, pending override, or invalid duplicate participant |
| Unit tests | Completion, ratios, multi-way ties, incomplete head-to-head, forfeits, cancellation, cycles, override preservation, topological propagation, placement medals, shared medals |
| Regression tests | Correct semifinal winner; correct a group result after a semifinal starts; invalidate tie-resolution hash; preserve unchanged award beneficiary; reset descendants; repeat identical command |
| Transaction tests | Two operators finalize simultaneously; failure during award update rolls back scores; retry after lost response produces one committed result and audit trail |

## 8. Seed Format and Supabase Setup

### 8.1 Repository artifacts

```text
SPEC.md
.env.example
README.md
docs/setup-supabase.md
docs/operations.md
data/source/README.md
data/seed/official.normalized.json
data/seed/demo.json
data/seed/validation-report.json
scripts/import-sheet.ts
scripts/validate-seed.ts
scripts/generate-seed-sql.ts
scripts/seed-event.ts
supabase/config.toml
supabase/migrations/*.sql
supabase/seed.sql
src/domain/
src/data/{mock,polling,realtime}/
tests/{unit,contract,integration,e2e}/
```

`official.normalized.json` contains only verified available source records. If the source is incomplete or unavailable, commit an explicitly incomplete file/report, not a fabricated official schedule. Demo data is separate and unmistakably labeled.

### 8.2 Normalized seed contract

| Field / collection | Contents |
|---|---|
| Manifest | `schema_version`, dataset kind `official/demo`, event external key, source checksum, import timestamp, completeness notes |
| Event | PGLU Olympics identity, November 9–26, 2026, Manila timezone, first-match instant, provisional medal weights |
| Teams | Stable external keys and verified delegation names/identity; target inventory is ten overall delegations |
| Sports/profiles | External keys, generic scoring configuration/version, explicit provisional flags |
| Divisions/groups | Parent external keys, rules/policies, expected counts and ordering |
| Entries | Division/team/group references, label/bib; no unresolved name joins at apply time |
| Fixtures | External key, division/group/profile references, stage, label, date/start time, duration override, venue reference, source notes, publication |
| Slots | Ordered tagged-union source references; external keys converted to UUIDs during validation/import |
| Players/rosters | Optional verified records using stable player keys and division-entry references; contract extended in §11 |
| Awards/results | Import only explicitly supplied official results, with reviewed policy and confirmation handling; never infer medals from schedule text |
| Provenance | Non-sensitive source tab/row reference on importable records; original source document access remains restricted as needed |

### 8.3 Import and seed behavior

| Step | Requirement |
|---|---|
| Extract | Adapter reads the supplied workbook/export; normalize merged headings, whitespace, team aliases, dates, and stages without guessing ambiguous values |
| Map | Present unresolved aliases and missing parent references for human resolution; retain original label in the report |
| Parse time | Interpret sheet-local dates/times in Asia/Manila and convert to UTC. Ambiguous date formats are errors, not locale-dependent guesses |
| Validate | Unique external keys; ancestry; entry eligibility; scoring schemas; slot graph; positive durations; roster identity; canonical venues; fixture counts/completion |
| Fixture audit | Volleyball expected topology: 16 round-robin plus four playoffs per division, 40 total across both. Report missing/extra/duplicate pairings; do not generate official rows to meet the count |
| Distinguish participation | A(5)+B(4) means nine entries in each stated volleyball division; do not automatically enroll all ten delegations or choose the absent delegation |
| Diff | Show inserts, updates, unchanged rows, unresolved references, and conflicts. Missing source rows are not implicit deletions |
| Apply | Use stable external keys and deterministic UUID mapping; run a validated transactional import with event lock, revisions, audit, and sanitized invalidation |
| Preserve app edits | Reimport cannot silently overwrite app-created fixtures, scores, schedule corrections, or roster reconciliation. Require explicit reviewed field-level replacement |
| Scheduling warnings | Bulk imports run the same conflict engine; an admin approves the specific warning set before applying (§11) |
| Idempotence | Reapplying identical input creates no duplicate entities or awards and no false score changes |
| Demo fixture generation | Allowed only in `demo.json`; include representative set, simple, placement, TBD, conflict, correction, and medal-review scenarios |
| SQL generation | Generate escaped parameter-safe SQL from validated normalized data; never concatenate untrusted sheet values as executable SQL |

### 8.4 Migration breakdown

| File | Responsibility |
|---|---|
| `202611070001_domain_schema.sql` | Enums, event/team/sport/division/profile/entry/match/score/result tables; basic FKs and CHECK constraints; deferred circular references |
| `202611070002_identity_audit_revisions.sql` | Account profiles, audit, request receipts, event revisions, outbox; active-coordinator uniqueness; timestamp helpers |
| `202611070003_integrity_indexes.sql` | Ancestry, score-shape, final-result, slot-graph, effective-entry, and medal-policy constraint triggers; FK/read indexes |
| `202611070004_authorization.sql` | Command-owner role, authorization helpers, table grants, RLS policies, revoked direct DML, secure function defaults |
| `202611070005_derived_models.sql` | Match summaries, standings, published results, schedule and tally views/functions; exact ranking/ratio behavior |
| `202611070006_commands_advancement.sql` | Score/status/configuration/award/account-profile RPCs, locking, idempotency, advancement, corrections, audited resets |
| `202611070007_snapshots_realtime.sql` | Public/staff snapshot RPCs, sanitized outbox builder, revision checks, Realtime publication membership |
| `202611070008_players_rosters_venues.sql` | §11 tables, sport-duration fields, match venue reference, roster constraints/indexes, private RLS |
| `202611070009_scheduling_conflicts.sql` | Overlap primitive, internal event-wide checker, safe conflict projections, fixture create/edit RPCs, acknowledgement storage; update snapshots/grants |
| `202611070010_final_privilege_checks.sql` | Final EXECUTE/SELECT grants, private-helper revocations, policy assertions, function search-path checks |

Migrations contain schema and behavior, not credentials, Auth users, or invented official data. Keep applied migrations immutable; subsequent changes use new files. `supabase/seed.sql` is generated development data and is never automatically applied to production.

### 8.5 Non-expert Supabase/Vercel checklist

| Order | Action / verification |
|---|---|
| 1 | Install documented Node/package-manager versions, Supabase CLI, and Docker for local integration tests; install locked dependencies |
| 2 | Copy `.env.example`; choose `NEXT_PUBLIC_DATA_TRANSPORT=mock`; run the full UI without credentials |
| 3 | Create Supabase project; record project URL and client-safe publishable/anon key. Keep the service-role key server-only |
| 4 | For local verification, run `supabase start` and `supabase db reset`; run database/auth tests before linking production |
| 5 | Link the intended hosted project; inspect migration status and apply `supabase db push`. Verify the project reference before any write |
| 6 | Configure Auth site URL and exact local/preview/production callback URLs; disable public signup; configure reliable invitation/reset email delivery |
| 7 | Create the initial owner user in Auth; use documented SQL to insert that exact UUID as active `super_admin`; verify login before creating coordinators |
| 8 | Validate the official seed, inspect its diff/report, back up existing data if present, and run the explicit event-seed command |
| 9 | Verify RLS for anon, coordinator, inactive staff, and admin; confirm direct table writes fail and cross-sport guessed UUID writes fail |
| 10 | Confirm `event_updates` is in the Realtime publication and that private tables are not published; test reconnect and polling fallback |
| 11 | Set Vercel environment variables separately for preview/production; never connect an untrusted preview deployment to production data |
| 12 | Deploy; test public reads, sign-in/reset, own-sport scoring/scheduling, conflict warnings, admin awards, and live updates from another browser |
| 13 | Confirm timezone, sport rules/durations, medal weights, verified delegation names, fixtures, and publication before announcing the site |
| 14 | Enable available backups and monitoring; document exports, restore/replay procedure, key rotation, and support ownership. Run a restore rehearsal |

Required variables: `NEXT_PUBLIC_DATA_TRANSPORT`, `NEXT_PUBLIC_SUPABASE_URL`, the documented client-safe Supabase key variable, `SUPABASE_SERVICE_ROLE_KEY`, and the application base URL. Validation is mode-aware; secrets never use `NEXT_PUBLIC_`.

## 9. Build Phases in Dependency Order

| Phase | Deliverable | Exit gate |
|---|---|---|
| 1. Source/configuration audit | Verified source inventory, aliases, unknowns, seed schema, sample scoring/duration policies | No assumption mislabeled official; missing information explicitly tracked |
| 2. Domain foundation | Types, versioned validators, time/overlap utilities, standings/tally/advancement/conflict modules | Unit tests pass, including §11 overlap cases |
| 3. Mock data platform | Persistent transactional mock store, role simulation, commands, subscriptions, representative demo seed | Reload/cross-tab persistence and shared contract tests pass |
| 4. Public UI | Routes, responsive components, scoring-kind displays, filters, countdown, stale/error states | Complete public experience with no Supabase credentials |
| 5. Staff UI | Coordinator scoring, admin configuration/accounts placeholders, fixture editor, roster manager, conflicts and awards | End-to-end mock workflows; unauthorized controls and commands denied |
| 6. Database foundation | Migrations, constraints, RLS, derived models, private scheduling checker | Clean reset succeeds; SQL/RLS/concurrency tests pass |
| 7. Transactional commands | Scoring, advancement, scheduling, conflict acknowledgements, roster/configuration mutations | Mock/database parity; rollback, idempotency, stale-write and race tests pass |
| 8. Production adapters/auth | Supabase Auth, provisioning, server guards, polling, snapshots, Realtime recovery | No service-role domain writes; multi-browser live/recovery tests pass |
| 9. Official import/rehearsal | Importer, diff/apply, verified seed, source provenance, initial admin setup | Counts and mappings reviewed; schedule/roster warnings approved |
| 10. Hardening/delivery | Accessibility, mobile/operator rehearsal, security, performance, deployment, backup/setup docs | Acceptance suite and non-expert setup completed on a fresh project |

**Release acceptance:** all three scoring kinds; standings and configured bracket progression; reviewed medals/tally; own-sport scheduling with cross-sport player/venue warnings; roster identity handling; tested overrides; production RLS; realtime recovery/polling; persistent credential-free mock mode. No essential workflow may remain a nonfunctional mock-only button.

## 10. Risks and Open Questions

| Issue | Decision / required resolution |
|---|---|
| Source availability and ambiguity | Verify workbook/export, all ten delegation names, sports/divisions, dates, venues, and stage mapping. Block official import of ambiguous records |
| Volleyball scoring | Provisional best-of-three is demonstration only; owner confirms regular/deciding targets, caps, and finals differences |
| Volleyball qualification | Confirm cross-over semifinal seeding and tie policy; fixture count alone does not prove the seeding rule |
| Medal points/policies | Confirm 3/2/1, shared-bronze rules, placement ties, and any divisions excluded from tally |
| Completion exceptions | Decide treatment of cancelled/unplayed required fixtures; admin-approved policy with audit, never silent group completion |
| Duration estimates | Owner confirms defaults per sport (§11); overlaps are only as accurate as these estimates |
| Roster identity/completeness | Stable person IDs require reconciliation; same names are not proof of identity. Missing rosters must visibly reduce detection confidence |
| Venue identity | Normalize aliases and define independently bookable courts/resources; free-text differences must not bypass checks |
| Late official changes | Scheduling, score correction, and award review need named operational owners; no silent downstream historical rewrites |
| Cross-sport confidentiality | Approve narrowly scoped disclosure of other fixtures in staff conflict warnings; public player names remain excluded |
| Account sharing | One coordinator account per sport limits individual attribution; retain request/account audit and warn against concurrent editing |
| Event-wide lock throughput | Appropriate for this event size; load-test concurrent saves. Keep transactions short; no Auth/email/network calls while locked |
| Realtime interruptions/limits | Polling and revision watchdog are mandatory; monitor connection/error rates and payload size |
| Email delivery | Configure and test invitations/password resets before event day; preserve bootstrap recovery procedure |
| Mock/SQL divergence | Shared fixtures and parity tests are release gates, especially rankings, advancement, and overlap semantics |
| Retention/privacy | Confirm player-name retention and export access; technical receipt/outbox retention is not a substitute for official-result/audit backup |
| Out of scope unless separately approved | Automated schedule optimization, attendance, player self-service, historical roster snapshots, travel/rest buffers, notifications, and individual-person authenticated operator attribution |

## 11. Scheduling, Rosters, and Conflict Detection (user-added scope)

**Binding user-added addendum dated 2026-11-07.** This section extends the §1 table inventory and supersedes the scoring-only coordinator permissions in §2. Seeded fixtures are a starting point; authorized staff can create and edit fixtures in-app.

### 11.1 Data additions

| Entity | Additions / constraints |
|---|---|
| `players` | `id`, `event_id`, `display_name`, `archived`, conventions and import provenance. Nonblank name; unique non-null external key within event. **Names are not unique identifiers** |
| `rosters` | `id`, `division_entry_id`, `player_id`, `active`, conventions and import provenance. Unique entry/player; player and entry belong to the same event |
| `venues` | `id`, `event_id`, `name`, `slug`, `archived`, conventions/provenance. Unique event/slug; represents one exclusively bookable venue/resource |
| `sports` | `default_duration_minutes integer NOT NULL`, positive; `duration_provisional boolean NOT NULL`. Initial technical fallback 60 minutes, explicitly provisional until admin confirms each sport |
| `matches` | Nullable `venue_id` FK, same event. Existing `starts_at` and `estimated_duration_minutes` remain authoritative scheduling inputs; a non-null duration override must be positive |
| `fixture_conflict_acknowledgements` | Append-only `id`, `event_id`, `match_id`, `actor_id nullable`, `request_id`, `report_hash`, `conflict_snapshot jsonb`, `reason`, `created_at`; FK/indexes for match/actor/time. Store minimal IDs/intervals, not duplicated player names |

`teams` remains the overall delegation. A player belongs to teams through `rosters → division_entries → teams`; roster scope is sport/division-specific, not every sport played by that delegation. One player may have multiple roster memberships across sports and, where valid, divisions/teams. No uniqueness constraint may prohibit normal cross-sport participation.

| Roster rule | Behavior |
|---|---|
| Identity creation | Admin creates/imports players and assigns memberships. Reuse a stable player ID across sports |
| Name reconciliation | Suggest possible duplicates after normalization, but never automatically merge solely by name. Admin-reviewed merge reassigns memberships, removes duplicate memberships, archives the superseded identity, and audits |
| Multiple placement entries | Membership attaches to the actual division entry; only its roster participates in that fixture’s check |
| Membership union | For each fixture, union players from all effective entries; a player present on multiple entries is evaluated once against other fixtures |
| Incomplete roster | Distinguish empty/unverified roster from conflict-free. Admin UI tracks completeness through validated roster/import metadata; warnings explicitly state which participating entries lack verified rosters |
| Privacy | No anonymous roster/player SELECT, public snapshots, or Realtime payloads. Coordinator reads own-sport memberships and associated player names; admin reads all |
| Roster edits | Admin-only for MVP. Event-locked commands recompute affected clashes across all relevant fixtures and emit private invalidation |
| Historical meaning | MVP checks use current active memberships, including for retained final fixtures
