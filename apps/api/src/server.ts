import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { attachUser } from './lib/auth'
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

const app = express()

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

app.use('/api/auth', authRouter)
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

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` })
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

const port = Number(process.env.PORT) || 4000
app.listen(port, () => {
  console.log(`DEALEONE API listening on http://localhost:${port}`)
})
