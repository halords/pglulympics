# STATE — PGLUlympics Live Tracker

Updated: 2026-11-07 (build session 1) — **BUILD COMPLETE, push-ready.**
Next step: main agent pushes the whole tree one-shot to halords/pglulympics `main`;
user follows SETUP.md (Step 0 integration proof first).

## ✅ Delivery status
- SPEC.md **v2.1 CONVERGED** (spec-finetune loop: Astra draft → 6.1-sol + 5.6-sol critiques →
  coordinator reconcile → 6.1-sol round-2 verify → v2.1 amendments closed all findings).
- `npm run build` **exit 0** (Next.js 16.4.5, all 14 routes). `npm test` **15/15 pass**
  (12 conflict-overlap utility tests + 3 mock end-to-end smoke tests: seed counts —
  9 sports / 43 divisions / 276 fixtures — full volleyball division playthrough →
  advancement → medal drafts → tally, conflict warn→ack→save, placement-model checks).
- Runtime smoke: production server returns 200 on /, /tally, /schedule, /sports/volleyball,
  /login, /console, /admin, /console/fixtures, /console/conflicts, /console/roster.
- ⚠ Migrations have NOT been executed against any Postgres (no local PG/Docker in this VM).
  First execution is the hosted gate: SETUP.md Step 0 (schema-only merge first, verify in
  Supabase → Database → Migrations), then the rest. Recovery = forward-fix migrations only.

## Data model (as built)
- Core: events, teams, sports, divisions (JSON configs: scoring/standings/medals),
  groups, division_entries (+roster_status), venues, players, roster_memberships,
  account_profiles (role: admin|coordinator, sport scope).
- Matches: matches + match_slots (source: entry | group_rank | match_outcome; override;
  resolved; frozen at start) + match_segments/segment_scores + match_totals +
  placement_results. Scores are full-state saves guarded by expected_revision.
- Derived, never stored: group_standings + overall_tally SQL views; division_results
  (draft → confirmed → void; only confirmed reaches the public tally).
- event_updates: public projection table (anon SELECT) carrying per-match score patches;
  added to the supabase_realtime publication — the anonymous-Realtime channel.
- Writes only via SECURITY DEFINER RPCs: save_score, set_match_status, request_correction,
  reset_match (mandatory descendant closure), confirm_awards, create_fixture/update_fixture
  (per-event advisory lock + conflict-ack hash protocol), list_conflicts.
- Migrations: 20261107090000_schema, …090100_rls, …090200_views, …090300_rpcs,
  …090400_realtime, …090500_official_data (idempotent; event + 10 teams + venue +
  volleyball 2 divisions + 40 fixtures). supabase/seed.sql is comment-only BY DESIGN.

## Mocked vs live
- **Mock (default without env):** full app on local seed fixtures — MockProvider in
  lib/data/mock.ts mirrors the SQL RPC semantics (scoring, freeze, advancement incl.
  tie-blocked group ranks, award drafts, conflict warn/ack, reset closure), persists to
  localStorage; demo sign-in roles (Volleyball Coordinator / Super Admin).
- **Live (env set):** SupabaseProvider — public pages read the projection views
  (public_match_cards, public_segment_scores, public_results, public_divisions);
  staff read RLS-scoped base tables; all writes call the RPCs. Transports:
  realtime (event_updates subscription → refetch; 15s max-revision watchdog) or
  polling (5s while visible). NEXT_PUBLIC_DATA_TRANSPORT selects; default realtime
  when a Supabase URL exists, else mock.
- Client assembles standings/tally with lib/standings.ts in BOTH modes (same code
  path as the SQL views) so public numbers can never diverge between transports.

## Supabase setup checklist (user)
Full non-expert version: **SETUP.md**. Short form:
0. Merge schema migrations only → verify they appear under Supabase → Database →
   Migrations (proves the GitHub integration + branch) → then merge the rest.
1. Vercel env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
   SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_DATA_TRANSPORT=realtime → redeploy.
2. First admin: Auth → Add user → SQL insert into account_profiles (role 'admin').
3. Coordinators: Auth → Add user → SQL insert (role 'coordinator', sport_id).
4. Verify counts: 10 teams, 2 divisions, 40 fixtures; two-phone <1s smoke test.
5. Pre-Nov 9 decisions: medal points 5/3/1 provisional; volleyball profile
   provisional; verify rosters in Admin so the conflict checker covers them.

## Push manifest (for main agent — ONE push_files call, branch main, repo halords/pglulympics)
Push the ENTIRE tree at ~/workspace/sportsfest-tracker EXCLUDING: node_modules/,
.next/, .git/, *.tsbuildinfo, next-env.d.ts (gitignored build artifacts). Includes:
- App: app/** (14 routes), components/**, lib/**, public/** (scaffold assets)
- Config: package.json, package-lock.json, .npmrc, next.config.ts, tsconfig.json,
  postcss.config.mjs, eslint.config.mjs, .gitignore, .env.example
- Data/spec: SPEC.md, STATE.md, SETUP.md, README.md, AGENTS.md, CLAUDE.md,
  data/seed.json, data/sheet-extract.md, data/tabs/*.txt, scripts/*.py,
  spec/** (briefs, drafts, critiques)
- Database: supabase/migrations/*.sql (7 files — #7 adds sports 2–9), supabase/seed.sql
No deletions needed (repo is empty). Commit message suggestion:
"feat: PGLUlympics live tracker — public site, coordinator console, admin, Supabase migrations + volleyball seed"

## Product / repo identity (user update, 2026-11-07)
- Product name: **PGLUlympics** (PGLU sports fest). Workbook file title: "Game Tracker PGLU Olympics.xlsx".
- Repo: **halords/pglulympics** (created by user, empty). Push target: branch `main`, one-shot by main agent.
- Repo is connected to the user's Supabase project via Supabase's GitHub integration →
  schema + seed ship as **supabase/migrations/<timestamp>_*.sql** + **supabase/seed.sql** in the repo tree.
- Supabase URL/keys still arrive at deploy time via env (app data layer unchanged: Realtime + polling fallback).
- Deployment (user-confirmed): Vercel connected to the GitHub repo; **git push triggers deployments** (no direct
  Vercel deploys). Tree must be self-contained: standard Next.js project at repo root (framework auto-detection),
  env var names documented in README/STATE, no local-file reliance.
- Supabase project (user-supplied): https://cvpkxgwdttyryeurvvvo.supabase.co (ref cvpkxgwdttyryeurvvvo).
  LIVE production project → read-only checks only; all writes via migrations/fixtures.
- Env vars the app expects: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  (NEW Supabase naming, sb_publishable_...; fall back to NEXT_PUBLIC_SUPABASE_ANON_KEY),
  SUPABASE_SERVICE_ROLE_KEY (server/admin only; user enters it directly in Vercel at deploy — never local),
  NEXT_PUBLIC_DATA_TRANSPORT (mock|polling|realtime, optional).

## Phase 0 — Sheet inventory (COMPLETE, 2026-11-07)

Workbook: "Game Tracker PGLU Olympics.xlsx" — event = **PGLU Olympics**, Nov 9–26, 2026.
Source: https://docs.google.com/spreadsheets/d/1I9JwRto0iLZZ3sLYN9Qaw9nUpm_JfTya
Tab bar enumerated by the parent agent via live browser; every tab then pulled via the
export CSV endpoint. **10 tabs = SUM tally + 9 sports — ALL extracted.** Full record:
data/sheet-extract.md. Totals: **9 sports, 43 divisions, 276 fixtures.**

1. **SUM** (gid=2096581143): overall tally, 10 teams, points formula NOT stated (→ 5/3/1 provisional config).
2. **Volleyball**: as before — 2 divisions, 40 fixtures, set scoring (migration 6).
3. **Basketball**: Men's (Brackets A/B of 5) + Women's (4 teams, single RR); 34 fixtures;
   final-score totals ("simple"); venues DMMMSU Gym + San Juan Gym.
4. **Pickleball** + 5. **Badminton**: 9 categories each; entry matrix + fixtures Nov 16/18 at
   Heritage 2500 in two parallel columns (seeded as Court 1 / Court 2 venues); 89 + 96 fixtures;
   39-category playoffs with text slot descriptions.
6. **Bowling** (Nov 25), 7. **Athletics** (Nov 9), 8. **Laro ng Lahi** (Nov 9): ENTRY-MATRIX
   tabs only → placement_only divisions, one placement event per category (3 + 9 + 5),
   entered teams as slots, date known, time/venue absent (starts_at NULL).
9. **Mobile Games** (ML ×10 teams, CODM ×6) + 10. **Chess** (Boys ×9, Girls ×2): entry-matrix
   tabs → divisions + entries, NO fixtures in the sheet (coordinators create them in-app).

### Format breaks & sheet quirks (modeled faithfully; organizers should confirm)
- **Entry-matrix sports break the fixture model** — handled via placement_only events
  (Bowling/Athletics/Laro) or entries-only divisions (Mobile Games/Chess). No code change
  was needed: the generic model absorbed all 9 sports.
- Racket-sport semifinal labels say "Bracket 1 Rank 1 vs Bracket 2 Rank 2" but their own RR
  pairings form a SINGLE round robin (no bracket split exists) → seeded as single-table
  ranks 1v4 / 2v3. Flagged assumption, correctable via fixture edit.
- Pickleball 39 Boys: Semifinal 1 listed Nov 18 **5:00 PM**, its Championship **9:45 AM**
  the same day — impossible order, kept as listed. Pickleball 39 Girls: no playoff rows.
  Badminton 39 Girls: Third-Place (10:00) is listed before Semifinal 2 (10:15).
- Basketball: two women's starts read "12:40 AM" in a midday sequence → seeded 12:40 PM.
  Badminton: "PDRRMO HAZARD BREAKERSA" typo normalized. Badminton Executive categories have
  a single entrant (TEAM 4-MIDABLE) and opponent-less rows — not seeded as matches.
- Racket entries = entry matrix ∪ fixture participants (5 fixture-side additions, e.g.
  Pickleball Executive Boys: AGKAYSA GUARDians plays but is not in the matrix).
- Racket scoring profiles (sheet has NO score columns): pickleball best-of-3 games to 11,
  badminton best-of-3 sets to 21 cap 30 — both flagged provisional in config.
- Migration 7 (`20261107100000_more_sports.sql`, generated by scripts/gen_migration7.py
  from seed.json v2) carries sports 2–9; seed builder: scripts/build_seed_v2.py;
  raw racket transcriptions: data/tabs/*.txt. Mock provider is now fully seed-driven
  (sport-scoped IDs; localStorage key bumped to pglulympics-mock-v2).

## Architecture (decided by brief)
- Next.js App Router + TypeScript on Vercel.
- Supabase: Postgres + Auth (per-sport coordinator accounts, super-admin) + Realtime (<1s broadcast).
- Polling fallback (5s) behind a transport flag — same UI. Local fixtures/mocks until keys exist.
- Palette: dark blue + white + dark red core; gold as complementary (medals/highlights). Mobile-first.

## User-added scope (2026-11-07, during spec loop) — spec/brief-addendum-2.md
- In-app fixture create/edit (admin all sports; coordinators own sport).
- Rosters (name-level players per team; players may span teams/sports).
- Player conflict detection at save: cross-sport time-overlap check, inline warning with clashes,
  admin override; venue double-booking in same engine; conflicts view (per player/team);
  overlap logic = tested utility; per-sport duration defaults (admin-editable).

## Lane log (rotation: astra → 6.1-sol → 5.6-sol, 3 fails each)
- Astra draft attempts 1–2: relay dropped connection (~271s each). Attempt 3 (9k tokens): landed but
  TRUNCATED mid-§1.2 (reasoning ate budget) — rejected as incomplete; continuation call in flight.

## Build log (session 1)
- Migrations 1–6 + seed.sql written (see Data model above).
- lib: types, conflicts/overlap.ts (+12 tests), standings.ts, data providers
  (mock + supabase), context, session.
- UI: layout/palette (navy/white/crimson, gold for medals), home, tally, sport
  page, schedule, match detail, login, console home, scoring screen (≥48px
  steppers, sticky save bar, draft/saving/server-confirmed states), fixtures
  (create/edit + conflict warning→acknowledge flow), conflicts view, roster
  view, admin (review queue, awards confirm, roster editor, points/durations).
- .env.example, SETUP.md, README. Build green; tests 15/15; runtime smoke 200s.

## Spec loop — round 1 critiques received (both sols, converged)
Astra draft v1 (3 parts, §1–§11) reviewed. Converged fix set (both lanes agree):
MVP freeze w/ hard cuts (no importer UI, graph tooling, audit explorer, profile builders,
transactional mock); §11 must be completed (overlap algorithm, ack protocol, override rules,
conflict read model, tests); ONE coordinator scheduling rule via RPC; GitHub integration =
sole prod migration path; official data ships as idempotent DATA MIGRATION (seed.sql is local-only);
public reads via sanitized projections only (RLS filters rows, not columns); few SECURITY DEFINER
RPCs w/ pinned search_path + auth.uid() checks; privileged event-wide conflict checker returning
only the proposed fixture's clashes; event_updates carries the public-safe SCORE PATCH (apply
immediately, <1s) + no event-wide lock (match-row locks only); frozen contestants at match start;
source invalidity (final+valid+not needs_review) propagates to descendants; mandatory reset closure;
award swaps via void+recreate under partial unique indexes; concrete JSON config schemas + seeded
examples; canonical venues (venue_id = booking resource); roster_status unknown|verified;
mock = thin localStorage adapter; palette tokens + sport display cards + dominant tally specified;
>=48px steppers, sticky save bar; hour-budgeted 48h plan, freeze at H40.
Reconciliation: coordinator writes SPEC.md v2 from draft + this fix set; round-2 verification by 6.1-sol.

## Spec loop — CLOSED (converged v2.1)
- Round-2 verify (6.1-sol): blockers 1/5/11/32/34 RESOLVED; 2/3/33/35 PARTIAL; 2 new findings.
  All closed by v2.1 amendments (◆ in SPEC.md): event_updates = public projection table (anon SELECT
  → lawful anonymous Realtime); config lock = DB trigger (DML-proof); fixture saves take per-event
  advisory lock; early hosted gate in H4–12 (integration smoke merge + hosted <1s proof);
  §8.3 step 0 integration proof + forward-fix-only recovery.
- SPEC OUTCOME for parent: no material conflict with the brief. Two assumptions flagged in §10:
  medal points seeded 5/3/1 PROVISIONAL (sheet gives no weights); volleyball profile provisional
  best-of-3 25/15; semis crossover A1vB2/B1vA2 assumed (sheet silent). All are config, owner-adjustable.
- Scaffold: Next.js 16.4.5 + React 19 + Tailwind v4 + @supabase/supabase-js + vitest 3 (.npmrc legacy-peer-deps).

## Build log
- H0 scaffold done. Next: migrations 1–6, seed.sql, lib (types/provider/mock), overlap util + tests.
