// Real-time updates to open apps (Server-Sent Events). Each signed-in app keeps one
// streaming request open to GET /api/live; the server pushes small JSON events down it —
// new chat messages, offer updates, notifications — so screens update instantly instead of
// only when reopened. In-memory, per process: fine for one API instance (move the fan-out
// to Postgres LISTEN/NOTIFY or Redis if the API ever runs several instances).
import type { Response } from 'express'

type LiveEvent = { type: string; [k: string]: unknown }

const clients = new Map<string, Set<Response>>()

export function addClient(userId: string, res: Response): () => void {
  let set = clients.get(userId)
  if (!set) {
    set = new Set()
    clients.set(userId, set)
  }
  set.add(res)
  return () => {
    set!.delete(res)
    if (set!.size === 0) clients.delete(userId)
  }
}

/** True if this user has the app open right now (used to skip redundant phone pushes). */
export function isOnline(userId: string): boolean {
  return (clients.get(userId)?.size ?? 0) > 0
}

export function publish(userId: string, event: LiveEvent): void {
  const set = clients.get(userId)
  if (!set) return
  const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
  for (const res of set) {
    try {
      res.write(frame)
    } catch {
      // connection already gone; its close handler removes it
    }
  }
}

// Keep connections alive through proxies/load balancers that drop idle streams.
setInterval(() => {
  for (const set of clients.values()) {
    for (const res of set) {
      try {
        res.write(': ping\n\n')
      } catch {
        // ignore
      }
    }
  }
}, 25_000).unref()
