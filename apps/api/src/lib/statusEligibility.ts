import { and, eq, gt, or } from 'drizzle-orm'
import { db } from '../db/client'
import { listings, users } from '../db/schema'

// Shared by routes/statuses.ts's GET / (the `canPost` flag shown in the UI) and POST / (the
// real server-side gate — the frontend's own check is only ever a UI convenience, same
// convention as presentListing's approxLocation enforcement elsewhere in this app). A
// business account with at least one *currently active* paid promotion — Boost, Featured,
// Top Search Placement, or a Banner ad on one of their own listings, or either of the two
// account-scoped promotions (Verified-seller fast-track, Buyer-Request priority access) —
// can post a status. Deliberately an "OR across every promotion type" check rather than
// tied to one specific promotion, since the ask was "people who paid for promotion," not
// "people who bought this exact one."
export async function isEligibleForStatus(userId: string): Promise<boolean> {
  const [user] = await db
    .select({
      isBusiness: users.isBusiness,
      verificationPriorityUntil: users.verificationPriorityUntil,
      buyerRequestPriorityUntil: users.buyerRequestPriorityUntil,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user?.isBusiness) return false

  const now = new Date()
  if (user.verificationPriorityUntil && user.verificationPriorityUntil > now) return true
  if (user.buyerRequestPriorityUntil && user.buyerRequestPriorityUntil > now) return true

  // Nullable `*Until` columns naturally fail a `gt(column, now)` comparison in SQL (NULL > x
  // is NULL, not true), so a listing that's merely `sponsored: true` in seed data with no
  // real `sponsoredUntil` (see schema.ts's comment on that column) correctly doesn't count
  // here — only a real, currently-active paid-through date does.
  const [activeListingPromo] = await db
    .select({ id: listings.id })
    .from(listings)
    .where(
      and(
        eq(listings.sellerId, userId),
        or(
          gt(listings.sponsoredUntil, now),
          gt(listings.featuredUntil, now),
          gt(listings.categoryPinnedUntil, now),
          gt(listings.bannerUntil, now),
        ),
      ),
    )
    .limit(1)
  return !!activeListingPromo
}
