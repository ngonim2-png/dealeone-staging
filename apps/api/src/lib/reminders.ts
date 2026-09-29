// Automatic reminder messages — small nudges that keep listings live and bring people back.
// They go to the in-app bell (and a phone push if the app is closed) via lib/notify.ts.
//
// Kinds (each sent at most once per thing, see reminder_log's unique index):
//  - fee_expiring   a listing's paid time ends within 24 hours → renew
//  - expired        a listing went offline in the last 3 days → renew to bring it back
//  - no_listing     signed up 2–14 days ago and never listed → list something
//  - boost_nudge    a listing got 10+ views in 7 days but no chats → try a Boost
//  - invite_prompt  an active seller for 7+ days who hasn't invited anyone → invite friends
//
// Guard rails: at most one reminder per person per day (renewal reminders first, since they
// protect revenue), only between 08:00 and 20:00 Freetown time (GMT), deleted and suspended
// accounts skipped. These are app notifications about the person's own account, not
// SMS/WhatsApp marketing, so they don't need the marketing opt-in.
//
// Runs every 30 minutes while the server is awake (server.ts), and can be triggered from
// outside with POST /api/stats/run-reminders + the REPORT_TOKEN (for a cron job, since a
// sleeping free-tier server can't run its own timer).
import { pool } from '../db/client'
import { notify, type NotifyInput } from './notify'
import { BOOST_FEE_PER_WEEK, LISTING_FEE_PER_WEEK } from './billing'

interface Candidate {
  userId: string
  kind: string
  refId: string
  message: NotifyInput
}

const PRIORITY = ['fee_expiring', 'expired', 'no_listing', 'boost_nudge', 'invite_prompt']

export function inSendingHours(now = new Date()): boolean {
  const h = now.getUTCHours() // Sierra Leone is GMT all year
  return h >= 8 && h < 20
}

async function candidates(): Promise<Candidate[]> {
  const out: Candidate[] = []
  const q = async (sql: string) => (await pool.query(sql)).rows

  for (const r of await q(`
    SELECT l.id, l.title, l.seller_id, to_char(l.fee_paid_until, 'YYYY-MM-DD') AS until
    FROM listings l JOIN users u ON u.id = l.seller_id
    WHERE l.status = 'active' AND l.fee_paid_until > now() AND l.fee_paid_until <= now() + interval '24 hours'
      AND u.deleted_at IS NULL AND NOT u.suspended`)) {
    out.push({
      userId: r.seller_id,
      kind: 'fee_expiring',
      refId: `${r.id}:${r.until}`,
      message: {
        type: 'reminder',
        title: `“${r.title}” goes offline tomorrow`,
        body: `Renew from NLe ${LISTING_FEE_PER_WEEK} a week to keep it visible to buyers near you.`,
        url: '/account/listings',
      },
    })
  }

  for (const r of await q(`
    SELECT l.id, l.title, l.seller_id, to_char(l.fee_paid_until, 'YYYY-MM-DD') AS until
    FROM listings l JOIN users u ON u.id = l.seller_id
    WHERE l.status = 'expired' AND l.fee_paid_until <= now() AND l.fee_paid_until > now() - interval '3 days'
      AND u.deleted_at IS NULL AND NOT u.suspended`)) {
    out.push({
      userId: r.seller_id,
      kind: 'expired',
      refId: `${r.id}:${r.until}`,
      message: {
        type: 'reminder',
        title: `“${r.title}” is hidden from buyers`,
        body: 'Its paid time ran out. Renew it in one tap to put it back on the map.',
        url: '/account/listings',
      },
    })
  }

  for (const r of await q(`
    SELECT u.id FROM users u
    WHERE u.deleted_at IS NULL AND NOT u.suspended AND u.name <> 'New User'
      AND u.created_at < now() - interval '48 hours' AND u.created_at > now() - interval '14 days'
      AND NOT EXISTS (SELECT 1 FROM listings l WHERE l.seller_id = u.id)`)) {
    out.push({
      userId: r.id,
      kind: 'no_listing',
      refId: '',
      message: {
        type: 'reminder',
        title: 'Got something to sell?',
        body: 'Take a photo, add a price, and people near you can find it on the map. It takes about two minutes.',
        url: '/sell',
      },
    })
  }

  for (const r of await q(`
    SELECT l.id, l.title, l.seller_id, count(v.*) AS views
    FROM listings l
    JOIN users u ON u.id = l.seller_id
    JOIN listing_views v ON v.listing_id = l.id AND v.created_at > now() - interval '7 days'
    WHERE l.status = 'active' AND NOT l.sponsored AND l.created_at < now() - interval '3 days'
      AND u.deleted_at IS NULL AND NOT u.suspended
      AND NOT EXISTS (SELECT 1 FROM conversations c WHERE c.listing_id = l.id AND c.created_at > now() - interval '7 days')
    GROUP BY l.id HAVING count(v.*) >= 10`)) {
    out.push({
      userId: r.seller_id,
      kind: 'boost_nudge',
      refId: r.id,
      message: {
        type: 'reminder',
        title: `${Number(r.views)} people looked at “${r.title}” this week`,
        body: `No one has messaged yet. A Boost puts it at the top of the map for NLe ${BOOST_FEE_PER_WEEK} a week — or try a clearer photo or price.`,
        url: '/account/listings',
      },
    })
  }

  for (const r of await q(`
    SELECT u.id FROM users u
    WHERE u.deleted_at IS NULL AND NOT u.suspended AND u.created_at < now() - interval '7 days'
      AND EXISTS (SELECT 1 FROM listings l WHERE l.seller_id = u.id AND l.status = 'active')
      AND NOT EXISTS (SELECT 1 FROM users f WHERE f.referred_by_id = u.id)`)) {
    out.push({
      userId: r.id,
      kind: 'invite_prompt',
      refId: '',
      message: {
        type: 'reminder',
        title: 'Know other sellers? Earn free Boosts',
        body: 'Invite them to DEALEONE. When they post their first listing, you get a free Boost week.',
        url: '/account/invite',
      },
    })
  }
  return out
}

export async function runReminders(opts: { force?: boolean } = {}): Promise<{ sent: number; skipped: string | null }> {
  if (!opts.force && !inSendingHours()) return { sent: 0, skipped: 'outside sending hours (08:00–20:00)' }
  const all = await candidates()
  if (!all.length) return { sent: 0, skipped: null }
  // Who already got a reminder in the last 20 hours — at most one a day each.
  const recent = new Set(
    (
      await pool.query(`SELECT DISTINCT user_id FROM reminder_log WHERE sent_at > now() - interval '20 hours'`)
    ).rows.map((r) => r.user_id as string),
  )
  all.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))
  let sent = 0
  for (const c of all) {
    if (recent.has(c.userId)) continue
    // Claim it first: the unique index makes this safe even if two servers run at once.
    const claimed = await pool.query(
      `INSERT INTO reminder_log (id, user_id, kind, ref_id) VALUES (gen_random_uuid()::text, $1, $2, $3)
       ON CONFLICT DO NOTHING RETURNING id`,
      [c.userId, c.kind, c.refId],
    )
    if (!claimed.rowCount) continue
    recent.add(c.userId)
    await notify(c.userId, c.message)
    sent++
  }
  return { sent, skipped: null }
}

export function startReminderTimer() {
  const tick = () => runReminders().catch((err) => console.error('reminders failed', err))
  setTimeout(tick, 60_000) // shortly after boot, then every 30 minutes
  return setInterval(tick, 30 * 60_000)
}
