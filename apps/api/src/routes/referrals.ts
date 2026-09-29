import { Router } from 'express'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { users } from '../db/schema'
import { requireAuth } from '../lib/auth'
import { ensureReferralCode } from '../lib/referrals'

export const referralsRouter = Router()

referralsRouter.get('/me', requireAuth, async (req, res) => {
  const code = await ensureReferralCode(req.userId!)
  const [{ invited }] = await db
    .select({ invited: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.referredById, req.userId!))
  const [{ rewarded }] = await db
    .select({ rewarded: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.referredById, req.userId!), isNotNull(users.referralRewardedAt)))
  const [me] = await db.select({ boostCredits: users.boostCredits }).from(users).where(eq(users.id, req.userId!)).limit(1)
  res.json({ code, invited, rewarded, boostCredits: me?.boostCredits ?? 0 })
})
