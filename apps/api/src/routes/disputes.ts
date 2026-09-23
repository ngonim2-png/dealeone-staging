import { Router } from 'express'
import { desc, eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { conversations, disputes, listings } from '../db/schema'
import { requireAuth } from '../lib/auth'

export const disputesRouter = Router()

const createDisputeSchema = z.object({
  conversationId: z.string(),
  reason: z.enum(['item_not_as_described', 'no_show_seller', 'no_show_buyer', 'payment_issue', 'other']),
  details: z.string().max(1000).optional(),
})

// Disputes are tied to a conversation (buyer+seller+listing), not a payment or an "accepted
// offer" — neither exists yet (see schema.ts's comment on the disputes table). Either party
// to the conversation can raise one.
disputesRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createDisputeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { conversationId, reason, details } = parsed.data

  const [convo] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1)
  if (!convo) {
    res.status(404).json({ error: 'Conversation not found' })
    return
  }
  if (convo.buyerId !== req.userId && convo.sellerId !== req.userId) {
    res.status(403).json({ error: 'You are not part of this conversation.' })
    return
  }

  const [dispute] = await db
    .insert(disputes)
    .values({ conversationId, raisedByUserId: req.userId!, reason, details: details ?? '' })
    .returning()

  res.status(201).json({ dispute })
})

// Disputes involving the current user, either as the one who raised it or as the other
// party in the conversation — both sides should be able to see it's being looked at.
disputesRouter.get('/mine', requireAuth, async (req, res) => {
  const rows = await db
    .select({ dispute: disputes, conversation: conversations, listing: listings })
    .from(disputes)
    .innerJoin(conversations, eq(disputes.conversationId, conversations.id))
    .innerJoin(listings, eq(conversations.listingId, listings.id))
    .where(or(eq(conversations.buyerId, req.userId!), eq(conversations.sellerId, req.userId!)))
    .orderBy(desc(disputes.createdAt))
  res.json({ disputes: rows })
})
