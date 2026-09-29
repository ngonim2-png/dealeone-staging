import { Router } from 'express'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { categoryEnum, savedSearches } from '../db/schema'
import { requireAuth } from '../lib/auth'

export const savedSearchesRouter = Router()

const MAX_PER_USER = 20

savedSearchesRouter.get('/', requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.userId, req.userId!))
    .orderBy(desc(savedSearches.createdAt))
  res.json({ savedSearches: rows })
})

const createSchema = z
  .object({
    query: z.string().trim().max(100).default(''),
    categories: z.array(z.enum(categoryEnum.enumValues)).max(10).default([]),
    maxPrice: z.number().int().positive().max(1_000_000_000).nullable().default(null),
    radiusKm: z.number().finite().positive().max(1000).default(5),
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
  })
  .refine((v) => v.query.length > 0 || v.categories.length > 0 || v.maxPrice != null, {
    message: 'Add a search word, a category or a max price to save a search.',
  })

savedSearchesRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  // Saving the exact same search twice just turns the existing one back on, instead of
  // creating a duplicate that would send every alert twice.
  const d = parsed.data
  const mine = await db.select().from(savedSearches).where(eq(savedSearches.userId, req.userId!))
  const sameCats = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()
  const dup = mine.find(
    (s) =>
      s.query.toLowerCase() === d.query.toLowerCase() &&
      sameCats(s.categories, d.categories) &&
      (s.maxPrice ?? null) === (d.maxPrice ?? null) &&
      s.radiusKm === d.radiusKm,
  )
  if (dup) {
    const [row] = await db
      .update(savedSearches)
      .set({ active: true, lat: d.lat, lng: d.lng })
      .where(eq(savedSearches.id, dup.id))
      .returning()
    res.json({ savedSearch: row })
    return
  }
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(savedSearches)
    .where(eq(savedSearches.userId, req.userId!))
  if (n >= MAX_PER_USER) {
    res.status(409).json({ error: `You can save up to ${MAX_PER_USER} searches — delete one first.` })
    return
  }
  const [row] = await db
    .insert(savedSearches)
    .values({ ...parsed.data, userId: req.userId! })
    .returning()
  res.status(201).json({ savedSearch: row })
})

savedSearchesRouter.patch('/:id', requireAuth, async (req, res) => {
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const [row] = await db
    .update(savedSearches)
    .set({ active: parsed.data.active })
    .where(and(eq(savedSearches.id, req.params.id), eq(savedSearches.userId, req.userId!)))
    .returning()
  if (!row) {
    res.status(404).json({ error: 'Saved search not found' })
    return
  }
  res.json({ savedSearch: row })
})

savedSearchesRouter.delete('/:id', requireAuth, async (req, res) => {
  // Scoped to the owner, so someone else's id simply matches nothing → 404.
  const gone = await db
    .delete(savedSearches)
    .where(and(eq(savedSearches.id, req.params.id), eq(savedSearches.userId, req.userId!)))
    .returning({ id: savedSearches.id })
  if (!gone.length) {
    res.status(404).json({ error: 'Saved search not found' })
    return
  }
  res.json({ ok: true })
})
