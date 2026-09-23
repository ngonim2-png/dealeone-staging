import { Router } from 'express'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { listingPayments, users, verificationRequests } from '../db/schema'
import { requireAuth } from '../lib/auth'
import { addWeeks, VERIFICATION_PRIORITY_FEE_PER_WEEK } from '../lib/billing'
import { omitPinHash } from '../lib/sanitize'

export const verificationRequestsRouter = Router()

// Makes users.verificationLevel genuinely real. Before this round, Verification.tsx's
// per-level "Start" button had no `onClick` handler at all — level only ever moved because
// auth.ts hardcodes new signups to level 1, or because seed.ts said so. Now: a user submits
// a request for the next level (a short note, optionally a photo — reusing the same base64
// data-URL pattern already used for listing photos and voice notes, no new storage
// infrastructure needed), and an admin reviews it from the moderation panel (see admin.ts's
// additions, mirroring the existing reports/disputes review pattern).
const createSchema = z.object({
  targetLevel: z.number().int().min(1).max(4),
  note: z.string().max(500).default(''),
  photo: z.string().max(3_000_000).optional(),
})

verificationRequestsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const [me] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1)
  if (!me) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  if (parsed.data.targetLevel !== me.verificationLevel + 1) {
    res.status(400).json({ error: 'You can only request the next verification level.' })
    return
  }
  const [existingPending] = await db
    .select()
    .from(verificationRequests)
    .where(and(eq(verificationRequests.userId, req.userId!), eq(verificationRequests.status, 'pending')))
    .limit(1)
  if (existingPending) {
    res.status(409).json({ error: 'You already have a pending verification request.' })
    return
  }

  const now = new Date()
  const priority = !!(me.verificationPriorityUntil && me.verificationPriorityUntil > now)

  const [created] = await db
    .insert(verificationRequests)
    .values({
      userId: req.userId!,
      targetLevel: parsed.data.targetLevel,
      note: parsed.data.note,
      photo: parsed.data.photo,
      priority,
    })
    .returning()

  res.status(201).json({ verificationRequest: created })
})

verificationRequestsRouter.get('/me', requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(verificationRequests)
    .where(eq(verificationRequests.userId, req.userId!))
    .orderBy(desc(verificationRequests.createdAt))
  res.json({ verificationRequests: rows })
})

// "Verified-seller fast-track" (NLe 100/week) — a request submitted while this window is
// active gets `priority: true` and sorts to the front of the admin review queue (see
// admin.ts's GET /verification-requests). Unlike the listing-scoped upgrades in
// routes/listings.ts, this lives on the user, so it has no listingId in the ledger.
verificationRequestsRouter.post('/priority', requireAuth, async (req, res) => {
  const [me] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1)
  if (!me) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const now = new Date()
  const base = me.verificationPriorityUntil && me.verificationPriorityUntil > now ? me.verificationPriorityUntil : now
  const verificationPriorityUntil = addWeeks(base, 1)

  const [updated] = await db
    .update(users)
    .set({ verificationPriorityUntil })
    .where(eq(users.id, req.userId!))
    .returning()

  await db.insert(listingPayments).values({
    sellerId: req.userId!,
    kind: 'verification_priority',
    amount: VERIFICATION_PRIORITY_FEE_PER_WEEK,
    periodStart: base,
    periodEnd: verificationPriorityUntil,
  })

  res.json({ user: omitPinHash(updated) })
})
