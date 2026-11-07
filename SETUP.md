# PGLUlympics — Supabase & deployment setup (for Harold)

Plain-language checklist. The app, database schema, and all volleyball data are
already written — you only connect the pieces. Estimated time: 15–20 minutes.

Project: **PGLUlympics** · Supabase project `cvpkxgwdttyryeurvvvo`
(`https://cvpkxgwdttyryeurvvvo.supabase.co`) · Repo `halords/pglulympics` ·
Vercel deploys automatically from the repo's `main` branch.

---

## Step 0 — Prove the Supabase GitHub integration FIRST (5 minutes)

The repo is connected to Supabase through its GitHub integration. That
connection is what applies `supabase/migrations/*.sql` for us. Prove it works
before anything else:

1. In the repo, merge **only** the schema migrations to `main` first
   (everything under `supabase/migrations/` up to
   `20261107090400_realtime.sql`). If the migration list is empty, the branch
   was not merged — the integration only reads the configured production branch.
2. In the Supabase dashboard → **Database → Migrations**, confirm the migration
   names appear as applied. If they don't show up within a few minutes, the
   integration is watching a different branch — fix that in
   **Project Settings → Integrations → GitHub** before continuing.
3. Only then merge the rest (`20261107090500_official_data.sql`, the app code).
   Data problems are fixed by adding a NEW migration later — never edit an
   already-applied one.

> `supabase/seed.sql` is intentionally comment-only: the official event data
> ships as migration 6 so it lands in every environment, not just local dev.

## Step 1 — Vercel environment variables

Vercel project (git-connected to `halords/pglulympics`) → Settings →
Environment Variables, for **Production** (and Preview if you want it):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://cvpkxgwdttyryeurvvvo.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` key from Supabase → Project Settings → API Keys |
| `SUPABASE_SERVICE_ROLE_KEY` | the secret key from the same page — entered here only, never in code or chat |
| `NEXT_PUBLIC_DATA_TRANSPORT` | `realtime` |

Then trigger a redeploy (Deployments → ⋯ → Redeploy) so the variables take
effect. Without these, the site safely falls back to demo/mock mode.

## Step 2 — Create the first super-admin (you)

1. Supabase dashboard → **Authentication → Users → Add user**: enter your
   email + a password, tick **Auto Confirm User**, create.
2. Copy the new user's **User UID**.
3. Supabase dashboard → **SQL Editor**, run (paste your UID and email):

```sql
insert into public.account_profiles (user_id, role, email)
select id, 'admin', email from auth.users where email = 'YOUR-EMAIL-HERE';
-- or, with the UID directly:
-- insert into public.account_profiles (user_id, role, email)
-- values ('USER-UID-HERE', 'admin', 'YOUR-EMAIL-HERE');
```

4. Open the site → **Console** → sign in with that email/password. You should
   land in the coordinator console with an **Admin** button.

## Step 3 — Create coordinator accounts (one per sport)

For each sport coordinator:

1. **Authentication → Users → Add user** (their email + a temporary password,
   Auto Confirm on).
2. SQL Editor:

```sql
insert into public.account_profiles (user_id, role, sport_id, email)
select u.id, 'coordinator', s.id, u.email
from auth.users u, public.sports s
where u.email = 'COORDINATOR-EMAIL-HERE' and s.slug = 'volleyball';
```

3. Hand them the site link + their login. They only ever see their own sport.

## Step 4 — Verify after the merge (2 minutes)

Open the live site and check:

- Home page shows the countdown to **Mon Nov 9, 2026, 1:00 PM**.
- The sports grid shows **9 sports**; Volleyball lists **2 divisions**, Brackets A & B.
- Schedule shows **276 fixtures** across all sports; **10 teams** in the tally list.
- Sign in as admin → Admin page loads; sign in as the volleyball coordinator →
  console shows only volleyball.

**Two-phone smoke test:** open a match on your phone as coordinator, start it
and add a set score; on a second phone (public view, no login) the score must
appear **within about a second**. If it doesn't, set
`NEXT_PUBLIC_DATA_TRANSPORT=polling` in Vercel and redeploy — viewers then
refresh every 5 seconds while Realtime is investigated.

## Step 5 — Before Nov 9 (organizer decisions, all editable in Admin)

- **Medal points** are seeded **5 / 3 / 1** and flagged **provisional** — the
  source workbook never states the formula. Confirm the real values in the
  Admin page (Event Config) and untick "Provisional" when final.
- **Volleyball scoring profile** is seeded as best-of-3, sets to 25 (15 in the
  decider), win by 2 — also provisional; tell the developer if the house rules
  differ and it becomes one small data migration.
- **Semifinal seeding** follows the standard crossover (Bracket A #1 vs
  Bracket B #2, B #1 vs A #2) — the sheet doesn't state it; if the organizers
  use a different pairing, flag it before Nov 25.
- **Rosters:** enter player names per team in the Admin page and mark each
  roster **verified** — the cross-sport conflict checker only covers verified
  rosters.
- **Sheet quirks to confirm with the organizers** (all seeded as listed, all
  fixable in-app): Pickleball 39 Boys has its Semifinal 1 at Nov 18 5:00 PM but
  its Championship at 9:45 AM the same day; racket-sport semifinals are seeded
  as single-table 1v4 / 2v3 because the sheet's round-robin pairings form one
  table despite "Bracket 1 / Bracket 2" labels; Bowling, Athletics and Laro ng
  Lahi have dates but no start times in the sheet (shown as "to be scheduled");
  Mobile Games and Chess have entries but no fixtures in the sheet — their
  coordinators create fixtures in the console.

## Troubleshooting

- *Site shows demo data / demo sign-in:* the Vercel env vars from Step 1 are
  missing — the app intentionally falls back to mock mode.
- *Coordinator sees no matches:* their `account_profiles.sport_id` doesn't
  match the sport, or migrations haven't been applied (Step 0).
- *Scores save but viewers don't update:* check the transport env var
  (Step 1) and that Realtime is enabled for the project (it is on by default;
  migration 5 adds `event_updates` to the realtime publication).
