import { Router, type Request, type Response } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, pool } from '../db/client'
import { fieldAgents } from '../db/schema'
import { requireAdmin } from '../lib/auth'
import { newAgentCode } from '../lib/agents'
import { runReminders } from '../lib/reminders'

// Growth tooling for the team:
//  - Admin CSV exports (users / listings / payments / daily sign-ups) for spreadsheets and
//    for handing to Claude. Never includes PINs; phone numbers only for people who opted in
//    to marketing.
//  - Field agents: create agents, see who each one signed up and what those users spent.
//  - A read-only weekly summary (aggregates only, no personal data) that scheduled Claude
//    tasks can fetch with a secret token (REPORT_TOKEN env var).

export const adminGrowthRouter = Router()
adminGrowthRouter.use(requireAdmin)

function csv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = v instanceof Date ? v.toISOString() : String(v)
    // Neutralise spreadsheet formula injection (a cell starting with = + - @ runs as a formula).
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\r\n') + '\r\n'
}

function sendCsv(res: Response, name: string, body: string) {
  const day = new Date().toISOString().slice(0, 10)
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="dealeone-${name}-${day}.csv"`,
    'Cache-Control': 'no-store',
  })
  res.send('﻿' + body) // BOM so Excel opens UTF-8 (names, NLe) correctly
}

const EXPORTS: Record<string, { sql: string; columns: string[] }> = {
  users: {
    columns: [
      'user_id', 'name', 'joined', 'last_seen', 'location', 'is_business', 'business_name', 'verification_level',
      'signup_source', 'signup_campaign', 'agent_code', 'invited_by_friend', 'active_listings', 'total_listings',
      'total_paid_nle', 'marketing_opt_in', 'phone_if_opted_in',
    ],
    sql: `
      SELECT u.id AS user_id, u.name, u.created_at AS joined, u.last_seen_at AS last_seen, u.location,
             u.is_business, u.business_name, u.verification_level, u.signup_source, u.signup_campaign,
             a.code AS agent_code, (u.referred_by_id IS NOT NULL) AS invited_by_friend,
             (SELECT count(*) FROM listings l WHERE l.seller_id = u.id AND l.status = 'active') AS active_listings,
             (SELECT count(*) FROM listings l WHERE l.seller_id = u.id) AS total_listings,
             (SELECT coalesce(sum(p.amount), 0) FROM listing_payments p WHERE p.seller_id = u.id) AS total_paid_nle,
             u.marketing_opt_in,
             CASE WHEN u.marketing_opt_in THEN u.phone ELSE NULL END AS phone_if_opted_in
      FROM users u LEFT JOIN field_agents a ON a.id = u.agent_id
      WHERE u.deleted_at IS NULL
      ORDER BY u.created_at DESC`,
  },
  listings: {
    columns: [
      'listing_id', 'title', 'category', 'price_nle', 'status', 'created', 'fee_paid_until', 'seller_id', 'seller_name',
      'views_total', 'saves', 'chats', 'offers', 'boosted', 'featured', 'top_of_category', 'banner',
    ],
    sql: `
      SELECT l.id AS listing_id, l.title, l.category, l.price AS price_nle, l.status, l.created_at AS created,
             l.fee_paid_until, l.seller_id, u.name AS seller_name,
             (SELECT count(*) FROM listing_views v WHERE v.listing_id = l.id) AS views_total,
             (SELECT count(*) FROM wishlist_entries w WHERE w.listing_id = l.id) AS saves,
             (SELECT count(*) FROM conversations c WHERE c.listing_id = l.id) AS chats,
             (SELECT count(*) FROM offers o WHERE o.listing_id = l.id) AS offers,
             l.sponsored AS boosted, l.featured, l.category_pinned AS top_of_category, l.banner
      FROM listings l JOIN users u ON u.id = l.seller_id
      ORDER BY l.created_at DESC`,
  },
  payments: {
    columns: ['payment_id', 'date', 'kind', 'amount_nle', 'listing_id', 'listing_title', 'seller_id', 'seller_name', 'period_start', 'period_end'],
    sql: `
      SELECT p.id AS payment_id, p.created_at AS date, p.kind, p.amount AS amount_nle, p.listing_id,
             l.title AS listing_title, p.seller_id, u.name AS seller_name, p.period_start, p.period_end
      FROM listing_payments p JOIN users u ON u.id = p.seller_id LEFT JOIN listings l ON l.id = p.listing_id
      ORDER BY p.created_at DESC`,
  },
  'signups-daily': {
    columns: ['date', 'signups', 'opted_in', 'via_agent', 'via_friend_invite', 'first_listing_same_week'],
    sql: `
      SELECT to_char(date_trunc('day', u.created_at), 'YYYY-MM-DD') AS date,
             count(*) AS signups,
             count(*) FILTER (WHERE u.marketing_opt_in) AS opted_in,
             count(*) FILTER (WHERE u.agent_id IS NOT NULL) AS via_agent,
             count(*) FILTER (WHERE u.referred_by_id IS NOT NULL) AS via_friend_invite,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM listings l WHERE l.seller_id = u.id AND l.created_at < u.created_at + interval '7 days'
             )) AS first_listing_same_week
      FROM users u WHERE u.deleted_at IS NULL
      GROUP BY 1 ORDER BY 1 DESC`,
  },
}

adminGrowthRouter.get('/export/:name', async (req, res) => {
  const name = req.params.name.replace(/\.csv$/, '')
  const spec = EXPORTS[name]
  if (!spec) {
    res.status(404).json({ error: `Unknown export. Try: ${Object.keys(EXPORTS).join(', ')}` })
    return
  }
  const { rows } = await pool.query(spec.sql)
  sendCsv(res, name, csv(rows, spec.columns))
})

// ---- Field agents -------------------------------------------------------------------
const AGENT_STATS_SQL = `
  SELECT a.id, a.name, a.phone, a.region, a.code, a.active, a.created_at,
         count(u.id) AS signups,
         count(u.id) FILTER (WHERE u.created_at > now() - interval '30 days') AS signups_30d,
         count(u.id) FILTER (WHERE EXISTS (SELECT 1 FROM listings l WHERE l.seller_id = u.id)) AS sellers,
         coalesce((SELECT sum(p.amount) FROM listing_payments p JOIN users uu ON uu.id = p.seller_id
                   WHERE uu.agent_id = a.id), 0) AS paid_total,
         coalesce((SELECT sum(p.amount) FROM listing_payments p JOIN users uu ON uu.id = p.seller_id
                   WHERE uu.agent_id = a.id AND p.kind <> 'listing_fee'), 0) AS promotions_total,
         coalesce((SELECT sum(p.amount) FROM listing_payments p JOIN users uu ON uu.id = p.seller_id
                   WHERE uu.agent_id = a.id AND p.kind <> 'listing_fee'
                     AND p.created_at > now() - interval '30 days'), 0) AS promotions_30d
  FROM field_agents a LEFT JOIN users u ON u.agent_id = a.id AND u.deleted_at IS NULL
  GROUP BY a.id ORDER BY a.active DESC, signups DESC, a.created_at`

adminGrowthRouter.get('/agents', async (_req, res) => {
  const { rows } = await pool.query(AGENT_STATS_SQL)
  res.json({
    agents: rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      region: r.region,
      code: r.code,
      active: r.active,
      createdAt: r.created_at,
      signups: Number(r.signups),
      signups30d: Number(r.signups_30d),
      sellers: Number(r.sellers),
      paidTotal: Number(r.paid_total),
      promotionsTotal: Number(r.promotions_total),
      promotions30d: Number(r.promotions_30d),
    })),
    // Matches the financial model's assumption; shown as an estimate in the admin screen.
    commissionRate: 0.1,
  })
})

adminGrowthRouter.get('/export-agents', async (_req, res) => {
  const { rows } = await pool.query(AGENT_STATS_SQL)
  const out = rows.map((r) => ({ ...r, commission_estimate_30d: Math.round(Number(r.promotions_30d) * 0.1) }))
  sendCsv(res, 'agents', csv(out, ['name', 'code', 'region', 'phone', 'active', 'signups', 'signups_30d', 'sellers', 'paid_total', 'promotions_total', 'promotions_30d', 'commission_estimate_30d']))
})

const newAgentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).optional(),
  region: z.string().trim().max(60).optional(),
})

adminGrowthRouter.post('/agents', async (req, res) => {
  const parsed = newAgentSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [row] = await db
        .insert(fieldAgents)
        .values({ ...parsed.data, code: newAgentCode() })
        .returning()
      res.status(201).json({ agent: row })
      return
    } catch (err) {
      if ((err as { code?: string }).code !== '23505') throw err // retry only on a code clash
    }
  }
  res.status(500).json({ error: "Couldn't create a unique code — try again." })
})

adminGrowthRouter.patch('/agents/:id', async (req, res) => {
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const [row] = await db.update(fieldAgents).set({ active: parsed.data.active }).where(eq(fieldAgents.id, req.params.id)).returning()
  if (!row) {
    res.status(404).json({ error: 'Agent not found' })
    return
  }
  res.json({ agent: row })
})

// ---- Weekly summary for automated reports --------------------------------------------
export const statsRouter = Router()

function tokenOk(req: Request): boolean {
  const expected = process.env.REPORT_TOKEN?.trim()
  if (!expected || expected.length < 24) return false
  const given = String(req.header('x-report-token') ?? req.query.token ?? '')
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function buildSummary() {
  const one = async (sql: string) => (await pool.query(sql)).rows[0]
  const many = async (sql: string) => (await pool.query(sql)).rows
  const n = (v: unknown) => Number(v ?? 0)
  const users = await one(`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE created_at > now() - interval '7 days') AS new_7d,
           count(*) FILTER (WHERE created_at > now() - interval '30 days') AS new_30d,
           count(*) FILTER (WHERE last_seen_at > now() - interval '7 days') AS active_7d,
           count(*) FILTER (WHERE last_seen_at > now() - interval '30 days') AS active_30d,
           count(*) FILTER (WHERE marketing_opt_in) AS opted_in,
           count(*) FILTER (WHERE is_business) AS businesses
    FROM users WHERE deleted_at IS NULL`)
  const listings = await one(`
    SELECT count(*) FILTER (WHERE status = 'active') AS live,
           count(*) FILTER (WHERE created_at > now() - interval '7 days') AS new_7d,
           count(*) FILTER (WHERE status = 'expired') AS expired,
           count(*) FILTER (WHERE status = 'sold' AND updated_at > now() - interval '30 days') AS sold_30d,
           count(DISTINCT seller_id) FILTER (WHERE status = 'active') AS sellers_live
    FROM listings`)
  // Renewal rate: of listings whose first paid period ended in the last 30 days, how many
  // bought another period. The single number the financial model says matters most.
  const renewal = await one(`
    WITH firsts AS (
      SELECT listing_id, min(period_end) AS first_end, count(*) AS periods
      FROM listing_payments WHERE kind = 'listing_fee' AND listing_id IS NOT NULL GROUP BY listing_id
    )
    SELECT count(*) AS due, count(*) FILTER (WHERE periods > 1) AS renewed
    FROM firsts WHERE first_end > now() - interval '30 days' AND first_end <= now()`)
  const revenue = await many(`
    SELECT kind, sum(amount) FILTER (WHERE created_at > now() - interval '7 days') AS d7,
                 sum(amount) FILTER (WHERE created_at > now() - interval '30 days') AS d30,
                 count(*) FILTER (WHERE created_at > now() - interval '30 days') AS count_30d
    FROM listing_payments GROUP BY kind ORDER BY kind`)
  const sources = await many(`
    SELECT coalesce(signup_source, 'unknown') AS source, count(*) AS signups_30d,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM listings l WHERE l.seller_id = users.id)) AS became_sellers
    FROM users WHERE deleted_at IS NULL AND created_at > now() - interval '30 days'
    GROUP BY 1 ORDER BY 2 DESC`)
  const agents = await many(`
    SELECT a.name, a.code, count(u.id) AS signups_30d
    FROM field_agents a LEFT JOIN users u ON u.agent_id = a.id AND u.created_at > now() - interval '30 days'
    WHERE a.active GROUP BY a.id ORDER BY 3 DESC`)
  const engagement = await one(`
    SELECT (SELECT count(*) FROM messages WHERE created_at > now() - interval '7 days') AS messages_7d,
           (SELECT count(*) FROM offers WHERE created_at > now() - interval '7 days') AS offers_7d,
           (SELECT count(*) FROM saved_searches WHERE active) AS saved_searches_active,
           (SELECT count(*) FROM users WHERE referred_by_id IS NOT NULL AND created_at > now() - interval '30 days') AS invites_30d`)
  const due = n(renewal.due)
  return {
    generatedAt: new Date().toISOString(),
    currency: 'NLe',
    users: Object.fromEntries(Object.entries(users).map(([k, v]) => [k, n(v)])),
    listings: Object.fromEntries(Object.entries(listings).map(([k, v]) => [k, n(v)])),
    renewal: { due30d: due, renewed30d: n(renewal.renewed), rate: due ? n(renewal.renewed) / due : null },
    revenue: revenue.map((r) => ({ kind: r.kind, last7d: n(r.d7), last30d: n(r.d30), payments30d: n(r.count_30d) })),
    signupSources30d: sources.map((s) => ({ source: s.source, signups: n(s.signups_30d), becameSellers: n(s.became_sellers) })),
    agents30d: agents.map((a) => ({ name: a.name, code: a.code, signups: n(a.signups_30d) })),
    engagement: Object.fromEntries(Object.entries(engagement).map(([k, v]) => [k, n(v)])),
    note: 'Payments are simulated until Monime is connected.',
  }
}

statsRouter.get('/summary', async (req, res) => {
  if (!tokenOk(req)) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.set('Cache-Control', 'no-store')
  res.json(await buildSummary())
})

// Trigger the reminder run from outside (e.g. a Render cron job or a scheduled task), since a
// sleeping free-tier server can't fire its own 30-minute timer.
statsRouter.post('/run-reminders', async (req, res) => {
  if (!tokenOk(req)) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(await runReminders())
})

adminGrowthRouter.post('/run-reminders', async (req, res) => {
  res.json(await runReminders({ force: req.query.force === '1' }))
})

adminGrowthRouter.get('/summary', async (_req, res) => {
  res.json(await buildSummary())
})
