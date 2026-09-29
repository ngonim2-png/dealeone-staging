// Referral rewards: invite a seller with your code/link; when they publish their first
// listing you get a free week of Boost (a boost credit, used from My Listings/Promote).
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { randomInt } from 'node:crypto'
import { db } from '../db/client'
import { users } from '../db/schema'
import { notify } from './notify'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I — easy to read aloud and type

function makeCode(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'D')
  let tail = ''
  for (let i = 0; i < 4; i++) tail += ALPHABET[randomInt(ALPHABET.length)]
  return letters + tail
}

/** The user's invite code, created the first time it's asked for. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const [u] = await db.select({ code: users.referralCode, name: users.name }).from(users).where(eq(users.id, userId)).limit(1)
  if (!u) throw new Error('User not found')
  if (u.code) return u.code
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeCode(u.name)
    try {
      const [row] = await db
        .update(users)
        .set({ referralCode: code })
        .where(and(eq(users.id, userId), isNull(users.referralCode)))
        .returning({ code: users.referralCode })
      if (row?.code) return row.code
      // someone (another tab) set it meanwhile — read it back
      const [again] = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1)
      if (again?.code) return again.code
    } catch {
      // unique collision — try another code
    }
  }
  throw new Error('Could not create a referral code')
}

/** Finds who owns an invite code (case-insensitive). */
export async function referrerForCode(code: string | undefined | null): Promise<string | null> {
  const c = (code ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9]{4,12}$/.test(c)) return null
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.referralCode, c)).limit(1)
  return u?.id ?? null
}

/** Called after a listing is published. The first time a referred user publishes, the
 * referrer earns one boost credit. Conditional update = exactly once. Never throws. */
export async function rewardReferrerOnFirstListing(userId: string): Promise<void> {
  try {
    const [row] = await db
      .update(users)
      .set({ referralRewardedAt: new Date() })
      .where(and(eq(users.id, userId), isNotNull(users.referredById), isNull(users.referralRewardedAt)))
      .returning({ referrerId: users.referredById, name: users.name })
    if (!row?.referrerId) return
    await db
      .update(users)
      .set({ boostCredits: sql`${users.boostCredits} + 1` })
      .where(eq(users.id, row.referrerId))
    await notify(row.referrerId, {
      type: 'referral',
      title: 'You earned a free week of Boost 🎁',
      body: `${row.name} joined with your invite and posted their first listing. Use it from My Listings.`,
      url: '/account/listings',
    })
  } catch (err) {
    console.error('referral reward failed', err)
  }
}
