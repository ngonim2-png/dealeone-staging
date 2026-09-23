import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

// Salted PIN hashing via Node's built-in scrypt — no extra dependency (no bcrypt/argon2 in
// package.json, and adding a native-binding package risks the same "blocked binary
// download" problem that ruled out Prisma for this project — see the build log's stack
// decisions). scrypt is deliberately slow/memory-hard, which matters here: a 4-digit PIN is
// only 10,000 possibilities, so the hash needs to be expensive to brute-force offline even
// though request-rate lockout (see pinAttempts.ts) is the main defense in practice.

const KEY_LEN = 32

export function hashPin(pin: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(pin, salt, KEY_LEN)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPinHash(pin: string, stored: string | null): boolean {
  if (!stored) return false
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const candidate = scryptSync(pin, salt, expected.length)
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}
