import { Router } from 'express'
import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { conversations, listingPayments, listingViews, listings, offers, wishlistEntries } from '../db/schema'
import { requireAuth } from '../lib/auth'

export const insightsRouter = Router()

const DAY_MS = 86_400_000
const dayKey = (d: Date) => d.toISOString().slice(0, 10)

// Seller insights: how each of my listings is doing — views, saves, chats, offers — and
// whether paid promotion actually brought more people (average views per day while
// promoted vs not promoted).
insightsRouter.get('/listings', requireAuth, async (req, res) => {
  const mine = await db
    .select()
    .from(listings)
    .where(and(eq(listings.sellerId, req.userId!), inArray(listings.status, ['active', 'reserved', 'sold', 'expired'])))
  if (!mine.length) {
    res.json({ listings: [], totals: { views: 0, views7d: 0, saves: 0, chats: 0, offers: 0 } })
    return
  }
  const ids = mine.map((l) => l.id)
  const since = new Date(Date.now() - 60 * DAY_MS)

  const viewRows = await db
    .select({ listingId: listingViews.listingId, day: listingViews.day, n: sql<number>`count(*)::int` })
    .from(listingViews)
    .where(and(inArray(listingViews.listingId, ids), gte(listingViews.createdAt, since)))
    .groupBy(listingViews.listingId, listingViews.day)
  const totalViews = await db
    .select({ listingId: listingViews.listingId, n: sql<number>`count(*)::int` })
    .from(listingViews)
    .where(inArray(listingViews.listingId, ids))
    .groupBy(listingViews.listingId)
  const saves = await db
    .select({ listingId: wishlistEntries.listingId, n: sql<number>`count(*)::int` })
    .from(wishlistEntries)
    .where(inArray(wishlistEntries.listingId, ids))
    .groupBy(wishlistEntries.listingId)
  const chats = await db
    .select({ listingId: conversations.listingId, n: sql<number>`count(*)::int` })
    .from(conversations)
    .where(inArray(conversations.listingId, ids))
    .groupBy(conversations.listingId)
  const offerRows = await db
    .select({ listingId: offers.listingId, n: sql<number>`count(*)::int` })
    .from(offers)
    .where(inArray(offers.listingId, ids))
    .groupBy(offers.listingId)
  const promos = await db
    .select()
    .from(listingPayments)
    .where(and(inArray(listingPayments.listingId, ids), inArray(listingPayments.kind, ['boost', 'featured', 'category_pin', 'banner_ad'])))

  const count = (rows: { listingId: string | null; n: number }[], id: string) => rows.find((r) => r.listingId === id)?.n ?? 0
  const today = dayKey(new Date())
  const weekAgo = dayKey(new Date(Date.now() - 6 * DAY_MS))

  const out = mine.map((l) => {
    const byDay = new Map(viewRows.filter((v) => v.listingId === l.id).map((v) => [v.day, v.n]))
    const views7d = [...byDay.entries()].filter(([d]) => d >= weekAgo && d <= today).reduce((a, [, n]) => a + n, 0)
    // Promotion effect over the last 60 days the listing existed.
    const start = Math.max(l.createdAt.getTime(), since.getTime())
    const promoted = new Set<string>()
    for (const p of promos.filter((p) => p.listingId === l.id)) {
      for (let t = p.periodStart.getTime(); t < p.periodEnd.getTime(); t += DAY_MS) promoted.add(dayKey(new Date(t)))
    }
    let promotedDays = 0
    let promotedViews = 0
    let normalDays = 0
    let normalViews = 0
    for (let t = start; t <= Date.now(); t += DAY_MS) {
      const d = dayKey(new Date(t))
      const v = byDay.get(d) ?? 0
      if (promoted.has(d)) {
        promotedDays++
        promotedViews += v
      } else {
        normalDays++
        normalViews += v
      }
    }
    // Last 14 days, oldest first, for a small sparkline.
    const daily: number[] = []
    for (let i = 13; i >= 0; i--) daily.push(byDay.get(dayKey(new Date(Date.now() - i * DAY_MS))) ?? 0)
    return {
      id: l.id,
      title: l.title,
      price: l.price,
      status: l.status,
      images: l.images,
      views: count(totalViews, l.id),
      views7d,
      saves: count(saves, l.id),
      chats: count(chats, l.id),
      offers: count(offerRows, l.id),
      daily,
      promotion:
        promotedDays > 0
          ? {
              promotedDays,
              avgViewsPromoted: +(promotedViews / promotedDays).toFixed(1),
              avgViewsNormal: normalDays ? +(normalViews / normalDays).toFixed(1) : null,
            }
          : null,
    }
  })
  const sum = (k: 'views' | 'views7d' | 'saves' | 'chats' | 'offers') => out.reduce((a, l) => a + l[k], 0)
  res.json({
    listings: out.sort((a, b) => b.views7d - a.views7d || b.views - a.views),
    totals: { views: sum('views'), views7d: sum('views7d'), saves: sum('saves'), chats: sum('chats'), offers: sum('offers') },
  })
})
