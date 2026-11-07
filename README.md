# PGLUlympics — live sports-fest tracker

Live scores, schedules, standings, and the overall medal tally for the
**PGLUlympics** (Provincial Government of La Union sports fest, Nov 9–26, 2026).

- **Public site** — live now-playing, up next, latest results, per-sport pages
  with bracket standings, full schedule, and the overall medal tally.
- **Coordinator console** — per-sport scoped accounts; big touch-friendly,
  set-by-set scoring; match flow scheduled → live → final; automatic semifinal
  advancement; in-app fixture create/edit with cross-sport player-conflict and
  venue double-booking checks.
- **Super admin** — medal confirmation, needs-review queue, rosters +
  verification, medal-points and match-duration config.

## Stack

Next.js (App Router, TypeScript) on Vercel · Supabase (Postgres + Auth +
Realtime) · Tailwind CSS. Data transport is switchable: `realtime`
(Supabase Realtime on the `event_updates` projection, <1s), `polling`
(5s fallback), or `mock` (local fixtures, no backend).

## Local development

```bash
npm install
npm run dev        # http://localhost:3000 — runs in mock/demo mode by default
npm test           # conflict-overlap utility tests (vitest)
npm run build
```

With no Supabase env set, the app runs entirely on local seed fixtures with
demo sign-in roles (Volleyball Coordinator / Super Admin) and browser-local
persistence — the full scoring/advancement/conflict flows are testable offline.

## Environment variables

See [`.env.example`](.env.example). Required in Vercel for production:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
(new key naming; `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback),
`SUPABASE_SERVICE_ROLE_KEY` (server-only), `NEXT_PUBLIC_DATA_TRANSPORT=realtime`.

## Database

Schema, RLS, views, and RPCs ship as Supabase migrations in
[`supabase/migrations/`](supabase/migrations/) and are applied by the repo's
Supabase GitHub integration; official event data is migration
`20261107090500_official_data.sql` (event, 10 teams, volleyball) plus
`20261107100000_more_sports.sql` (the other 8 sports — 43 divisions and 276
fixtures in total across all 9 sports). `supabase/seed.sql` is intentionally
comment-only. Full operator instructions: [SETUP.md](SETUP.md).

Design and decisions: [SPEC.md](SPEC.md) · Build state: [STATE.md](STATE.md).

<!-- supabase integration sync: 2026-11-07 -->

<!-- supabase integration sync: migration 8 check 2026-11-07 -->
