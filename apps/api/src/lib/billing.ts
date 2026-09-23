// Monetization: the listing fee is a real recurring monthly charge; Boost, Featured, Top
// Search Placement, and the Explore banner ad are all real weekly charges — but there's
// still no real payment gateway wired up (a payments API is expected but not integrated
// yet, see the project doc), so every "charge" here is a simulated one that always
// succeeds and gets logged to `listingPayments` for a real integration to slot into later.
// (The other two paid upgrades — verification fast-track and buyer-request priority access
// — live on the user rather than a listing, see the two *Until columns on `users` in
// schema.ts; they're charged the same simulated way but aren't listing-scoped, so they're
// not part of this file's listing-focused sweep.)
import { and, eq, isNotNull, lt } from 'drizzle-orm'
import { db } from '../db/client'
import { listings } from '../db/schema'

export const LISTING_FEE_PER_MONTH = 30 // NLe, charged monthly to keep a listing visible
export const BOOST_FEE_PER_WEEK = 100 // NLe, "Boosted" — gold glow + top map/sort priority
export const FEATURE_FEE_PER_WEEK = 100 // NLe, "Featured" — badge on the listing card
export const CATEGORY_PIN_FEE_PER_WEEK = 100 // NLe, "Top Search Placement" — pin within category
export const BANNER_FEE_PER_WEEK = 100 // NLe, Explore homepage banner ad (business accounts)
export const BUYER_REQUEST_PRIORITY_FEE_PER_WEEK = 100 // NLe, early access to new buyer requests
export const VERIFICATION_PRIORITY_FEE_PER_WEEK = 100 // NLe, front-of-queue verification review

const ONE_MONTH_MS = 30 * 86400000
const ONE_WEEK_MS = 7 * 86400000

export function addMonths(from: Date, months: number): Date {
  return new Date(from.getTime() + months * ONE_MONTH_MS)
}

export function addWeeks(from: Date, weeks: number): Date {
  return new Date(from.getTime() + weeks * ONE_WEEK_MS)
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
    .where(and(eq(listings.status, 'active'), lt(listings.feePaidUntil, now)))
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
