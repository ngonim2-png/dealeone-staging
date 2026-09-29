import { Router } from 'express'
import { loadMedia } from '../lib/media'

export const mediaRouter = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Public, immutable, cache-forever: a media id never changes content, so phones (and the
// app's service worker) download each photo exactly once. ?size=thumb serves the small
// version used by cards and map pins. Ids are random UUIDs, so a voice note's URL can't be
// guessed by someone who wasn't in the conversation.
mediaRouter.get('/:id', async (req, res) => {
  const id = req.params.id
  if (!UUID_RE.test(id)) {
    res.status(404).end()
    return
  }
  const size = req.query.size === 'thumb' ? 'thumb' : 'full'
  const etag = `"${id}-${size}"`
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end()
    return
  }
  const found = await loadMedia(id, size)
  if (!found) {
    res.status(404).end()
    return
  }
  res.set({
    'Content-Type': found.mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: etag,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Accept-Ranges': 'bytes',
  })
  // Byte ranges: iPhone Safari won't play an <audio> file (voice notes, listing voice
  // descriptions) unless the server answers Range requests with 206 Partial Content.
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''))
  if (range && (range[1] || range[2])) {
    const total = found.body.length
    let start = range[1] ? Number(range[1]) : total - Number(range[2])
    let end = range[1] && range[2] ? Number(range[2]) : total - 1
    start = Math.max(0, start)
    end = Math.min(total - 1, end)
    if (start > end || start >= total) {
      res.status(416).set('Content-Range', `bytes */${total}`).end()
      return
    }
    res.status(206).set('Content-Range', `bytes ${start}-${end}/${total}`)
    res.send(found.body.subarray(start, end + 1))
    return
  }
  res.send(found.body)
})
