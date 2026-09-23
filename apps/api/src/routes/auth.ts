import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { users } from '../db/schema'
import { hashPin, verifyPinHash } from '../lib/pin'
import { clearAttempts, lockedUntil, recordFailedAttempt } from '../lib/pinAttempts'
import { signSession } from '../lib/jwt'
import { omitPinHash } from '../lib/sanitize'

export const authRouter = Router()

// Phone + self-chosen 4-digit PIN — replaces the earlier phone-OTP flow (spec §45/§30). No
// code is texted or shown on screen any more: the user picks their own PIN at signup, and the
// device just stays signed in afterward (the JWT in localStorage already had a 30-day expiry —
// see lib/jwt.ts — so "same device opens straight in" was mostly already true; this removes
// the OTP-entry step in between). Worth being honest about the tradeoff: the old OTP was
// already mocked (shown directly in the response instead of texted — see the previous version
// of this file), so it never actually proved phone ownership either. This isn't a real security
// downgrade from what was actually running; it *is* a downgrade from what real SMS-verified OTP
// would provide, so if a real SMS provider gets wired up later, re-adding a one-time signup
// verification step (kept separate from daily login) would be the natural next step — see the
// build log for this round.

const phoneSchema = z.object({ phone: z.string().min(6) })
const pinSchema = z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits')

function lockoutResponse(phone: string): { locked: true; retryAfterSec: number } | null {
  const until = lockedUntil(phone)
  if (!until) return null
  return { locked: true, retryAfterSec: Math.ceil((until - Date.now()) / 1000) }
}

// Lets the login screen ask "does this phone already have an account?" before deciding
// whether to show a PIN-creation step or a PIN-entry step.
authRouter.post('/check', async (req, res) => {
  const parsed = phoneSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const [user] = await db.select().from(users).where(eq(users.phone, parsed.data.phone)).limit(1)
  res.json({ exists: !!user })
})

const signupSchema = z.object({ phone: z.string().min(6), pin: pinSchema })

authRouter.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { phone, pin } = parsed.data

  const [existing] = await db.select().from(users).where(eq(users.phone, phone)).limit(1)
  if (existing) {
    res.status(409).json({ error: 'An account with this number already exists — sign in instead.' })
    return
  }

  const [user] = await db
    .insert(users)
    .values({
      phone,
      name: 'New User',
      location: 'Freetown',
      pinHash: hashPin(pin),
      verificationLevel: 1, // phone provided, per spec §30 Level 1 — see note above re: OTP
    })
    .returning()

  const token = signSession(user.id)
  res.status(201).json({ token, user: omitPinHash(user), isNewUser: true })
})

const loginSchema = z.object({ phone: z.string().min(6), pin: pinSchema })

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { phone, pin } = parsed.data

  const locked = lockoutResponse(phone)
  if (locked) {
    res.status(423).json({
      error: `Too many incorrect PIN attempts. Try again in ${Math.ceil(locked.retryAfterSec / 60)} minute(s).`,
    })
    return
  }

  const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1)
  if (!user || !verifyPinHash(pin, user.pinHash)) {
    recordFailedAttempt(phone)
    res.status(401).json({ error: 'Incorrect phone number or PIN.' })
    return
  }

  if (user.suspended) {
    res.status(403).json({ error: 'This account has been suspended. Contact support if you think this is a mistake.' })
    return
  }

  clearAttempts(phone)
  const token = signSession(user.id)
  res.json({ token, user: omitPinHash(user), isNewUser: false })
})
