# ADDENDUM to brief.md (user update, 2026-11-07) — binding, overrides brief where in conflict

1. Product name: **PGLUlympics**. Repo: halords/pglulympics, branch main.
2. Schema delivery: the repo is connected to the owner's Supabase project via Supabase's GitHub
   integration. The spec's data model must therefore be delivered as timestamped SQL migration
   files under `supabase/migrations/` plus a `supabase/seed.sql`, and the spec must state the
   migration file breakdown (schema, RLS policies, realtime publication, seed) and any
   dashboard-only steps the integration cannot do (e.g. enabling Realtime on tables if not
   expressible in SQL, creating the first auth user).
3. Everything else in brief.md stands.
