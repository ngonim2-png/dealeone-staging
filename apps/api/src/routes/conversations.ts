import { Router } from 'express'
import { and, asc, desc, eq, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { conversations, messages, users } from '../db/schema'
import { requireAuth } from '../lib/auth'
import { ensureConversation, ensureEventConversation, SelfConversationError } from '../lib/conversations'
import { storeDataUrl } from '../lib/media'
import { announceMessage } from '../lib/chatEvents'

export const conversationsRouter = Router()

const OTHER_PARTY_COLS = {
  id: users.id,
  name: users.name,
  avatarEmoji: users.avatarEmoji,
  isBusiness: users.isBusiness,
  verificationLevel: users.verificationLevel,
  rating: users.rating,
  ratingCount: users.ratingCount,
  location: users.location,
}

// spec §15-16 — one thread per (buyer, listing) or (buyer, event) — keeps context attached
// so a buyer talking to the same seller about two items, or the same organizer about two
// events, doesn't get them mixed up. Deliberately doesn't join listings/events here: the
// frontend already resolves the full listing/event object from its own global state (see
// AppContext's `listings`/`events` arrays) by the conversation's listingId/eventId — all
// this endpoint needs to add is who the "other party" is (seller or organizer, both just a
// `users` row) plus the last-message/unread preview.
// Both sides of every thread: the buyer who started it AND the seller/organizer it's with.
// Before this only `buyerId = me` was returned, so a seller never saw a single incoming
// message anywhere in the app. `seller` in the response is kept as the field name for
// compatibility but now always means "the other party" (the buyer, when I'm the seller),
// and `role` says which side of the thread the signed-in user is on.
conversationsRouter.get('/', requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(conversations)
    .where(or(eq(conversations.buyerId, req.userId!), eq(conversations.sellerId, req.userId!)))
    .orderBy(desc(conversations.lastMessageAt))

  const withDetails = await Promise.all(
    rows.map(async (conversation) => {
      const role = conversation.buyerId === req.userId ? 'buyer' : 'seller'
      const otherId = role === 'buyer' ? conversation.sellerId : conversation.buyerId
      const [seller] = await db.select(OTHER_PARTY_COLS).from(users).where(eq(users.id, otherId)).limit(1)
      const [last] = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(desc(messages.createdAt))
        .limit(1)
      const [{ unread }] = await db
        .select({ unread: sql<number>`count(*)::int` })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversation.id),
            eq(messages.read, false),
            ne(messages.senderId, req.userId!),
          ),
        )
      return { conversation, seller, role, lastMessage: last ?? null, unreadCount: unread }
    }),
  )

  res.json({ conversations: withDetails })
})

// get-or-create a conversation for the current user + a listing ("Message Seller") or an
// event ("Message organizer") — exactly one of listingId/eventId, see ensureConversation /
// ensureEventConversation in lib/conversations.ts.
const ensureSchema = z.union([
  z.object({ listingId: z.string(), eventId: z.undefined().optional() }),
  z.object({ eventId: z.string(), listingId: z.undefined().optional() }),
])
conversationsRouter.post('/ensure', requireAuth, async (req, res) => {
  const parsed = ensureSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  try {
    const convo =
      'listingId' in parsed.data && parsed.data.listingId
        ? await ensureConversation(req.userId!, parsed.data.listingId)
        : await ensureEventConversation(req.userId!, (parsed.data as { eventId: string }).eventId)
    res.json({ conversation: convo })
  } catch (err) {
    if (err instanceof SelfConversationError) {
      res.status(400).json({ error: err.message })
      return
    }
    res.status(404).json({ error: 'listingId' in parsed.data && parsed.data.listingId ? 'Listing not found' : 'Event not found' })
  }
})

conversationsRouter.get('/:id', requireAuth, async (req, res) => {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, req.params.id)).limit(1)

  if (!conversation || (conversation.buyerId !== req.userId && conversation.sellerId !== req.userId)) {
    res.status(404).json({ error: 'Conversation not found' })
    return
  }

  const role = conversation.buyerId === req.userId ? 'buyer' : 'seller'
  const otherId = role === 'buyer' ? conversation.sellerId : conversation.buyerId
  const [seller] = await db.select(OTHER_PARTY_COLS).from(users).where(eq(users.id, otherId)).limit(1)

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, req.params.id))
    .orderBy(asc(messages.createdAt))

  res.json({ conversation, seller, role, messages: msgs })
})

// Two message shapes: a normal text message, or a voice note (spec: literacy accessibility
// — many buyers/sellers in Sierra Leone can't read or write, so being able to just record
// and send a voice clip matters as much as typing). audioUrl is a base64 data URL — see the
// storage note on messages.audioUrl in schema.ts.
const sendMessageSchema = z.union([
  z.object({ type: z.literal('text').optional(), text: z.string().min(1) }),
  z.object({
    type: z.literal('voice'),
    audioUrl: z.string().min(1).startsWith('data:audio/'),
    audioDurationSec: z.number().int().positive().max(300),
  }),
])
conversationsRouter.post('/:id/messages', requireAuth, async (req, res) => {
  const parsed = sendMessageSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const [convo] = await db.select().from(conversations).where(eq(conversations.id, req.params.id)).limit(1)
  if (!convo || (convo.buyerId !== req.userId && convo.sellerId !== req.userId)) {
    res.status(404).json({ error: 'Conversation not found' })
    return
  }
  // Voice notes are stored as media and referenced by URL (not base64 in the message row).
  const storedAudioUrl = parsed.data.type === 'voice' ? await storeDataUrl(parsed.data.audioUrl, req.userId!) : null
  const [msg] = await db
    .insert(messages)
    .values(
      parsed.data.type === 'voice'
        ? {
            conversationId: convo.id,
            senderId: req.userId!,
            type: 'voice',
            audioUrl: storedAudioUrl,
            audioDurationSec: parsed.data.audioDurationSec,
          }
        : { conversationId: convo.id, senderId: req.userId!, type: 'text', text: parsed.data.text },
    )
    .returning()
  await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, convo.id))
  announceMessage(convo, msg)
  res.status(201).json({ message: msg })
})

conversationsRouter.patch('/:id/read', requireAuth, async (req, res) => {
  const [convo] = await db.select().from(conversations).where(eq(conversations.id, req.params.id)).limit(1)
  if (!convo || (convo.buyerId !== req.userId && convo.sellerId !== req.userId)) {
    res.status(404).json({ error: 'Conversation not found' })
    return
  }
  await db
    .update(messages)
    .set({ read: true })
    .where(and(eq(messages.conversationId, convo.id), ne(messages.senderId, req.userId!)))
  res.json({ ok: true })
})
