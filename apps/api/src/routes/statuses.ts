import { Router } from 'express'
import { and, eq, gt, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { statuses, statusViews, users } from '../db/schema'
import { requireAuth } from '../lib/auth'
import { isEligibleForStatus } from '../lib/statusEligibility'

export const statusesRouter = Router()

const POSTER_COLS = {
  id: users.id,
  name: users.name,
  avatarEmoji: users.avatarEmoji,
  isBusiness: users.isBusiness,
  verificationLevel: users.verificationLevel,
  rating: users.rating,
  ratingCount: users.ratingCount,
  location: users.location,
}

// GET / — every currently-active (expiresAt > now) status, grouped by poster, plus whether
// the current viewer is themselves eligible to post one (see isEligibleForStatus). Grouped
// server-side rather than left to the frontend, since "which statuses belong to which
// poster, in what order, all-viewed or not" is exactly the shape StatusRow.tsx/
// StatusViewer.tsx need and there's no reason to re-derive it client-side from a flat list.
statusesRouter.get('/', requireAuth, async (req, res) => {
  const now = new Date()
  const rows = await db
    .select({ status: statuses, poster: POSTER_COLS })
    .from(statuses)
    .innerJoin(users, eq(statuses.userId, users.id))
    .where(gt(statuses.expiresAt, now))
    .orderBy(statuses.createdAt)

  const statusIds = rows.map((r) => r.status.id)
  const viewedRows = statusIds.length
    ? await db
        .select({ statusId: statusViews.statusId })
        .from(statusViews)
        .where(and(eq(statusViews.viewerId, req.userId!), inArray(statusViews.statusId, statusIds)))
    : []
  const viewedSet = new Set(viewedRows.map((v) => v.statusId))

  const groupsByUser = new Map<string, { userId: string; statuses: any[] }>()
  const postersById = new Map<string, (typeof rows)[number]['poster']>()
  for (const r of rows) {
    postersById.set(r.poster.id, r.poster)
    const g = groupsByUser.get(r.status.userId) ?? { userId: r.status.userId, statuses: [] }
    g.statuses.push({ ...r.status, viewedByMe: viewedSet.has(r.status.id) })
    groupsByUser.set(r.status.userId, g)
  }

  // Current viewer's own group (if any) always first, then everyone else with any unviewed
  // status ahead of fully-seen posters — mirrors the ordering people already expect from
  // WhatsApp/Instagram Status. Ties otherwise keep the rows' natural createdAt-ascending
  // grouping order (roughly "who posted most recently" reading left to right per poster).
  const groups = Array.from(groupsByUser.values())
    .map((g) => ({ userId: g.userId, allViewed: g.statuses.every((s) => s.viewedByMe), statuses: g.statuses }))
    .sort((a, b) => {
      if (a.userId === req.userId) return -1
      if (b.userId === req.userId) return 1
      if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1
      return 0
    })

  const canPost = await isEligibleForStatus(req.userId!)

  res.json({ canPost, groups, posters: Array.from(postersById.values()) })
})

const createStatusSchema = z.object({
  // Compressed base64 data URL from StatusComposer.tsx (same capture/compress pattern as
  // listing/event photos — see apps/web/src/lib/media.ts). Capped here as a backstop behind
  // that client-side compression, same size cap listings' images already use.
  imageUrl: z
    .string()
    .min(1)
    .max(3_000_000)
    .refine((v) => v.startsWith('data:image'), { message: 'imageUrl must be a data:image URL' }),
  caption: z.string().max(200).default(''),
})

statusesRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createStatusSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const eligible = await isEligibleForStatus(req.userId!)
  if (!eligible) {
    res.status(403).json({
      error:
        'Posting a status needs a business account with an active paid promotion (Boost, Featured, Top Placement, Banner ad, Buyer-Request priority, or Verified-seller priority).',
    })
    return
  }
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const [created] = await db
    .insert(statuses)
    .values({ userId: req.userId!, imageUrl: parsed.data.imageUrl, caption: parsed.data.caption, expiresAt })
    .returning()
  res.status(201).json({ status: created })
})

// Owner-only early removal — a real "no dead ends" action rather than only ever being able
// to wait out the 24h window.
statusesRouter.delete('/:id', requireAuth, async (req, res) => {
  const [existing] = await db.select().from(statuses).where(eq(statuses.id, req.params.id)).limit(1)
  if (!existing || existing.userId !== req.userId) {
    res.status(404).json({ error: 'Status not found' })
    return
  }
  await db.delete(statuses).where(eq(statuses.id, req.params.id))
  res.status(204).end()
})

// Marks a status as seen by the current viewer — called once per slide from
// StatusViewer.tsx. onConflictDoNothing so reopening an already-viewed status is a harmless
// no-op rather than a duplicate-key error.
statusesRouter.post('/:id/view', requireAuth, async (req, res) => {
  const [existing] = await db.select({ id: statuses.id }).from(statuses).where(eq(statuses.id, req.params.id)).limit(1)
  if (!existing) {
    res.status(404).json({ error: 'Status not found' })
    return
  }
  await db.insert(statusViews).values({ statusId: req.params.id, viewerId: req.userId! }).onConflictDoNothing()
  res.status(204).end()
})
