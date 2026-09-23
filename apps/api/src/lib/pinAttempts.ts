// In-memory failed-PIN-attempt lockout, mirroring the old otpStore.ts's tradeoffs: a plain
// per-process Map is fine because losing lockout state on a restart just means a brute-forcer
// gets a few more free guesses, not a security hole that persists — and it avoids standing up
// Redis for something this small. Swap for Redis if the API ever runs multiple instances (the
// same caveat already noted for otpStore historically applied here).
//
// A 4-digit PIN is only 10,000 possibilities and there's no OTP step proving phone ownership
// any more (see routes/auth.ts), so this lockout — not the hash itself — is the real defense
// against someone just guessing a stranger's PIN.

interface AttemptEntry {
  count: number
  lockedUntil: number | null
}

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 5 * 60 * 1000
const store = new Map<string, AttemptEntry>()

/** Returns the epoch-ms the lockout lifts, or null if not currently locked. */
export function lockedUntil(phone: string): number | null {
  const e = store.get(phone)
  if (e?.lockedUntil && Date.now() < e.lockedUntil) return e.lockedUntil
  if (e?.lockedUntil && Date.now() >= e.lockedUntil) {
    store.delete(phone) // lockout expired — reset cleanly on next check
  }
  return null
}

export function recordFailedAttempt(phone: string): void {
  const e = store.get(phone) ?? { count: 0, lockedUntil: null }
  e.count += 1
  if (e.count >= MAX_ATTEMPTS) {
    e.lockedUntil = Date.now() + LOCKOUT_MS
    e.count = 0
  }
  store.set(phone, e)
}

export function clearAttempts(phone: string): void {
  store.delete(phone)
}
