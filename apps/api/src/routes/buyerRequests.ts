import { Router } from 'express'
import { and, desc, eq, lt, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { buyerRequests, conversations, listingPayments, listings, messages, users } from '../db/schema'
import { requireAuth } from '../lib/auth'
import { ensureConversation } from '../lib/conversations'
import { addWeeks, BUYER_REQUEST_PRIORITY_FEE_PER_WEEK } from '../lib/billing'
import { omitPinHash } from '../lib/sanitize'

export const buyerRequestsRouter = Router()

// spec §14 — reverse marketplace: buyer posts what they want, matching sellers get
// notified. GET / (this route) is the buyer's own posted requests; GET /feed (below) is the
// seller-side counterpart that never existed before this round — there was no way for a
// seller to browse buyer requests at all, and `responses` was a purely decorative counter
// seed data set by hand and nothing ever incremented.
buyerRequestsRouter.get('/', requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(buyerRequests)
    .where(eq(buyerRequests.userId, req.userId!))
    .orderBy(desc(buyerRequests.createdAt))
  res.json({ buyerRequests: rows })
})

const createSchema = z.object({
  product: z.string().min(1),
  maxOffer: z.number().int().nonnegative(),
  radiusKm: z.number().int().positive(),
  condition: z.enum(['new', 'used', 'either']),
  expiresInDays: z.number().int().positive().default(30),
})

buyerRequestsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const d = parsed.data
  const [created] = await db
    .insert(buyerRequests)
    .values({
      userId: req.userId!,
      product: d.product,
      maxOffer: d.maxOffer,
      radiusKm: d.radiusKm,
      condition: d.condition,
      expiresAt: new Date(Date.now() + d.expiresInDays * 86400000),
    })
    .returning()
  res.status(201).json({ buyerRequest: created })
})

// Seller-facing feed of open buyer requests — deliberately NOT geo-matched: buyerRequests
// has no lat/lng of its own (just a buyer-chosen search radius preference), and users only
// store a free-text neighborhood, not coordinates, so real proximity matching would need a
// separate, bigger change. This is honestly a bulletin board, not a "nearby" feed — sellers
// read the free-text `product` description themselves to judge relevance, same as spec's
// original reverse-marketplace framing.
//
// "Buyer-Request priority access" (NLe 100/week, business accounts only, POST
// /priority-access below): by default this feed hides anything posted in the last 24
// hours, so paying sellers see brand-new requests immediately while everyone else sees them
// a day later — a real (if simple) early-access mechanic, not just a label.
buyerRequestsRouter.get('/feed', requireAuth, async (req, res) => {
  const [me] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1)
  const now = new Date()
  const hasPriority = !!(me?.buyerRequestPriorityUntil && me.buyerRequestPriorityUntil > now)
  const oneDayAgo = new Date(now.getTime() - 86400000)

  const rows = await db
    .select({
      buyerRequest: buyerRequests,
      requester: { id: users.id, name: users.name, location: users.location },
    })
    .from(buyerRequests)
    .innerJoin(users, eq(buyerRequests.userId, users.id))
    .where(
      and(
        ne(buyerRequests.userId, req.userId!),
        eq(buyerRequests.status, 'open'),
        hasPriority ? undefined : lt(buyerRequests.createdAt, oneDayAgo),
      ),
    )
    .orderBy(desc(buyerRequests.createdAt))
    .limit(100)

  res.json({ buyerRequests: rows, hasPriority })
})

const respondSchema = z.object({
  listingId: z.string(),
  message: z.string().max(500).optional(),
})

// A seller "responds" by pointing one of their own listings at the buyer's request — the
// natural mapping given `conversations` requires a real listingId (there's no listing-less
// conversation type), so this reuses the existing ensureConversation/messages infra rather
// than inventing a parallel messaging path just for buyer requests.
buyerRequestsRouter.post('/:id/respond', requireAuth, async (req, res) => {
  const parsed = respondSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const [request] = await db.select().from(buyerRequests).where(eq(buyerRequests.id, req.params.id)).limit(1)
  if (!request) {
    res.status(404).json({ error: 'Buyer request not found' })
    return
  }
  if (request.userId === req.userId) {
    res.status(400).json({ error: "You can't respond to your own request." })
    return
  }
  const [listing] = await db.select().from(listings).where(eq(listings.id, parsed.data.listingId)).limit(1)
  if (!listing || listing.sellerId !== req.userId) {
    res.status(403).json({ error: 'You can only respond with your own listing.' })
    return
  }

  const convo = await ensureConversation(request.userId, listing.id)
  const text = parsed.data.message?.trim()
    ? parsed.data.message.trim()
    : `Responding to your request for "${request.product}" — check out my listing "${listing.title}".`
  await db.insert(messages).values({ conversationId: convo.id, senderId: req.userId!, type: 'text', text })
  await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, convo.id))

  await db
    .update(buyerRequests)
    .set({
      responses: request.responses + 1,
      status: request.status === 'open' ? 'matched' : request.status,
    })
    .where(eq(buyerRequests.id, request.id))

  res.json({ conversationId: convo.id })
})

// "Buyer-Request priority access" purchase (NLe 100/week, business accounts only — an
// individual buyer occasionally posting one request doesn't need to pay to see other
// buyers' requests faster; this is aimed at businesses actively sourcing inventory).
buyerRequestsRouter.post('/priority-access', requireAuth, async (req, res) => {
  const [me] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1)
  if (!me) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  if (!me.isBusiness) {
    res.status(403).json({ error: 'Only business accounts can buy priority access. Register as a business from Account > Settings.' })
    return
  }
  const now = new Date()
  const base = me.buyerRequestPriorityUntil && me.buyerRequestPriorityUntil > now ? me.buyerRequestPriorityUntil : now
  const buyerRequestPriorityUntil = addWeeks(base, 1)

  const [updated] = await db
    .update(users)
    .set({ buyerRequestPriorityUntil })
    .where(eq(users.id, req.userId!))
    .returning()

  await db.insert(listingPayments).values({
    sellerId: req.userId!,
    kind: 'buyer_request_priority',
    amount: BUYER_REQUEST_PRIORITY_FEE_PER_WEEK,
    periodStart: base,
    periodEnd: buyerRequestPriorityUntil,
  })

  res.json({ user: omitPinHash(updated) })
})
