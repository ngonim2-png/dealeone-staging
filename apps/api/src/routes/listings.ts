import { Router } from 'express'
import { and, asc, desc, eq, gte, inArray, lte, or, ilike, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { categoryEnum, listingPayments, listings, users } from '../db/schema'
import { distanceKmExpr, presentListing } from '../lib/geo'
import { requireAuth } from '../lib/auth'
import {
  addMonths,
  addWeeks,
  BANNER_FEE_PER_WEEK,
  BOOST_FEE_PER_WEEK,
  CATEGORY_PIN_FEE_PER_WEEK,
  FEATURE_FEE_PER_WEEK,
  LISTING_FEE_PER_MONTH,
  sweepBilling,
} from '../lib/billing'

export const listingsRouter = Router()

const DEFAULT_LAT = 8.4657 // Lumley, Freetown — used if the client doesn't send a location
const DEFAULT_LNG = -13.2983

const querySchema = z.object({
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radiusKm: z.coerce.number().optional(),
  categories: z.string().optional(), // comma-separated
  condition: z.string().optional(), // comma-separated
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  sellerType: z.enum(['any', 'individual', 'business', 'verified']).optional(),
  q: z.string().optional(),
  sort: z
    .enum(['closest', 'best_deal', 'recommended', 'sponsored', 'newest', 'price_asc', 'price_desc'])
    .optional(),
  sellerId: z.string().optional(),
  status: z.string().optional(), // comma-separated, defaults to "active"
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

  const statusList = (q.status ?? 'active').split(',').filter(Boolean)

  const conditions = [inArray(listings.status, statusList as any), lte(dist, radiusKm)]

  if (q.categories) {
    const cats = q.categories.split(',').filter(Boolean)
    if (cats.length) conditions.push(inArray(listings.category, cats as any))
  }
  if (q.condition) {
    const conds = q.condition.split(',').filter(Boolean)
    if (conds.length) conditions.push(inArray(listings.condition, conds as any))
  }
  if (q.minPrice != null) conditions.push(gte(listings.price, q.minPrice))
  if (q.maxPrice != null) conditions.push(lte(listings.price, q.maxPrice))
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
    .orderBy(orderBy)
    .limit(200)

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

  res.json({ results, count: results.length })
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

  const lat = Number(req.query.lat) || DEFAULT_LAT
  const lng = Number(req.query.lng) || DEFAULT_LNG
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
  title: z.string().min(1),
  description: z.string().default(''),
  price: z.number().int().nonnegative(),
  negotiable: z.boolean().default(true),
  condition: z.enum(['new', 'used', 'refurbished']),
  quantity: z.number().int().positive().default(1),
  lat: z.number(),
  lng: z.number(),
  approxLocation: z.boolean().default(true),
  durationMonths: z.number().int().positive().max(12).default(3),
  // Each entry is either a short emoji placeholder (seed/demo data, or the category-emoji
  // fallback when a listing has no real photo) or a compressed base64 data URL from the
  // Sell flow's camera/gallery capture (see apps/web/src/lib/media.ts) — capped here so a
  // client can't push something huge past the compression step.
  images: z.array(z.string().max(3_000_000)).max(5).default([]),
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
  const expiresAt = addMonths(now, d.durationMonths)
  const feePaidUntil = addMonths(now, 1)

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
      images: d.images,
      feePaidUntil,
      expiresAt,
    })
    .returning()

  await db.insert(listingPayments).values({
    listingId: created.id,
    sellerId: req.userId!,
    kind: 'listing_fee',
    amount: LISTING_FEE_PER_MONTH,
    periodStart: now,
    periodEnd: feePaidUntil,
  })

  res.status(201).json({ listing: created })
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
  const now = new Date()
  const base = existing.feePaidUntil > now ? existing.feePaidUntil : now
  const feePaidUntil = addMonths(base, 1)

  const [updated] = await db
    .update(listings)
    .set({
      feePaidUntil,
      status: existing.status === 'expired' ? 'active' : existing.status,
      updatedAt: now,
    })
    .where(eq(listings.id, req.params.id))
    .returning()

  await db.insert(listingPayments).values({
    listingId: existing.id,
    sellerId: req.userId!,
    kind: 'listing_fee',
    amount: LISTING_FEE_PER_MONTH,
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
    amount: BOOST_FEE_PER_WEEK,
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
  const bannerUntil = addWeeks(base, 1)

  const [updated] = await db
    .update(listings)
    .set({ banner: true, bannerUntil, updatedAt: now })
    .where(eq(listings.id, req.params.id))
    .returning()

  await db.insert(listingPayments).values({
    listingId: existing.id,
    sellerId: req.userId!,
    kind: 'banner_ad',
    amount: BANNER_FEE_PER_WEEK,
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
  const lat = Number(req.query.lat) || DEFAULT_LAT
  const lng = Number(req.query.lng) || DEFAULT_LNG
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
  const [updated] = await db
    .update(listings)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(listings.id, req.params.id))
    .returning()
  res.json({ listing: updated })
})
