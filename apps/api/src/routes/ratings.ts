import { Router } from 'express'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { listings, offers, ratings, users } from '../db/schema'
import { requireAuth } from '../lib/auth'

export const ratingsRouter = Router()

// Makes users.rating/ratingCount genuinely real. Before this round they were pure seed-time
// numbers — there was no flow anywhere, at any point, that ever changed them after a real
// deal happened. A rating requires: the listing is actually marked 'sold' (see
// routes/listings.ts's PATCH /:id/status, now wired to a real "Mark as Sold" button in
// MyListings.tsx), the rater has an *accepted* offer on that listing (routes/offers.ts's
// PATCH /:id/accept — so a rating can only come from the buyer the seller actually accepted,
// not just anyone who once messaged about it), and one rating per listing (enforced by the
// DB's uniqueIndex on ratings.listingId, not just application logic).
const createRatingSchema = z.object({
  listingId: z.string(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).default(''),
})

ratingsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createRatingSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { listingId, stars, comment } = parsed.data

  const [listing] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1)
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' })
    return
  }
  if (listing.status !== 'sold') {
    res.status(400).json({ error: 'You can only rate a seller after a listing is marked sold.' })
    return
  }
  const [acceptedOffer] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.listingId, listingId), eq(offers.buyerId, req.userId!), eq(offers.status, 'accepted')))
    .limit(1)
  if (!acceptedOffer) {
    res.status(403).json({ error: 'Only the buyer whose offer was accepted on this listing can rate it.' })
    return
  }

  const [existingRating] = await db.select().from(ratings).where(eq(ratings.listingId, listingId)).limit(1)
  if (existingRating) {
    res.status(409).json({ error: 'This listing has already been rated.' })
    return
  }

  const [created] = await db
    .insert(ratings)
    .values({ listingId, raterId: req.userId!, ratedUserId: listing.sellerId, stars, comment })
    .returning()

  const [seller] = await db.select().from(users).where(eq(users.id, listing.sellerId)).limit(1)
  if (seller) {
    const newCount = seller.ratingCount + 1
    const newRating = Math.round(((seller.rating * seller.ratingCount + stars) / newCount) * 10) / 10
    await db.update(users).set({ rating: newRating, ratingCount: newCount }).where(eq(users.id, seller.id))
  }

  res.status(201).json({ rating: created })
})

// Listing ids the current user has already rated (as the rater) — used by ChatThread.tsx to
// decide whether to still show the "Rate your seller" prompt on a sold listing.
ratingsRouter.get('/mine', requireAuth, async (req, res) => {
  const rows = await db.select({ listingId: ratings.listingId }).from(ratings).where(eq(ratings.raterId, req.userId!))
  res.json({ listingIds: rows.map((r) => r.listingId) })
})
