// DEALEONE — Drizzle schema, mirrors spec §43 (DATA STRUCTURE).
// Plain lat/lng double columns + a haversine expression in raw SQL for radius queries
// (see src/lib/geo.ts) rather than PostGIS, so this runs on any stock Postgres —
// including Render's managed Postgres — with no extensions required.

import { sql } from 'drizzle-orm'
import {
  pgTable,
  pgEnum,
  text,
  doublePrecision,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  jsonb,
} from 'drizzle-orm/pg-core'
import { createId } from './cuid'

// Original 11 kept first (existing rows/migrations depend on the enum values, not their
// order, but keeping them first makes the diff against the previous migration obvious).
// The 15 added below round this out to a general local-marketplace taxonomy (electronics,
// vehicles, property... already covered plenty of ground, but phones, appliances, jewelry,
// bags, shoes, tools/hardware, auto parts and pets did not have anywhere to live before —
// see the frontend's types/index.ts for the human labels + emoji, and categoryIcons.ts for
// the map-pin glyphs).
export const categoryEnum = pgEnum('category', [
  'electronics',
  'cars',
  'property',
  'food',
  'groceries',
  'fashion',
  'services',
  'furniture',
  'agriculture',
  'computers',
  'shops',
  'phones',
  'appliances',
  'home_living',
  'beauty_health',
  'baby_kids',
  'jewelry_watches',
  'bags_luggage',
  'shoes',
  'sports_outdoors',
  'toys_games',
  'office_school',
  'tools_hardware',
  'auto_parts',
  'pets',
  'hobbies_music',
])

export const conditionEnum = pgEnum('condition', ['new', 'used', 'refurbished'])

export const listingStatusEnum = pgEnum('listing_status', [
  'draft',
  'pending_payment',
  'active',
  'reserved',
  'sold',
  'expired',
  'removed',
])

export const listingTypeEnum = pgEnum('listing_type', [
  'standard',
  'deal',
  'auction',
  'wanted',
  'service',
])

export const offerStatusEnum = pgEnum('offer_status', [
  'pending',
  'accepted',
  'rejected',
  'countered',
])

export const messageTypeEnum = pgEnum('message_type', [
  'text',
  'offer',
  'counter_offer',
  'system',
  'voice',
])

export const buyerRequestConditionEnum = pgEnum('buyer_request_condition', [
  'new',
  'used',
  'either',
])

export const buyerRequestStatusEnum = pgEnum('buyer_request_status', [
  'open',
  'matched',
  'expired',
])

export const userRoleEnum = pgEnum('user_role', ['user', 'admin'])

// Events — a genuinely dedicated section, not just another listing category (see the
// events table below for why). A small, distinct taxonomy from categoryEnum: "live show",
// "nightlife" etc. describe *happenings*, not *things for sale*.
export const eventCategoryEnum = pgEnum('event_category', [
  'live_show',
  'nightlife',
  'sports',
  'community',
  'business',
  'arts_culture',
  'food_drink',
  'religious',
  'other',
])

export const eventStatusEnum = pgEnum('event_status', ['active', 'cancelled'])

// 'event' added alongside the original listing/user targets so a shady event can be
// flagged the same way a listing or user can (see ReportSheet.tsx and EventDetail.tsx).
// 'status' added for the same reason once Statuses shipped (see the statuses table below).
export const reportTargetTypeEnum = pgEnum('report_target_type', ['listing', 'user', 'event', 'status'])

export const reportReasonEnum = pgEnum('report_reason', [
  'scam',
  'counterfeit',
  'inappropriate',
  'spam',
  'other',
])

export const reportStatusEnum = pgEnum('report_status', [
  'open',
  'reviewing',
  'resolved',
  'dismissed',
])

export const disputeReasonEnum = pgEnum('dispute_reason', [
  'item_not_as_described',
  'no_show_seller',
  'no_show_buyer',
  'payment_issue',
  'other',
])

export const disputeStatusEnum = pgEnum('dispute_status', [
  'open',
  'in_review',
  'resolved_buyer',
  'resolved_seller',
  'resolved_other',
  'dismissed',
])

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(createId),
  phone: text('phone').notNull().unique(),
  name: text('name').notNull(),
  avatarEmoji: text('avatar_emoji').notNull().default('🙂'),
  location: text('location').notNull(),
  isBusiness: boolean('is_business').notNull().default(false),
  businessName: text('business_name'),
  verificationLevel: integer('verification_level').notNull().default(0),
  rating: doublePrecision('rating').notNull().default(0),
  ratingCount: integer('rating_count').notNull().default(0),
  // Login: phone + a self-chosen 4-digit PIN (see lib/pin.ts), not SMS OTP — replaces the
  // earlier phone-OTP flow. Nullable at the DB level only so ALTER TABLE ADD COLUMN doesn't
  // require a backfill migration on existing rows; every real signup path always sets it, and
  // login/signup routes enforce that at the application layer (routes/auth.ts). Never store
  // the raw PIN — only the salted hash produced by lib/pin.ts's hashPin().
  pinHash: text('pin_hash'),
  role: userRoleEnum('role').notNull().default('user'),
  // Set by an admin from the moderation panel (see routes/admin.ts) after a report is
  // upheld. A suspended user is blocked at both login (routes/auth.ts) and on every
  // requireAuth-gated route (lib/auth.ts) — enforced in one place, not scattered per-route.
  suspended: boolean('suspended').notNull().default(false),
  // Second monetization round: two more paid weekly upgrades, both NLe 100/week, that live
  // on the user rather than a listing. Nullable timestamps, same "null = never purchased"
  // convention as listings.sponsoredUntil — read directly as `> now()` at the point of use
  // rather than needing a lazy sweep, since neither drives a persisted boolean that could
  // drift out of sync (unlike sponsored/featured on listings).
  // "Verified-seller fast-track" (routes/verificationRequests.ts's POST /priority) — a
  // verification request submitted while this is in the future gets `priority: true` and
  // sorts to the front of the admin review queue.
  verificationPriorityUntil: timestamp('verification_priority_until', { withTimezone: true }),
  // "Buyer-Request priority access" (routes/buyerRequests.ts's POST /priority-access,
  // business accounts only) — the seller-facing buyer-request feed normally hides requests
  // posted in the last 24h from everyone; an active window here removes that delay.
  buyerRequestPriorityUntil: timestamp('buyer_request_priority_until', { withTimezone: true }),
  // Account deletion (Apple App Store guideline 5.1.1(v) requires an in-app path to this,
  // Google Play's Data Safety section expects the equivalent) — see routes/users.ts's
  // `DELETE /me`. Deliberately NOT a hard row delete: dozens of other tables (listings,
  // conversations, messages, offers, ratings, reports, disputes...) hold a real FK to this
  // user's id from *other people's* records, and those need to stay intact for their own
  // history. Instead, deleting an account anonymizes this row in place (name, phone, PIN,
  // location, business fields all scrubbed — see the DELETE handler) and sets this
  // timestamp, which does three jobs at once: marks the account as gone for anyone who
  // looks up this id afterward (they'll just see "Deleted User"), blocks that id's existing
  // JWT from authenticating again (checked in lib/auth.ts's attachUser, so a token issued
  // before deletion can't be replayed after), and frees the original phone number for reuse
  // in a brand-new signup, since phone gets replaced with a `deleted-<id>` placeholder that
  // will never collide with a real one.
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const listings = pgTable(
  'listings',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    sellerId: text('seller_id')
      .notNull()
      .references(() => users.id),
    category: categoryEnum('category').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    price: integer('price').notNull(),
    negotiable: boolean('negotiable').notNull().default(true),
    condition: conditionEnum('condition').notNull(),
    quantity: integer('quantity').notNull().default(1),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    // spec: seller-controlled privacy toggle from the Sell flow's "Location" step. true
    // (default) = buyers who aren't the seller see a fuzzed pin/area and no exact street
    // address; false = buyers see the real street. The seller (and any owner viewing their
    // own listing) always sees the exact coordinates regardless of this flag — the fuzzing
    // happens in the API response layer (see routes/listings.ts's presentListing), never in
    // storage, so the real location is never lost.
    approxLocation: boolean('approx_location').notNull().default(true),
    status: listingStatusEnum('status').notNull().default('active'),
    type: listingTypeEnum('type').notNull().default('standard'),
    // Monetization round: the listing fee is now a real recurring monthly charge, not a
    // one-time payment. `feePaidUntil` is the paid-through date — set to now+1 month at
    // publish (the "Pay & Publish" charge covers the first month) and pushed forward by
    // another month each time POST /:id/renew is called (routes/listings.ts). A lazy sweep
    // (lib/billing.ts's sweepBilling, run at the top of every listings read) flips `status`
    // to 'expired' the moment this date passes without a renewal, which removes the listing
    // from public search/map results while leaving it fully visible to its own seller (via
    // MyListings' all-statuses fetch) with a "renew to go live again" prompt. Not nullable —
    // every real listing goes through the paid publish flow, which always sets this; the
    // default only exists so this migration doesn't need a backfill for pre-existing rows.
    feePaidUntil: timestamp('fee_paid_until', { withTimezone: true })
      .notNull()
      .default(sql`(now() + interval '1 month')`),
    sponsored: boolean('sponsored').notNull().default(false),
    // Paid promotion ("Boost", NLe 100/week — see routes/listings.ts's POST /:id/boost).
    // Nullable: null means either "never boosted" OR a curated demo listing that's
    // permanently sponsored/featured in seed.ts without ever going through a real purchase
    // (the lazy sweep only ever un-boosts a row that HAS a sponsoredUntil/featuredUntil in
    // the past — `isNotNull(...)` in lib/billing.ts's sweepBilling — so a null value is
    // immune to expiry by design). Every real user-purchased boost always sets a real date
    // here, so it always eventually lapses on its own.
    sponsoredUntil: timestamp('sponsored_until', { withTimezone: true }),
    // `featured` existed in the schema/API response long before this round but had no
    // purchase path and nothing in the UI ever read it — a fully inert field. This round
    // gives it a real paid purpose: a "Featured" badge on the listing card (NLe 100/week,
    // see POST /:id/feature), expiring the same way sponsoredUntil does.
    featured: boolean('featured').notNull().default(false),
    featuredUntil: timestamp('featured_until', { withTimezone: true }),
    // "Top Search Placement" (NLe 100/week, POST /:id/pin-category) — pins a listing above
    // others *within its own category* when a buyer filters/browses by that category,
    // distinct from `sponsored`'s app-wide map/sort priority. Same boolean+Until+sweep
    // pattern as sponsored/featured above.
    categoryPinned: boolean('category_pinned').notNull().default(false),
    categoryPinnedUntil: timestamp('category_pinned_until', { withTimezone: true }),
    // Explore homepage banner ad (NLe 100/week, business accounts only, POST
    // /:id/banner-ad) — an active row here appears in Explore.tsx's banner carousel above
    // the map. Same boolean+Until+sweep pattern again.
    banner: boolean('banner').notNull().default(false),
    bannerUntil: timestamp('banner_until', { withTimezone: true }),
    images: text('images').array().notNull().default([]),
    dealOriginalPrice: integer('deal_original_price'),
    dealValidUntil: timestamp('deal_valid_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('listings_category_idx').on(t.category),
    index('listings_status_idx').on(t.status),
    index('listings_lat_lng_idx').on(t.lat, t.lng),
  ],
)

// A ledger of every simulated monetization charge — listing fees, boosts, featured
// upgrades, and (as of this round) the two other listing-scoped weekly upgrades (Top
// Search Placement, the Explore banner ad) plus the two account-scoped ones (verification
// fast-track, buyer-request priority access) that aren't tied to any one listing. There's
// still no real payment gateway wired up (see the trust & safety / "what's deliberately
// still missing" section of the project doc — a real payments API is expected but not yet
// integrated), so nothing here moves real money; this table exists so the *billing logic*
// (what was charged, for what period, when) is modeled honestly and durably now, rather
// than being a number shown once in the UI and forgotten. A real payment gateway
// integration later would insert a row here per successful real charge instead of the
// current always-succeeds mock charge.
export const paymentKindEnum = pgEnum('payment_kind', [
  'listing_fee',
  'boost',
  'featured',
  'category_pin',
  'banner_ad',
  'verification_priority',
  'buyer_request_priority',
])

export const listingPayments = pgTable(
  'listing_payments',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    // Nullable: the two account-scoped kinds above (verification_priority,
    // buyer_request_priority) aren't charged against any one listing — every other kind
    // always sets this.
    listingId: text('listing_id').references(() => listings.id),
    sellerId: text('seller_id')
      .notNull()
      .references(() => users.id),
    kind: paymentKindEnum('kind').notNull(),
    amount: integer('amount').notNull(), // NLe
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('listing_payments_listing_idx').on(t.listingId),
    index('listing_payments_seller_idx').on(t.sellerId),
  ],
)

// Events — a dedicated first-class entity, not a listing category. A live show/concert/
// sports match/etc. has a start time, a named venue, and (optionally) ticket price tiers
// instead of a single item price/condition/quantity like listings. Still location-first
// like the rest of the app (lat/lng + distance sort in routes/events.ts), but venue
// location is public by nature — no approxLocation fuzzing like listings.lat/lng gets (see
// lib/geo.ts's jitterCoordinate/presentListing): the whole point of a real event is that
// people can find and go to it.
export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    organizerId: text('organizer_id')
      .notNull()
      .references(() => users.id),
    category: eventCategoryEnum('category').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    venueName: text('venue_name').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    // Flexible price tiers (e.g. "General" NLe 50, "VIP" NLe 150) rather than a single
    // `price` column like listings — an event's ticketing structure doesn't fit one number.
    // jsonb rather than a join table since nothing ever queries/filters by an individual
    // tier; an empty array means a free event.
    ticketTiers: jsonb('ticket_tiers').$type<{ name: string; price: number }[]>().notNull().default([]),
    images: text('images').array().notNull().default([]),
    status: eventStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('events_category_idx').on(t.category),
    index('events_starts_at_idx').on(t.startsAt),
    index('events_lat_lng_idx').on(t.lat, t.lng),
  ],
)

// Lightweight "interested/going" RSVP — one row per (user, event), toggled from
// EventDetail.tsx. Powers both the public interested-count shown on every event card and
// whether the current viewer has already marked themselves interested.
export const eventInterests = pgTable(
  'event_interests',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('event_interests_user_event_idx').on(t.userId, t.eventId)],
)

export const offers = pgTable(
  'offers',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id),
    buyerId: text('buyer_id')
      .notNull()
      .references(() => users.id),
    amount: integer('amount').notNull(),
    message: text('message'),
    status: offerStatusEnum('status').notNull().default('pending'),
    counterAmount: integer('counter_amount'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('offers_listing_idx').on(t.listingId), index('offers_buyer_idx').on(t.buyerId)],
)

export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    // Exactly one of listingId/eventId is set, enforced at the application layer (see
    // lib/conversations.ts's ensureConversation/ensureEventConversation) rather than a DB
    // constraint — mirrors the reports table's targetType/targetId polymorphism below, just
    // as two nullable FKs instead of a type+id pair, since each side already has its own
    // real foreign key to point at. Both nullable: Postgres treats NULL as distinct from any
    // other NULL in a unique index, so a listing-conversation (eventId always null) and an
    // event-conversation (listingId always null) never collide on either unique index below.
    listingId: text('listing_id').references(() => listings.id),
    eventId: text('event_id').references(() => events.id),
    buyerId: text('buyer_id')
      .notNull()
      .references(() => users.id),
    // Named `sellerId` from the original listing-only design; for an event conversation this
    // is the event's organizerId. Kept as one column rather than adding a third, since every
    // conversation has exactly one "other party" regardless of what it's about.
    sellerId: text('seller_id')
      .notNull()
      .references(() => users.id),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('conversations_listing_buyer_idx').on(t.listingId, t.buyerId),
    uniqueIndex('conversations_event_buyer_idx').on(t.eventId, t.buyerId),
  ],
)

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    senderId: text('sender_id')
      .notNull()
      .references(() => users.id),
    type: messageTypeEnum('type').notNull().default('text'),
    text: text('text').notNull().default(''),
    amount: integer('amount'),
    // Voice notes (spec: literacy accessibility — many buyers/sellers can't read or write).
    // MVP storage: the recorded clip as a base64 data URL straight in Postgres, since the
    // stack has no object storage (S3/blob) configured yet. Fine at demo scale (clips are
    // short, ~seconds of low-bitrate audio); worth moving to real object storage before
    // heavy real-world traffic.
    audioUrl: text('audio_url'),
    audioDurationSec: integer('audio_duration_sec'),
    read: boolean('read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId)],
)

export const wishlistEntries = pgTable(
  'wishlist_entries',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('wishlist_user_listing_idx').on(t.userId, t.listingId)],
)

export const buyerRequests = pgTable('buyer_requests', {
  id: text('id').primaryKey().$defaultFn(createId),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  product: text('product').notNull(),
  maxOffer: integer('max_offer').notNull(),
  radiusKm: integer('radius_km').notNull(),
  condition: buyerRequestConditionEnum('condition').notNull().default('either'),
  status: buyerRequestStatusEnum('status').notNull().default('open'),
  responses: integer('responses').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

// Scam/fraud reporting pipeline — a report against either a listing or a user (seller or
// buyer). `targetId` isn't a real FK since it can point at either `listings` or `users`
// depending on `targetType` — Postgres has no clean polymorphic FK, so this is resolved at
// query time in routes/reports.ts and routes/admin.ts instead.
export const reports = pgTable(
  'reports',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => users.id),
    targetType: reportTargetTypeEnum('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: reportReasonEnum('reason').notNull(),
    details: text('details').notNull().default(''),
    status: reportStatusEnum('status').notNull().default('open'),
    resolutionNote: text('resolution_note'),
    resolvedByAdminId: text('resolved_by_admin_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('reports_status_idx').on(t.status), index('reports_target_idx').on(t.targetType, t.targetId)],
)

// Dispute resolution — tied to a conversation (buyer+seller+listing), not a payment or an
// "accepted offer": there's still no real payment gateway (see lib/billing.ts), so a
// conversation remains the most durable "this deal is happening" record, even though a
// seller-facing offer-accept flow does exist now (routes/offers.ts). Either party in the
// conversation can raise one; both can see its status.
export const disputes = pgTable(
  'disputes',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    raisedByUserId: text('raised_by_user_id')
      .notNull()
      .references(() => users.id),
    reason: disputeReasonEnum('reason').notNull(),
    details: text('details').notNull().default(''),
    status: disputeStatusEnum('status').notNull().default('open'),
    resolutionNote: text('resolution_note'),
    resolvedByAdminId: text('resolved_by_admin_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('disputes_status_idx').on(t.status), index('disputes_conversation_idx').on(t.conversationId)],
)

// Post-transaction seller ratings — makes users.rating/ratingCount (previously pure seed-time
// numbers with no real flow anywhere that ever updated them) genuinely real. One rating per
// listing (uniqueIndex below), submitted by the buyer whose offer was accepted on that
// listing once it's marked 'sold' (enforced in routes/ratings.ts, not at the DB level, since
// that check needs to join through offers/conversations). Inserting one recomputes the
// seller's aggregate rating/ratingCount — see routes/ratings.ts.
export const ratings = pgTable(
  'ratings',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id),
    raterId: text('rater_id')
      .notNull()
      .references(() => users.id),
    ratedUserId: text('rated_user_id')
      .notNull()
      .references(() => users.id),
    stars: integer('stars').notNull(),
    comment: text('comment').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ratings_listing_idx').on(t.listingId),
    index('ratings_rated_user_idx').on(t.ratedUserId),
  ],
)

export const verificationRequestStatusEnum = pgEnum('verification_request_status', [
  'pending',
  'approved',
  'rejected',
])

// Makes `users.verificationLevel` genuinely real. Before this round it was set once at
// signup (always level 1) and otherwise only ever changed by hand in seed data —
// `Verification.tsx`'s per-level "Start" button had no `onClick` at all. Now: a user submits
// a request for the next level (a short note + an optional photo, reusing the same base64
// data-URL pattern already used for listing photos and voice notes — no new storage
// infrastructure), an admin reviews it from a new moderation-panel tab (mirrors the existing
// reports/disputes review pattern in routes/admin.ts), and approving it actually bumps
// `users.verificationLevel`. `priority` is set at submission time if the requester has an
// active `verificationPriorityUntil` (the paid fast-track) — the admin queue sorts priority
// requests first.
export const verificationRequests = pgTable(
  'verification_requests',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    targetLevel: integer('target_level').notNull(),
    note: text('note').notNull().default(''),
    photo: text('photo'), // base64 data URL — an ID photo, business doc, etc.
    priority: boolean('priority').notNull().default(false),
    status: verificationRequestStatusEnum('status').notNull().default('pending'),
    resolutionNote: text('resolution_note'),
    resolvedByAdminId: text('resolved_by_admin_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('verification_requests_user_idx').on(t.userId),
    index('verification_requests_status_idx').on(t.status),
  ],
)

// "Statuses" — a lightweight promotional update paid-promotion holders can post, shown as a
// row of avatar circles at the top of Chats.tsx (mirrors the familiar WhatsApp/Instagram
// "Status"/"Story" pattern) so *every* buyer who opens Messages sees it, not just people
// already in a conversation with the poster. Gated to isBusiness accounts with at least one
// currently active paid promotion (see lib/statusEligibility.ts) — this is what makes those
// existing NLe 100/wk promotions ("paid for promo's", per the feature request) worth more
// than just map/search placement. Auto-expires 24h after posting, WhatsApp-style — enforced
// by filtering reads to `expiresAt > now()` (see routes/statuses.ts) rather than a lazy
// sweep like listings' billing fields use: nothing here needs to "flip" a persisted status
// column, a row is simply still within its window or it isn't.
export const statuses = pgTable(
  'statuses',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    // Compressed base64 data URL, same MVP storage tradeoff as listing/event photos and
    // voice notes (see lib/media.ts) — worth moving to real object storage before heavy
    // real-world traffic.
    imageUrl: text('image_url').notNull(),
    caption: text('caption').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('statuses_user_idx').on(t.userId), index('statuses_expires_idx').on(t.expiresAt)],
)

// One row per (viewer, status) — powers the "seen" ring dim vs. gold-glow state in
// StatusRow.tsx, the same idea as eventInterests powering the interested-count above.
// onDelete: 'cascade' so removing a status (its 24h window lapsing server-side isn't a real
// delete — see above — but the poster's own early "delete this status" action is) doesn't
// leave orphaned view rows behind for the FK to complain about.
export const statusViews = pgTable(
  'status_views',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    statusId: text('status_id')
      .notNull()
      .references(() => statuses.id, { onDelete: 'cascade' }),
    viewerId: text('viewer_id')
      .notNull()
      .references(() => users.id),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('status_views_status_viewer_idx').on(t.statusId, t.viewerId)],
)
