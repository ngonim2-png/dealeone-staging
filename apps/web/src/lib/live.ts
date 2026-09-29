// Client for the API's real-time stream (GET /api/live, Server-Sent Events). Uses fetch
// streaming rather than EventSource so the session token travels in the Authorization
// header, not the URL. Reconnects automatically with backoff, and again when the phone
// comes back online or the app returns to the foreground.
import { BASE_URL, getSessionToken } from './api'

export type LiveEvent = { type: string; [k: string]: any }

export function connectLive(onEvent: (e: LiveEvent) => void, onReconnect: () => void): () => void {
  let stopped = false
  let controller: AbortController | null = null
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let connectedOnce = false

  const schedule = () => {
    if (stopped) return
    const delay = Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500
    attempt++
    timer = setTimeout(run, delay)
  }

  const run = async () => {
    if (stopped) return
    const token = getSessionToken()
    if (!token) return
    controller = new AbortController()
    try {
      const res = await fetch(`${BASE_URL}/api/live`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!res.ok || !res.body) throw new Error(`live ${res.status}`)
      attempt = 0
      if (connectedOnce) onReconnect() // catch up on anything missed while disconnected
      connectedOnce = true
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const data = frame
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart())
            .join('\n')
          if (!data) continue
          try {
            onEvent(JSON.parse(data))
          } catch {
            // ignore a malformed frame
          }
        }
      }
    } catch {
      // network drop / server restart — fall through to reconnect
    }
    if (!stopped) schedule()
  }

  const reconnectNow = () => {
    if (stopped) return
    if (timer) clearTimeout(timer)
    controller?.abort()
    attempt = 0
    run()
  }
  const onVisible = () => document.visibilityState === 'visible' && reconnectNow()
  window.addEventListener('online', reconnectNow)
  document.addEventListener('visibilitychange', onVisible)

  run()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    controller?.abort()
    window.removeEventListener('online', reconnectNow)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
