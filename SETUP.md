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

## Step 2 — Create the first super-admin (you, one-time bootstrap)

The in-app user manager needs an existing super-admin to sign in with, so the
very first admin is still created by hand:

1. Supabase dashboard → **Authentication → Users → Add user**: enter your
   email + a password, tick **Auto Confirm User**, create.
2. Copy the new user's **User UID**.
3. Supabase dashboard → **SQL Editor**, run (paste your UID and email):

```sql
insert into public.account_profiles (user_id, role)
select id, 'super_admin' from auth.users where email = 'YOUR-EMAIL-HERE';
-- or, with the UID directly:
-- insert into public.account_profiles (user_id, role)
-- values ('USER-UID-HERE', 'super_admin');
```

4. Open the site → **Console** → sign in with that email/password. You should
   land in the coordinator console with an **Admin** button.

## Step 3 — Create coordinator accounts (in the app)

Sign in as the super-admin → **Admin → User Accounts**:

1. Enter the coordinator's email, a temporary password (min 8 characters),
   and a display name; role = **Coordinator**.
2. Tick **all** the sports they handle — a coordinator can cover several
   sports, and a sport can have several coordinators. Their console gets a
   sport switcher for exactly that set, and the database enforces the same
   scope (they cannot read or score another sport's data).
3. **Create user** — they can sign in immediately. Hand them the site link +
   their login.
4. Later changes live in the same section: **Edit** adjusts role, sports, and
   display name; unticking **Account active** deactivates sign-in.

> **Multi-sport model (migration 8):** assignments live in
> `account_sport_assignments` (user × sport). It backfills from the old
> single-sport column `account_profiles.sport_id`, which stays in the schema
> as a legacy, unused column. Migration 8 applies automatically via the
> GitHub integration on merge, like the earlier migrations.

<details>
<summary>Fallback: create a coordinator with SQL (only if the in-app manager is unavailable)</summary>

1. **Authentication → Users → Add user** (their email + a temporary password,
   Auto Confirm on).
2. SQL Editor — profile first, then one assignment row per sport:

```sql
insert into public.account_profiles (user_id, role)
select id, 'coordinator' from auth.users where email = 'COORDINATOR-EMAIL-HERE';

insert into public.account_sport_assignments (user_id, sport_id)
select u.id, s.id
from auth.users u, public.sports s
where u.email = 'COORDINATOR-EMAIL-HERE' and s.slug = 'volleyball';
-- repeat the second insert per extra sport, changing the slug
```

</details>

## Step 4 — Verify after the merge (2 minutes)

Open the live site and check:

- Home page shows the countdown to **Mon Nov 9, 2026, 1:00 PM**.
- The sports grid shows **9 sports**; Volleyball lists **2 divisions**, Brackets A & B.
- Schedule shows **276 fixtures** across all sports; **10 teams** in the tally list.
- Sign in as admin → Admin page loads; sign in as a coordinator → the console
  shows only their assigned sport(s), with a switcher when they have several.

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

## TV display board (venue screen)

The site ships a dedicated fullscreen board for the venue TV at **`/display`**
(e.g. `https://<your-site>/display`). It is chromeless — no header, nav or
footer — and updates live from the same data feed as the public site, so
scores and the tally refresh on screen with no reload and no interaction.

- **Run it:** open `/display` in the TV's browser (or a laptop on HDMI),
  then press **F11** for fullscreen. Any modern smart-TV browser works;
  nothing to install, no sign-in needed.
- **What it shows:** views auto-cycle every ~15 seconds — **Overall
  Standings** (all 10 teams) → **Live Now** (scorebug view, only in the
  rotation while matches are live) → **Up Next** → **Latest Results** —
  over a persistent bottom ticker of the latest results and upcoming
  fixtures, with a live clock in the corner.
- **Second screen / fixed view:** pin one view with a query parameter —
  `/display?view=tally`, `?view=live`, `?view=upnext` or `?view=results`.
  A pinned `live` view falls back to the tally when nothing is live.
- Sized for distance reading at 1920×1080 and 1366×768 — keep the TV at
  its native resolution and browser zoom at 100%.
