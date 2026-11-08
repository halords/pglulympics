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

## Console operations desk, conflict severity re-tier, courtside scoreboard, sport identities (2026-11-07, post-launch)

### Conflict severity model (Part 1) — severity derives from conflict TYPE
- MAJOR = player overlaps only (a team/athlete double-booked). MINOR = venue overlaps + coverage notes ("no time set / no players listed") — informational only, NEVER blocking, NEVER acknowledged (a venue may run multiple courts).
- Engine (lib/conflicts/overlap.ts): PlayerClash.severity = "major", VenueClash.severity = "minor" (stamped at detection; ConflictRow.severity likewise in every provider's listConflicts). Helpers: severityOfKind, hasMajorConflicts, hasMinorNotes. conflictAckHash now binds ONLY the player-clash set — venue/coverage churn can no longer invalidate an acknowledgement.
- Providers: mock blocks fixture saves on major only and returns ok + `notes` (the minor report) when a save succeeds with minor notes attached. Supabase provider normalizes RPC output client-side (normalizeConflicts) so behavior is identical pre- and post-migration-9.
- Migration 9 — supabase/migrations/20261107120000_conflict_severity.sql (idempotent create-or-replace; applies via the GitHub→Supabase integration on push, same path as migration 8): _check_conflicts stamps 'severity' per clash ('major'/'minor'); _conflict_hash = player keys only (stored ack hashes are never re-verified — no data migration); create_fixture / update_fixture / set_fixture_teams warn ONLY on player clashes, and on success attach `notes` when only minor notes exist; list_conflicts rows carry 'severity' (body otherwise = migration 8's set-scoped version). NOT yet confirmed applied live (same status as migration 8 at this writing) — the app is correct either way by construction.
- Consumers: fixtures page warning panel = crimson MAJOR panel with player clashes + acknowledge ONLY; minor notes render in a separate muted "Minor — venue overlaps (does not block saving)" box, also shown after a clean save as "Saved — with minor notes". Conflicts page: severity chips (crimson MAJOR / navy MINOR), summary counts; console home carries a compact conflicts summary (major = crimson alert chip, minor = muted note) linking to the page.

### Reschedule date context (Part 4)
- lib/schedule.ts: dayScheduleRows(matches, divisions, sports, dayKey, excludeMatchId?) → sorted read-only rows (time, sport, division, label, teams or "N teams entered", venue, LIVE/final markers). Fixtures page renders "Already on <date>: …" (DayContext) under the create date field and inside the reschedule panel (own match excluded). Pure context — the engine still owns conflict warnings.

### Console home = operations desk (Part 2)
- Structure: header nav (no sign-out) → MATCHDAY strip (navy band: Manila date, live/today/up-next/review counts, scope sport icon chips) → SportSwitcher → compact conflicts summary strip → NEEDS REVIEW → LIVE NOW → TODAY'S MATCHES → UP NEXT → separated account block.
- ConsoleMatchCard (components/ConsoleMatchCard.tsx): sport-tint left bar + icon, sport/division/label, teams + score, time/venue, and the three matchday jobs as ≥52px buttons — Scoreboard (→ /console/matches/[id]/scoreboard), Score / Winner (→ scoring page), Reschedule (→ /console/fixtures?edit=<id>, which auto-opens the edit panel). Placement matches get "Enter results" instead of a scoreboard; finals get "Result & corrections"; live matches omit Reschedule.
- Sign-out (Part 3): audited — existed ONLY on console home; now lives solely in the bottom account block ("Signed in as <email> · role/scope"), visually separated, two-step: first tap arms "Tap again to confirm sign-out" (crimson), auto-disarms after 4s, second tap signs out.

### Courtside scoreboard (Part 5a) — /console/matches/[id]/scoreboard
- Header: sport tint bar + icon chip, SPORT NAME huge (font-display uppercase), division · match label, venue/time, LIVE bug. Then a segment strip (open segment tint-filled) and two giant team panels.
- Modes from lib/scoring.ts scorerMode(division, sportSlug) — PURE helpers, 12 tests: set_based → "rally" (tap giant score or +1 = a point into the open set; applyRallyPoint auto-closes a won set per config target/win-by/cap, decider uses deciding_set_target; −1 walks back and REOPENS a just-closed set; taps refused once the match is decided on sets), basketball simple → "periods" (+1/+2/+3 into the open period, End period advances, totals = sum of all segments), other simple → "totals" steppers, placement_only → no fake board (panel linking to placement entry).
- Save engine: optimistic local state + serialized flush through provider.saveScore — one save in flight, dirty loop, server revision authoritative; stale-revision → adopt server + notice. Undo = local history stack (≤60), restores AND saves. Finalize bar (sticky): computedWinner preview names the winner (or tie); FINALIZE + TAG WINNER confirms, drains pending saves, then setMatchStatus final (draw → outcome "draw") — the existing final/verify flow and NEEDS REVIEW checks are untouched, so medals still need division confirmation downstream. Scheduled matches get a Start (go live) gate before scoring.
- Concurrency (5c): the scoreboard is per-match with scope enforced by the existing RLS/RPC layer, so simultaneous live matches are independently scorable from multiple devices; a revision clash between two scorers on the SAME match resolves by adopt-server, never a silent overwrite.

### Per-sport identity map (Part 5b) — lib/sport-identity.tsx
Inline-SVG line icons (stroke style, no emoji) + accent tints. Navy #0b3d91 / crimson stay the brand base; tints are accents only, chosen to sit beside navy/crimson — deliberately NOT the literal ball colors (basketball orange is off-palette):
| Sport | Icon | Tint |
|---|---|---|
| Basketball | ball with seams | violet #6d28d9 |
| Volleyball | paneled ball | teal #0f766e |
| Badminton | shuttlecock | sky #0369a1 |
| Pickleball | paddle + ball | lime #4d7c0f |
| Bowling | pin + ball | indigo #4338ca |
| Athletics | runner | clay #92400e |
| Chess | rook | slate #334155 |
| Mobile Games | gamepad | fuchsia #a21caf |
| Laro ng Lahi | saranggola (kite) | rose #be123c |
Fallback (unknown sport): trophy icon, navy tint. Applied to: scoreboard header, console cards + matchday chips, /display scorebugs, public sport page headers (tint bar + icon chip). Tints are inline styles (Tailwind-purge-proof).

### /display Live presentation (Part 5b/c + addenda) — MANUAL SLIDESHOW, featured mode
- Scorebug reworked: sport icon chip (solid tint, white glyph) + SPORT NAME big at top, tint rule under it, division/category · match label · venue next, then teams + giant score + set/period strip (placement bugs get the same header). Tally/Up Next/Results/Ticker unchanged.
- FINAL mode logic (user correction supersedes the earlier scroll-mode addendum — NO auto-scrolling marquee was built): Live is a MANUAL SLIDESHOW of discrete slides. Slide grouping choice: 1–2 live → one game per slide at FEATURED size; 3+ live → 2×2 pages per slide (chosen for TV-distance readability). Slides change ONLY via: control-cluster Prev/Next buttons, clickable game chips (one per slide), or ←/→ keys (on the Live view, arrows page games; on other views they still step views). The Tally/Live/Up Next/Results rotation is unchanged and never advances game slides — landing on Live waits for the operator.
- FEATURED: picker in the control cluster (grouped by sport → game) or ?game=<matchId> pins one match as a giant single bug — a slideshow locked to one slide. ?game= behaves like a ?view= pin (board holds on Live/featured; Rotate releases it; jumping to another view also releases a picker feature). Exactly one live match → Live naturally shows it at featured size.

Verification: npm test 66/66 (46 prior + 5 severity-overlap + 1 mock venue-notes + 2 day-schedule + 12 scoring); npx tsc --noEmit clean; npm run build exit 0 (route table includes /console/matches/[id]/scoreboard); production smoke — /, /schedule, /console, /console/fixtures, /console/matches/match:volleyball:mens:1/scoreboard, /display, /display?game=… all 200. Migration 9 not yet applied live (applies on push via the GitHub integration; client code is severity-correct without it). No headless browser in the VM — scoreboard taps, slideshow keys, and bug layouts rest on source + tests + build, same caveat as prior passes; the user's phone/TV pass remains the visual QA.

## Roster bulk import + public lineups (2026-11-07, post-launch)

User requirements: (A) roster name entry via Excel/CSV upload driven by a controlled template — encoders type ONLY the name; Sport/Team/Division are Excel dropdowns baked from the system's real values so they can never be mistyped; a name registers PER SPORT. (B) Addendum: a LINEUP panel on the public match page. Committed locally, PUSH PENDING (main agent's one-shot push; migration 10 applies via the GitHub integration on merge, after 8/9).

### Roster import (no new migration — rides the existing roster write paths)
- TEMPLATE (lib/roster-template.ts, exceljs — new dependency): "Download roster template (.xlsx)" on the console Roster page + Admin builds the workbook from the LIVE snapshot at click time (lists always current; a coordinator's template only offers their assigned sports). Roster sheet: title + instructions rows, header row 3, 200 pre-formatted entry rows (4–203, frozen panes, navy styling). B = list `Sports`, C = list `Teams`, D = DEPENDENT list `INDIRECT("Div_"&SUBSTITUTE($B4," ","_"))` over per-sport named ranges `Div_<Sport>` (one column per sport on a hidden ListsDiv sheet; Sports/Teams on a hidden Lists sheet). All three validations carry input prompts + stop-error alerts. Verified at the XML level on the generated file (3 dataValidations + 11 defined names). exceljs' bundled types omit `dataValidations` on Worksheet — typed doorway `dataValidationsOf()` in the same module. exceljs loads via dynamic import() from UI code (code-split chunk).
- STATIC COPY: roster-template.xlsx at repo root (12 KB, 9 sports / 10 teams / 43 divisions from seed.json) generated by scripts/gen-roster-template.mjs, which compiles the app's own builder so the file can't drift. It is GITIGNORED and NOT part of the pushed app bundle — the main agent delivers it out-of-band; the in-app download (live lists) stays authoritative.
- PURE LOGIC (lib/roster-import.ts, 17 tests): validateImportRows resolves every row against the snapshot BEFORE anything is written — name required; sport/team/division resolved case/whitespace-insensitively by display name or slug; sport must be in the caller's writable scope; blank division auto-places when the team has exactly ONE entry in that sport (noted on the row) and errors when it has several ("division required — …") or none; a named division the team isn't entered in errors; duplicates inside the file and names already on the roster are SKIPS (not errors); fully blank template rows drop silently. importCommitPlan groups ok rows per entry (deduped by normalized name); templateListsFromSnapshot builds the dropdown lists.
- I/O (lib/roster-file.ts, 5 tests incl. a full mock-provider loop): parseRosterFile (.xlsx via exceljs — Roster sheet or first sheet, header found by label within the first 8 rows so the instruction rows are skipped; .csv via a small RFC-4180 tokenizer), downloadRosterTemplate / downloadCsvSkeleton (headers-only CSV for encoders without Excel — validation is its safety net), commitRosterImport: per entry, upsertPlayer per name (provider dedupes by name within the event) + setEntryRoster with the merged id list — exactly the manual editor's write path; one entry's failure doesn't stop the rest; summary counts added/updated/failed.
- UI (components/RosterImport.tsx on /console/roster, visible to signed-in roles; Admin gets template/skeleton downloads + a link to it): file picker → PREVIEW table (row no, player, sport, team, division, per-row status: Ready / Skip–reason / error reason) with Ready/Skip/Error count chips → Confirm button writes → result summary (added across N rosters, skipped, errors, per-entry failures). Error rows are never imported; ready rows can go in and error rows re-uploaded separately. Manual roster editor untouched.
- Mock-loop proof: same person imported into Volleyball + Chess creates ONE player record with two memberships; re-validating the same file afterwards yields all skips.

### Public lineups (migration 10 — required, and user-authorized)
- Anonymous snapshots carry no players/rosters (RLS staff-only) and synthesize entries from awards, so the public match page could not show lineups without a projection. Migration 10 (20261107130000_public_lineups.sql, idempotent create-or-replace + grant) adds `public_lineups`: for PUBLISHED matches — slotted entries (effective_entry_id) UNION all division entries for placement_only divisions — exposing ONLY match/division/entry ids + team_name + player_name (names already appear in the source workbook). Same owner-privilege view pattern as migration 3.
- Provider: the public assembly fetches public_lineups (tolerates its absence pre-merge — lineups stay undefined and the page derives what it can) and stores `Snapshot.lineups` (matchId → teams, players name-sorted) via lib/lineups.ts lineupsFromViewRows.
- Page (app/(site)/matches/[id]/page.tsx): LINEUPS section under the score hero — head-to-head: two cards (slot order); placement: one card per entered team. Each card: team name + name-sorted player list, or the muted italic empty state "Roster not yet submitted". Derivation path (mock/staff) = lineupsForMatch (lib/lineups.ts, 4 tests) from entries/rosters. Lineups are NOT on the scoreboard or the TV board (decided separately).

Verification: npm test 95/95 (66 baseline + 17 import validation + 3 template + 5 file/commit + 4 lineups); npx tsc --noEmit clean; npm run build exit 0; production smoke — /, /console/roster, /admin, /matches/<id>, /display all 200; built chunks contain IMPORT ROSTERS / Confirm import / LINEUPS / Roster not yet submitted / public_lineups; generated roster-template.xlsx XML inspected (validations + named ranges, above). Lint: touched files clean except the pre-existing supabase.ts prefer-const (rosters declaration, predates this pass). Migration 10 has NOT run against any Postgres (same hosted-gate caveat as 1–9; the provider tolerates its absence).

## Per-game scoreboard screen + division teams boards (2026-11-07, post-launch)

User requirements: (A) the per-game display must be device-neutral — at a court they'll prop up a TABLET or LAPTOP for players to watch the score; the rotating /display board is the wrong form for that. (B) Addendum: Mobile Legends is a session sport (all teams in one area at once), so it needs a per-division TEAMS BOARD. (C) Clarification: Mobile Games holds TWO games — boards are per GAME/division and never merged: ML board = ML's 10 teams only, CODM board = CODM's 6 teams only. No new migrations. Committed locally, PUSH PENDING (main agent's one-shot push).

### /board/[matchId] — per-game scoreboard screen (chromeless, app/board/)
- Full-viewport, display-only, outside the (site) group like /display: no login, no nav, no rotation, no ticker. Data = the SAME public snapshot (useSnapshot) as /display — realtime score patches land <1s, 5s polling fallback unchanged. Unknown matchId → clean "Match not found" state (plus a Loading state while the snapshot streams).
- Layout: sport identity header — tint icon chip + SPORT NAME huge (font-display clamp to ~88px), division · match label · venue under it, sport-tint rule. LIVE bug (crimson, pulsing live-dot) / FINAL chip / CANCELLED chip at top-right.
- Versus states: scheduled = clean "vs" preview (both team names huge, crimson VS, date/time + venue; "Date & time to be announced" when unscheduled); live/final = stacked team rows with GIANT tabular numerals (clamp(76px,15vw,210px) — readable on a 10" tablet at 2–3 m, composes on phone + 1080p), set/period chips beneath (S#/Q#, open segment crimson); final adds a WINNER chip on the winning row and dims the loser; draw shows "Match drawn"; forfeit finals note "Decided by forfeit". Cancelled = names + "This match was cancelled".
- Placement sports keep their placement form: match label + state line (Now competing / Final results / date-time), then ranked rows (#place crimson, note) once placements exist, else entrant chips + "results appear here as places are decided".
- PRESENT (components/BoardPresentButton.tsx, shared by both board routes): one discreet button bottom-right, auto-hides ~3s after last pointer move/tap (same poke pattern as /display controls). Tap → requestFullscreen + Screen Wake Lock (navigator.wakeLock) so the courtside device doesn't sleep mid-game; tap again (or Esc/OS exit, via fullscreenchange) exits and releases the lock; the lock re-arms on visibilitychange return. Every API call is guarded — unsupported browsers (older tablets, webviews) degrade silently.
- Entry points (wording exactly "Scoreboard screen", new tab): ConsoleMatchCard (full-width row under the actions, hidden for cancelled), console scoring page (beside Courtside scoreboard, all division kinds), courtside scoreboard page (top-bar link), public match page (button beside the breadcrumb). /display + its Featured pin untouched.

### /board/division/[divisionId] — teams board (per game, never merged)
- Route shape chosen: /board/division/<divisionId> — same chromeless family as /board. Header: sport eyebrow ("Mobile Games · Teams board") + DIVISION NAME huge (the division IS the game: "Mobile Legends" / "CODM"), sport icon/tint, live-match count chip; subline: N teams entered · M matches in play.
- Per-team row (lib/board.ts divisionBoard — generic per division, unit-tested): team name; if LIVE → crimson-framed row, LIVE bug, "vs <opponent>", and the current score FROM THAT TEAM's perspective (giant W–L-style pair mirrors W/L/D ordering per row orientation); the whole row links to that match's /board/[matchId]. If played → record (W n · L n [· D n]) + latest decided result ("Last: W 2–1 vs <opponent>", from the team's side), plus a compact W–L[–D] numeral at right. If idle → "No matches yet". Cancelled matches and needsReview finals never count (same exclusions as computeStandings); winner = winnerEntryId, else score-derived computedWinner. Sort: live teams first, then wins desc / losses asc / name.
- Session gating (lib/board.ts isSessionSport, SESSION_SPORT_SLUGS = ["mobile-games"]): entry points offered ONLY for Mobile Games divisions — public Mobile Games sport page gets one link per division in its division sections, labelled "<Division name> — Teams board" (i.e. "Mobile Legends — Teams board", "CODM — Teams board"); console home gets a "Session boards" row under the sport switcher with the same per-game labels for the divisions in the caller's scope. /board/[matchId] for a session-sport match shows an "All teams →" chip back to its division board. The route itself renders any divisionId (generic mechanism, CODM included by construction); head-to-head fixture sports keep the per-match screen, placement sports keep the placement form.
- View models are pure in lib/board.ts (boardContext / boardScore / boardView / divisionBoard) with 16 unit tests (score derivation incl. closed-set sums + null case, state/winner/draw derivation, segment chips, placement sorting, live-score orientation from slot 2, W/L/D + last result, cancelled/review exclusions via fixtures, division isolation — an ML board provably contains no CODM team/match).

Verification: npm test 111/111 (95 baseline + 16 board); npx tsc --noEmit clean; npm run build exit 0 — route table includes /board/[matchId] and /board/division/[divisionId]. Production smoke (fresh build; an earlier attempt hit a stale server from a prior pass on the same port and 404'd the new routes — killed it and re-ran): /board/match:volleyball:mens:1, /board/division/div:mobile-games:ml, /board/division/div:mobile-games:codm, /board/match:bowling:executive-mixed:executive-mixed (placement), /display, /matches/match:volleyball:mens:1, /console, /sports/mobile-games all 200; both /board HTML payloads carry arena-bg + the loading state and NO site chrome (no "Open menu", no header nav); built chunks contain "Scoreboard screen", "Teams board" and the Present control.

## /display fit fix — every slide fits its screen by construction (2026-11-07, post-launch)

Defect (user's iPad photo, ~1180×820 Safari): the Tally slide showed 8 of 10 teams — THE CODE BLUES clipped at the bottom edge, TRIFORCE BANNUARS off-screen. Root cause: tally/list rows were content-sized with VW-based type clamps inside a fixed-height board; vw does not shrink when the slide gets SHORTER, so 10 rows simply exceeded short viewports (the same math overflowed at 1080p too, just less visibly). A TV board must never clip or scroll.

Fix (app/display/page.tsx, presentation only — no data/behavior changes):
- TallyView, UpNextView, ResultsView: the list container is now a CSS size container (`[container-type:size]`, min-h-0 flex-1) and every row is `min-h-0 flex-1` — each row gets exactly 1/N of the height the slide actually has (10 tally rows, 7 up-next/results rows), at ANY viewport, by construction rather than per-resolution tuning.
- All row typography switched from vw clamps to CQH clamps (1cqh = 1% of the list container's height), budgeted inside the row share: tally rank ≤ 8.2cqh / name ≤ 5.6cqh / medals 4.4cqh / points ≤ 7cqh of a 10cqh row; list title 6.8cqh + meta ~4.7cqh of a 14.3cqh row; the tallest results content — a placement row's 3 finisher lines at 3.3cqh × 1.25 ≈ 12.4cqh — also fits. Type still caps at the old px maxima on tall screens, so the broadcast look (oversized rank numerals, condensed caps names, leader gold bar + medal columns aligned) is unchanged at 1080p and shrinks gracefully below it. Fixed vertical row padding was dropped in the two lists (flex distributes the height now). Live featured/2×2 untouched; ticker, clock, manual controls, and view cycling untouched.

Folded in (user directive): ALL /display links now open in a NEW TAB (target="_blank" rel="noreferrer") — SiteHeader desktop + mobile menu + (site) footer (labels gained ↗); no console/admin /display links exist. The /board teams-board links got the same treatment (sport page + console home already had target, gained rel; the /board/[matchId] "All teams →" chip gained target+rel), and the four per-match "Scoreboard screen" links gained rel="noreferrer" for consistency. Deliberately left same-tab: the teams board's live-row tap-through to a match board — intra-board navigation on the display device itself.

Verification (EMPIRICAL — headless Chromium, production build, mock snapshot; screenshots in display-fit-shots/, NOT committed): Tally with the control cluster auto-hidden (TV resting state) — 1920×1080: 10/10 teams, lowest row bottom 1006/1080 FITS; 1366×768: 710/768 FITS; 1280×720: 666/720 FITS; 1180×820 (the user's iPad case): 766/820 FITS. Up Next at 1280×720: 7 rows, lowest bottom 666/720 FITS. Latest Results at 1280×720 with 7 fabricated finals (4 versus + 3 placement rows carrying 3 finisher lines each — the tallest row shape): lowest bottom 666/720 FITS. npm test 111/111 at this commit; npx tsc --noEmit clean; npm run build exit 0. Tooling note: Playwright's CDN download kept dropping at ~90% in this VM — the headless-shell zip was fetched with resumable curl and unpacked into ~/.cache/ms-playwright manually; scripts live in /tmp/shots-tool (out of tree).

## Admin Top-3 report — /admin/reports (2026-11-07, post-launch)

User requirement: an admin-only report of the Top 3 of EVERY sport and division, with print + Excel outputs. Separate commit after the /display fit fix.

- ROUTE/GATING: app/(site)/admin/reports/page.tsx → /admin/reports, linked from /admin (TOP 3 REPORT card under the header). Same gate as /admin: session.role !== "admin" (the normalized super_admin) gets the block page; verified empirically — a demo coordinator is blocked and sees no report content. Derives entirely from the shared snapshot (useSnapshot), so live + mock modes behave identically. Generated-at stamp = mount-time client stamp formatted in Asia/Manila (effect pattern — Next 16 prerender rejects `new Date()` in a Client Component body; the first build caught exactly that).
- SOURCE (lib/report.ts, pure + 8 tests): CONFIRMED awards only — the identical set computeTally counts (state === "confirmed"; drafts/voids never appear — test-proven with a draft gold + void silver present). Playoff divisions confirm from finals; placement_only divisions confirm from their recorded placements (award source "placement") — one uniform source, no second derivation. A division is "decided" when it holds ≥1 confirmed place; places list every holder (shared medals list several teams). Winning entries list their roster players (name-sorted) when a roster is loaded — read straight off the snapshot (rosters/players), no new queries. The report's tally IS computeTally (test asserts points/ranks incl. shared-rank ties), and top3SheetRows flattens Sport | Division | Place | Team in report order.
- LAYOUT: header (event name, confirmed-only note, generated stamp, "X of 43 divisions decided") → OVERALL MEDAL TALLY (the existing TallyTable) → per sport → per decided division (medal-literal gold/silver/bronze dots + 1st/2nd/3rd + team + players) → "NOT YET DECIDED (N)" two-column list for coverage at a glance.
- PRINT (globals.css @media print + @page A4/14mm): visibility isolation — only .report-print-area prints (site header/footer/buttons gone), .no-print drops the toolbar, print-color-adjust exact keeps medal colors, every sport after the first starts a fresh page (.report-sport ~ .report-sport break-before), division blocks never split (break-inside avoid).
- EXCEL (lib/report-xlsx.ts + lib/report-file.ts, following the roster-template/file split — exceljs dynamically imported, navy header styling mirrored): sheet "Top 3" = Sport | Division/Category | Place | Team (one row per team-place); sheet "Medal Tally" = Rank | Team | Gold | Silver | Bronze | Points (rank "—" while scoreless, same convention as the boards).
- MOCK COUNTS: fresh mock seed = 0 of 43 divisions decided / 43 pending (unit-tested against the real MockProvider snapshot: 9 sports, 43 divisions, 10 tally rows).

Verification: npm test 119/119 (111 prior + 8 report: confirmed-only extraction, placement-division podiums, decided/pending partition + counts, shared medals, roster attachment, tally reuse, Excel row flattening, real-seed coverage); npx tsc --noEmit clean; npm run build exit 0 (route ƒ /admin/reports present). Empirical (production build, headless Chromium; artifacts in report-shots/, NOT committed): fabricated state with 2 decided divisions (Volleyball Men's playoff podium + Bowling Executive Mixed placement podium, a draft "ghost" gold in Chess, roster players on the volleyball winner) → page shows "2 of 43 divisions decided", NOT YET DECIDED (41), both podiums with players under the winner, ghost absent, tally = CODE RED 2 gold / 10 pts; Excel download parsed back with exceljs — sheets [Top 3, Medal Tally], exact 6 winner rows + 10-team tally with shared ranks; print emulation screenshot = chrome-free report page 1, page.pdf() = 8 A4 pages; coordinator gate verified (blocked, no content). The one lint warning in touched files (unused LiveBug in display/page.tsx) predates this pass.

## /display Tally — table form (2026-11-07, post-launch)

User direction (on the fit-fix screenshot): "make it into a table — alternate row shades with mild white border on the team, medals and points." Presentation-only restyle of TallyView in app/display/page.tsx; the public TallyTable and the admin report are untouched.

- GRID: header band + data rows share verbatim column cells (RANK 6.5vw | TEAM flex-1 | GOLD/SILVER/BRONZE 5.7vw each, centered | POINTS 7vw, right-aligned) so every separator lines up. Vertical separators = cell border-l white/20; horizontal separators = row border-b white/15 (last row borderless against the frame); outer frame border white/20; header band bg white/[0.07] with a white/25 bottom rule, labels RANK/TEAM/GOLD/SILVER/BRONZE/POINTS with medal dots kept. The pinstripe arena stays visible around the table.
- ZEBRA: odd data rows bg-white/5 over the base navy; even rows transparent. The leader row still wins over zebra — bg-navy-900 + inset gold left bar (boxShadow unchanged, overlays the frame's left edge at that row) + gold rank/points, only while points > 0.
- NO REGRESSIONS BY CONSTRUCTION: zebra + borders live inside the row boxes (border-box, no fixed heights added); the cqh size-container machinery is byte-identical below the header — rank ≤8.2cqh / name ≤5.6cqh / medals 4.4cqh / points ≤7cqh of a 10cqh row. Rank "—" while scoreless, tabular numerals, ticker/clock/controls untouched.

Verification (EMPIRICAL — headless Chromium, production build, mock snapshot; screenshots display-fit-shots/tally-{1920x1080,1180x820}-table.png, NOT committed): 1920×1080 — 10/10 teams, lowest row bottom 1005/1080 FITS; 1180×820 (user's iPad case) — 765/820 FITS (same margins as the fit pass: 1006/766 measured then, ±1px rounding). Computed-style audit of the live DOM: exactly 5/10 rows carry the white-5% tint (alternating), 50 vertical-border cells (5/row), 9 row bottom-borders (last row against the frame). Both screenshots eyeballed: full grid + header band + zebra render as a broadcast standings table. npm test 119/119; npx tsc --noEmit clean; npm run build exit 0; eslint on the touched file shows only the pre-existing unused-LiveBug warning.

## Sheet sync — workbook → Supabase, MANUAL ONLY (2026-11-08, post-launch)

Folds the organizers' source workbook (*Game Tracker PGLU Olympics.xlsx*, id
1I9JwRto0iLZZ3sLYN9Qaw9nUpm_JfTya — the seed workbook, NOT the Team 4 roster
book) into the portal on demand. **Automatic polling was CANCELLED by the user
on 2026-11-08 before it shipped**: there is no SYNC_SECRET, no
/api/sync/sheet endpoint, and no polling caller will be wired — the sync runs
only when a super-admin presses **Sync now** in Admin → SHEET SYNC. It needs
zero new env vars (reuses the service-role key).

- Engine (`lib/sheet-sync/`): fetch.ts (server-only) → parse.ts (pure) →
  engine.ts (pure planner `planChanges` + `runSheetSync` apply loop) →
  store.ts (live store over the service-role client). API:
  `app/api/admin/sheet-sync/route.ts` (GET = recent log + last run; POST = run;
  both behind the same super-admin bearer gate as /api/admin/users). Panel:
  `components/SheetSyncPanel.tsx` on the Admin page (mock mode shows an
  explainer; live mode shows counts, per-tab chips, and the change log).
- Transport: **CSV export by gid is primary** (`export?format=csv&gid=`), gviz
  JSON only as fallback. Measured 2026-11-08: gviz folds this workbook's
  title/merged rows into column labels and DROPS rows (Volleyball 62 gviz rows
  vs 87 CSV rows, first standings row lost), so CSV — the Phase-0 method —
  leads. One fetch per tab per run; a failed tab aborts only itself.
- Parsers encode the data/sheet-extract.md layouts: tracker tabs (standings =
  entries + Winner-#-resolution; fixture block right of the standings with
  per-set SCORES pairs for volleyball, one totals pair for basketball whose
  sheet-global Match # maps to DB label "Match N"); racket tabs (entry matrix
  + two parallel court blocks per row; venue = "Heritage 2500 · Court N";
  playoff text rows → Semifinal/Third-Place/Championship labels; one-team rows
  = walkovers → entry only); matrix tabs (entries; placement tabs flip a
  column to PLACES once any cell is an ordinal or ≥2 — otherwise "1" means
  entered, not champion). Names normalize (case/punctuation-insensitive) with
  the documented sheet-typo alias PDRRMO HAZARD BREAKERSA → …BREAKERS.
  Basketball's seeded 12:40 AM→PM fix is protected by a 12-hour-flip
  equivalence in the time diff (sync never "un-normalizes" it).
- Rules (conservative, binding): allowed writes are fixture starts_at/venue,
  recorded finals for versus sports (sheet final → portal final via the
  existing RPC flow live→save→final, i.e. an UNCONFIRMED final with draft
  awards — medal confirmation stays human), complete placement results
  (unconfirmed), and entry adds/reactivations/withdrawals. NEVER overwritten:
  live matches, portal finals that disagree, confirmed divisions, rosters.
  Disagreements become conflict_skip log rows. Undecided set scores,
  winner-column contradictions, partial placements, and results for unresolved
  fixtures are HELD (logged, not applied). Unmatched sheet fixtures are logged
  and counted, never inserted. Withdrawal additionally requires the team to
  have ZERO fixtures in the division — sheet matrices lag fixture lists
  (Pickleball 39-Girls plays a Nov-18 round its matrix predates). Idempotent:
  field-level diff; a no-change run applies 0 writes.
- Writes go through the EXISTING RPCs (update_fixture / save_score /
  set_match_status), so advancement propagation, draft-award proposals and
  realtime events behave exactly as if a coordinator entered the result. The
  sync never self-acknowledges a conflict: an update_fixture "warning" (major
  player conflict) is recorded as a FAILED change.
- Migration 11 (`20261107140000_sheet_sync.sql`, idempotent) — joins the user's
  SQL-Editor list AFTER 8/9/10: (a) `sheet_sync_log` (run_id, kind incl. the
  added `unmatched` kind beyond the brief's list, fixture/division refs,
  field, old/new, source_ref; RLS on, admin-select policy, no anon access);
  (b) `_assert_match_writer` gains a service_role early-return — all write
  RPCs assert on auth.uid(), which is NULL for service-role calls, so before
  migration 11 the engine's RPC writes fail per-change with 42501 and are
  logged FAILED (the run still completes; schedule/entry DML paths unaffected
  in design but entry DML works pre-11 since it needs no RPC). Graceful
  degradation without the log table: store.writeLog returns false → the run
  still applies everything and the response carries the full log in-memory
  (`logPersisted: false`; the panel shows it and notes the pending migration).
- Live verification (read-only, 2026-11-08): fetch+parse of the real workbook
  returned Basketball 34 fixtures/14 entries, Volleyball 40/18, Bowling 27
  entries, Pickleball 90/43, Badminton 96/49 (3 walkover warnings), Athletics
  66, Mobile Games 16, Chess 11, Laro ng Lahi 46 entries. Seed-vs-sheet pairing
  diff is clean except two known sheet quirks that sync handles conservatively:
  Pickleball 39-Girls lists FOURce–PDRRMO twice (9:30 + 11:00 AM Nov 18; the
  duplicate becomes an unmatched log row) and a Badminton "3rd Place Loser…"
  descriptor row (unmatched, never inserted). NO live sync was run against
  production Supabase (writes tested only against the in-memory fake store).
- Verification: npm test 145/145 (119 baseline + 14 parser + 12 engine: live
  protected, confirmed protected, unconfirmed final written, placements
  complete-vs-partial, entry add/withdraw/protect, failed-tab isolation,
  idempotent second run = 0, missing-log-table degradation, RPC-warning →
  failed); npx tsc --noEmit clean; npm run build exit 0 (ƒ /api/admin/sheet-sync
  registered); production smoke in mock mode — / 200, API GET/POST 503 without
  the service key (same gate behavior as /api/admin/users), panel strings
  ("SHEET SYNC" / "Sync now") present in the admin client bundle. Commits:
  e00c708 (parsers+fetch), 3e12d11 (engine+store), c08309a (withdrawal guard),
  cc45baa (migration 11 + API + panel), plus this docs commit. NOT pushed —
  parent pushes one-shot.

- Posters pass (2026-11-08, user request — replace the official announcement graphics, whose raw "1" entry cells confused people): downloadable announcement posters in the portal's own branding. lib/posters.ts (pure, tested): posterKind (dated head-to-head matches -> schedule poster, else entries matrix), schedulePosterDays (per Manila day, matches numbered in start order, finals carry totals, LIVE carried via status), entriesPoster (teams x divisions boolean matrix). components/Poster.tsx: fixed 1920x1080 arena-navy posters, crimson header rule, sport identity icon/tint, zebra + hairline-grid tables (the /display treatment), entered = crimson check (never "1"), not entered = faint dash, entries legend line. Pages: /posters gallery (per-sport card w/ kind + counts) and /posters/[sport] (scaled live preview, day chips for schedule sports, Download PNG via html-to-image toPng at 1920x1080 — new dependency). Links: header nav + mobile menu + footer + a "Download poster" button on every sport page header. Tests 151/151 (6 new), tsc + build clean. Posters read the live snapshot, so they always match the site data; migration state does not affect them.
