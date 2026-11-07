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
