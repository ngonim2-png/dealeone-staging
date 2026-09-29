import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { fieldAgents } from '../db/schema'

// Field-agent codes are 8 characters ("AG" + 6), so they can never clash with a user's
// 7-character invite code (lib/referrals.ts) even though both go in the same box at signup.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function newAgentCode(): string {
  let s = 'AG'
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return s
}

/** The active agent a typed/linked code belongs to, if any. */
export async function agentForCode(code: string | undefined | null): Promise<string | null> {
  const c = (code ?? '').trim().toUpperCase()
  if (!/^AG[A-Z0-9]{6}$/.test(c)) return null
  const [a] = await db.select({ id: fieldAgents.id, active: fieldAgents.active }).from(fieldAgents).where(eq(fieldAgents.code, c)).limit(1)
  return a && a.active ? a.id : null
}

/** Normalises a utm_source-style value to something safe to store and group by. */
export function cleanTag(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase().replace(/[^a-z0-9_.\-]/g, '-').replace(/-+/g, '-').slice(0, max)
  return t && t !== '-' ? t : null
}
