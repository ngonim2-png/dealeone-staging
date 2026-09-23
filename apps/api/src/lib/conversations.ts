import { and, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { conversations, listings, events } from '../db/schema'

/** Get-or-create the single conversation between a buyer and a listing's seller.
 * Mirrors the frontend prototype's `ensureConversation` — one thread per (buyer, listing). */
export async function ensureConversation(buyerId: string, listingId: string) {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.listingId, listingId), eq(conversations.buyerId, buyerId)))
    .limit(1)
  if (existing) return existing

  const [listing] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1)
  if (!listing) throw new Error('Listing not found')

  const [created] = await db
    .insert(conversations)
    .values({ listingId, buyerId, sellerId: listing.sellerId })
    .returning()
  return created
}

/** Get-or-create the single conversation between a buyer and an event's organizer — mirrors
 * ensureConversation above, just keyed by eventId instead of listingId (see the
 * conversations table's polymorphic listingId/eventId columns in schema.ts). Powers
 * EventDetail.tsx's "Message organizer" button the same way ensureConversation powers
 * ListingDetail.tsx's "Message Seller". */
export async function ensureEventConversation(buyerId: string, eventId: string) {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.eventId, eventId), eq(conversations.buyerId, buyerId)))
    .limit(1)
  if (existing) return existing

  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1)
  if (!event) throw new Error('Event not found')

  const [created] = await db
    .insert(conversations)
    .values({ eventId, buyerId, sellerId: event.organizerId })
    .returning()
  return created
}
