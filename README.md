# DEALEONE — Find It. Near You.

A location-first, AI-powered local commerce marketplace, built from the DEALEONE product
spec. Full-stack monorepo: a real Postgres database, an Express/TypeScript API, and a
React PWA frontend — all wired together and working end to end.

```
apps/
  web/   React + TypeScript + Vite + Tailwind + Leaflet PWA (the app people use)
  api/   Express + TypeScript + Drizzle ORM REST API (the backend)
render.yaml   Render Blueprint — deploys db + api + web together
```

## Quick start (local)

Requires Node 20+ and a local Postgres.

```bash
npm install                                   # installs both workspaces

# 1. Database — create a role + db once:
#    createuser dealeone --pwprompt --createdb
#    createdb dealeone -O dealeone

# 2. API
cp apps/api/.env.example apps/api/.env        # edit DATABASE_URL if yours differs, set JWT_SECRET
npm run db:migrate                            # applies apps/api/drizzle/*.sql
npm run db:seed                                # loads demo data (Freetown listings etc.)
npm run dev:api                                # http://localhost:4000

# 3. Web (separate terminal)
cp apps/web/.env.example apps/web.env.local    # VITE_API_URL=http://localhost:4000
npm run dev:web                                # http://localhost:5173
```

The web app opens on a real phone-number login screen — enter any number, and since no SMS
provider is wired up yet, the one-time code is shown directly on screen instead of being
texted (see "What's implemented" below). To see the app pre-populated with sample listings,
conversations, and offers rather than a blank new account, log in as the seeded demo user
with phone `+232-76-000001` (any name, since that account already has one).

## Stack

- **Database**: Postgres, schema + migrations in `apps/api/src/db/schema.ts` via
  [Drizzle ORM](https://orm.drizzle.team). Geospatial radius search is a plain haversine
  formula in raw SQL (`apps/api/src/lib/geo.ts`) rather than PostGIS, so it runs on any
  stock Postgres — including Render's managed Postgres — with zero extensions.
- **API**: Express + TypeScript, run directly with `tsx` (no separate build step). REST
  endpoints for listings (search/filter/rank/create), offers, conversations/messages,
  wishlist, buyer requests, and a real phone-OTP auth flow issuing signed JWT sessions.
  See `apps/api/src/routes/` and `apps/api/src/lib/{jwt,otpStore,auth}.ts`.
- **Web**: React 19 + TypeScript + Vite + Tailwind v4 + React Router (hash-based, so it
  needs zero server rewrite rules) + Leaflet for the map. Talks to the API via
  `apps/web/src/lib/api.ts`; `apps/web/src/context/AppContext.tsx` holds all app state.

## Deploying (Render)

`render.yaml` is a [Render Blueprint](https://render.com/docs/blueprint-spec) that
provisions a managed Postgres, the API as a Node web service, and the frontend as a
static site, all from this one repo.

1. Push this repo to GitHub/GitLab.
2. In the Render dashboard: **New → Blueprint**, point it at the repo.
3. Render provisions all three services and wires `DATABASE_URL` automatically, and
   generates a random `JWT_SECRET` for you (`render.yaml`'s `generateValue: true`) — no
   manual secret to create or paste in.
4. First deploy only: open the `dealeone-api` service's **Shell** tab and run
   `npm run db:seed --workspace apps/api` to load demo data (the migration runs
   automatically on every deploy; seeding does not, since it wipes existing rows).
5. If either service's Render subdomain differs from what `render.yaml` assumes
   (`dealeone-api` / `dealeone-web` already taken by someone else), update
   `CORS_ORIGIN` on the API and `VITE_API_URL` on the web service to match, then
   redeploy both.

Nothing else needs to change — the same Postgres connection string and REST API work
identically whether Postgres is the local one on your machine or Render's managed one.

## What's implemented

Matches the MVP scope from the spec (§49), now backed by real data instead of mocks:

- **Real auth** — phone-number login/registration with actual one-time codes (random,
  per-phone, 5-minute expiry, single use) and signed JWT sessions (`apps/api/src/lib/jwt.ts`,
  `otpStore.ts`). Different phone numbers are genuinely different accounts with their own
  listings, offers, and chats now — this replaced the earlier build's single shared demo
  user. The only mock piece left is SMS delivery: no provider is wired up, so
  `request-otp` returns the code directly instead of texting it (see below).
- **Explore (map home)** — category pins on a real Leaflet map, radius filters with
  auto-expansion, tap-a-pin bottom sheet, swipeable nearby-listings carousel.
- **Search** — keyword search plus a mock "Ask AI" natural-language parser, category
  filters, 7 ranking modes, SPONSORED labeling kept separate from organic "Closest".
- **Listing detail** — Make Offer (creates a real `offers` row + a message in the
  conversation thread), Message Seller, wishlist, similar-nearby, and a real embedded
  street-level map with the item's exact location (or a fuzzed general-area circle — see
  below) plus a reverse-geocoded street address.
- **Sell flow** — Photos → AI detect (mock) → Details → Location → Publish; the created
  listing is a real row in Postgres and appears on the map immediately for every client.
  The "show approximate location to buyers" checkbox in the Location step is real: it's
  enforced server-side (`apps/api/src/lib/geo.ts`'s `presentListing`, applied everywhere a
  listing leaves the API), not just a frontend display choice — a listing with it checked
  never sends its exact coordinates to anyone but the seller, a stable per-listing fuzzed
  point (~80–320m off) goes out instead.
- **Chats** — real per-listing conversation threads and messages persisted server-side;
  the seller's auto-reply is still simulated client-side only (see below).
- **Account** — My Listings (all statuses, live from the DB), My Offers, Wishlist, Buyer
  Requests (§14's reverse marketplace — postable and persisted), verification tiers.

## What's still missing

- **Real SMS delivery.** The OTP flow is otherwise real (see above), but there's no
  Twilio/Africa's Talking/etc. integration yet, so the code is returned in the API
  response and shown on screen instead of being texted. Swapping in a real provider is a
  small, contained change — one line in `apps/api/src/routes/auth.ts` — since the rest of
  the flow (code generation, expiry, one-time use, JWT issuance) already works for real.
- **Seller-side auto-replies** in chat are simulated client-side for demo liveliness —
  not persisted to the API, since there's no real seller session to send them from.
- **Street addresses depend on an external geocoder.** `apps/web/src/lib/geocode.ts` calls
  OpenStreetMap's free Nominatim API directly from the browser to turn coordinates into a
  street name. It's not reachable from this project's dev sandbox (outbound network policy
  blocks it there), so it always falls back to the seller's neighborhood text when tested
  here — that's expected, not a bug, and it resolves to a real street address once deployed
  somewhere with normal internet access (e.g. Render). Worth proxying server-side with
  proper caching before real traffic, per Nominatim's usage policy.
- **Everything else needing third-party integration**: payments (mobile money/bank/
  cards), the admin back office, location-targeted/push advertising, delivery, real
  AI/LLM behind search and photo detection (both are still heuristic parsers). See the
  spec's phased roadmap (§49) for what's next.

## Repo layout details

See `apps/web/README.md` and inline comments in `apps/api/src/` — routes and the schema
file are commented with which spec section they implement.
