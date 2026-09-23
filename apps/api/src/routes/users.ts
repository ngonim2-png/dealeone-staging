import { Router } from 'express'
import { and, desc, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import {
  events,
  listingPayments,
  listings,
  statuses,
  users,
  verificationRequests,
  wishlistEntries,
} from '../db/schema'
import { requireAuth } from '../lib/auth'
import { omitPinHash } from '../lib/sanitize'
import { verifyPinHash } from '../lib/pin'

export const usersRouter = Router()

usersRouter.get('/me', requireAuth, async (req, res) => {
  const [u] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1)
  if (!u) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json({ user: omitPinHash(u) })
})

// Used right after a first-time OTP verification to collect the new user's name — the
// account is created immediately on verify (so it has an id/session), then completed here.
// `isBusiness`/`businessName` were added this round: previously a real user could never
// actually register as a business through the app at all — the field only ever existed as
// seed data. This is the "Business account" toggle in a new Settings page
// (apps/web/src/pages/account/Settings.tsx), which also gates the banner-ad and
// buyer-request-priority-access purchases in routes/listings.ts / routes/buyerRequests.ts.
const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    location: z.string().trim().min(1).max(120).optional(),
    isBusiness: z.boolean().optional(),
    businessName: z.string().trim().max(120).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update.' })
  .refine((v) => !(v.isBusiness === true && !v.businessName), {
    message: 'businessName is required when enabling a business account.',
  })

usersRouter.patch('/me', requireAuth, async (req, res) => {
  const parsed = updateMeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const patch: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.isBusiness === false) patch.businessName = null
  const [updated] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, req.userId!))
    .returning()
  res.json({ user: omitPinHash(updated) })
})

// Account deletion (Apple App Store guideline 5.1.1(v); Google Play's Data Safety section
// expects the equivalent). Reauthenticates with the account's own PIN first — the same
// credential the app already uses everywhere else, and exactly the kind of "reauthenticate
// for security/accidental-deletion prevention" step Apple's own guidance calls out as fine
// to require. See schema.ts's users.deletedAt for why this anonymizes the row in place
// rather than hard-deleting it: this user's id is a real, non-nullable FK on dozens of other
// people's rows (their own conversations, offers, ratings, reports about this user) that
// must stay intact for their own history — hard-deleting the row would either violate those
// foreign keys outright or require cascading deletes into data that isn't this user's to
// remove. Anonymizing satisfies the actual requirement (the account and its personal data
// are gone, and it can never be signed into or looked up as this person again) without
// corrupting anyone else's records.
const deleteMeSchema = z.object({ pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits') })

usersRouter.delete('/me', requireAuth, async (req, res) => {
  const parsed = deleteMeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const [u] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1)
  if (!u) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  if (!verifyPinHash(parsed.data.pin, u.pinHash)) {
    // Deliberately 403, not 401: the caller IS authenticated (requireAuth already passed) —
    // this is a *reauthentication* check failing, not a missing/invalid session. The
    // frontend's api.ts request() wipes the stored session token on any 401 (on the
    // reasonable assumption that a 401 means the token itself is dead), which would
    // silently sign the user out of their still-valid session after one wrong-PIN attempt
    // and turn a correct retry into a bogus "Sign in required." 403 avoids that entirely.
    res.status(403).json({ error: 'Incorrect PIN.' })
    return
  }

  await db.transaction(async (tx) => {
    // The account record itself: every personally-identifying field scrubbed, phone freed
    // up (as a placeholder that can never collide with a real number) so the same phone can
    // be used to create a brand-new account later, PIN cleared so the old credential can
    // never authenticate again even before deletedAt's own check in lib/auth.ts kicks in.
    await tx
      .update(users)
      .set({
        name: 'Deleted User',
        phone: `deleted-${u.id}`,
        pinHash: null,
        avatarEmoji: '🙂',
        location: 'Unknown',
        isBusiness: false,
        businessName: null,
        verificationLevel: 0,
        verificationPriorityUntil: null,
        buyerRequestPriorityUntil: null,
        deletedAt: new Date(),
      })
      .where(eq(users.id, u.id))

    // Publicly-shared UGC this account controls, pulled down immediately (Apple's "content
    // shared publicly" clause): active/reserved/draft/etc. listings flip to 'removed' — the
    // same terminal state MyListings' own "Remove listing" button already uses — so they
    // stop appearing in search/map results right away. Already-'sold' listings are left
    // alone: they're historical transaction records for the *other* party (a real buyer's
    // purchase history), not public/browsable content any more either way.
    await tx
      .update(listings)
      .set({ status: 'removed' })
      .where(and(eq(listings.sellerId, u.id), ne(listings.status, 'sold')))

    // Any event they organize gets cancelled the same way.
    await tx.update(events).set({ status: 'cancelled' }).where(eq(events.organizerId, u.id))

    // Statuses are ephemeral 24h posts with no historical value to anyone else — delete
    // outright (status_views cascades on statusId, see schema.ts).
    await tx.delete(statuses).where(eq(statuses.userId, u.id))

    // Verification-request photos are literally an ID/business-document photo of this
    // specific person — delete the rows outright rather than merely anonymizing; nothing
    // else references verificationRequests.id so this is safe.
    await tx.delete(verificationRequests).where(eq(verificationRequests.userId, u.id))

    // Wishlist entries are private to this user alone — safe to remove outright.
    await tx.delete(wishlistEntries).where(eq(wishlistEntries.userId, u.id))
  })

  res.json({ ok: true })
})

// Billing history — reads the same listingPayments ledger built for the monetization round
// (listing fee renewals, Boost/Featured/Top-Placement/Banner purchases, the two account-
// scoped priority upgrades). Backs Account.tsx's "Payments" row, which previously linked to
// nothing at all (`to: '#'`) — there was no real payments screen anywhere in the app.
usersRouter.get('/me/payments', requireAuth, async (req, res) => {
  const rows = await db
    .select({
      payment: listingPayments,
      listingTitle: listings.title,
    })
    .from(listingPayments)
    .leftJoin(listings, eq(listingPayments.listingId, listings.id))
    .where(eq(listingPayments.sellerId, req.userId!))
    .orderBy(desc(listingPayments.createdAt))
    .limit(200)
  res.json({ payments: rows })
})

usersRouter.get('/:id', async (req, res) => {
  const [u] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1)
  if (!u) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const sellerListings = await db
    .select({ id: listings.id })
    .from(listings)
    .where(eq(listings.sellerId, u.id))
  res.json({ user: omitPinHash(u), listingsCount: sellerListings.length })
})
