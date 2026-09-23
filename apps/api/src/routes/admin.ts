import { Router } from 'express'
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { conversations, disputes, events, listings, reports, statuses, users, verificationRequests } from '../db/schema'
import { requireAdmin } from '../lib/auth'
import { omitPinHash } from '../lib/sanitize'

export const adminRouter = Router()
adminRouter.use(requireAdmin)

// --- Reports -------------------------------------------------------------

adminRouter.get('/reports', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  const rows = await db
    .select({
      report: reports,
      reporter: { id: users.id, name: users.name, phone: users.phone },
    })
    .from(reports)
    .innerJoin(users, eq(reports.reporterId, users.id))
    .where(status ? eq(reports.status, status as any) : undefined)
    .orderBy(desc(reports.createdAt))
    .limit(200)

  // Resolve each report's target (a listing title, an event title, a status's caption, or a
  // user's name/phone) for display — targetId isn't a real FK (see schema.ts) so this can't
  // be a plain join.
  const listingIds = rows.filter((r) => r.report.targetType === 'listing').map((r) => r.report.targetId)
  const eventIds = rows.filter((r) => r.report.targetType === 'event').map((r) => r.report.targetId)
  const statusIds = rows.filter((r) => r.report.targetType === 'status').map((r) => r.report.targetId)
  const userIds = rows.filter((r) => r.report.targetType === 'user').map((r) => r.report.targetId)
  const listingRows = listingIds.length
    ? await db
        .select({ id: listings.id, title: listings.title, status: listings.status })
        .from(listings)
        .where(inArray(listings.id, listingIds))
    : []
  const eventRows = eventIds.length
    ? await db
        .select({ id: events.id, title: events.title, status: events.status })
        .from(events)
        .where(inArray(events.id, eventIds))
    : []
  const statusRows = statusIds.length
    ? await db
        .select({ id: statuses.id, caption: statuses.caption, userId: statuses.userId })
        .from(statuses)
        .where(inArray(statuses.id, statusIds))
    : []
  const userRows = userIds.length
    ? await db
        .select({ id: users.id, name: users.name, phone: users.phone, suspended: users.suspended })
        .from(users)
        .where(inArray(users.id, userIds))
    : []
  const listingById = new Map(listingRows.map((l) => [l.id, l]))
  const eventById = new Map(eventRows.map((e) => [e.id, e]))
  const statusById = new Map(statusRows.map((s) => [s.id, s]))
  const userById = new Map(userRows.map((u) => [u.id, u]))

  res.json({
    reports: rows.map((r) => ({
      ...r,
      target:
        r.report.targetType === 'listing'
          ? listingById.get(r.report.targetId) ?? null
          : r.report.targetType === 'event'
            ? eventById.get(r.report.targetId) ?? null
            : r.report.targetType === 'status'
              ? statusById.get(r.report.targetId) ?? null
              : userById.get(r.report.targetId) ?? null,
    })),
  })
})

const resolveReportSchema = z.object({
  status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']),
  resolutionNote: z.string().max(1000).optional(),
  action: z.enum(['remove_listing', 'cancel_event', 'remove_status', 'suspend_user', 'none']).default('none'),
})

adminRouter.patch('/reports/:id', async (req, res) => {
  const parsed = resolveReportSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const [existing] = await db.select().from(reports).where(eq(reports.id, req.params.id)).limit(1)
  if (!existing) {
    res.status(404).json({ error: 'Report not found' })
    return
  }
  const { status, resolutionNote, action } = parsed.data

  if (action === 'remove_listing' && existing.targetType === 'listing') {
    await db.update(listings).set({ status: 'removed', updatedAt: new Date() }).where(eq(listings.id, existing.targetId))
  } else if (action === 'cancel_event' && existing.targetType === 'event') {
    await db.update(events).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(events.id, existing.targetId))
  } else if (action === 'remove_status' && existing.targetType === 'status') {
    await db.delete(statuses).where(eq(statuses.id, existing.targetId))
  } else if (action === 'suspend_user') {
    // Applies whether the report's direct target was a user, a listing, an event, or a
    // status — suspending the *seller*/*organizer*/*poster* of a reported item is usually
    // what an admin means by "suspend the bad actor" when the report was filed against the
    // thing itself rather than the user directly.
    if (existing.targetType === 'user') {
      await db.update(users).set({ suspended: true }).where(eq(users.id, existing.targetId))
    } else if (existing.targetType === 'event') {
      const [event] = await db.select({ organizerId: events.organizerId }).from(events).where(eq(events.id, existing.targetId)).limit(1)
      if (event) await db.update(users).set({ suspended: true }).where(eq(users.id, event.organizerId))
    } else if (existing.targetType === 'status') {
      const [statusRow] = await db.select({ userId: statuses.userId }).from(statuses).where(eq(statuses.id, existing.targetId)).limit(1)
      if (statusRow) await db.update(users).set({ suspended: true }).where(eq(users.id, statusRow.userId))
    } else {
      const [listing] = await db.select({ sellerId: listings.sellerId }).from(listings).where(eq(listings.id, existing.targetId)).limit(1)
      if (listing) await db.update(users).set({ suspended: true }).where(eq(users.id, listing.sellerId))
    }
  }

  const [updated] = await db
    .update(reports)
    .set({
      status,
      resolutionNote: resolutionNote ?? existing.resolutionNote,
      resolvedByAdminId: req.userId!,
      resolvedAt: status === 'open' || status === 'reviewing' ? null : new Date(),
    })
    .where(eq(reports.id, req.params.id))
    .returning()

  res.json({ report: updated })
})

// --- Disputes --------------------------------------------------------------

adminRouter.get('/disputes', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  const rows = await db
    .select({
      dispute: disputes,
      conversation: conversations,
      listing: { id: listings.id, title: listings.title },
    })
    .from(disputes)
    .innerJoin(conversations, eq(disputes.conversationId, conversations.id))
    .innerJoin(listings, eq(conversations.listingId, listings.id))
    .where(status ? eq(disputes.status, status as any) : undefined)
    .orderBy(desc(disputes.createdAt))
    .limit(200)

  const partyIds = Array.from(
    new Set(rows.flatMap((r) => [r.conversation.buyerId, r.conversation.sellerId, r.dispute.raisedByUserId])),
  )
  const partyRows = partyIds.length
    ? await db.select({ id: users.id, name: users.name, phone: users.phone }).from(users)
    : []
  const partyById = new Map(partyRows.map((u) => [u.id, u]))

  res.json({
    disputes: rows.map((r) => ({
      ...r,
      buyer: partyById.get(r.conversation.buyerId) ?? null,
      seller: partyById.get(r.conversation.sellerId) ?? null,
      raisedBy: partyById.get(r.dispute.raisedByUserId) ?? null,
    })),
  })
})

const resolveDisputeSchema = z.object({
  status: z.enum(['open', 'in_review', 'resolved_buyer', 'resolved_seller', 'resolved_other', 'dismissed']),
  resolutionNote: z.string().max(1000).optional(),
})

adminRouter.patch('/disputes/:id', async (req, res) => {
  const parsed = resolveDisputeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const [existing] = await db.select().from(disputes).where(eq(disputes.id, req.params.id)).limit(1)
  if (!existing) {
    res.status(404).json({ error: 'Dispute not found' })
    return
  }
  const { status, resolutionNote } = parsed.data
  const resolved = !['open', 'in_review'].includes(status)

  const [updated] = await db
    .update(disputes)
    .set({
      status,
      resolutionNote: resolutionNote ?? existing.resolutionNote,
      resolvedByAdminId: req.userId!,
      resolvedAt: resolved ? new Date() : null,
    })
    .where(eq(disputes.id, req.params.id))
    .returning()

  res.json({ dispute: updated })
})

// --- Users -------------------------------------------------------------

adminRouter.get('/users', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      role: users.role,
      suspended: users.suspended,
      verificationLevel: users.verificationLevel,
      isBusiness: users.isBusiness,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(q ? or(ilike(users.name, `%${q}%`), ilike(users.phone, `%${q}%`)) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(100)
  res.json({ users: rows })
})

const updateUserSchema = z.object({ suspended: z.boolean() })

adminRouter.patch('/users/:id', async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  if (req.params.id === req.userId && parsed.data.suspended) {
    res.status(400).json({ error: "You can't suspend your own account." })
    return
  }
  const [updated] = await db
    .update(users)
    .set({ suspended: parsed.data.suspended })
    .where(eq(users.id, req.params.id))
    .returning()
  if (!updated) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  // Found while wiring up omitPinHash elsewhere this round: this endpoint was returning the
  // full users row, salted pinHash included, straight to the admin client — the same class
  // of bug #11 in the project doc already flagged and fixed on several other routes, but
  // this one was missed at the time.
  res.json({ user: omitPinHash(updated) })
})

// --- Listings ------------------------------------------------------------

adminRouter.get('/listings', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  const rows = await db
    .select({
      listing: listings,
      seller: { id: users.id, name: users.name, phone: users.phone },
    })
    .from(listings)
    .innerJoin(users, eq(listings.sellerId, users.id))
    .where(and(q ? ilike(listings.title, `%${q}%`) : undefined, status ? eq(listings.status, status as any) : undefined))
    .orderBy(desc(listings.createdAt))
    .limit(100)
  // Admin sees real coordinates — presentListing's fuzzing is a buyer-facing privacy
  // measure, not something that should hide data from moderation.
  res.json({ listings: rows })
})

const updateListingStatusSchema = z.object({
  status: z.enum(['draft', 'pending_payment', 'active', 'reserved', 'sold', 'expired', 'removed']),
})

adminRouter.patch('/listings/:id/status', async (req, res) => {
  const parsed = updateListingStatusSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const [updated] = await db
    .update(listings)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(listings.id, req.params.id))
    .returning()
  if (!updated) {
    res.status(404).json({ error: 'Listing not found' })
    return
  }
  res.json({ listing: updated })
})

// --- Verification requests ------------------------------------------------

// Mirrors the reports/disputes review pattern above. Sorted priority-first (the "Verified-
// seller fast-track" paid upgrade, routes/verificationRequests.ts's POST /priority) then
// oldest-first within each group, so a paying user's request jumps the queue but two paying
// users are still served fairly in order.
adminRouter.get('/verification-requests', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'pending'
  const rows = await db
    .select({
      request: verificationRequests,
      requester: { id: users.id, name: users.name, phone: users.phone, verificationLevel: users.verificationLevel },
    })
    .from(verificationRequests)
    .innerJoin(users, eq(verificationRequests.userId, users.id))
    .where(status === 'all' ? undefined : eq(verificationRequests.status, status as any))
    .orderBy(desc(verificationRequests.priority), verificationRequests.createdAt)
    .limit(200)
  res.json({ verificationRequests: rows })
})

const resolveVerificationSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  resolutionNote: z.string().max(1000).optional(),
})

adminRouter.patch('/verification-requests/:id', async (req, res) => {
  const parsed = resolveVerificationSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const [existing] = await db
    .select()
    .from(verificationRequests)
    .where(eq(verificationRequests.id, req.params.id))
    .limit(1)
  if (!existing) {
    res.status(404).json({ error: 'Verification request not found' })
    return
  }
  if (existing.status !== 'pending') {
    res.status(400).json({ error: 'This request has already been reviewed.' })
    return
  }

  const [updatedRequest] = await db
    .update(verificationRequests)
    .set({
      status: parsed.data.status,
      resolutionNote: parsed.data.resolutionNote ?? null,
      resolvedByAdminId: req.userId!,
      resolvedAt: new Date(),
    })
    .where(eq(verificationRequests.id, req.params.id))
    .returning()

  if (parsed.data.status === 'approved') {
    // Only actually raises the level — never lowers it, in case an approval lands after the
    // user's level already moved for some other reason in the meantime.
    const [requester] = await db.select().from(users).where(eq(users.id, existing.userId)).limit(1)
    if (requester && existing.targetLevel > requester.verificationLevel) {
      await db.update(users).set({ verificationLevel: existing.targetLevel }).where(eq(users.id, existing.userId))
    }
  }

  res.json({ verificationRequest: updatedRequest })
})
