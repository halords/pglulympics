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

## Fix pass — mobile header/nav, sports menu, schedule IA, placement cards (2026-11-07, post-launch)

Presentation layer only — no schema/migration/data changes; palette unchanged. Committed locally, PUSH PENDING (main agent's one-shot push; the push triggers the Vercel redeploy).

What was wrong:
- Header crammed wordmark + Home / Medal Tally / Volleyball / Schedule / Console into one non-wrapping row → overflowed 320–430px viewports ("Medal Tally" wrapped, "Console" clipped). "Volleyball" was a hardcoded top-level link left over from the single-sport scaffold.
- /schedule led with the unscheduled (TBA) block and dumped all 276 fixtures in raw sheet order.
- Card labels repeated path segments ("LARO NG LAHI · PATINTERO · PATINTERO").
- placement_only fixtures (Bowling/Athletics/Laro ng Lahi) rendered as two-team versus cards on public surfaces — root cause: the public assembly (lib/data/supabase.ts) only ever builds slots [1,2] from the public_match_cards view, so live placement matches hit the versus branch. NOT fixed at the data layer (out of scope); cards now branch on division.scoringKind.

Changes:
- NEW components/SiteHeader.tsx (client, in root layout inside Suspense — usePathname requires a boundary in this Next version; static same-height fallback in app/layout.tsx; DataRoot now wraps header + main so nav reads the snapshot). Mobile: compact wordmark + 44px hamburger → slide-down panel, all destinations ≥44px, active page highlighted, closes on selection/navigation. Desktop (md+): full nav unchanged in shape — Home · Medal Tally · Sports · Schedule · Console.
- Sports nav (addendum): hardcoded Volleyball link GONE. Desktop Sports = dropdown, mobile menu Sports = expandable section; both list ALL sports from the snapshot (no hardcoded names) → /sports/[slug].
- app/schedule/page.tsx + NEW lib/schedule.ts (buildScheduleSections, unit-tested): LIVE NOW pinned section when any match is live; then sticky day headers (top 60px) ordered nearest-day-first (today while running, else Day 1), past days after (most recent first, dimmed, "— Today" suffix on today's header); within a day upcoming before finished; "To be scheduled (N)" LAST, collapsed behind a toggle. Filters (day/sport/status) apply before grouping, unchanged semantics.
- Label dedup: dedupeLabel() in lib/format.ts (re-exported from MatchCard) applied to card headers and the match-page breadcrumb.
- Placement EVENT cards: MatchCard branches on scoringKind === "placement_only" → deduped title, entrant chips (same chip style as sport pages) or top-3 finishers once placements exist, date/venue footer. Callers (home, schedule, sport page, console) pass entrants via divisionEntrantNames(); match detail page shows entrant chips instead of versus rows for placement divisions.
- CAVEAT (live public mode): snapshot entries are synthesized from awards only (division_entries is staff-only by RLS), so pre-event public placement cards fall back to the two slot teamNames until results/placements exist; sport pages show the same synthesized set, so cards stay consistent with them. Staff/console and mock modes have full rosters. Widening public entrant data would need a view/RLS change — deliberately NOT done in this pass.
- Small-width audit (checked at source level, ~360px): home (countdown row now flex-wrap; tally table already overflow-x-auto), /tally (contained scroll), sport pages (tables contained; entrant chips wrap), /schedule (filter selects max-w-full, min-h 44px), /console + /admin + /login (collapsing grids), match detail (score spans shrink-0, names min-w-0/break-words). No other overflow sources found.

Verification: npm test 24/24 (15 prior + 9 new in lib/schedule.test.ts covering TBA-last, live pinning, day ordering pre/during event, within-day order, dedupeLabel); npx tsc --noEmit clean; npm run build exit 0 (14 routes); production server smoke — /, /schedule, /tally, 3 sport pages, /console, /login, /admin, /console/fixtures all 200; SSR HTML of /schedule contains the hamburger (aria-label "Open menu", md:hidden) and desktop nav (hidden md:flex); built CSS contains the sticky offset (top:60px); built chunks contain "LIVE NOW" / "To be scheduled" / "Loading sports"; no hardcoded sport names in nav sources. No headless browser in the VM — viewport containment rests on the class contract (mobile header row = wordmark + 44px button only; panel links are full-width blocks) plus the audit above. Lint: every touched file clean; 8 remaining repo lint errors are pre-existing in untouched files (lib/data/*, console/matches/[id]) — also fixed one pre-existing lint error in app/page.tsx useNow along the way.

## IA reorder — standings first, then sports/divisions, then Up Next (2026-11-07, post-launch)

User direction: overall standings first, sports/divisions below, "Up next" after — on the homepage AND every sport page. Presentation/IA only — no data-layer, schema, or behavior changes; palette unchanged. Committed locally, PUSH PENDING (main agent's one-shot push).

- NEW lib/schedule.ts `nextUpFixtures(matches, todayKey, limit=8)` built on buildScheduleSections: live separated for pinning; upcoming = scheduled matches on today/future days, chronological (nearest day first, start ascending within a day); finals and past days excluded; TBA fixtures only fill leftover slots. +5 unit tests.
- HOMEPAGE (app/page.tsx): hero slimmed to a compact strip (eyebrow + name at text-4xl, dates + sport/team counts, small countdown chips or live pill — descriptive paragraph gone). Section order now: (1) OVERALL STANDINGS — the FULL medal tally (all 10 teams, TallyTable without the old `compact` top-5 slice; same computeTally source as /tally; the side link now reads "Medals by sport →"); (2) SPORTS — 9-sport grid unchanged; (3) UP NEXT — live matches pinned at the top of the section under a "Live now" label, then the next 8 upcoming fixtures chronologically in a card grid. LATEST RESULTS dropped from the homepage (standings + sports + 8 up-next cards already fill the page; /schedule carries results).
- SPORT PAGES (app/sports/[slug]/page.tsx): after the unchanged header — (1) LEAD block titled per sport kind: group/RR sports → "STANDINGS" with every division's group tables (same computeStandings/sortStandings + StandingsTable as before, advancement note kept; division name added to the heading when a sport has several divisions); placement_only sports → "RESULTS SO FAR" with per-division ranked placement lists (all places, from match.placements), or the single empty state "No results yet — placements appear here once events finish." pre-event; fixture-less divisions (ML/Chess, plus e.g. Pickleball Executive Girls) → entrant chips under "… — Entrants (N)", and a sport with no fixtures at all titles the block "ENTRANTS". (2) UP NEXT — the sport's next 6 scheduled fixtures, live pinned above under a "Live now" label; section omitted when nothing is live/upcoming. (3) Full fixtures & results by division, exactly as before MINUS the group standings tables (they moved into the lead, not duplicated); placement entrant blocks and "No fixtures yet" notes unchanged.
- Mobile: hero strip is one wrapping flex row (~2 lines tall); standings/tally tables keep their existing overflow-x-auto wrappers; no new wide elements introduced at 360px.

Verification: npm test 29/29 (24 prior + 5 new nextUpFixtures tests: live separation, cross-day chronology, finals/past-day exclusion, limit + default limit, TBA fill-only); npx tsc --noEmit clean; npm run build exit 0; production server smoke — /, /sports/volleyball (group sport), /sports/bowling (placement sport), /sports/chess (entries-only), /tally, /schedule all 200; built chunks contain "OVERALL STANDINGS" (home) and "RESULTS SO FAR" + the placement empty-state string (sport page). Lint clean on all touched files (one react-hooks/purity hit on Date.now() in the homepage memo fixed by deriving today from the existing `now` state). Pages are client-rendered from the snapshot, so section order rests on the source structure + chunk checks, same as the previous pass.

## Presentation upgrade — crimson accent rebalance, typography, /display TV board (2026-11-07, post-launch)

User direction: "where is the red?" (gold had taken the accent role), is the font good enough, and will the tally work on a venue TV. Presentation only — no schema/migration/data-layer/behavior changes. Committed locally, PUSH PENDING (main agent's one-shot push). README.md's pre-existing uncommitted modification left untouched again.

### 1. Accent rebalance — crimson is THE accent; gold = medal-literal only
- globals.css: palette comment corrected; NEW tokens crimson-400 #e05252 (on-dark red), crimson-100/50 tints, silver-400 + bronze-500 (medal-literal dots). Global `:focus-visible` ring = crimson-600.
- GOLD → CRIMSON (accent uses): wordmark "LYMPICS" (SiteHeader + header fallback + homepage hero + sport-page eyebrow) → crimson-400; header gradient bar via-gold → via-crimson-600; ALL active nav states (desktop pill, mobile panel, sports dropdown links, Sports toggle) → bg-crimson-800 text-white; homepage countdown chips bg-navy-800 → bg-crimson-800; placement "#place" markers (MatchCard + sport page) → crimson-600; MatchCard winner dot → crimson-600; match-detail "WINNER" → crimson-400; card hover borders → crimson-600; StandingsTable top-2 advancement tint gold-100 → crimson-100; warning/notice chips that were gold tints (Under-review pill, PROVISIONAL badge, demo-mode notice, console NEEDS REVIEW section, under-review banner, conflict-acknowledged badges ×2, unverified roster chips ×2) → crimson-100/600/800 tints; primary CTA buttons → bg-crimson-800 (Sign in, Save scores, Finalize result, Create fixture, console "Go to sign-in"); Request-correction button border → crimson-600.
- GOLD SURVIVES (medal-literal only): medal emoji columns/lists (tally table headers, medals-by-sport, admin award lists) untouched; on /display — gold medal dot in the tally, solid gold leader bar + gold rank numeral/points for the rank-1 team (only while points > 0). After the sweep, the ONLY `gold-*` classes in the codebase are in app/display/page.tsx (5, all medal-literal).

### 2. Typography sharpening
- Barlow + Barlow Condensed kept (verified in layout). `tracking-tight` unified onto EVERY font-display class segment lacking a tracking utility (blanket sweep, 16 files; wordmark/sport-card tracking-wide deliberately kept).
- Tabular numerals added where missing: tally rank cell (+font-semibold), standings # cell (+font-semibold), match-detail big scores ×2 + results place, placement "#place" markers, console placement input, tally points line. Scores/cards/countdown/tally/standings numeric cells already had them.

### 3. NEW /display — broadcast TV board (app/display/page.tsx)
- Chromeless via route groups: all site pages moved to app/(site)/ (git mv, imports +1 depth); app/(site)/layout.tsx now owns header/footer/content column; root layout = shell + fonts + DataRoot only. /display sits outside the group → zero site chrome (verified: no header/footer/max-w-6xl in its HTML; / and /schedule keep full chrome).
- Broadcast grammar (per the raised design bar): arena-bg = navy-950 + hard-stop diagonal pinstripe texture (pattern, no gradient blends, no glass/backdrop anywhere on the board); section headers = Barlow Condensed 700 uppercase + three skewed crimson slash bars + crimson underline bar; tally rows = oversized rank numerals (clamp 38–92px), condensed ALL-CAPS team names (26–58px), medal dots in literal gold/silver/bronze + counts, points right-aligned (32–78px); rank-1 leader row = navy-900 solid + inset solid gold left bar + gold rank numeral and points (no glow).
- LIVE view = scorebug: label strip + crimson LIVE bug (pulsing white dot), team names flanking a giant central score (up to 150px, crimson dash), set/period strip beneath; placement events get a big entrant/placement block; up to 4 bugs (2×2). Only enters rotation while matches are live.
- UP NEXT (next 8, today-first via nextUpFixtures; 7 rows, big time + crimson slash divider + caps fixture + meta line) and LATEST RESULTS (7 finals, FINAL tag, winner in white/loser dimmed, big score or top-3 placements).
- Auto-cycle 15s/view with a 400ms slide/fade cut (board-view-in keyframes, key-remount), progress bars under the view (hidden when pinned); ?view=tally|live|upnext|results pins a view (pinned live → tally fallback when idle); persistent top bar = wordmark + live Manila clock (1s tick, tabular); PERSISTENT bottom TICKER on every view: crimson "LATEST" tab + seamless CSS marquee (55s loop, duplicated track) of latest finals + up-next items separated by skewed crimson slashes.
- Data = the same useSnapshot feed (realtime/polling transports carry updates with no reload). SETUP.md gained a "TV display board (venue screen)" section (open /display, F11, ?view pins, 100% zoom).

Verification: npm test 29/29; npx tsc --noEmit clean (stale .next validator errors after the move cleared by rebuild); npm run build exit 0 (15 routes incl. /display); production smoke — /display, /, /schedule, /sports/volleyball, /tally all 200; /display HTML contains arena-bg + board wordmark and NO site chrome strings, home/schedule keep theirs; built CSS contains arena-bg / board-view-in / ticker-scroll; display chunk contains Overall Standings / Live Now / Up Next / Latest Results; eslint clean on all touched files (2 pre-existing errors remain in untouched lib/data + 1 in console/matches setState pattern — the file was moved/edited for classes only, error predates this pass per earlier passes' notes). No headless browser in the VM — board composition rests on the clamp/vw/vh sizing system + chunk/HTML checks, same caveat as prior passes.

## Multi-sport assignments, in-app user management, full scheduling (2026-11-07, post-launch)

User requirements: (A) super-admin manages users + roles IN-APP, coordinators may handle MULTIPLE sports; (B) scheduling everything (create, reschedule, venues, teams) for admins + coordinators across all their assigned sports, conflict engine inline on create AND reschedule. Plus three small addenda landed in the same commit: "TV Board" nav link, scoreless-board rank "—", and manual controls on /display. Committed locally, PUSH PENDING (main agent's one-shot push; migration 8 applies via the GitHub integration on merge).

### Migration 8 — supabase/migrations/20261107110000_multi_sport_assignments.sql (idempotent; NOT yet run against any Postgres, same caveat as migrations 1–7)
- NEW join table `account_sport_assignments` (user_id FK→account_profiles, sport_id FK→sports, PK both, created_at) + sport index; backfill from account_profiles.sport_id (coordinators); RLS on: read own-or-admin, admin write; grants mirror migration 2 style.
- DROPPED `uq_one_coordinator_per_sport` (many-to-many both ways now) and the legacy role/sport CHECK (found via pg_constraint by its definition, so re-runs are safe). `account_profiles.sport_id` STAYS as a legacy nullable column — new code neither reads nor writes it (one transitional exception below).
- Helpers: NEW `my_sport_ids()` (setof uuid from assignments, active coordinators only) + `has_sport_access(uuid)`; `coordinates_sport()` redefined to delegate — every existing RLS policy and RPC picks up set semantics untouched. `my_sport_id()` kept as a legacy shim (first assignment). `list_conflicts()` rewritten with `sa.id = any(v_mine)` set filters.
- NEW RPC `set_fixture_teams(match_id, entry_ids, ack_hash)`: scheduled matches only, manual entry slots only (bracket-derived/frozen refused), same slot count, entries must belong to the division; same conflict warn/ack hash protocol + per-event advisory lock + audit ('fixture.teams') + _emit_update as create/update_fixture. Granted to authenticated.
- CONSUMER SWEEP (single-sport assumption): SQL — RLS helpers (above), list_conflicts; the RLS policies themselves needed NO edits (they all call coordinates_sport). Client — lib/data/session.ts (sportId → sportIds[]), console home/fixtures/roster scope filters. listConflicts RPC + conflicts page needed no client change (server-scoped).

### Session (lib/data/session.ts)
- SessionInfo.sportId → `sportIds: string[]` (assignment set; admin = role-implied all). DB role 'super_admin' now NORMALIZED to session role 'admin' (the old cast let 'super_admin' leak through, which would have failed every `role === "admin"` check in live mode — latent bug fixed). Inactive profiles resolve to role null. Assignments read failure (pre-migration-8 database) falls back to the legacy sport_id — the ONE transitional read of the legacy column; remove once migration 8 is confirmed applied.
- Pure scope helpers in lib/scope.ts (+10 tests): effectiveSportIds / canAccessSport / divisionsInScope / consoleScopeSportIds. Mock demo coordinator scope is now the first TWO sports (was: first sport only) so the multi-sport switcher is exercisable in demo; demo admin = all.

### Admin user management (server-side only)
- lib/supabase/server.ts: service-role client from server env + `requireSuperAdmin(req)` — EVERY call re-validates the bearer token via auth.getUser AND an active super_admin profile; 503 (no service key) / 401 (no/bad token) / 403 (not super-admin). The key is never sent to the browser and never logged; temporary passwords pass from the admin's form to the Auth Admin API only — not stored, logged, or echoed.
- Routes (dynamic; cacheComponents rejects `dynamic` segment config — handlers read headers so they run at request time by default): GET /api/admin/users (list = auth users ⋈ profiles ⋈ assignments; pre-migration fallback synthesizes assignments from the legacy column), POST (create auth user email_confirm + profile + assignments in one flow; profile failure rolls back the auth user), PATCH /api/admin/users/[id] (role/display name/assignments replace/active; deactivation also bans in Auth ~100y, reactivation unbans, ban failure returned as a warning; self-deactivation/self-demotion refused with 400). Input validation is shared + unit-tested (lib/admin-users.ts, +7 tests): coordinator create requires ≥1 sport; super_admin assignments normalized to [].
- UI: /admin gains a USER ACCOUNTS section (live mode only; demo mode shows an explainer): user table (email, name, role, sport chips, status) + create form (email, temp password, name, role, multi-sport chip picker) + per-user edit panel (role, sports, name, active toggle; self-deactivation disabled). The stale "accounts are never managed from this page" note was replaced.

### Console scheduling surface
- SportSwitcher component (chips: "All my sports" + each in-scope sport; hidden when scope < 2) on console home, fixtures, roster. Console home header now lists the coordinator's sport set.
- Fixtures page: divisions/matches filtered by the full assignment set (+ switcher). Create form: placement_only divisions now pick ENTRANTS via chips (≥2) instead of Team A/B — placement events can be created in-app, not just seeded. Reschedule panel: venue free-text is now actually editable/sent (previously hard-coded null); NEW team editing — per-slot team selects for scheduled matches with manual entry slots, saved via setFixtureTeams AFTER the reschedule step in the same click, each step with its own conflict warn→acknowledge round (warning panel dispatches by action: create/edit/teams). Bracket-derived fixtures show why teams can't be edited. Provider parity: setFixtureTeams in types + Supabase (RPC) + mock (same guards: scheduled-only, entry-slots-only, slot-count; conflict check incl. uncheckable_no_time for TBA fixtures).
- Conflicts page: unchanged (list_conflicts is server-scoped; now set-valued underneath).

### Addenda in this commit
1. TV Board link: SiteHeader desktop nav + mobile menu (after Console, same active styling) + footer link in (site)/layout.tsx → /display (public, no auth).
2. Scoreless rank: TallyTable + /display tally render "—" while a team has 0 points (pre-event everyone tied at rank 1 looked like a bug); tied ranks still shared once points exist; leader gold treatment was already gated on points > 0.
3. /display manual controls: bottom-right cluster (view chips Tally/Live/Up Next/Results — the old progress bars became these buttons; Live disabled when idle — + Pause/Rotate button), AUTO-HIDES after ~3s without mouse movement (move/tap restores; cursor hides too). Space = pause/resume, ←/→ = prev/next view. Pause freezes rotation only — ticker + clock keep running. A ?view= pin still starts pinned, but jumping/playing unpins into rotation, and resuming rotation continues from the currently shown view.

### Docs
SETUP.md: Step 2 = one-time super-admin bootstrap (unchanged SQL), Step 3 rewritten — coordinators are created IN-APP (Admin → User Accounts, multi-sport ticks); SQL path demoted to a collapsed fallback (profile + assignment inserts); migration-8/multi-sport note added; Step 4 coordinator check updated to assigned-sport(s) + switcher. .env.example: service-role key comment updated (now used by /api/admin). This commit also includes the previously-pushed SETUP.md account-SQL fix + README sync comment from the working tree.

Verification: npm test 46/46 (29 prior + 10 scope + 7 admin-users validation); npx tsc --noEmit clean; npm run build exit 0 (17 routes incl. ƒ /api/admin/users + /api/admin/users/[id]); production smoke — /, /schedule, /console, /admin, /display all 200 in mock mode; /admin HTML contains NO user data (client-gated, users load only after a live admin session); API gate verified against a live-env instance: no service key → 503; no token → 401; garbage token → 401 (GET/POST/PATCH alike). The 403 branch (valid non-admin token) is code-reviewed only — no non-admin credential exists to exercise it here. Lint: all new/touched files clean except pre-existing items (session.ts set-state-in-effect reproduces the original file's mock-branch pattern verbatim; supabase.ts prefer-const + mock.ts warnings pre-date this pass). No headless browser in the VM — /display controls + switcher behavior rest on source + chunk checks ("TV Board", "All my sports", "Rotate", "USER ACCOUNTS" all present in built chunks), same caveat as prior passes.
