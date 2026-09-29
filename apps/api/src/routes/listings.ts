import { Router } from 'express'
import { and, asc, desc, eq, gte, inArray, lte, or, ilike, sql } from 'drizzle-orm'
import { z } from 'zod'
import { isSafeImageValue } from '../lib/sanitize'
import { db } from '../db/client'
import { categoryEnum, conditionEnum, listingPayments, listingStatusEnum, listingViews, listings, users } from '../db/schema'
import { distanceKmExpr, presentListing, safeCoord } from '../lib/geo'
import { requireAuth } from '../lib/auth'
import {
  addWeeks,
  addDays,
  BANNER_FEE_PER_PERIOD,
  BANNER_PERIOD_DAYS,
  BOOST_FEE_PER_WEEK,
  CATEGORY_PIN_FEE_PER_WEEK,
  FEATURE_FEE_PER_WEEK,
  listingFee,
  sweepBilling,
} from '../lib/billing'
import { normalizeImages } from '../lib/media'

import { storeDataUrl } from '../lib/media'
import { matchSavedSearches, notifyPriceDrop } from '../lib/alerts'
import { rewardReferrerOnFirstListing } from '../lib/referrals'
import { createHash } from 'node:crypto'
export const listingsRouter = Router()

const DEFAULT_LAT = 8.4657 // Lumley, Freetown — used if the client doesn't send a location
const DEFAULT_LNG = -13.2983

// Comma-separated list params are validated against the real DB enums — an unknown value
// used to go straight into the SQL and make Postgres throw (which, before the async error
// fix, crashed the whole API). Numbers must be finite and sane.
const csvOf = (allowed: readonly string[]) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : undefined))
    .refine((vals) => !vals || vals.every((x) => allowed.includes(x)), { message: 'Unknown value' })

const querySchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90).optional(),
  lng: z.coerce.number().finite().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().finite().positive().optional(),
  categories: csvOf(categoryEnum.enumValues),
  condition: csvOf(conditionEnum.enumValues),
  minPrice: z.coerce.number().finite().optional(),
  maxPrice: z.coerce.number().finite().optional(),
  sellerType: z.enum(['any', 'individual', 'business', 'verified']).optional(),
  q: z.string().max(200).optional(),
  sort: z
    .enum(['closest', 'best_deal', 'recommended', 'sponsored', 'newest', 'price_asc', 'price_desc'])
    .optional(),
  sellerId: z.string().optional(),
  status: csvOf(listingStatusEnum.enumValues), // defaults to active
  // Paging: the app loads the nearest page first and fetches more as people scroll,
  // instead of every listing in the country at sign-in.
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
})

listingsRouter.get('/', async (req, res) => {
  // Lazily expire lapsed listing fees / boosts / featured upgrades before reading — see
  // lib/billing.ts's sweepBilling for why this runs here rather than on a cron.
  await sweepBilling()
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const q = parsed.data
  const lat = q.lat ?? DEFAULT_LAT
  const lng = q.lng ?? DEFAULT_LNG
  const radiusKm = q.radiusKm ?? 25000 // effectively "anywhere" if omitted
  const dist = distanceKmExpr(lat, lng)

  // Only the owner may browse their own non-public listings (drafts, sold, expired,
  // removed). Anyone else asking for other statuses — e.g. ?status=removed to dig up
  // moderated content — just gets the public active feed.
  const ownListings = !!req.userId && q.sellerId === req.userId
  const statusList = ownListings && q.status?.length ? q.status : ['active']

  const conditions = [inArray(listings.status, statusList as any), lte(dist, radiusKm)]
  // Suspended sellers' listings disappear from public browsing.
  if (!ownListings) conditions.push(eq(users.suspended, false))

  if (q.categories?.length) conditions.push(inArray(listings.category, q.categories as any))
  if (q.condition?.length) conditions.push(inArray(listings.condition, q.condition as any))
  // Prices are whole leones; round user-typed decimals rather than failing.
  if (q.minPrice != null) conditions.push(gte(listings.price, Math.floor(q.minPrice)))
  if (q.maxPrice != null) conditions.push(lte(listings.price, Math.ceil(q.maxPrice)))
  if (q.sellerId) conditions.push(eq(listings.sellerId, q.sellerId))
  if (q.q) {
    conditions.push(
      or(ilike(listings.title, `%${q.q}%`), ilike(listings.description, `%${q.q}%`))!,
    )
  }
  if (q.sellerType === 'business') conditions.push(eq(users.isBusiness, true))
  if (q.sellerType === 'individual') conditions.push(eq(users.isBusiness, false))
  if (q.sellerType === 'verified') conditions.push(gte(users.verificationLevel, 3))

  let orderBy
  switch (q.sort) {
    case 'price_asc':
      orderBy = asc(listings.price)
      break
    case 'price_desc':
      orderBy = desc(listings.price)
      break
    case 'newest':
      orderBy = desc(listings.createdAt)
      break
    case 'closest':
    default:
      orderBy = asc(dist)
  }

  const rows = await db
    .select({
      listing: listings,
      distanceKm: dist,
      seller: {
        id: users.id,
        name: users.name,
        avatarEmoji: users.avatarEmoji,
        isBusiness: users.isBusiness,
        verificationLevel: users.verificationLevel,
        rating: users.rating,
        ratingCount: users.ratingCount,
        location: users.location,
      },
    })
    .from(listings)
    .innerJoin(users, eq(listings.sellerId, users.id))
    .where(and(...conditions))
    .orderBy(orderBy, listings.id)
    .limit((q.limit ?? 200) + 1)
    .offset(q.offset ?? 0)

  const pageSize = q.limit ?? 200
  const hasMore = rows.length > pageSize
  if (hasMore) rows.length = pageSize

  let results = rows.map((r) => ({ ...r, listing: presentListing(r.listing, req.userId) }))

  if (q.sort === 'sponsored') {
    results = [...results].sort(
      (a, b) => Number(b.listing.sponsored) - Number(a.listing.sponsored) || a.distanceKm - b.distanceKm,
    )
  } else if (q.sort === 'best_deal') {
    results = [...results].sort((a, b) => {
      const da = a.listing.dealOriginalPrice ? a.listing.dealOriginalPrice - a.listing.price : 0
      const db_ = b.listing.dealOriginalPrice ? b.listing.dealOriginalPrice - b.listing.price : 0
      return db_ - da || a.distanceKm - b.distanceKm
    })
  } else if (q.sort === 'recommended') {
    results = [...results].sort((a, b) => {
      const scoreA = (a.listing.sponsored ? 2 : 0) + a.seller.rating - a.distanceKm * 0.3
      const scoreB = (b.listing.sponsored ? 2 : 0) + b.seller.rating - b.distanceKm * 0.3
      return scoreB - scoreA
    })
  }

  // "Top Search Placement" (NLe 100/week, POST /:id/pin-category) — applied LAST, after
  // whichever sort mode ran above, and only when a buyer is actually filtering by category.
  // Array.prototype.sort is a stable sort (guaranteed since ES2019), and this comparator
  // only ever distinguishes categoryPinned true/false, so every pinned listing moves to the
  // front while the relative order chosen by the sort above is preserved both within the
  // pinned group and within the rest — this is a pure "float pinned ones to the top,
  // everything else keeps its place" pass, not a competing sort. Deliberately distinct from
  // `sponsored`'s app-wide priority: pinning only matters (and is only worth paying for) in
  // the specific category context a seller bought it for.
  if (q.categories) {
    results = [...results].sort((a, b) => Number(b.listing.categoryPinned) - Number(a.listing.categoryPinned))
  }

  res.json({ results, count: results.length, hasMore, nextOffset: (q.offset ?? 0) + results.length })
})

// Fair-price guide for the Sell / Edit screens: what similar items go for nearby. Looks at
// live and recently sold listings in the same category within 50 km, preferring ones whose
// title shares a word with the seller's title (so "iPhone 12" compares against iPhones, not
// every phone). Needs at least 3 comparable prices to say anything — a "guide" built from
// one listing would just be that seller's price. Honest heuristics, no AI involved.
const priceGuideSchema = z.object({
  category: z.enum(categoryEnum.enumValues),
  q: z.string().max(120).default(''),
  exclude: z.string().uuid().optional(),
})
const GUIDE_STOP_WORDS = new Set(['for', 'and', 'the', 'with', 'new', 'used', 'sale', 'good', 'condition', 'clean'])

listingsRouter.get('/price-guide', async (req, res) => {
  const parsed = priceGuideSchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { category, q, exclude } = parsed.data
  const lat = safeCoord(req.query.lat, 90, 8.4657)
  const lng = safeCoord(req.query.lng, 180, -13.2317)
  const dist = distanceKmExpr(lat, lng)
  const rows = await db
    .select({ id: listings.id, title: listings.title, price: listings.price })
    .from(listings)
    .where(
      and(
        eq(listings.category, category),
        inArray(listings.status, ['active', 'reserved', 'sold']),
        sql`${listings.price} > 0`,
        sql`${dist} <= 50`,
      ),
    )
    .orderBy(desc(listings.createdAt))
    .limit(300)

  const words = q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !GUIDE_STOP_WORDS.has(w))
  const pool = rows.filter((r) => r.id !== exclude)
  const similar = words.length ? pool.filter((r) => words.some((w) => r.title.toLowerCase().includes(w))) : []
  const basis = similar.length >= 3 ? similar : pool
  if (basis.length < 3) {
    res.json({ count: basis.length, basis: 'none' })
    return
  }
  const prices = basis.map((r) => r.price).sort((a, b) => a - b)
  const pct = (p: number) => prices[Math.min(prices.length - 1, Math.max(0, Math.round((prices.length - 1) * p)))]
  res.json({
    count: prices.length,
    basis: basis === similar ? 'similar' : 'category',
    low: pct(0.25),
    median: pct(0.5),
    high: pct(0.75),
  })
})

// Count a view for the seller's insights: once per person (or per anonymous device/IP)
// per day, never the seller's own. Fire-and-forget — never slows the page down.
function recordView(listingId: string, sellerId: string, userId: string | undefined, ip: string | undefined) {
  if (sellerId === userId) return
  const viewerKey = userId ?? `ip:${createHash('sha256').update(String(ip)).digest('hex').slice(0, 16)}`
  db.insert(listingViews)
    .values({ listingId, viewerKey, day: new Date().toISOString().slice(0, 10) })
    .onConflictDoNothing()
    .catch((err) => console.error('record view failed', err))
}

// The app usually already has a listing from the feed and opens it without fetching it
// again, so the detail screen pings this to count the view.
listingsRouter.post('/:id/view', async (req, res) => {
  const [row] = await db
    .select({ id: listings.id, sellerId: listings.sellerId })
    .from(listings)
    .where(eq(listings.id, req.params.id))
    .limit(1)
  if (row) recordView(row.id, row.sellerId, req.userId, req.ip)
  res.status(204).end()
})

listingsRouter.get('/:id', async (req, res) => {
  await sweepBilling()
  const [row] = await db
    .select({
      listing: listings,
      seller: {
        id: users.id,
        name: users.name,
        avatarEmoji: users.avatarEmoji,
        isBusiness: users.isBusiness,
        verificationLevel: users.verificationLevel,
        rating: users.rating,
        ratingCount: users.ratingCount,
        location: users.location,
      },
    })
    .from(listings)
    .innerJoin(users, eq(listings.sellerId, users.id))
    .where(eq(listings.id, req.params.id))
    .limit(1)

  if (!row) {
    res.status(404).json({ error: 'Listing not found' })
    return
  }

  // Non-public states (removed by moderation or the seller, unpublished drafts) are only
  // visible to the owner. Sold/reserved/expired stay viewable so chat and offer history
  // that points at them still renders for the buyer.
  const hidden = ['removed', 'draft', 'pending_payment'].includes(row.listing.status)
  if (hidden && row.listing.sellerId !== req.userId) {
    res.status(404).json({ error: 'Listing not found' })
    return
  }

  recordView(row.listing.id, row.listing.sellerId, req.userId, req.ip)

  const lat = safeCoord(req.query.lat, 90, DEFAULT_LAT)
  const lng = safeCoord(req.query.lng, 180, DEFAULT_LNG)
  const dist = distanceKmExpr(lat, lng)
  const [{ distanceKm }] = await db
    .select({ distanceKm: dist })
    .from(listings)
    .where(eq(listings.id, req.params.id))
    .limit(1)

  const similarRows = await db
    .select({ listing: listings, distanceKm: dist })
    .from(listings)
    .where(
      and(
        eq(listings.category, row.listing.category),
        eq(listings.status, 'active'),
        sql`${listings.id} != ${req.params.id}`,
      ),
    )
    .orderBy(asc(dist))
    .limit(4)

  const similar = similarRows.map((r) => ({ ...r, listing: presentListing(r.listing, req.userId) }))

  res.json({
    ...row,
    listing: presentListing(row.listing, req.userId),
    distanceKm,
    similar,
  })
})

const createListingSchema = z.object({
  // Was a hand-typed list of just the original 11 categories — silently rejected every
  // publish attempt in any of the 15 categories added by the categories-expansion round
  // (phones, jewelry_watches, etc. only ever existed via seed data, never through a real
  // user publishing one). Fixed by deriving straight from the DB enum instead of a second
  // hardcoded copy that has to be kept in sync by hand.
  category: z.enum(categoryEnum.enumValues),
  title: z.string().trim().min(1).max(120),
  description: z.string().max(4000).default(''),
  price: z.number().int().nonnegative().max(1_000_000_000),
  negotiable: z.boolean().default(true),
  condition: z.enum(['new', 'used', 'refurbished']),
  quantity: z.number().int().positive().default(1),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  approxLocation: z.boolean().default(true),
  // Listing package: how many weeks to pay for now (1, 2, 3 or 4 = "1 month").
  weeks: z.number().int().min(1).max(4).default(1),
  // Old clients sent a 1/3/6-month duration; accepted and ignored — a listing now stays
  // live for as long as it's paid up.
  durationMonths: z.number().int().positive().max(12).optional(),
  // Each entry is either a short emoji placeholder (seed/demo data, or the category-emoji
  // fallback when a listing has no real photo) or a compressed base64 data URL from the
  // Sell flow's camera/gallery capture (see apps/web/src/lib/media.ts) — capped here so a
  // client can't push something huge past the compression step.
  images: z.array(z.string().max(3_000_000).refine(isSafeImageValue, 'Unsupported image')).max(5).default([]),
  // Optional spoken description, recorded in the app (≤ 2 minutes).
  voiceNote: z.string().max(3_000_000).startsWith('data:audio/').optional(),
})

// spec §17-19: sell flow ends in a paid, live listing with an expiry set by duration.
// Monetization round: the listing fee is now a real recurring monthly charge (NLe 30/mo,
// see lib/billing.ts) rather than a single lump sum for the whole chosen duration. The
// duration picker still sets `expiresAt` (the outer lifetime cap the listing can run for),
// but the "Pay & Publish" charge only ever covers the *first* month — every month after
// that has to be renewed via POST /:id/renew below, or the listing lapses to 'expired'
// (see lib/billing.ts's sweepBilling).
listingsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createListingSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const d = parsed.data
  const now = new Date()
  const feePaidUntil = addWeeks(now, d.weeks)
  const expiresAt = feePaidUntil

  const [created] = await db
    .insert(listings)
    .values({
      sellerId: req.userId!,
      category: d.category,
      title: d.title,
      description: d.description,
      price: d.price,
      negotiable: d.negotiable,
      condition: d.condition,
      quantity: d.quantity,
      lat: d.lat,
      lng: d.lng,
      approxLocation: d.approxLocation,
      status: 'active', // MVP: fee payment is a simulated charge, listing goes live immediately
      type: 'standard',
      // New photos are stored in the media table; the row only keeps their URLs.
      images: await normalizeImages(d.images, req.userId!),
      voiceNoteUrl: d.voiceNote ? await storeDataUrl(d.voiceNote, req.userId!) : null,
      feePaidUntil,
      expiresAt,
    })
    .returning()

  await db.insert(listingPayments).values({
    listingId: created.id,
    sellerId: req.userId!,
    kind: 'listing_fee',
    amount: listingFee(d.weeks, now),
    periodStart: now,
    periodEnd: feePaidUntil,
  })

  res.status(201).json({ listing: created })
  // After responding: tell people whose saved searches this listing matches.
  matchSavedSearches(created)
  rewardReferrerOnFirstListing(req.userId!)
})

// Sellers can edit their listing (fix a typo, change the price, add photos). Lowering the
// price notifies everyone who saved it. Sold/removed listings are frozen.
const editListingSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(4000).optional(),
  price: z.number().int().nonnegative().max(1_000_000_000).optional(),
  negotiable: z.boolean().optional(),
  condition: z.enum(conditionEnum.enumValues).optional(),
  quantity: z.number().int().positive().max(100_000).optional(),
  category: z.enum(categoryEnum.enumValues).optional(),
  images: z.array(z.string().max(3_000_000).refine(isSafeImageValue, 'Unsupported image')).max(5).optional(),
  // A new recording (data URL), or null to remove the spoken description.
  voiceNote: z.string().max(3_000_000).startsWith('data:audio/').nullable().optional(),
})

listingsRouter.patch('/:id', requireAuth, async (req, res) => {
  const parsed = editListingSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const [existing] = await db.select().from(listings).where(eq(listings.id, req.params.id)).limit(1)
  if (!existing || existing.sellerId !== req.userId) {
    res.status(404).json({ error: 'Listing not found' })
    return
  }
  if (existing.status === 'sold' || existing.status === 'removed') {
    res.status(409).json({ error: `A ${existing.status} listing can't be edited.` })
    return
  }
  const d = parsed.data
  const patch: Partial<typeof listings.$inferInsert> = { updatedAt: new Date() }
  if (d.title !== undefined) patch.title = d.title
  if (d.description !== undefined) patch.description = d.description
  if (d.price !== undefined) patch.price = d.price
  if (d.negotiable !== undefined) patch.negotiable = d.negotiable
  if (d.condition !== undefined) patch.condition = d.condition
  if (d.quantity !== undefined) patch.quantity = d.quantity
  if (d.category !== undefined) patch.category = d.category
  if (d.images !== undefined) patch.images = await normalizeImages(d.images, req.userId!)
  if (d.voiceNote !== undefined) patch.voiceNoteUrl = d.voiceNote ? await storeDataUrl(d.voiceNote, req.userId!) : null
  const [updated] = await db.update(listings).set(patch).where(eq(listings.id, existing.id)).returning()
  res.json({ listing: presentListing(updated, req.userId) })
  if (d.price !== undefined && d.price < existing.price && updated.status === 'active') {
    notifyPriceDrop(updated, existing.price)
  }
})

// Renews the recurring monthly listing fee (NLe 30) — extends feePaidUntil by another
// month from whichever is later, its current value or now (so renewing early doesn't lose
// the remainder of the current paid month, and renewing late after a lapse doesn't
// backdate the new month to the old expiry). Also flips a lapsed 'expired' listing back to
// 'active', since the whole point of renewing is to make it visible to buyers again.
listingsRouter.post('/:id/renew', requireAuth, async (req, res) => {
  const [existing] = await db.select().from(listings).where(eq(listings.id, req.params.id)).limit(1)
  if (!existing || existing.sellerId !== req.userId) {
    res.status(404).json({ error: 'Listing not found' })
    return
  }
  if (existing.status !== 'active' && existing.status !== 'expired') {
    res.status(409).json({ error: `A ${existing.status} listing can't be renewed.` })
    return
  }
  const weeksParsed = z.object({ weeks: z.number().int().min(1).max(4).default(1) }).safeParse(req.body ?? {})
  if (!weeksParsed.success) {
    res.status(400).json({ error: 'Choose 1, 2, 3 or 4 weeks.' })
    return
  }
  const weeks = weeksParsed.data.weeks
  const now = new Date()
  const base = existing.feePaidUntil > now ? existing.feePaidUntil : now
  const feePaidUntil = addWeeks(base, weeks)
  // Paying for more weeks also extends the listing's lifetime cap — otherwise the billing
  // sweep (which enforces expiresAt) would re-expire a freshly renewed listing.
  const expiresAt = existing.expiresAt > feePaidUntil ? existing.expiresAt : feePaidUntil

  const [updated] = await db
    .update(listings)
    .set({
      feePaidUntil,
      expiresAt,
      status: existing.status === 'expired' ? 'active' : existing.status,
      updatedAt: now,
    })
    .where(eq(listings.id, req.params.id))
    .returning()

  await db.insert(listingPayments).values({
    listingId: existing.id,
    sellerId: req.userId!,
    kind: 'listing_fee',
    amount: listingFee(weeks, now),
    periodStart: base,
    periodEnd: feePaidUntil,
  })

  res.json({ listing: updated })
})

// Paid promotion — "Boost" (NLe 100/week): gold glow + top-of-map/top-of-sort priority
// (existing `sponsored` treatment throughout the app, previously only ever set by seed
// data). Stacks on top of any remaining boosted time rather than resetting it, same
// later-of-now-or-current-expiry logic as renew above.
listingsRouter.post('/:id/boost', requireAuth, async (req, res) => {
  const [existing] = await db.select().from(listings).where(eq(listings.id, req.params.id)).limit(1)
  if (!existing || existing.sellerId !== req.userId) {
    res.status(404).json({ error: 'Listing not found' })
    return
  }
  if (existing.status !== 'active') {
    res.status(409).json({ error: 'Only an active listing can be boosted.' })
    return
  }
  // A free week earned through referrals is used instead of charging, when asked for.
  const useCredit = req.body?.useCredit === true
  if (useCredit) {
    const [spent] = await db
      .update(users)
      .set({ boostCredits: sql`${users.boostCredits} - 1` })
      .where(and(eq(users.id, req.userId!), sql`${users.boostCredits} > 0`))
      .returning({ left: users.boostCredits })
    if (!spent) {
      res.status(409).json({ error: "You don't have a free boost week to use." })
      return
    }
  }
  const now = new Date()
  const base = existing.sponsoredUntil && existing.sponsoredUntil > now ? existing.sponsoredUntil : now
  const sponsoredUntil = addWeeks(base, 1)

  const [updated] = await db
    .update(listings)
    .set({ sponsored: true, sponsoredUntil, updatedAt: now })
    .where(eq(listings.id, req.params.id))
    .returning()

  await db.insert(listingPayments).values({
    listingId: existing.id,
    sellerId: req.userId!,
    kind: 'boost',
    amount: useCredit ? 0 : BOOST_FEE_PER_WEEK,
    periodStart: base,
    periodEnd: sponsoredUntil,
  })

  res.json({ listing: updated })
})

// Paid "Featured" badge (NLe 100/week) — the `featured` column existed since long before
// this round but had no purchase path and nothing in the UI ever rendered it; this is what
// makes it real (see ListingCard.tsx's new "FEATURED" badge). Same stacking logic as boost.
listingsRouter.post('/:id/feature', requireAuth, async (req, res) => {
  const [existing] = await db.select().from(listings).where(eq(listings.id, req.params.id)).limit(1)
  if (!existing || existing.sellerId !== req.userId) {
    res.status(404).json({ error: 'Listing not found' })
    return
  }
  const now = new Date()
  const base = existing.featuredUntil && existing.featuredUntil > now ? existing.featuredUntil : now
  const featuredUntil = addWeeks(base, 1)

  const [updated] = await db
    .update(listings)
    .set({ featured: true, featuredUntil, updatedAt: now })
    .where(eq(listings.id, req.params.id))
    .returning()

  await db.insert(listingPayments).values({
    listingId: existing.id,
    sellerId: req.userId!,
    kind: 'featured',
    amount: FEATURE_FEE_PER_WEEK,
    periodStart: base,
    periodEnd: featuredUntil,
  })

  res.json({ listing: updated })
})

// "Top Search Placement" (NLe 100/week) — pins a listing above others within its own
// category (see the GET / sort above). Same stacking/later-of-now-or-current-expiry logic
// as boost/feature.
listingsRouter.post('/:id/pin-category', requireAuth, async (req, res) => {
  const [existing] = await db.select().from(listings).where(eq(listings.id, req.params.id)).limit(1)
  if (!existing || existing.sellerId !== req.userId) {
    res.status(404).json({ error: 'Listing not found' })
    return
  }
  const now = new Date()
  const base =
    existing.categoryPinnedUntil && existing.categoryPinnedUntil > now ? existing.categoryPinnedUntil : now
  const categoryPinnedUntil = addWeeks(base, 1)

  const [updated] = await db
    .update(listings)
    .set({ categoryPinned: true, categoryPinnedUntil, updatedAt: now })
    .where(eq(listings.id, req.params.id))
    .returning()

  await db.insert(listingPayments).values({
    listingId: existing.id,
    sellerId: req.userId!,
    kind: 'category_pin',
    amount: CATEGORY_PIN_FEE_PER_WEEK,
    periodStart: base,
    periodEnd: categoryPinnedUntil,
  })

  res.json({ listing: updated })
})

// Explore homepage banner ad (NLe 100/week, business accounts only) — appears in
// Explore.tsx's banner carousel (see GET /banners below). Gated to isBusiness because an
// individual seller advertising one item on the app's own homepage isn't the intended use —
// this is meant as a lightweight "storefront" placement for a real business.
listingsRouter.post('/:id/banner-ad', requireAuth, async (req, res) => {
  const [existing] = await db.select().from(listings).where(eq(listings.id, req.params.id)).limit(1)
  if (!existing || existing.sellerId !== req.userId) {
    res.status(404).json({ error: 'Listing not found' })
    return
  }
  const [seller] = await db.select({ isBusiness: users.isBusiness }).from(users).where(eq(users.id, req.userId!)).limit(1)
  if (!seller?.isBusiness) {
    res.status(403).json({ error: 'Only business accounts can buy a banner ad. Register as a business from Account > Settings.' })
    return
  }
  const now = new Date()
  const base = existing.bannerUntil && existing.bannerUntil > now ? existing.bannerUntil : now
  const bannerUntil = addDays(base, BANNER_PERIOD_DAYS)

  const [updated] = await db
    .update(listings)
    .set({ banner: true, bannerUntil, updatedAt: now })
    .where(eq(listings.id, req.params.id))
    .returning()

  await db.insert(listingPayments).values({
    listingId: existing.id,
    sellerId: req.userId!,
    kind: 'banner_ad',
    amount: BANNER_FEE_PER_PERIOD,
    periodStart: base,
    periodEnd: bannerUntil,
  })

  res.json({ listing: updated })
})

// Active banner-ad listings for Explore.tsx's carousel — a small, separate endpoint rather
// than overloading the main GET / query, since "give me the currently-bannered listings" is
// a fundamentally different question from "search/filter listings."
listingsRouter.get('/banners/active', async (req, res) => {
  await sweepBilling()
  const lat = safeCoord(req.query.lat, 90, DEFAULT_LAT)
  const lng = safeCoord(req.query.lng, 180, DEFAULT_LNG)
  const dist = distanceKmExpr(lat, lng)
  const rows = await db
    .select({
      listing: listings,
      distanceKm: dist,
      seller: { id: users.id, name: users.name, businessName: users.businessName },
    })
    .from(listings)
    .innerJoin(users, eq(listings.sellerId, users.id))
    .where(and(eq(listings.banner, true), eq(listings.status, 'active')))
    .orderBy(asc(dist))
    .limit(10)
  res.json({
    results: rows.map((r) => ({ ...r, listing: presentListing(r.listing, req.userId) })),
  })
})

listingsRouter.patch('/:id/status', requireAuth, async (req, res) => {
  const schema = z.object({
    status: z.enum(['draft', 'pending_payment', 'active', 'reserved', 'sold', 'expired', 'removed']),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const [existing] = await db.select().from(listings).where(eq(listings.id, req.params.id)).limit(1)
  if (!existing || existing.sellerId !== req.userId) {
    res.status(404).json({ error: 'Listing not found' })
    return
  }
  // Owners may only make the moves the UI actually offers. Previously any transition was
  // accepted, so a seller could PATCH a listing an admin had removed straight back to
  // 'active' (undoing moderation), or flip an expired/unpaid listing to 'active' without
  // paying the monthly fee. Going live again after expiry is what /renew is for.
  const allowed: Record<string, string[]> = {
    active: ['reserved', 'sold', 'removed'],
    reserved: ['active', 'sold', 'removed'],
    expired: ['removed'],
    draft: ['removed'],
    pending_payment: ['removed'],
    sold: [],
    removed: [],
  }
  const next = parsed.data.status
  if (next !== existing.status && !allowed[existing.status]?.includes(next)) {
    res.status(409).json({ error: `A ${existing.status} listing can't be changed to ${next}.` })
    return
  }
  const [updated] = await db
    .update(listings)
    .set({ status: next, updatedAt: new Date() })
    .where(eq(listings.id, req.params.id))
    .returning()
  res.json({ listing: presentListing(updated, req.userId) })
})
