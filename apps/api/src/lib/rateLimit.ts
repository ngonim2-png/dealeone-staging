// Per-IP rate limiting for the auth endpoints. The per-phone PIN lockout in pinAttempts.ts
// stops someone hammering ONE account, but not someone cycling guesses across MANY
// accounts from one machine (5 guesses per phone per 5 min, times thousands of phones).
// Same in-memory tradeoff as pinAttempts.ts: fine for a single API instance; move to
// Redis if the API ever runs more than one process.
import type { NextFunction, Request, Response } from 'express'

interface Bucket {
  hits: number[]
}
const buckets = new Map<string, Bucket>()

function hit(key: string, windowMs: number): number {
  const now = Date.now()
  const b = buckets.get(key) ?? { hits: [] }
  b.hits = b.hits.filter((t) => now - t < windowMs)
  b.hits.push(now)
  buckets.set(key, b)
  return b.hits.length
}

function count(key: string, windowMs: number): number {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b) return 0
  b.hits = b.hits.filter((t) => now - t < windowMs)
  return b.hits.length
}

// Keep the map from growing forever.
setInterval(() => {
  const now = Date.now()
  for (const [k, b] of buckets) {
    if (!b.hits.length || now - b.hits[b.hits.length - 1] > 60 * 60 * 1000) buckets.delete(k)
  }
}, 10 * 60 * 1000).unref()

/** General request cap for auth endpoints: 60 requests / minute / IP. */
export function authRateLimit(req: Request, res: Response, next: NextFunction) {
  if (hit(`req:${req.ip}`, 60_000) > 60) {
    res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' })
    return
  }
  next()
}

const FAILED_WINDOW_MS = 15 * 60 * 1000
const MAX_FAILED_PER_IP = 20

/** True if this IP has had too many failed PIN attempts (across any accounts) recently. */
export function ipLoginBlocked(ip: string | undefined): boolean {
  return count(`fail:${ip}`, FAILED_WINDOW_MS) >= MAX_FAILED_PER_IP
}

export function recordIpFailure(ip: string | undefined): void {
  hit(`fail:${ip}`, FAILED_WINDOW_MS)
}
