import 'dotenv/config'
// Must be imported before any router is created: patches Express 4 so an error thrown
// (or a promise rejected) inside an async route handler is passed to the error handler
// below instead of becoming an unhandled rejection — which on Node 22 kills the whole
// process. Before this, one malformed request (e.g. GET /api/events?status=bogus) took
// the API down for everyone.
import 'express-async-errors'
import express from 'express'
import cors from 'cors'
import { attachUser } from './lib/auth'
import { authRateLimit } from './lib/rateLimit'
import { authRouter } from './routes/auth'
import { usersRouter } from './routes/users'
import { listingsRouter } from './routes/listings'
import { eventsRouter } from './routes/events'
import { offersRouter } from './routes/offers'
import { conversationsRouter } from './routes/conversations'
import { wishlistRouter } from './routes/wishlist'
import { buyerRequestsRouter } from './routes/buyerRequests'
import { reportsRouter } from './routes/reports'
import { disputesRouter } from './routes/disputes'
import { adminRouter } from './routes/admin'
import { ratingsRouter } from './routes/ratings'
import { verificationRequestsRouter } from './routes/verificationRequests'
import { statusesRouter } from './routes/statuses'
import { mediaRouter } from './routes/media'
import { liveRouter } from './routes/live'
import { savedSearchesRouter } from './routes/savedSearches'
import { referralsRouter } from './routes/referrals'
import { insightsRouter } from './routes/insights'
import { assistRouter } from './routes/assist'
import { rateCard } from './lib/billing'
import { adminGrowthRouter, statsRouter } from './routes/growth'
import { startReminderTimer } from './lib/reminders'
import { notificationsRouter } from './routes/notifications'
import { backfillMedia } from './lib/mediaBackfill'

const app = express()
// Render (and most hosts) put the API behind a proxy — without this, req.ip is the proxy's
// address and per-IP rate limiting would lump every user together.
app.set('trust proxy', 1)

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
  }),
)
// Default 100kb JSON limit is too small for voice notes and listing photos, both of which
// arrive as base64 data URLs in the request body (see messages.audioUrl in schema.ts, and
// the Sell flow's camera/gallery capture in apps/web/src/lib/media.ts) — bumped well above
// what a short recorded clip or a few compressed photos need.
app.use(express.json({ limit: '20mb' }))
app.use(attachUser)

app.get('/health', (_req, res) => res.json({ ok: true }))
// Current prices, so the app never shows a stale price (see lib/billing.ts).
app.get('/api/rate-card', (_req, res) => res.json(rateCard()))

app.use('/api/auth', authRateLimit, authRouter)
app.use('/api/users', usersRouter)
app.use('/api/listings', listingsRouter)
app.use('/api/events', eventsRouter)
app.use('/api/offers', offersRouter)
app.use('/api/conversations', conversationsRouter)
app.use('/api/wishlist', wishlistRouter)
app.use('/api/buyer-requests', buyerRequestsRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/disputes', disputesRouter)
app.use('/api/ratings', ratingsRouter)
app.use('/api/verification-requests', verificationRequestsRouter)
app.use('/api/statuses', statusesRouter)
app.use('/api/admin', adminRouter)
app.use('/api/media', mediaRouter)
app.use('/api/live', liveRouter)
app.use('/api/saved-searches', savedSearchesRouter)
app.use('/api/referrals', referralsRouter)
app.use('/api/insights', insightsRouter)
app.use('/api/assist', assistRouter)
app.use('/api/admin/growth', adminGrowthRouter)
app.use('/api/stats', statsRouter)
app.use('/api/notifications', notificationsRouter)

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` })
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Malformed JSON body from express.json()
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' })
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Upload too large' })
  // Postgres errors that mean "the client sent something invalid" rather than "the server
  // broke" — an unknown enum value, a malformed number/date, an out-of-range coordinate —
  // become a 400 instead of a 500. A unique-constraint race (two taps at once) is a 409.
  const code: string | undefined = err?.code ?? err?.cause?.code
  if (code === '22P02' || code === '22003' || code === '22007' || code === '22008' || code === '23514') {
    return res.status(400).json({ error: 'Invalid request parameters' })
  }
  if (code === '23505') return res.status(409).json({ error: 'That was already done' })
  if (code === '23503') return res.status(400).json({ error: 'Referenced item does not exist' })
  console.error(`[${req.method} ${req.path}]`, err)
  res.status(500).json({ error: 'Internal server error' })
})

// Last-resort safety net: log, don't die. A stray rejection outside a request (a timer, a
// fire-and-forget promise) should never take the API offline for every user.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
})

const port = Number(process.env.PORT) || 4000
app.listen(port, () => {
  console.log(`DEALEONE API listening on http://localhost:${port}`)
  backfillMedia().catch((err) => console.error('media backfill failed', err))
  if (process.env.REMINDERS !== 'off') startReminderTimer()
})
