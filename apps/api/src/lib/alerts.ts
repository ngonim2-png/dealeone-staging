// Alerts that fire when listings appear or change:
// - saved-search matches ("tell me when an iPhone under NLe 10,000 appears within 5 km")
// - price drops on items people saved to their wishlist
import { and, eq, ne, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { savedSearches, wishlistEntries } from '../db/schema'
import { notify } from './notify'

interface ListingLike {
  id: string
  sellerId: string
  title: string
  description: string
  category: string
  price: number
  lat: number
  lng: number
}

const words = (q: string) =>
  q
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length > 1)

/** Notifies owners of active saved searches this new listing matches. Never throws. */
export async function matchSavedSearches(listing: ListingLike): Promise<void> {
  try {
    const distance = sql<number>`6371 * 2 * asin(sqrt(power(sin(radians(${listing.lat} - ${savedSearches.lat}) / 2), 2) + cos(radians(${savedSearches.lat})) * cos(radians(${listing.lat})) * power(sin(radians(${listing.lng} - ${savedSearches.lng}) / 2), 2)))`
    const candidates = await db
      .select()
      .from(savedSearches)
      .where(
        and(
          eq(savedSearches.active, true),
          ne(savedSearches.userId, listing.sellerId),
          sql`${distance} <= ${savedSearches.radiusKm}`,
          sql`(cardinality(${savedSearches.categories}) = 0 or ${listing.category} = any(${savedSearches.categories}))`,
          sql`(${savedSearches.maxPrice} is null or ${listing.price} <= ${savedSearches.maxPrice})`,
        ),
      )
    const haystack = `${listing.title} ${listing.description}`.toLowerCase()
    const notified = new Set<string>()
    for (const s of candidates) {
      if (notified.has(s.userId)) continue // one alert per person per listing
      if (!words(s.query).every((w) => haystack.includes(w))) continue
      notified.add(s.userId)
      await db.update(savedSearches).set({ lastNotifiedAt: new Date() }).where(eq(savedSearches.id, s.id))
      await notify(s.userId, {
        type: 'saved_search',
        title: `New near you: ${listing.title}`,
        body: `NLe ${listing.price.toLocaleString()} — matches your saved search${s.query ? ` “${s.query}”` : ''}.`,
        url: `/listing/${listing.id}`,
      })
    }
  } catch (err) {
    console.error('matchSavedSearches failed', err)
  }
}

/** Tells everyone who saved this listing that its price went down. Never throws. */
export async function notifyPriceDrop(listing: ListingLike, oldPrice: number): Promise<void> {
  try {
    const savers = await db
      .select({ userId: wishlistEntries.userId })
      .from(wishlistEntries)
      .where(and(eq(wishlistEntries.listingId, listing.id), ne(wishlistEntries.userId, listing.sellerId)))
    const pct = Math.round(((oldPrice - listing.price) / oldPrice) * 100)
    for (const { userId } of savers) {
      await notify(userId, {
        type: 'price_drop',
        title: `Price drop: ${listing.title}`,
        body: `Now NLe ${listing.price.toLocaleString()} (was NLe ${oldPrice.toLocaleString()}, −${pct}%).`,
        url: `/listing/${listing.id}`,
      })
    }
  } catch (err) {
    console.error('notifyPriceDrop failed', err)
  }
}
