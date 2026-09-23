import { Router } from 'express'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { events, listings, reports, statuses, users } from '../db/schema'
import { requireAuth } from '../lib/auth'

export const reportsRouter = Router()

const createReportSchema = z.object({
  targetType: z.enum(['listing', 'user', 'event', 'status']),
  targetId: z.string(),
  reason: z.enum(['scam', 'counterfeit', 'inappropriate', 'spam', 'other']),
  details: z.string().max(1000).optional(),
})

reportsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createReportSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { targetType, targetId, reason, details } = parsed.data

  // Confirm the target actually exists before recording a report against it — a stale or
  // typo'd id would otherwise clutter the moderation queue with nothing an admin can act on.
  const exists =
    targetType === 'listing'
      ? (await db.select({ id: listings.id }).from(listings).where(eq(listings.id, targetId)).limit(1)).length > 0
      : targetType === 'event'
        ? (await db.select({ id: events.id }).from(events).where(eq(events.id, targetId)).limit(1)).length > 0
        : targetType === 'status'
          ? (await db.select({ id: statuses.id }).from(statuses).where(eq(statuses.id, targetId)).limit(1)).length > 0
          : (await db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1)).length > 0
  if (!exists) {
    res.status(404).json({ error: `That ${targetType} could not be found.` })
    return
  }

  const [report] = await db
    .insert(reports)
    .values({ reporterId: req.userId!, targetType, targetId, reason, details: details ?? '' })
    .returning()

  res.status(201).json({ report })
})

// A reporter's own submitted reports, so they can see whether anything came of it —
// surfaced in Account > My Reports on the frontend.
reportsRouter.get('/mine', requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(reports)
    .where(eq(reports.reporterId, req.userId!))
    .orderBy(desc(reports.createdAt))
  res.json({ reports: rows })
})
