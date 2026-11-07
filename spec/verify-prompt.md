You critiqued v1 of this spec (your findings are attached). The coordinator reconciled to SPEC v2 (attached). Verify ONLY:
1) Is each of your BLOCKER findings (1,2,3,5,11,32,33,34,35) resolved in v2? Answer per blocker: RESOLVED / PARTIAL / OPEN + one line why.
2) Did the reconciliation introduce any NEW contradiction, unbuildable mechanism, or binding-requirement gap? List only real ones, severity-tagged.
3) Final verdict: CONVERGED (buildable in the 48h plan) or NOT + the single most important remaining fix.
Dense, no preamble, no re-review of already-resolved majors.

=== YOUR ROUND-1 CRITIQUE ===
1. **blocker — The submitted spec is incomplete.** It ends mid-row in §11, after “including for retained final fixtures.” The binding scheduling addendum consequently lacks completed save semantics, override rights, conflict-view disclosure, and overlap tests; references to §11 do not supply these. **Fix:** finish this section before implementation, including coordinator warning acknowledgement, admin override, event-wide checking, and exact interval semantics.

2. **blocker — This is a multi-week platform plan masquerading as a 48-hour build.** Ten sequential phases, two transactional domain implementations, ten migrations, import reconciliation, graph/reset tooling, sophisticated mock persistence, and broad admin CRUD cannot fit the deadline. There are no hour budgets, parallel workstreams, or operational cutoff. **Fix:** define a 48-hour critical path with production DB/Auth/scoring working by hour 12, public Realtime by hour 20, scheduling/conflicts by hour 30, official-data rehearsal by hour 40, and an eight-hour deployment buffer. CUT custom import/diff UI, generic graph editor, rich audit explorer, mock export/import, and advanced administration previews.

3. **blocker — The deployment procedure contradicts the binding GitHub-integration delivery path.** §8.5 defaults to linking production and running `supabase db push`; it never explains how `halords/pglulympics/main` actually reaches the connected Supabase environment. A connected repository alone is not proof that pushes apply production migrations. **Fix:** document the owner’s actual integration/branch configuration, migration execution trigger, target project, migration-history verification, failure recovery, and production approval. Use GitHub integration as the primary deployment path; keep CLI push as an explicitly controlled recovery option, not a competing writer. State separately how official seed data is applied—do not assume integration executes `seed.sql` against production.

4. **major — Migration ordering leaves dependencies to guesswork.** `public_schedule`, snapshots, configuration commands, and advancement/conflict integration are introduced before the roster/venue tables and duration fields they logically need. Later “update snapshots/grants” is not a buildable dependency contract. **Fix:** create **all tables and columns first**, then integrity/indexes, authorization, derived reads, transactional commands, and publication. Use conventional 14-digit timestamps. Make `supabase db reset` from an empty database a mandatory early CI gate.

5. **blocker — Cross-sport conflict detection cannot work under the proposed ordinary command-role visibility.** A `NOBYPASSRLS`, non-table-owner SECURITY DEFINER function remains subject to RLS; coordinator policies hide other sports’ fixtures and rosters. The checker will miss precisely the cross-sport conflicts the addendum requires. **Fix:** add one narrowly privileged, private checker that can inspect event-wide fixtures/rosters, validates the caller’s authority over the proposed fixture, and returns only clashes involving that fixture. Pin its search path, revoke direct `anon`/`authenticated` execution, and call it from the authorized scheduling RPC. Test with a coordinator unable to SELECT the other sport’s roster.

6. **major — The command-role scheme is possible, but its privilege contract is unfinished.** “Limited DML grants” does not establish how coordinator commands lock/update `event_revisions`, append technical records, invalidate previously confirmed awards, or execute nonrecursive role helpers. Distinguishing internal engine writes from forbidden coordinator writes is delegated to unspecified implementation. **Fix:** supply concrete grants and representative policies for each category, including `USING`/`WITH CHECK` transitions on confirmed awards. Lock down function EXECUTE explicitly. CUT the elaborate role hierarchy if necessary: a few carefully authorized SECURITY DEFINER RPCs are safer than an unfinished custom privilege framework.

7. **major — Safe snapshots do not prevent raw-table leaks.** Anonymous SELECT on visible `match_slots` exposes `override_reason`; SELECT on confirmed `division_results` exposes `reason` and `confirmed_by`. Those rows can bypass the carefully sanitized snapshot/outbox projections through the Supabase REST API. **Fix:** separate public and staff projections and explicitly restrict sensitive columns or remove anonymous base-table SELECT in favor of tightly scoped public read functions. Test direct REST reads, not only application endpoints. Preserve publication enforcement when choosing view/function ownership.

8. **major — Realtime is described, but `<1s` delivery is not engineered or accepted.** The normal path is commit → logical replication → notification → 50–100 ms debounce → HTTP snapshot → render. There is no latency budget, measurement, load assumption, or acceptance threshold. **Fix:** instrument committed revision → visible score on two separate clients; require measured `<1s` on healthy supported connections under the expected event load. Keep a small public score-summary patch in the outbox for immediate card updates, refreshing standings/tally afterward. Document outage behavior separately; do not imply Supabase guarantees every viewer subsecond delivery.

9. **major — Polling fallback is not actually specified as a failover path, and its interval drifts beyond five seconds.** Reconnecting, a 30-second watchdog, and a build-time transport flag can leave a falsely “connected” UI stale. ±20% jitter permits six-second polling. **Fix:** specify transition rules: subscription error/timeout → polling; successful resubscription plus snapshot → realtime. Provide a runtime operations switch. Poll every five seconds while visible, staggering the initial request rather than extending the interval. A watchdog must check committed revisions, not merely channel status.

10. **major — Optimistic coordinator behavior is replaced by an unsaved local form, without acknowledgement semantics.** “Save progress” is acceptable, but the spec never defines whether the displayed score is draft, saving, or server-confirmed, or how an incoming update affects a pending optimistic save. **Fix:** show three explicit states; retain the original server snapshot, render the proposed save immediately, then reconcile by request ID and match revision. On rejection preserve the operator’s draft and show the authoritative score. Never announce an optimistic result as final.

11. **blocker — Advancement rules and actual contestants are not cleanly separated after play starts.** `match_slots` contains dynamic resolution and override fields, while scores and winner identity reference those slots. Re-resolving a live/final slot can silently attach an existing result to a different entrant. “Preserve participants” is a requirement, not an implemented storage rule. **Fix:** freeze contestant entry IDs at match start—either explicit recorded-entry fields or immutable started-slot resolutions. Upstream changes update eligibility/review state, never historical contestant identity. Only an audited reset may clear results and replace those contestants.

12. **major — Correction propagation must track invalidity, not just entrant changes.** A reviewed semifinal can still have the same apparent winner, but its outcome is no longer an eligible source. The “entrant unchanged → refresh provenance” rule risks leaving gold/bronze and medals official after an upstream source becomes invalid. **Fix:** define a usable source as final **and** valid, unarchived, and not `needs_review`. Propagate source invalidity through the descendant closure even when displayed contestants remain unchanged. Preserve historical scores while excluding invalid descendants from official advancement/awards.

13. **major — “Clear selected invalid results” allows incomplete resets.** An admin can apparently reset a semifinal without resetting already-played descendants that depended on its old contestants. The coordinator rejection path also leaves the original erroneous result official until admin intervention, which needs explicit operator messaging. **Fix:** compute the mandatory affected descendant closure; reject a reset selection that excludes required descendants. Show whether a correction is unapplied, committed-but-under-review, or resolved. For the deadline, CUT interactive graph selection: offer one reviewed “correct and reset affected downstream results” action.

14. **major — Medal uniqueness conflicts with correction handling.** Gold=X/silver=Y corrected to gold=Y/silver=X collides with the unique non-void entry constraint during ordinary updates. Keeping old awards as `needs_review` while creating replacement drafts also collides, because both states count as non-void. **Fix:** choose one lifecycle: update the two current award rows atomically using a safe transitional void state, or separate current proposed awards from confirmed award history. Keep before-images in audit. Test swaps, shared bronze, invalidated confirmation, and restoration of the original winner.

15. **major — Forfeit handling is underspecified across scoring, standings, and awards.** The prose says profiles determine forfeit credit, but set-based configuration provides no forfeit standings/aggregate policy. A forfeit after partially played sets also conflicts with “no unfinished sets” final validation unless explicitly exempted. Gold-final losers automatically receive silver even when event rules might distinguish forfeiture, withdrawal, or disqualification. **Fix:** define exact final validation exceptions; preserve real played scores without fabricating scores; specify Played/W/L and aggregate inclusion. Require admin confirmation of medal eligibility for exceptional outcomes. Do not add a full disciplinary system in this build.

16. **major — “Fully data-driven” currently means several unspecified JSON languages.** `standings_rules`, completion policies, `medal_policy`, tie resolution, and scoring configs have descriptions but no exact keys, defaults, permitted combinations, or seed examples. Two implementations cannot reliably agree on these. **Fix:** publish concrete versioned schemas and one complete seeded example per supported scoring kind. Define the boundary as “new sport using supported profiles requires seed/config only.” CUT metric-derived placements, separate deciders, and elaborate overtime configuration for launch; retain manual placement entry, direct simple scores, and set scoring.

17. **major — Generic profile and rules editors are a deadline trap, but deleting configuration would violate the brief.** The proposal requires schema-guided editors, profile previews, version cloning, affected-fixture previews, and competition-lock review workflows. **Fix:** use small preset selectors and basic forms for required values; allow validated JSON editing behind an admin-only advanced panel if necessary. Preserve admin-editable medal weights, durations, semifinal source slots, and manual overrides. CUT visual configuration builders and bulk reassignment previews.

18. **major — Coordinator fixture creation is not reconciled with entry/slot permissions.** Coordinators can create fixtures but cannot create division entries, configure slots, or edit source rules. Creating a fixture necessarily creates its participant slots; changing its division or teams can invalidate existing sources and scores. **Fix:** define coordinator creation as two existing own-sport division entries, with server-created fixed-entry slots; support placement entrants through the same authorized command. Permit edits only before play, except separately authorized time/venue updates. Keep division reassignment and playoff dependency-rule editing admin-only.

19. **major — The tested overlap utility required by the addendum is not specified.** Listing “overlap utilities” in build phases does not define an implementation or test cases. **Fix:** require `aStart < bEnd && bStart < aEnd`, with UTC instants and `end = start + override-or-sport-duration`. Test touching boundaries as nonoverlapping, containment, identical intervals, midnight crossing, Manila conversion, invalid duration, and exclusion of the edited fixture itself. Match the SQL predicate against the TypeScript utility.

20. **major — Warning acknowledgement has no safe save protocol.** A report hash/table is listed, but nothing says whether a stale acknowledgement can authorize a changed fixture or newly discovered conflicts. A preflight-only check is insufficient. **Fix:** inside the event-locked save transaction, recompute clashes and compare an acknowledgement token bound to proposed inputs and the current conflict set. Return typed warnings if it differs; persist only after acknowledgement. State explicitly: coordinators may acknowledge own-sport saves; admins may always override scheduling warnings; neither may override structural/scoring invalidity.

21. **major — Conflict confidence relies on metadata that does not exist.** §11 says roster completeness is tracked through “validated roster/import metadata,” but no completeness column or status is defined. Empty membership could mean verified no players or completely missing data. **Fix:** add entry-level `roster_status = unknown|verified` and verification timestamp; expose an “incomplete conflict check” warning for unknown entries. Use stable player IDs across sports, with admin-reviewed identity reconciliation. CUT duplicate-name suggestion/merge tooling; a simple searchable person picker and CSV with stable IDs suffice initially.

22. **major — Duration changes and unresolved contestants can silently invalidate prior warnings.** Changing a sport default changes the effective interval of every fixture without editing the fixture. TBD slots cannot reveal player clashes until advancement resolves them. **Fix:** recompute affected conflicts after duration, roster, and participant changes, emit console invalidations, and mark affected fixtures as newly conflicted/unverified. Acknowledgements are historical evidence, not permanent clearance. Never roll back a correct competitive result because its advancement creates a scheduling clash.

23. **major — Venue double-booking can be bypassed through the mixed venue model.** Fixtures retain free-text `venue`/`court` plus nullable `venue_id`; canonical venues represent exclusive resources, but the authoritative booking key is not defined. **Fix:** use `venue_id` as the booking resource and derive display text. Seed “DMMMSU Covered Court” once. If multiple independent courts exist, model each as its own resource with a shared display location; otherwise do not assume they are independently bookable. Missing/unmapped venue must produce an incomplete-check warning, not “no conflict.”

24. **major — “All other fixtures” needs an explicit inclusion contract.** Otherwise implementations will disagree about final matches, cancellations, archives, missing times, placement entrants, and duplicated player memberships. **Fix:** check all timed, noncancelled, nonarchived event fixtures across sports, including finals; exclude the current fixture ID. Union active players of effective entries. Label untimed/TBD fixtures as unchecked. Separately warn when the same player appears on opposing entries in one fixture rather than silently deduplicating that problem away.

25. **major — The conflicts view is a route placeholder, not a defined read model.** There is no row shape, grouping, freshness rule, or privacy projection for per-player/per-team lists. Generic invalidations alone also do not identify which private console data needs refresh. **Fix:** define rows containing local fixture/team, player, other fixture label, sport, interval, venue conflict if applicable, and current acknowledgement state. Coordinators may see only rows involving an own-sport fixture, with narrowly disclosed other-match details—not the other sport’s full roster. Reuse the save checker’s result model; CUT a second analytics engine.

26. **major — Mock persistence and full SQL/TypeScript behavioral duplication consume the deadline without satisfying additional binding scope.** IndexedDB atomic audit/idempotency, cross-tab serialization, import/export, and exhaustive adapter parity are self-imposed. Building the production backend only after these is backwards. **Fix:** use a small seeded mock adapter with localStorage or in-memory state, obvious demo identity, and the same UI/request shapes. Start local Supabase on day one using locally generated keys. Keep production correctness in a small transactional backend and test essential mock parity, rather than implementing a second complete database.

27. **major — The importer is an entire second product.** Workbook extraction, merged-heading normalization, alias reconciliation, field-level diff approval, official result handling, app-edit preservation, and transactional reimport UI are excessive for replacing one known sheet before Monday. **Fix:** CUT in-app import and general reimport. Deliver a one-shot normalization script, reviewed JSON/SQL, a validation report, and explicit production application instructions. Include the ten named delegations and verified volleyball fixtures; report unknown entrants/times rather than manufacturing them. In-app fixture editing remains mandatory.

28. **major — Account provisioning stops short of a functioning invite/reset journey.** Redirect URLs are mentioned, but no Auth callback route, recovery session handling, or password-setting screen is specified. The first match cannot wait for SMTP troubleshooting. **Fix:** implement and test invite acceptance, callback/session exchange appropriate to the chosen Supabase flow, password setting, and recovery. Document dashboard creation/reset as an emergency operator fallback. Verify the first admin and both volleyball coordinators on the real deployed origin before importing/publishing data.

29. **major — The public experience omits explicit palette and hype requirements.** There is no enforceable dark-blue/white/dark-red/gold token set, and “sport navigation” is not the requested per-sport display cards. The described home can become a generic database dashboard. **Fix:** specify exact accessible color tokens and ship a prominent live scoreboard, sport-card grid/carousel with live/next/result summaries, countdown, and visually dominant medal tally cards. Add restrained score/winner transitions with reduced-motion support. CUT team-detail routes and custom sharing-image infrastructure before cutting the public event identity.

30. **major — Mobile coordinator scoring remains a spreadsheet.** “Sequential set rows” and numeric inputs do not satisfy big touch-friendly score steppers; no sizes, sticky controls, accidental-input safeguards, or keyboard behavior are specified. **Fix:** use ≥48 px plus/minus targets, clear team labels, tabular large digits, direct numeric entry, and a sticky Save/Finalize bar above safe-area insets. Disable minus at zero; avoid long-press runaway increments. Show the active set separately, keep previous sets collapsed/readable, and test at 360 px with the keyboard open.

31. **major — Public mobile density and Realtime focus stability are unresolved.** Horizontally scrollable standings are permitted, but tally columns, full placement lists, schedule filters, brackets, and changing live ordering can overwhelm a phone or move content under a tap. “Bounded snapshots” has no actual limits. **Fix:** use compact tally cards, abbreviated standings with detail expansion, a filter drawer, stacked semifinal/medal-round cards, and bounded latest-results lists. Keep open forms and actively touched cards stable during updates. Split snapshots by event summary, division, and match detail; do not fetch every segment, placement, and fixture on every score.

32. **blocker — FIRST CHANGE (1/5): eliminate the fictional delivery scope.** **Fix:** replace the ten-phase plan with an hour-budgeted 48-hour plan; freeze the mandatory workflows and immediately cut custom import/reimport UI, graph tooling, advanced profile editors, rich audit UI, and transactional mock machinery.

33. **blocker — FIRST CHANGE (2/5): establish a deployable, secure vertical slice before more UI.** **Fix:** finish migration dependencies and GitHub deployment instructions; run a clean local reset; prove coordinator-owned scoring, rejected cross-sport writes, private roster reads, and the privileged event-wide conflict checker. Deploy this slice to Vercel/Supabase early.

34. **blocker — FIRST CHANGE (3/5): make result corrections safe.** **Fix:** freeze started contestants, propagate invalid-source review through descendants, make reset closure mandatory, and resolve medal-swap uniqueness. Test a corrected semifinal after the gold match has started before trusting automatic advancement.

35. **blocker — FIRST CHANGE (4/5): complete the user-added scheduling contract.** **Fix:** finish §11; implement fixture create/edit with canonical venues, stable player identities, explicit duration/roster confidence, tested half-open overlap logic, atomic warning acknowledgement, and scoped per-player/per-team conflict lists.

36. **major — FIRST CHANGE (5/5): rehearse the actual event experience, not the demo.** **Fix:** load reviewed volleyball data, confirm scoring/points/durations, test two-phone scoring-to-public `<1s` delivery and five-second fallback, and finish the branded mobile live cards/tally plus touch-first coordinator editor. Freeze features by hour 40 and spend the remaining time on production Auth, setup verification, and operational recovery.

=== SPEC v2 ===
# PGLUlympics — Build Specification v2 (CONVERGED)

Status: converged after spec-finetune loop — Astra draft v1 (3 parts), round-1 critiques by
gpt-6.1-sol + gpt-5.6-sol (36 + 10 findings, strongly convergent), reconciled by coordinator.
§11 is **user-added scope** (2026-11-07). Where v2 differs from the v1 draft, v2 wins; the v1
draft's deeper domain detail (standings tie-break math, medal policy edge cases) remains the
reference for anything v2 marks "per v1 §x".

| Item | Decision |
|---|---|
| Product | **PGLUlympics** — PGLU (Provincial Government of La Union) inter-office sports fest, Nov 9–26, 2026. First matches Mon Nov 9, 13:00 Asia/Manila |
| Repo | `halords/pglulympics`, branch `main`; push triggers Supabase migrations (GitHub integration) AND Vercel deployment |
| Stack | Next.js App Router + TypeScript (Vercel); Supabase Postgres + Auth + Realtime; Tailwind |
| Data principle | Sports/formats/fixtures/scoring/advancement are seed data + config, never sport-name conditionals. New sport on supported profiles = seed only |
| Deadline discipline | 48-hour MVP (§9). Anything not listed in §9's mandatory workflows is CUT (§9.3) |

## 0. MVP freeze (round-1 blocker fix)
Mandatory: official seed live; public home/sport/schedule/tally; coordinator scoring for the 3
scoring kinds; admin essentials (fixtures, rosters, awards, accounts, config values); fixture
create/edit RPC with conflict check; Realtime patch + 5s polling fallback. Everything else is
cut or post-event (§9.3). Mock mode is a THIN adapter (§3.4), not a second database.

## 1. Data model

Conventions: UUID PKs; `timestamptz` UTC storage, Asia/Manila display; `created_at`/`updated_at`
on mutable tables; scores are non-negative integers; every FK indexed. Enums:
`match_status(scheduled|live|final|cancelled)`, `match_stage(round_robin|semifinal|bronze|gold|placement)`,
`scoring_kind(set_based|simple|placement_only)`, `award_state(draft|confirmed|void)`,
`roster_status(unknown|verified)`, `slot_source(entry|group_rank|match_outcome)`.

| Table | Key columns (beyond id/timestamps) | Notes |
|---|---|---|
| `events` | slug, name, start/end date, `gold_points`,`silver_points`,`bronze_points` (ints ≥0), `points_provisional bool` | One row: PGLUlympics 2026. Points admin-editable; tally shows "provisional" badge while flag set |
| `teams` | event_id, name, slug, color, display_order | The 10 overall delegations |
| `sports` | event_id, name, slug, icon_key, display_order, `default_duration_minutes int` | Duration default feeds §11 conflict intervals; admin-editable |
| `divisions` | sport_id, name, slug, `scoring_kind`, `scoring_config jsonb`, `standings_config jsonb`, `medal_policy jsonb`, display_order | Configs follow §1.1 schemas exactly; locked (RPC-enforced) once any division match is live/final |
| `groups` | division_id, name, display_order | Brackets (e.g. Bracket A/B); nullable use = groupless divisions |
| `division_entries` | division_id, team_id, group_id nullable, label, `roster_status` | One entry per team per head-to-head division; placement divisions may have several named entries per team |
| `players` | event_id, full_name | Event-scoped people with STABLE ids across sports |
| `roster_memberships` | entry_id, player_id | PK(entry,player). Staff-only visibility (§2) |
| `venues` | event_id, name | Canonical booking resources. Seed: "DMMMSU Covered Court" |
| `matches` | division_id, group_id nullable, stage, status, label, `starts_at`, `duration_minutes int nullable` (override), venue_id nullable, venue_text nullable, `revision int`, `needs_review bool`, published bool, `conflict_ack jsonb nullable` | Effective duration = duration_minutes ?? sport.default. `conflict_ack` stores §11 acknowledgement {hash, by, at} |
| `match_slots` | match_id, slot_no, source, source_entry_id / source_group_id+source_rank / source_match_id+source_outcome, `resolved_entry_id`, `override_entry_id`, `frozen_entry_id` | Effective entry = frozen ?? override ?? resolved. `frozen_entry_id` set once at match start and never changed except via §7 reset |
| `match_segments` | match_id, segment_no, kind(set|period), status(open|closed) | Sequential; ≤1 open |
| `segment_scores` | segment_id, slot_id, points | PK(segment,slot); exactly 2 rows per head-to-head segment |
| `match_totals` | match_id, slot_id, points | Simple kind with direct totals only; never mixed with period segments in one match |
| `placement_results` | match_id, slot_id, place nullable, finish_status(finished|dnf|dns|dq), note | Final requires every entrant accounted for |
| `division_results` | division_id, award_key (e.g. `gold`, `bronze:1`), medal, entry_id, state, source(manual|playoff|placement), source_match_id | Partial unique indexes: (division_id, award_key) and (division_id, entry_id) WHERE state='confirmed' — swaps = void old + insert new in ONE transaction (§1.3) |
| `account_profiles` | user_id PK→auth.users, role(super_admin|coordinator), sport_id nullable, display_name, active | Coordinator ⇒ sport required; super_admin ⇒ sport null. One ACTIVE coordinator per sport (partial unique) |
| `audit_log` | event/sport ids nullable, actor_id, action, entity_type, entity_id, before/after jsonb, reason | Append-only, written by RPCs. No UI in MVP |
| `event_updates` | event_id, revision (from sequence), changed_match_ids uuid[], changed_division_ids uuid[], topics text[], `patch jsonb` | PUBLIC-SAFE outbox committed with each mutation: patch = score summaries of changed matches (id, status, label, slots' team names, segment scores, totals) sufficient to repaint live cards WITHOUT a refetch. No audit/account/roster data ever |

### 1.1 Config schemas (concrete; unknown keys rejected server-side)
- `scoring_config` set_based: `{best_of: 3|5, set_target: 25, deciding_set_target: 15, win_by: 2, cap: null|int≥target, allow_forfeit: true}`.
  Seeded volleyball (PROVISIONAL — owner confirms before first serve): best_of 3, 25/15, win_by 2, no cap.
- simple: `{entry_mode: "total"|"periods", periods: ["Q1","Q2","Q3","Q4"]|null, allow_draw: bool, standings_points: {win:3, draw:1, loss:0, forfeit_loss:0}}`.
- placement_only: `{allow_ties: true, rank_style: "competition"}` — manual places only at launch (metric-derived places CUT).
- `standings_config`: `{order: ["win_pct","wins","head_to_head","set_ratio","point_ratio"], show_draws: bool}` for set_based;
  simple default order `["points","diff","scored","head_to_head"]`. Tie-break math per v1 §1.3 (mini-table head-to-head, exact fractions, infinity ratios).
- `medal_policy`: `{place_to_medal: {"1":"gold","2":"silver","3":"bronze"}, max_per_medal: {"gold":1,"silver":1,"bronze":1}, shared_allowed: false}`.
  Playoff divisions: gold-final winner/loser → gold/silver drafts; bronze-final winner → bronze draft (§1.3).

### 1.2 Standings & tally (derived, never stored counters)
- SQL views `group_standings` (per division/group: played, W, L, D, win_pct, sets W/L, points for/against)
  computed from FINAL, valid (not needs_review), non-cancelled RR matches only. Live scores never count.
- `overall_tally` view: from CONFIRMED division_results joined entry→team: gold/silver/bronze counts,
  points = counts × event medal points; rank by points desc → gold → silver → bronze → name (display).
- Forfeit: a final outcome with winner/loser + reason; counts as Played/W/L; contributes NO segment
  scores or ratios; partial real sets played before a forfeit are kept as-is and the final-validation
  "no unfinished sets" rule is waived for the forfeited match (v1 §1.2 exception, made explicit here).
  Medal eligibility from a forfeited final requires admin confirmation like any award (§1.3).

### 1.3 Awards lifecycle
Engine writes DRAFT candidates when a gold/bronze final or the division's medal placement match
goes final. Only super_admin confirms (RPC `confirm_awards(division_id, awards[])`): one transaction
voids the division's existing confirmed set and inserts the new confirmed set (handles winner swaps
without unique-index collisions). Manual awards allowed (externally decided results) with reason;
never to an unregistered team. Drafts/needs-review awards never appear in the public tally.

## 2. Auth, authorization, RLS

Roles: anonymous public; `coordinator` (sport-scoped); `super_admin`. Supabase Auth email+password;
invite acceptance + password-set + recovery flows are IN MVP scope, plus dashboard-created users as
emergency fallback (checklist §8.3). First super_admin is bootstrapped by SQL (checklist §8.3).

Mechanics (round-1 fixes applied):
- Helper predicates (SQL, `stable`, pinned search_path): `is_admin()`, `coordinates_sport(sport_id)`,
  `can_read_match(match_id)`, `can_write_match(match_id)` — all keyed on `auth.uid()` + account_profiles.
- FEW SECURITY DEFINER RPCs own all multi-table writes (§5/§7/§11 list them). Each: `security definer`,
  owner = a dedicated role with the needed DML grants, `search_path` pinned, EXECUTE revoked from
  PUBLIC and granted to `authenticated` only; caller authority re-checked inside via auth.uid().
- **Base tables get NO anonymous SELECT** where columns are mixed-sensitivity (matches, match_slots,
  division_results, groups, divisions configs, players, roster_memberships, audit_log, event_updates raw).
  Public reads go through projection views exposed to anon: `public_schedule`, `public_match_cards`
  (id, sport/division names, label, stage, status, starts_at, venue text, team names per slot,
  segment scores, totals, winner), `group_standings`, `overall_tally`, `public_results`
  (confirmed awards: division, medal, team name). Views contain ONLY approved fields.
  Safe static tables (events, teams, sports, divisions names, groups, venues) may allow anon SELECT
  on published rows, with configs excluded via a names-only view for divisions.
- Staff reads: coordinators SELECT their sport's rows (all tables incl. rosters of own-sport entries)
  + event-wide fixture basics (id, division→sport, starts_at, duration, venue) needed for §11 —
  NOT other sports' rosters or scores detail. Admins read all.
- Writes: direct DML only for admin CRUD on simple entities (teams, sports, divisions, groups,
  entries, players, venues, event points) under `is_admin()` policies. Coordinators get NO direct
  DML on matches/slots/scores — everything through RPCs. Roster membership writes: admin only (MVP).
- Every RLS claim ships with an integration test: cross-sport coordinator write rejected;
  anon REST read of base match_slots denied; coordinator cannot SELECT another sport's roster.

## 3. Realtime, polling, mock — one data contract

### 3.1 Contract
A single `DataProvider` interface consumed by all UI: `getSnapshot(scope)`, `subscribe(scope, cb)`,
command methods mirroring the RPCs. Scopes: `event` (summary: live cards, next up, tally),
`division` (standings + fixtures), `match` (detail). Snapshot payloads are bounded: event scope
carries match CARDS (no segment history beyond current), lists are capped (latest results ≤ 20).

### 3.2 Realtime (Supabase)
- Subscribe to `event_updates` inserts (publication in migration 5) filtered by event.
- On insert: apply `patch` IMMEDIATELY to affected live/result cards (this is the <1s path);
  then debounce 300ms and refetch affected scopes (standings/tally) in the background.
- Revisions are per-event sequence values; a gap ⇒ refetch snapshot (no replay).
- Health: if no channel `SUBSCRIBED` within 5s, or channel errors, or 15s watchdog sees a newer
  committed revision (cheap HEAD poll of max revision) without messages → auto-switch to polling
  and show a subtle " reconnecting" state. Resubscribe + snapshot restores realtime.
- ACCEPTANCE: two browsers on hosted Supabase, coordinator saves a point → p95 commit-to-visible < 1s.

### 3.3 Polling fallback
Same DataProvider over REST snapshot endpoints; poll every 5.0s while page visible (no jitter beyond
5s), pause when hidden, immediate fetch on focus. Selected by env flag `NEXT_PUBLIC_DATA_TRANSPORT`
(realtime|polling|mock) OR forced at runtime by §3.2 failover (runtime wins).

### 3.4 Mock mode (pre-keys development)
In-memory store seeded from `data/seed.json`, persisted to localStorage; demo identities
(admin + per-sport coordinator) selectable without passwords, clearly badged "DEMO DATA".
Same UI, same command shapes, simulated 300ms latency. NO IndexedDB transactions, cross-tab
sync, or audit parity (cut). Local Supabase (CLI) is used from hour 0 for the real backend path.

## 4. Public site (mobile-first; hype is a requirement, not polish)

Palette tokens (binding): `--blue-950 #061A3A` (primary ground), `--blue-800 #0B3D91`-family accents,
`--white #FFFFFF`, `--red-800 #8B1E1E` / `--red-600 #C1272D` (live/accents), `--gold #D4A017`
(medals/highlights ONLY). Light content surfaces on white with blue-950 text; dark hero/scoreboard.
All text pairs meet WCAG AA on their ground. Reduced-motion variants for every animation.

Routes:
- `/` Home: hero (event name, dates, countdown to first/next match), **LIVE scoreboard strip**
  (all live matches across sports, patch-updated), **sport display-card grid** — one card per sport:
  name, icon, live count, next match, latest result, link; **medal tally card** (top-5 + link to full);
  up-next list (bounded), latest results (bounded ≤10).
- `/tally`: full overall tally table/cards (all 10 teams, medals, points, rank; provisional badge if set).
- `/sports/[slug]`: sport hub — divisions, live + up next, standings per group, fixtures/results.
- `/schedule`: event-wide schedule, filter by day + sport (drawer on mobile), stacked cards.
- `/matches/[id]`: match detail — teams, per-set/period scores, status, venue, time.
- Display cards everywhere use the same MatchCard component: status pill (LIVE pulses red),
  team names, big score (sets won + current set points for set_based; total for simple; places for placement).
- Pre-event state (now → Nov 9): countdown hero, full schedules + standings shells visible; no fake results.
- Updates must never move a card a user is touching/reading: lists keep stable order within a render
  (live strip sorted by start time, not by last update).

## 5. Coordinator console

Routes under `/console` (auth-gated, sport-scoped):
- `/console`: my sport today — live + upcoming matches of own sport, big tap targets.
- `/console/matches/[id]`: scoring screen per kind (§5.1).
- `/console/fixtures`: own-sport fixture list + create/edit (§11).
- `/console/conflicts`: conflicts view (§11.4).
- `/console/roster`: own-sport rosters READ view (edits are admin-only in MVP).

### 5.1 Scoring UX (touch-first, 360px-verified)
- Score state is explicit: `draft` (local) → `saving` → `server-confirmed`; the confirmed server
  snapshot is always shown distinctly from the local draft. On save rejection the draft is preserved
  with the error visible; an optimistic score is NEVER displayed as final.
- Steppers: **≥48px** +/− targets, large tabular digits, team names always adjacent to their score;
  minus disabled at 0; no long-press repeat. Direct numeric entry allowed.
- set_based: active set front-and-center; closed sets collapsed but readable; "Close set" validates
  target/win_by/cap; sets won auto-tallied; starting a match freezes contestants (§7).
- simple: totals mode = two big steppers; periods mode = per-period rows + auto total.
- placement_only: place assignment list (tap entry → assign next place / pick place), finish statuses.
- Status flow buttons: Start (scheduled→live), Finalize (live→final, validates completeness),
  plus correction request (final→needs_review flag for admin; coordinator cannot silently edit a final).
- Sticky action bar (Save / status action) above the safe-area inset; works with keyboard open.
- Commands are RPCs: `save_score(match_id, expected_revision, payload)`, `set_match_status(...)`.
  `expected_revision` mismatch ⇒ server returns current snapshot; UI reconciles (no silent overwrite).

## 6. Admin (`/admin`, super_admin only)
- Dashboard: event status, sports list, pending reviews (needs_review matches, draft awards), conflicts summary.
- CRUD (direct DML under RLS): teams, sports (incl. default duration), divisions (+ config forms:
  preset selectors + validated JSON advanced field — NO visual config builders), groups, entries, venues.
- Fixtures: full create/edit (§11) incl. playoff slots' sources; bracket topology is admin-only.
- Rosters: player directory (create/search people), membership editor per entry, `roster_status` toggle.
- Awards: review drafts → confirm/replace (atomic, §1.3); manual award with reason; medal points editor
  + provisional flag on the event.
- Accounts: list account_profiles; create coordinator (Auth invite via Supabase, profile row with sport),
  deactivate. One active coordinator per sport enforced.
- Reviews: needs_review queue — inspect correction, apply §7 reset closure, or clear the flag.

## 7. Advancement engine

- Slot sources: `entry` (fixed), `group_rank` (group + rank → from group_standings), `match_outcome`
  (winner/loser of a source match). Default volleyball seeding (config, admin-editable):
  Semis G1 = A#1 vs B#2; Semis G2 = B#1 vs A#2; Bronze = loser(Semis G1) vs loser(Semis G2);
  Gold = winner(Semis G1) vs winner(Semis G2).
- Resolution runs INSIDE the scoring RPC transaction: when a source becomes final+valid, resolve
  dependent slots (unless that match has started/final — then flag needs_review instead of touching it).
  A slot's source is USABLE only if source match is final AND not needs_review AND not cancelled AND
  standings (for group_rank) are complete + untied at that rank (v1 §1.3/§1.5: a tie crossing a
  qualification rank blocks auto-resolution → slot stays pending + admin tie_resolution on the group).
- FREEZE: `start_match` copies effective entries into slots' `frozen_entry_id`. Scores, standings
  display and history always use frozen entries for started matches. Upstream corrections NEVER
  rewrite a started match's contestants.
- Invalidity propagation: if a final source is corrected/reopened, walk the dependent closure:
  unstarted dependents lose resolution (back to pending) or take the corrected entry; started/final
  dependents get `needs_review=true` and their derived awards revert to draft/needs-review
  (excluded from tally until re-confirmed) — even if the displayed contestants look unchanged.
- Reset: admin action `reset_match(match_id)` computes the MANDATORY descendant closure (all matches
  whose slots depend on it, transitively, that are live/final) and resets them together (scores cleared,
  status back to scheduled, frozen cleared); partial resets are rejected. One action, audited. No graph UI.
- Manual override: admin may set `override_entry_id` on an unstarted slot with reason (audited);
  override beats resolution until cleared.

## 8. Seed, migrations, setup

### 8.1 Repo artifacts
`data/seed.json` (normalized source of truth, from the sheet), `data/sheet-extract.md` (audit trail),
`supabase/migrations/*.sql`, `supabase/seed.sql` (LOCAL/preview only — mirrors the official data for
`supabase db reset`; it is NOT the production seeding mechanism), `.env.example`, `SETUP.md` (non-expert guide).

### 8.2 Migration breakdown (14-digit timestamps; ALL tables first — round-1 fix)
1. `20261107090000_schema.sql` — extensions, enums, ALL tables + FKs + indexes (incl. players/rosters/venues/§11 columns).
2. `20261107090100_rls.sql` — helper predicates, grants, RLS enable + policies (staff + admin direct DML).
3. `20261107090200_views.sql` — group_standings, overall_tally, public projections.
4. `20261107090300_rpcs.sql` — scoring/status/advancement, fixture create/update + conflict checker, awards, admin helpers.
5. `20261107090400_realtime.sql` — event_updates in supabase_realtime publication; replica identity as needed.
6. `20261107090500_official_data.sql` — IDEMPOTENT official data (upserts by natural keys/slugs):
   event, 10 teams, venue, volleyball sport/divisions/groups/entries, 40 fixtures + playoff slot sources,
   provisional volleyball scoring config. This migration IS the production bootstrap.
- Gate: `supabase db reset` from empty must pass locally before any push (CI-equivalent check in §9).

### 8.3 Production path (sole path — round-1 fix)
- Merge to `main` ⇒ Supabase GitHub integration applies migrations to the connected project;
  Vercel deploys the app from the same push. CLI `db push` is LOCAL/emergency-recovery only, never a second writer.
- Verify after merge: Supabase dashboard → Database → Migrations shows all 6 applied; run the count
  check in SETUP.md (10 teams, 40 volleyball fixtures, 2 divisions).
- Owner steps (SETUP.md, non-expert, exact clicks): (1) confirm integration branch = main;
  (2) create own Auth user in Supabase dashboard; (3) run the provided SQL snippet to make that user
  super_admin (insert into account_profiles); (4) set Vercel env: NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (fallback NEXT_PUBLIC_SUPABASE_ANON_KEY), SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_DATA_TRANSPORT=realtime; (5) sign in, confirm volleyball profile + medal points,
  create coordinator accounts from /admin; (6) two-phone smoke test (§3.2 acceptance).

## 9. Build phases (48-hour critical path; freeze at H40)

| Window | Deliverable | Verify |
|---|---|---|
| H0–4 | Scaffold (Next.js+TS+Tailwind), migrations 1–2 skeleton, DataProvider interface + mock adapter w/ seed.json, local Supabase reset gate | `supabase db reset` clean; app boots in mock mode |
| H4–12 | Migrations 3–5 (views, scoring RPCs, realtime), public shell: home (countdown, sport cards, tally card), sport page, schedule, standings — all on mock, one sport real-shaped | Volleyball renders end-to-end from seed; RLS tests: cross-sport write rejected, anon base-table read denied |
| H12–20 | Auth (invite/password/recovery), console scoring screens for 3 kinds, status RPCs, freeze + advancement resolution | Two-user rehearsal on local Supabase: coordinator scores, admin sees; cross-sport RPC rejected |
| H20–28 | Realtime patch path + polling failover, public live polish (scoreboard strip, transitions, tally), match detail | §3.2 acceptance on hosted Supabase preview: p95 <1s |
| H28–36 | §11: fixture create/edit RPC + conflict checker, conflicts views, roster admin + roster_status | Overlap utility test suite green (§11.6); coordinator scheduling rehearsal |
| H36–40 | Admin essentials (CRUD, accounts, awards confirm, reviews queue), official data migration final check | Full dress rehearsal on seed data: RR→semis→finals→awards→tally |
| H40–48 | Deploy via merge to main, owner setup (SETUP.md), two-phone production smoke, buffer | §8.3 verification counts; production <1s check |

### 9.3 CUT list (do not build)
In-app sheet importer/reimport + diff UI · bracket graph editor/visual config builders · audit-log UI ·
mock IndexedDB/cross-tab/export machinery · team detail pages · share-image generation · metric-derived
placements, separate deciders, elaborate overtime · duplicate-name merge tooling · per-sport subdomains.

## 10. Risks & open questions
1. **Volleyball set format unconfirmed** (best-of/sets/targets) — seeded provisional best-of-3, 25/15.
   Owner/coordinators confirm before Nov 9; config-only change.
2. **Medal points values unknown** — sheet shows a POINTS column, no weights. Seeded 5/3/1 with
   `points_provisional=true`; admin edits in /admin; tally badged provisional until unset.
3. **Semifinal crossover assumed** A1vB2 / B1vA2 (sheet silent) — config + manual override cover alternatives.
4. **Remaining sport tabs not yet extracted** (browser-blocked at build time) — architecture is
   seed-driven; adding a sport = new seed + one data migration, no code change. Volleyball ships complete.
5. Supabase GitHub integration specifics (branch config, failure surfacing) verified by owner in §8.3 step 1.
6. Player identity is name-level by design (stable ids, admin-curated) — same-name different people
   are possible; roster_status + admin curation is the mitigation accepted for MVP.

## 11. Scheduling, Rosters, and Conflict Detection (user-added scope)

### 11.1 Single permission rule (supersedes any earlier "scoring-only" wording)
- super_admin: create/edit ANY fixture, any slot source, bracket topology, venues, durations.
- coordinator: create/edit fixtures **in own sport only**, via RPC `create_fixture`/`update_fixture`.
  A coordinator fixture = a division of own sport + two EXISTING division entries (head-to-head) or
  existing entries list (placement). The RPC atomically creates the match + fixed `entry` slots and
  applies the division's scoring config. Coordinators may NOT create entries, edit slot sources
  (group_rank/match_outcome), or touch playoff topology. Edits allowed freely before the match starts;
  after start, only time/venue edits (which re-run §11 checks); division/teams locked.
- All fixture saves run the §11.3 checker inside the same transaction (never preflight-only).

### 11.2 Data (in §1 schema)
`players` (stable event-scoped ids), `roster_memberships(entry, player)`, entry `roster_status
(unknown|verified)`, canonical `venues`, `matches.venue_id` (booking resource; venue_text is display
fallback only), `sports.default_duration_minutes` + `matches.duration_minutes` override,
`matches.conflict_ack`. Roster edits are admin-only in MVP; coordinators read own-sport rosters.

### 11.3 Conflict checker (privileged, exact)
Implemented as ONE internal function used by the fixture RPCs and the conflicts view (§11.4):
- **Interval**: for a fixture f: `start = f.starts_at`, `end = start + coalesce(f.duration_minutes,
  sport.default_duration_minutes)`. Overlap is HALF-OPEN: `a.start < b.end AND b.start < a.end`
  (touching boundaries do NOT conflict). All math in UTC instants (inputs converted from Asia/Manila).
- **Inclusion set**: all fixtures in the event with a start time, status ≠ cancelled, not archived —
  INCLUDING finals and other sports — excluding the fixture being saved itself.
- **Participants**: for each fixture, the union of ACTIVE roster players of its EFFECTIVE entries
  (frozen ?? override ?? resolved). A player on multiple entries counts once per fixture.
  Fixtures with unresolved (TBD) slots are checked for venue only and marked `partial`.
- **Player clash**: same player in the participant sets of two overlapping fixtures.
- **Venue clash**: same non-null venue_id on two overlapping fixtures.
- **Same-fixture anomaly**: a player appearing on BOTH sides of one fixture is a warning row, not a clash.
- **Incomplete signals** (returned, not silent): any participating entry with `roster_status=unknown`
  or empty membership ⇒ `incomplete: roster_unverified`; fixture with null venue_id ⇒
  `incomplete: venue_unmapped`; TBD slots ⇒ `incomplete: participants_unresolved`.
- **Privilege**: the checker is a SECURITY DEFINER function with event-wide read (it MUST see other
  sports' fixtures/rosters), pinned search_path, callable ONLY from the authorized fixture RPCs and
  conflicts-view RPC (no direct anon/authenticated EXECUTE). It returns ONLY clashes involving the
  proposed fixture — never other sports' rosters or unrelated fixtures.
- **Result shape**: `{playerClashes: [{player_id, player_name, other_match_id, other_label,
  other_sport, other_starts_at, other_ends_at}], venueClashes: [{venue_id, venue_name, other_match_id,
  other_label, other_sport, other_starts_at, other_ends_at}], anomalies: [...], incomplete: [...]}`.

### 11.4 Save / acknowledgement protocol (no stale approvals)
- `create_fixture`/`update_fixture` accept an optional `ack_hash`. Inside the save transaction the
  checker recomputes clashes for the PROPOSED fixture. `ack_hash = sha256(canonical proposed fields +
  sorted clash keys + incomplete keys)`.
- If clashes/incomplete exist and `ack_hash` ≠ recomputed hash ⇒ nothing persists; RPC returns
  `{status:"warning", ack_hash, conflicts}` and the UI shows the specific clashes inline with a
  "Save anyway" button that resubmits with that hash.
- If hashes match ⇒ persist, storing `conflict_ack = {hash, by: auth.uid(), at: now}` on the match.
- **Override rights**: coordinators may acknowledge warnings for own-sport fixtures (that IS their
  save path); admins may acknowledge any. Acknowledgement NEVER overrides structural invalidity
  (wrong division, nonexistent entries, config violations, RLS) — those are hard errors.
- **Revalidation**: roster edits, duration changes (sport default or fixture override), participant
  resolution (advancement), and time/venue edits re-run checks for affected fixtures; newly clashing
  fixtures surface in §11.5 views. A stored ack is historical evidence, not permanent clearance.
  Competitive results are NEVER rolled back because a clash appears.

### 11.5 Conflicts views (console)
One read model (RPC `list_conflicts(scope)`) reusing the §11.3 result shape, rows:
`{fixture (own/local), label, sport, division, starts_at, ends_at, kind: player|venue,
player_name (player rows), other_fixture_label, other_sport, other_time, acked: bool}`.
- `/console/conflicts`: tabs **By player** / **By team**; grouped, sorted by time.
- Coordinator sees only rows where at least one fixture is own-sport; the other fixture is disclosed
  narrowly (label, sport, time, venue) — never its roster beyond the clashing player's name.
- Admin sees all rows event-wide. Public site NEVER sees conflicts or rosters.

### 11.6 Overlap utility + tests (binding)
Pure TypeScript utility `lib/conflicts/overlap.ts` (`intervalOf(fixture, sportDefault)`,
`overlaps(a,b)`, `findClashes(...)`) used by the console for instant pre-checks; the SQL checker is
the authority and MUST implement the identical predicate. Unit tests (vitest) must cover:
touching boundaries (no clash), containment, identical intervals, partial overlap, midnight crossing,
Asia/Manila→UTC conversion, duration override vs sport default, invalid/zero duration rejected,
self-exclusion by fixture id, same-player-both-sides anomaly, venue clash without player clash,
unverified-roster incomplete flag. SQL parity test: same fixture set through both implementations
⇒ identical clash sets.

---
*End of SPEC v2. Build strictly to this document; deviations require a STATE.md note.*
