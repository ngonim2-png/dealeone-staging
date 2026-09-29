// Monetization: the listing fee is a real recurring weekly charge (bought 1–4 weeks at a
// time); Boost, Featured and Top of category are weekly, the banner ad is per 10 days — but there's
// still no real payment gateway wired up (a payments API is expected but not integrated
// yet, see the project doc), so every "charge" here is a simulated one that always
// succeeds and gets logged to `listingPayments` for a real integration to slot into later.
// (Buyer-request priority access lives on the user rather than a listing — see
// users.buyerRequestPriorityUntil — so it isn't part of this file's listing-focused sweep.)
import { and, eq, isNotNull, lt, or } from 'drizzle-orm'
import { db } from '../db/client'
import { listings } from '../db/schema'

// Rate card agreed 29 Sep 2026 (see the project's dealeone-rate-card.md). Prices in NLe.
export const LISTING_FEE_PER_WEEK = 25 // keeps a listing visible; sold in 1–4 week packages
export const LISTING_PACKAGE_WEEKS = [1, 2, 3, 4] as const // "1 month" = 4 weeks = NLe 100
export const BOOST_FEE_PER_WEEK = 50 // "Boosted" — top map/sort priority, highlighted pin
export const FEATURE_FEE_PER_WEEK = 25 // "Featured" — badge on the listing card
export const CATEGORY_PIN_FEE_PER_WEEK = 50 // "Top of category" — pinned within its category
export const BANNER_FEE_PER_PERIOD = 100 // home-screen banner ad (business accounts)
export const BANNER_PERIOD_DAYS = 10 // …sold per 10 days
export const BUYER_REQUEST_PRIORITY_FEE_PER_WEEK = 50 // early access to new buyer requests
// Seller verification is free and first-come-first-served — the paid fast-track was
// removed with the Sep 2026 rate card.

/** Listings are free until this date (launch promotion), if set: FREE_LISTINGS_UNTIL=2027-03-01. */
export function freeListingsUntil(): Date | null {
  const raw = process.env.FREE_LISTINGS_UNTIL?.trim()
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** What a listing package costs right now (0 during the free launch period). */
export function listingFee(weeks: number, now = new Date()): number {
  const free = freeListingsUntil()
  if (free && now < free) return 0
  return LISTING_FEE_PER_WEEK * weeks
}

export function rateCard() {
  const free = freeListingsUntil()
  return {
    currency: 'NLe',
    listingFeePerWeek: LISTING_FEE_PER_WEEK,
    listingPackages: LISTING_PACKAGE_WEEKS.map((weeks) => ({
      weeks,
      label: weeks === 4 ? '1 month' : `${weeks} week${weeks > 1 ? 's' : ''}`,
      price: LISTING_FEE_PER_WEEK * weeks,
    })),
    freeListingsUntil: free && free > new Date() ? free.toISOString() : null,
    boostPerWeek: BOOST_FEE_PER_WEEK,
    featurePerWeek: FEATURE_FEE_PER_WEEK,
    topOfCategoryPerWeek: CATEGORY_PIN_FEE_PER_WEEK,
    bannerPerPeriod: BANNER_FEE_PER_PERIOD,
    bannerPeriodDays: BANNER_PERIOD_DAYS,
    buyerRequestPriorityPerWeek: BUYER_REQUEST_PRIORITY_FEE_PER_WEEK,
  }
}

const ONE_MONTH_MS = 30 * 86400000
const ONE_WEEK_MS = 7 * 86400000

export function addMonths(from: Date, months: number): Date {
  return new Date(from.getTime() + months * ONE_MONTH_MS)
}

export function addWeeks(from: Date, weeks: number): Date {
  return new Date(from.getTime() + weeks * ONE_WEEK_MS)
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86400000)
}

/** Lazily expires anything whose paid-through date has passed. Run at the top of every
 * listings read (routes/listings.ts) rather than on a cron/worker — this app has no
 * background job runner, and a listings read is exactly the moment staleness would
 * otherwise be user-visible, so checking there is both simplest and always fresh. Flips
 * `status` to 'expired' (an existing enum value — no new status needed) when the fee has
 * lapsed, which drops the listing out of the public "active"-only feed while leaving it
 * fully visible to its own seller in MyListings (which fetches all statuses) so they can
 * see it needs renewing. Boost/feature lapse independently of the fee — a listing can stay
 * active with an expired boost. */
export async function sweepBilling(): Promise<void> {
  const now = new Date()
  await db
    .update(listings)
    .set({ status: 'expired', updatedAt: now })
    // Unpaid this month, OR past the listing's own lifetime cap (the 1/3/6-month duration
    // picked at publish) — the cap was stored but never enforced before.
    .where(and(eq(listings.status, 'active'), or(lt(listings.feePaidUntil, now), lt(listings.expiresAt, now))))
  await db
    .update(listings)
    .set({ sponsored: false, updatedAt: now })
    .where(
      and(eq(listings.sponsored, true), isNotNull(listings.sponsoredUntil), lt(listings.sponsoredUntil, now)),
    )
  await db
    .update(listings)
    .set({ featured: false, updatedAt: now })
    .where(and(eq(listings.featured, true), isNotNull(listings.featuredUntil), lt(listings.featuredUntil, now)))
  await db
    .update(listings)
    .set({ categoryPinned: false, updatedAt: now })
    .where(
      and(
        eq(listings.categoryPinned, true),
        isNotNull(listings.categoryPinnedUntil),
        lt(listings.categoryPinnedUntil, now),
      ),
    )
  await db
    .update(listings)
    .set({ banner: false, updatedAt: now })
    .where(and(eq(listings.banner, true), isNotNull(listings.bannerUntil), lt(listings.bannerUntil, now)))
}
