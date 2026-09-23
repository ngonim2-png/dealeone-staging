# DEALEONE — Find It. Near You.

A location-first, AI-powered local commerce marketplace, built from the DEALEONE product
spec as a working front-end codebase with realistic mock data (no backend yet).

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- React Router
- Leaflet / React-Leaflet (map, free OpenStreetMap/CARTO tiles, no API key)
- vite-plugin-pwa (installable as a PWA on a phone)
- All state (wishlist, offers, listings you publish, chats) persists to `localStorage` —
  there is no server. This is a UI/UX + interaction layer meant to be wired to a real
  backend next.

## Run it

```bash
npm install
npm run dev
```

Open the printed local URL. The layout is mobile-first — narrow your browser window or
open dev tools' device toolbar for the intended experience. It also installs as a PWA
(`npm run build && npm run preview`, then "Add to Home Screen" on a phone on the same
network).

## What's implemented

Matches the MVP scope from the spec (§49):

- **Explore (map home)** — category pins on a real Leaflet map, radius filter chips
  (1/3/5/10/25 km / Anywhere), auto radius-expansion prompt when nothing matches, tap-a-pin
  bottom sheet, swipeable nearby-listings carousel.
- **Search** — traditional keyword search and a mock "Ask AI" mode that parses natural
  language ("find me a good used iPhone under NLe 15,000 within 5 km") into structured
  filters, category chips, and 7 ranking modes (Closest, Best Deal, Recommended, Sponsored,
  Newest, Price ↑/↓) with SPONSORED labeling kept separate from organic "Closest" ranking.
- **Listing detail** — tags, seller card with verification tier and rating, Make Offer
  (with counter flow reflected in chat), Message Seller, wishlist save, similar-nearby
  (basic AI-style product matching), directions link.
- **Sell flow** — Photos → AI detect (mock) → Details → Location → Listing duration/fee →
  Publish, and the new listing appears live on the map immediately.
- **Chats** — per-listing conversation threads with product context, offer/counter-offer
  message bubbles, unread badges, simulated seller auto-replies.
- **Account** — profile, My Listings (Active/Sold/Expired/Drafts), My Offers, Wishlist,
  Buyer Requests ("wanted" reverse-marketplace, §14 — you can post one), tiered
  verification (Phone → Identity → Verified Seller → Verified Business).

## What's deliberately not built yet

Everything that needs a real backend or third-party integration: authentication, a real
AI/LLM behind search and photo detection, payments (mobile money / bank / cards), the
admin back office, location-targeted/push advertising, delivery, and persistence beyond
one browser's `localStorage`. See the full spec for the phased roadmap (§49).

## Project structure

```
src/
  types/        data model (Listing, Seller, Offer, Conversation, BuyerRequest, ...)
  data/         mock dataset (Freetown-based) + AI photo-detection catalog
  lib/          geo/distance, filters + ranking, price/date formatting, mock NL query parser
  context/      AppContext — in-memory + localStorage app state and actions
  components/   shared UI (map, nav, cards, filter sheet, offer modal, ...)
  pages/        one file per screen, routed with react-router
```
