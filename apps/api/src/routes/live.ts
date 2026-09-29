import { Router } from 'express'
import { requireAuth } from '../lib/auth'
import { addClient } from '../lib/live'

export const liveRouter = Router()

// The app's real-time channel (see lib/live.ts). A streaming response that stays open;
// the client reconnects automatically if it drops.
liveRouter.get('/', requireAuth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // don't let a proxy buffer the stream
  })
  res.flushHeaders()
  res.write(`retry: 5000\nevent: ready\ndata: {"type":"ready"}\n\n`)
  const remove = addClient(req.userId!, res)
  req.on('close', remove)
})
