import type { NextFunction, Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { users } from '../db/schema'
import { verifySession } from './jwt'

// Real session auth: the frontend completes the phone-OTP flow (routes/auth.ts), gets a
// signed JWT back, and sends it as `Authorization: Bearer <token>` on every request. This
// replaces the earlier MVP stand-in that trusted a plain `x-user-id` header from the client.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string
      userRole?: 'user' | 'admin'
      userSuspended?: boolean
    }
  }
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
  if (token) {
    const userId = verifySession(token)
    if (userId) {
      const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
      // A deleted account (see schema.ts's users.deletedAt) is never attached — this is
      // what stops a JWT issued before deletion from being replayed afterward, since the
      // row itself is anonymized in place rather than hard-deleted (see routes/users.ts's
      // DELETE /me), so `u` above is still found by id. Treating it as "not signed in"
      // rather than adding a separate token-invalidation mechanism keeps this a one-line
      // check in the one place all auth already flows through.
      if (u && !u.deletedAt) {
        req.userId = u.id
        req.userRole = u.role
        req.userSuspended = u.suspended
      }
    }
  }
  next()
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    res.status(401).json({ error: 'Sign in required.' })
    return
  }
  if (req.userSuspended) {
    res.status(403).json({ error: 'This account has been suspended.' })
    return
  }
  next()
}

// Gate for the moderation panel (routes/admin.ts) — checked in addition to requireAuth's
// suspended check, not instead of it, so a suspended admin account is still locked out.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    res.status(401).json({ error: 'Sign in required.' })
    return
  }
  if (req.userSuspended) {
    res.status(403).json({ error: 'This account has been suspended.' })
    return
  }
  if (req.userRole !== 'admin') {
    res.status(403).json({ error: 'Admin access required.' })
    return
  }
  next()
}
