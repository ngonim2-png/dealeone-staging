# Deploying this round's changes to DEALEONE

This zip merges everything into one buildable codebase for the first time in a while:
the **navigation redesign** (Map/List home screen + Promote tab), **Events**, **Statuses**,
and every monetization/trust-and-safety feature from earlier rounds — all of which existed
only in an earlier zip you'd downloaded but never pushed to GitHub — **plus** this session's
**light-theme rebrand** (new green/lime logo, light color palette, light map tiles),
applied fresh on top of that fuller codebase rather than the older one GitHub currently has.
**Also newly added**: a real "Delete my account" feature (Settings → Delete account) — Apple
requires this for any App Store app that allows account creation, which came up because you
asked how to get DEALEONE onto the App Store/Play Store. It needs one more small database
migration (adds a single column) — already covered by Step 3 below, no extra step to
remember.

Your current setup, for reference:
- GitHub repo: `github.com/ngonim2-png/dealeone-2`
- Render services: `dealeone-api-022g` and `dealeone-web-022g`

## Before you push: this replaces everything on GitHub

Because your GitHub repo has been stuck on an older snapshot (missing Events, Statuses, and
the navigation redesign) for a while, **this round's zip is not a small diff** — pushing it
will bring your repo fully up to date in one go, including all that previously-unpushed work
plus the new visual theme. That's the goal, so this is expected, not a mistake: `git status`
after unzipping will show a large number of changed files. Just don't skip Step 3 below.

## What you'll need

- The `dealeone-fullstack.zip` from this conversation (download it if you haven't).
- A terminal (Terminal on Mac, or Git Bash on Windows — same one you've used before).
- `git` installed (`git --version` to check).

## Step 1 — Clone a clean copy of your current repo

Don't reuse an old local folder — start fresh from what's actually on GitHub right now, so
you're not merging on top of something out of sync:

```bash
git clone https://github.com/ngonim2-png/dealeone-2.git dealeone-latest
cd dealeone-latest
```

If it asks for a password and your normal GitHub password doesn't work, GitHub wants a
[Personal Access Token](https://github.com/settings/tokens) instead — generate one
(Settings → Developer settings → Personal access tokens) and paste that in when prompted.

## Step 2 — Unzip the new build on top of it

1. Unzip `dealeone-fullstack.zip` somewhere separate (e.g. your Desktop).
2. Select **everything inside** the unzipped folder (not the folder itself) and copy it
   into `dealeone-latest`, confirming "replace" for anything that already exists.
3. **Do not copy `.git`, `apps/api/.env`, or `apps/web/.env.local`** into `dealeone-latest`
   — those are local-only and shouldn't come from the zip (it doesn't include them anyway).

## Step 3 — Check what changed, and run the new migration

```bash
git status
```

You'll see a large list — new files (`pages/Events.tsx`, `pages/EventDetail.tsx`,
`pages/CreateEvent.tsx`, `pages/account/MyEvents.tsx`, `pages/Promote.tsx`,
`components/Status*.tsx`, `apps/api/src/routes/events.ts`, `apps/api/src/routes/statuses.ts`,
etc.) alongside changed ones (`App.tsx`, `BottomNav.tsx`, `Explore.tsx`, `index.css`,
`MapView.tsx`, `MiniMap.tsx`, the new logo/icon assets, and more). That's expected — this
is genuinely everything since your last push, not a small round.

**This round needs a real database migration** (Events + Statuses add new tables, and the
new account-deletion feature adds one column to `users`) — after pushing (Step 4), you must
run it once on Render:

1. Open `dealeone-api-022g` in the Render dashboard once the new deploy shows **Live**.
2. Go to its **Shell** tab and run:
   ```bash
   npm run db:migrate --workspace apps/api
   ```
   (Render's start command does not auto-run new migrations for you.)
3. Then reseed so Events/Statuses have demo data to show:
   ```bash
   npm run db:seed --workspace apps/api
   ```
   **This wipes and reloads all demo data** — skip this specific step only if you've since
   had real signups/listings you want to keep (the migration in step 2 is still required
   either way).

## Step 4 — Commit and push

```bash
git add .
git commit -m "Merge navigation redesign, Events, Statuses, and the light-theme rebrand"
git push origin main
```

Render is watching this repo and will kick off a new deploy for both `dealeone-api-022g`
and `dealeone-web-022g` within a minute or two. Watch it happen in each service's **Logs**
tab in the Render dashboard, then come back and do Step 3's migration/reseed once the API
service shows **Live**.

## Step 5 — Confirm it's live

Open your `dealeone-web-022g` URL and check:

- Log in with the demo buyer `+232-76-000001` / PIN `1234`.
- The whole app should be **light** (off-white background, white cards), with the new
  green/lime "Dealeone" logo in the header and on login.
- The bottom nav should show exactly 5 tabs: **Events, Messages, Sell, Profile, Promote**
  (Sell raised and glowing dead-center) — not the older Explore/Search/Sell/Chats/Account.
- The home screen should open on a **Map** view with a **Map / List** pill toggle; tapping
  **List** reveals the ranked/filterable results list.
- Tap **Events** — you should see upcoming seeded events (a rooftop party, a football
  tournament, etc.) with dates, venues, and ticket info.
- Tap **Promote** — you should see the verified-seller fast-track and buyer-request
  priority cards, plus a "Boost your listings" section for the demo account's own listing.
- On **Messages**, you should see a row of circular status avatars at the top (a WhatsApp-
  style status strip) for the seed sellers eligible to post them.
- The map should render on light basemap tiles with white pin badges, a lime "you are here"
  dot, and a forest-green accent throughout (buttons, prices, active chips).
- Open **Account → Settings** and confirm a red "Delete account" card is there below the
  business-account toggle. **Don't actually delete the demo buyer account to test this** — it
  permanently scrubs that account's name/phone/PIN, which would break the seeded demo data
  documented throughout this project. If you want to see the full delete flow work, sign up
  a throwaway test number instead (any phone number that isn't one of the seeded ones) and
  delete that one.

If something looks stale, it's almost always the browser caching the old site — hard
refresh with Ctrl/Cmd+Shift+R.

## Doing this again next time

Steps 1–2 (clone + copy zip contents) are the part that changes every round. Step 3's
migration is only needed when a round adds new database tables (this one does — Events
and Statuses); a purely visual/frontend round (like the previous rebrand) doesn't need it.
Steps 3 (status check)/4 (commit, push) are otherwise always the same commands. No need to
touch the Render Blueprint setup again — that only happens once.

**One habit worth starting now that everything is finally in sync**: push each round to
GitHub soon after it's built, rather than letting several rounds pile up in downloaded zips
— that's what caused this round to need a bigger-than-usual merge. A future session can't
recover work from a zip you've deleted, so if in doubt, push sooner rather than later.
