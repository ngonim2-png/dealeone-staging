import { Router } from 'express'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { listings, wishlistEntries } from '../db/schema'
import { requireAuth } from '../lib/auth'
import { presentListing } from '../lib/geo'

export const wishlistRouter = Router()

// spec §29 — the wishlist itself is dumb here; the "intelligent" price-drop / closer-
// availability alerts described in the spec need a notification worker, not built yet.
wishlistRouter.get('/', requireAuth, async (req, res) => {
  const rows = await db
    .select({ entry: wishlistEntries, listing: listings })
    .from(wishlistEntries)
    .innerJoin(listings, eq(wishlistEntries.listingId, listings.id))
    .where(eq(wishlistEntries.userId, req.userId!))
    .orderBy(desc(wishlistEntries.createdAt))
  res.json({ wishlist: rows.map((r) => ({ ...r, listing: presentListing(r.listing, req.userId) })) })
})

const toggleSchema = z.object({ listingId: z.string() })
wishlistRouter.post('/toggle', requireAuth, async (req, res) => {
  const parsed = toggleSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { listingId } = parsed.data
  const [existing] = await db
    .select()
    .from(wishlistEntries)
    .where(and(eq(wishlistEntries.userId, req.userId!), eq(wishlistEntries.listingId, listingId)))
    .limit(1)

  if (existing) {
    await db.delete(wishlistEntries).where(eq(wishlistEntries.id, existing.id))
    res.json({ wishlisted: false })
    return
  }
  await db.insert(wishlistEntries).values({ userId: req.userId!, listingId })
  res.json({ wishlisted: true })
})
