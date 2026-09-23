import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET

if (!SECRET) {
  // Fail loudly in a way that's easy to grep in logs rather than silently signing
  // tokens with a guessable default — but don't crash local dev if someone forgot to
  // copy .env.example, since that's a common first-run stumble.
  console.warn(
    '[auth] JWT_SECRET is not set — using an insecure development-only default. ' +
      'Set a real JWT_SECRET before deploying (see apps/api/.env.example).',
  )
}

const EFFECTIVE_SECRET = SECRET || 'dev-insecure-secret-change-me'
const SESSION_TTL = '30d'

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, EFFECTIVE_SECRET, { expiresIn: SESSION_TTL })
}

export function verifySession(token: string): string | null {
  try {
    const payload = jwt.verify(token, EFFECTIVE_SECRET) as { sub?: string }
    return payload.sub ?? null
  } catch {
    return null
  }
}
