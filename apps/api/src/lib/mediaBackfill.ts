// One-time (idempotent) move of photos/voice notes that were saved as base64 text before
// the media table existed. Runs in the background at API start-up; each row is converted
// independently, so an unreadable old photo is logged and skipped instead of blocking the rest.
import { eq, like, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { events, listings, messages, statuses } from '../db/schema'
import { normalizeImages, storeDataUrl } from './media'

export async function backfillMedia(): Promise<void> {
  let moved = 0
  let failed = 0
  const hasDataImage = sql`exists (select 1 from unnest(images) i where i like 'data:%')`

  for (const l of await db.select({ id: listings.id, sellerId: listings.sellerId, images: listings.images }).from(listings).where(hasDataImage)) {
    try {
      await db.update(listings).set({ images: await normalizeImages(l.images, l.sellerId) }).where(eq(listings.id, l.id))
      moved++
    } catch (err) {
      failed++
      console.error('media backfill: listing', l.id, err)
    }
  }
  for (const e of await db.select({ id: events.id, organizerId: events.organizerId, images: events.images }).from(events).where(hasDataImage)) {
    try {
      await db.update(events).set({ images: await normalizeImages(e.images, e.organizerId) }).where(eq(events.id, e.id))
      moved++
    } catch (err) {
      failed++
      console.error('media backfill: event', e.id, err)
    }
  }
  for (const st of await db.select({ id: statuses.id, userId: statuses.userId, imageUrl: statuses.imageUrl }).from(statuses).where(like(statuses.imageUrl, 'data:%'))) {
    try {
      await db.update(statuses).set({ imageUrl: await storeDataUrl(st.imageUrl, st.userId) }).where(eq(statuses.id, st.id))
      moved++
    } catch (err) {
      failed++
      console.error('media backfill: status', st.id, err)
    }
  }
  for (const m of await db.select({ id: messages.id, senderId: messages.senderId, audioUrl: messages.audioUrl }).from(messages).where(like(messages.audioUrl, 'data:%'))) {
    try {
      await db.update(messages).set({ audioUrl: await storeDataUrl(m.audioUrl!, m.senderId) }).where(eq(messages.id, m.id))
      moved++
    } catch (err) {
      failed++
      console.error('media backfill: message', m.id, err)
    }
  }
  if (moved || failed) console.log(`media backfill: moved ${moved}, failed ${failed}`)
}
