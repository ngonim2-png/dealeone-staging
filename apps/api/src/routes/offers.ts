import { Router } from 'express'
import { and, desc, eq, inArray, ne, TransactionRollbackError } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { conversations, listings, messages, offers, users } from '../db/schema'
import { requireAuth } from '../lib/auth'
import { ensureConversation } from '../lib/conversations'
import { presentListing } from '../lib/geo'
import { announceMessage } from '../lib/chatEvents'
import { notify } from '../lib/notify'

export const offersRouter = Router()

// spec §13 — buyer submits an offer; seller can accept/reject/counter. GET / (this route)
// is the buyer's own "offers I sent" view; GET /received (below) is its seller-side mirror
// — offers made on the seller's own listings, which previously had no endpoint or UI at
// all (every offer just sat at status: 'pending' forever with nothing to act on it).
offersRouter.get('/', requireAuth, async (req, res) => {
  const rows = await db
    .select({ offer: offers, listing: listings })
    .from(offers)
    .innerJoin(listings, eq(offers.listingId, listings.id))
    .where(eq(offers.buyerId, req.userId!))
    .orderBy(desc(offers.createdAt))
  res.json({ offers: rows.map((r) => ({ ...r, listing: presentListing(r.listing, req.userId) })) })
})

// Offers made on listings the current user sells — the seller-facing counterpart to GET /
// above. Includes the buyer's name/rating so the seller has context before acting.
offersRouter.get('/received', requireAuth, async (req, res) => {
  const rows = await db
    .select({
      offer: offers,
      listing: listings,
      buyer: {
        id: users.id,
        name: users.name,
        avatarEmoji: users.avatarEmoji,
        rating: users.rating,
        ratingCount: users.ratingCount,
      },
    })
    .from(offers)
    .innerJoin(listings, eq(offers.listingId, listings.id))
    .innerJoin(users, eq(offers.buyerId, users.id))
    .where(eq(listings.sellerId, req.userId!))
    .orderBy(desc(offers.createdAt))
  res.json({ offers: rows })
})

/** Inserts a plain system-narrated message (type 'system', no amount) into a conversation
 * and bumps its lastMessageAt — used by accept/reject below to actually narrate what just
 * happened in the chat thread, rather than the status silently changing with no record of
 * why. `messageTypeEnum` already had 'system' as a value long before this round, but nothing
 * ever inserted one — this is the first real use of it. */
async function postSystemMessage(conversationId: string, senderId: string, text: string) {
  const [msg] = await db.insert(messages).values({ conversationId, senderId, type: 'system', text }).returning()
  const [convo] = await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversationId)).returning()
  if (convo) announceMessage(convo, msg)
}

const createOfferSchema = z.object({
  listingId: z.string(),
  amount: z.number().int().positive().max(1_000_000_000),
  message: z.string().max(1000).optional(),
})

offersRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createOfferSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { listingId, amount, message } = parsed.data

  const [listing] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1)
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' })
    return
  }
  // A seller could previously offer on their own listing, accept it, mark it sold and then
  // rate themselves 5 stars — repeatable for free. Offers are also only meaningful on an
  // item that's actually still for sale.
  if (listing.sellerId === req.userId) {
    res.status(400).json({ error: "You can't make an offer on your own listing." })
    return
  }
  if (listing.status !== 'active') {
    res.status(409).json({ error: 'This listing is no longer available.' })
    return
  }

  const [offer] = await db
    .insert(offers)
    .values({ listingId, buyerId: req.userId!, amount, message })
    .returning()

  const convo = await ensureConversation(req.userId!, listingId)
  const [offerMsg] = await db
    .insert(messages)
    .values({
      conversationId: convo.id,
      senderId: req.userId!,
      type: 'offer',
      text: message ?? '',
      amount,
    })
    .returning()
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, convo.id))
  announceMessage(convo, offerMsg)
  notify(listing.sellerId, {
    type: 'offer',
    title: `New offer: NLe ${amount.toLocaleString()}`,
    body: `On “${listing.title}” (asking NLe ${listing.price.toLocaleString()})`,
    url: '/account/offers',
  })

  res.status(201).json({ offer, conversationId: convo.id })
})

/** Shared owner check for the three action endpoints below — every one of them requires
 * the current user to be the *seller* of the listing the offer was made on, not the buyer
 * who made it. Returns the offer+listing row, or null after already sending a 404/403. */
async function loadOwnedOffer(req: any, res: any) {
  const [row] = await db
    .select({ offer: offers, listing: listings })
    .from(offers)
    .innerJoin(listings, eq(offers.listingId, listings.id))
    .where(eq(offers.id, req.params.id))
    .limit(1)
  if (!row) {
    res.status(404).json({ error: 'Offer not found' })
    return null
  }
  if (row.listing.sellerId !== req.userId) {
    res.status(403).json({ error: 'Only the seller can act on this offer.' })
    return null
  }
  return row
}

// Accepting reserves the listing (spec: a deal is now in progress) and auto-rejects every
// other still-pending offer on the same listing — a seller can only actually sell an item
// once, so leaving competing offers dangling at 'pending' after one is accepted would be
// misleading (and is exactly the kind of thing a real seller would do by hand: tell the
// other bidders it's gone). Each affected buyer gets a real system message explaining why.
offersRouter.patch('/:id/accept', requireAuth, async (req, res) => {
  const row = await loadOwnedOffer(req, res)
  if (!row) return
  const { offer, listing } = row

  // All-or-nothing, and conditional at every step: the offer must still be open and the
  // listing must still be for sale *at the moment of the update*, not just when it was
  // read. Without this, accepting offer A (auto-rejecting B) and then accepting B left two
  // "accepted" offers on one item.
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(offers)
      .set({ status: 'accepted' })
      .where(and(eq(offers.id, offer.id), inArray(offers.status, ['pending', 'countered'])))
      .returning()
    if (!updated) return { error: 'This offer has already been answered.' as const }
    const [reserved] = await tx
      .update(listings)
      .set({ status: 'reserved', updatedAt: new Date() })
      .where(and(eq(listings.id, listing.id), eq(listings.status, 'active')))
      .returning({ id: listings.id })
    if (!reserved) {
      tx.rollback()
    }
    const others = await tx
      .update(offers)
      .set({ status: 'rejected' })
      .where(and(eq(offers.listingId, listing.id), inArray(offers.status, ['pending', 'countered']), ne(offers.id, offer.id)))
      .returning()
    return { updated, others }
  }).catch((err) => {
    // tx.rollback() throws to abort the transaction — that's the "listing no longer for
    // sale" case, not a server error.
    if (err instanceof TransactionRollbackError) return { error: 'This listing is no longer available.' as const }
    throw err
  })

  if ('error' in result) {
    res.status(409).json({ error: result.error })
    return
  }

  notify(offer.buyerId, {
    type: 'offer_update',
    title: 'Your offer was accepted 🎉',
    body: `NLe ${offer.amount.toLocaleString()} for “${listing.title}”. Arrange to meet in Messages.`,
    url: '/account/offers',
  })
  for (const other of result.others) {
    notify(other.buyerId, {
      type: 'offer_update',
      title: 'Item no longer available',
      body: `“${listing.title}” went to another buyer.`,
      url: '/account/offers',
    })
  }
  const acceptedConvo = await ensureConversation(offer.buyerId, listing.id)
  await postSystemMessage(
    acceptedConvo.id,
    req.userId!,
    `Offer accepted: NLe ${offer.amount} for ${listing.title}. Coordinate a time/place to complete the deal.`,
  )
  for (const other of result.others) {
    const convo = await ensureConversation(other.buyerId, listing.id)
    await postSystemMessage(
      convo.id,
      req.userId!,
      `${listing.title} is no longer available — the seller accepted another offer.`,
    )
  }

  res.json({ offer: result.updated })
})

offersRouter.patch('/:id/reject', requireAuth, async (req, res) => {
  const row = await loadOwnedOffer(req, res)
  if (!row) return
  const { offer, listing } = row

  const [updated] = await db
    .update(offers)
    .set({ status: 'rejected' })
    .where(and(eq(offers.id, offer.id), inArray(offers.status, ['pending', 'countered'])))
    .returning()
  if (!updated) {
    res.status(409).json({ error: 'This offer has already been answered.' })
    return
  }

  notify(offer.buyerId, {
    type: 'offer_update',
    title: 'Offer declined',
    body: `Your NLe ${offer.amount.toLocaleString()} offer on “${listing.title}” wasn't accepted.`,
    url: '/account/offers',
  })
  const convo = await ensureConversation(offer.buyerId, listing.id)
  await postSystemMessage(convo.id, req.userId!, `Offer of NLe ${offer.amount} declined for ${listing.title}.`)

  res.json({ offer: updated })
})

const counterSchema = z.object({ counterAmount: z.number().int().positive().max(1_000_000_000) })

offersRouter.patch('/:id/counter', requireAuth, async (req, res) => {
  const parsed = counterSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const row = await loadOwnedOffer(req, res)
  if (!row) return
  const { offer, listing } = row

  const [updated] = await db
    .update(offers)
    .set({ status: 'countered', counterAmount: parsed.data.counterAmount })
    .where(and(eq(offers.id, offer.id), inArray(offers.status, ['pending', 'countered'])))
    .returning()
  if (!updated) {
    res.status(409).json({ error: 'This offer has already been answered.' })
    return
  }

  const convo = await ensureConversation(offer.buyerId, listing.id)
  const [counterMsg] = await db
    .insert(messages)
    .values({
      conversationId: convo.id,
      senderId: req.userId!,
      type: 'counter_offer',
      text: '',
      amount: parsed.data.counterAmount,
    })
    .returning()
  await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, convo.id))
  announceMessage(convo, counterMsg)
  notify(offer.buyerId, {
    type: 'offer_update',
    title: `Counter-offer: NLe ${parsed.data.counterAmount.toLocaleString()}`,
    body: `The seller of “${listing.title}” countered your NLe ${offer.amount.toLocaleString()} offer.`,
    url: `/chats/${convo.id}`,
  })

  res.json({ offer: updated })
})
