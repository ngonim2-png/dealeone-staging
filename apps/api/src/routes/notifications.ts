import { Router } from 'express'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { notifications, pushSubscriptions } from '../db/schema'
import { requireAuth } from '../lib/auth'
import { vapidKeys } from '../lib/push'

export const notificationsRouter = Router()

notificationsRouter.get('/', requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, req.userId!))
    .orderBy(desc(notifications.createdAt))
    .limit(60)
  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, req.userId!), eq(notifications.read, false)))
  res.json({ notifications: rows, unreadCount: unread })
})

notificationsRouter.post('/read-all', requireAuth, async (req, res) => {
  await db.update(notifications).set({ read: true }).where(eq(notifications.userId, req.userId!))
  res.json({ ok: true })
})

notificationsRouter.patch('/:id/read', requireAuth, async (req, res) => {
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, req.userId!)))
  res.json({ ok: true })
})

// --- Phone push ------------------------------------------------------------------

notificationsRouter.get('/push/public-key', async (_req, res) => {
  const { publicKey } = await vapidKeys()
  res.json({ publicKey })
})

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
})

notificationsRouter.post('/push/subscribe', requireAuth, async (req, res) => {
  const parsed = subscriptionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { endpoint, keys } = parsed.data
  // Same device re-subscribing (or switching accounts) replaces the old row.
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
  await db.insert(pushSubscriptions).values({ userId: req.userId!, endpoint, p256dh: keys.p256dh, auth: keys.auth })
  res.status(201).json({ ok: true })
})

notificationsRouter.post('/push/unsubscribe', requireAuth, async (req, res) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : ''
  if (endpoint) {
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, req.userId!)))
  }
  res.json({ ok: true })
})
