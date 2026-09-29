import { Router } from 'express'
import { and, asc, desc, eq, gte, inArray, lt, lte, ne, or, ilike, sql } from 'drizzle-orm'
import { z } from 'zod'
import { isSafeImageValue } from '../lib/sanitize'
import { db } from '../db/client'
import { eventCategoryEnum, eventInterests, events, eventStatusEnum, reports, users } from '../db/schema'
import { eventDistanceKmExpr, safeCoord } from '../lib/geo'
import { requireAuth } from '../lib/auth'
import { normalizeImages } from '../lib/media'

export const eventsRouter = Router()

const DEFAULT_LAT = 8.4657 // Lumley, Freetown — used if the client doesn't send a location
const DEFAULT_LNG = -13.2983

const ORGANIZER_COLS = {
  id: users.id,
  name: users.name,
  avatarEmoji: users.avatarEmoji,
  isBusiness: users.isBusiness,
  verificationLevel: users.verificationLevel,
  rating: users.rating,
  ratingCount: users.ratingCount,
  location: users.location,
}

/** Interested-count + "did the current viewer already mark themselves interested" for a
 * batch of event ids — one grouped count query plus (only if signed in) one membership
 * query, rather than N+1 per event. Powers the interested/going number shown on every event
 * card and the filled-vs-outline state of EventDetail.tsx's "I'm interested" button. */
async function withInterestData<T extends { event: { id: string } }>(rows: T[], viewerUserId?: string) {
  const ids = rows.map((r) => r.event.id)
  if (ids.length === 0) return rows.map((r) => ({ ...r, interestedCount: 0, isInterested: false }))

  const counts = await db
    .select({ eventId: eventInterests.eventId, count: sql<number>`count(*)::int` })
    .from(eventInterests)
    .where(inArray(eventInterests.eventId, ids))
    .groupBy(eventInterests.eventId)
  const countMap = new Map(counts.map((c) => [c.eventId, c.count]))

  let mineSet = new Set<string>()
  if (viewerUserId) {
    const mine = await db
      .select({ eventId: eventInterests.eventId })
      .from(eventInterests)
      .where(and(inArray(eventInterests.eventId, ids), eq(eventInterests.userId, viewerUserId)))
    mineSet = new Set(mine.map((m) => m.eventId))
  }

  return rows.map((r) => ({
    ...r,
    interestedCount: countMap.get(r.event.id) ?? 0,
    isInterested: mineSet.has(r.event.id),
  }))
}

const csvOf = (allowed: readonly string[]) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : undefined))
    .refine((vals) => !vals || vals.every((x) => allowed.includes(x)), { message: 'Unknown value' })

// Validated against the real enums and finite numbers — `?status=bogus` or `?lat=1e400`
// used to reach Postgres and crash the API.
const querySchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90).optional(),
  lng: z.coerce.number().finite().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().finite().positive().optional(),
  categories: csvOf(eventCategoryEnum.enumValues),
  q: z.string().max(200).optional(),
  when: z.enum(['upcoming', 'past', 'all']).optional(), // default 'upcoming'
  sort: z.enum(['soonest', 'closest', 'newest']).optional(),
  organizerId: z.string().optional(),
  status: csvOf(eventStatusEnum.enumValues), // defaults to active
})

eventsRouter.get('/', async (req, res) => {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const q = parsed.data
  const lat = q.lat ?? DEFAULT_LAT
  const lng = q.lng ?? DEFAULT_LNG
  const radiusKm = q.radiusKm ?? 25000 // effectively "anywhere" if omitted
  const dist = eventDistanceKmExpr(lat, lng)
  const now = new Date()
  const when = q.when ?? 'upcoming'

  // Cancelled events are only listed for their own organizer (My Events).
  const own = !!req.userId && q.organizerId === req.userId
  const statusList = own && q.status?.length ? q.status : ['active']
  const conditions = [inArray(events.status, statusList as any), lte(dist, radiusKm)]

  if (when === 'upcoming') conditions.push(gte(events.startsAt, now))
  else if (when === 'past') conditions.push(lt(events.startsAt, now))

  if (q.categories?.length) conditions.push(inArray(events.category, q.categories as any))
  if (q.organizerId) conditions.push(eq(events.organizerId, q.organizerId))
  if (q.q) {
    conditions.push(
      or(
        ilike(events.title, `%${q.q}%`),
        ilike(events.description, `%${q.q}%`),
        ilike(events.venueName, `%${q.q}%`),
      )!,
    )
  }

  let orderBy
  switch (q.sort) {
    case 'closest':
      orderBy = asc(dist)
      break
    case 'newest':
      orderBy = desc(events.createdAt)
      break
    case 'soonest':
    default:
      orderBy = when === 'past' ? desc(events.startsAt) : asc(events.startsAt)
  }

  const rows = await db
    .select({ event: events, distanceKm: dist, organizer: ORGANIZER_COLS })
    .from(events)
    .innerJoin(users, eq(events.organizerId, users.id))
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(200)

  const results = await withInterestData(rows, req.userId)

  res.json({ results, count: results.length })
})

eventsRouter.get('/:id', async (req, res) => {
  const [row] = await db
    .select({ event: events, organizer: ORGANIZER_COLS })
    .from(events)
    .innerJoin(users, eq(events.organizerId, users.id))
    .where(eq(events.id, req.params.id))
    .limit(1)

  if (!row) {
    res.status(404).json({ error: 'Event not found' })
    return
  }

  const lat = safeCoord(req.query.lat, 90, DEFAULT_LAT)
  const lng = safeCoord(req.query.lng, 180, DEFAULT_LNG)
  const dist = eventDistanceKmExpr(lat, lng)
  const [{ distanceKm }] = await db
    .select({ distanceKm: dist })
    .from(events)
    .where(eq(events.id, req.params.id))
    .limit(1)

  const now = new Date()
  const similarRows = await db
    .select({ event: events, distanceKm: dist })
    .from(events)
    .where(
      and(
        eq(events.category, row.event.category),
        eq(events.status, 'active'),
        gte(events.startsAt, now),
        ne(events.id, req.params.id),
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(4)

  const [withMainInterest] = await withInterestData([row], req.userId)
  const similar = await withInterestData(similarRows, req.userId)

  res.json({
    ...withMainInterest,
    distanceKm,
    similar,
  })
})

const createEventSchema = z.object({
  category: z.enum(eventCategoryEnum.enumValues),
  title: z.string().trim().min(1).max(120),
  description: z.string().max(4000).default(''),
  venueName: z.string().trim().min(1).max(160),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  // Must be real dates — an unparseable string used to become an Invalid Date and crash the insert.
  startsAt: z.string().min(1).refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid start date'),
  endsAt: z.string().min(1).refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid end date').optional(),
  // e.g. [{ name: 'General', price: 50 }, { name: 'VIP', price: 150 }] — empty means free.
  ticketTiers: z
    .array(z.object({ name: z.string().min(1), price: z.number().int().nonnegative() }))
    .max(6)
    .default([]),
  images: z.array(z.string().max(3_000_000).refine(isSafeImageValue, 'Unsupported image')).max(5).default([]),
})

eventsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createEventSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const d = parsed.data
  const [created] = await db
    .insert(events)
    .values({
      organizerId: req.userId!,
      category: d.category,
      title: d.title,
      description: d.description,
      venueName: d.venueName,
      lat: d.lat,
      lng: d.lng,
      startsAt: new Date(d.startsAt),
      endsAt: d.endsAt ? new Date(d.endsAt) : undefined,
      ticketTiers: d.ticketTiers,
      images: await normalizeImages(d.images, req.userId!),
    })
    .returning()

  res.status(201).json({ event: created })
})

// Organizer-only — cancel (or reactivate) an event, same "no dead ends" convention as
// listings.ts's PATCH /:id/status.
eventsRouter.patch('/:id/status', requireAuth, async (req, res) => {
  const schema = z.object({ status: z.enum(['active', 'cancelled']) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const [existing] = await db.select().from(events).where(eq(events.id, req.params.id)).limit(1)
  if (!existing || existing.organizerId !== req.userId) {
    res.status(404).json({ error: 'Event not found' })
    return
  }
  // An event an admin took down after a report stays down — the organizer can't just flip
  // it back to active. (A report resolved as 'resolved' = actioned; 'dismissed' = no action.)
  if (parsed.data.status === 'active' && existing.status === 'cancelled') {
    const [moderated] = await db
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(reports.targetType, 'event'), eq(reports.targetId, existing.id), eq(reports.status, 'resolved')))
      .limit(1)
    if (moderated) {
      res.status(403).json({ error: 'This event was removed by moderators and can’t be reactivated.' })
      return
    }
  }
  const [updated] = await db
    .update(events)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(events.id, req.params.id))
    .returning()
  res.json({ event: updated })
})

// Toggles the current user's "interested/going" RSVP — one row per (user, event), see
// eventInterests in schema.ts. Returns the fresh count so the client can update the badge
// without a full reload.
eventsRouter.post('/:id/interested', requireAuth, async (req, res) => {
  const [existingEvent] = await db.select().from(events).where(eq(events.id, req.params.id)).limit(1)
  if (!existingEvent) {
    res.status(404).json({ error: 'Event not found' })
    return
  }
  const [existing] = await db
    .select()
    .from(eventInterests)
    .where(and(eq(eventInterests.eventId, req.params.id), eq(eventInterests.userId, req.userId!)))
    .limit(1)

  if (existing) {
    await db.delete(eventInterests).where(eq(eventInterests.id, existing.id))
  } else {
    await db.insert(eventInterests).values({ eventId: req.params.id, userId: req.userId! }).onConflictDoNothing()
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventInterests)
    .where(eq(eventInterests.eventId, req.params.id))

  res.json({ interested: !existing, interestedCount: count })
})
