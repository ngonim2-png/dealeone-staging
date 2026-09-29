// Phone push notifications (Web Push). Works on Android (Chrome, Samsung Internet, etc.)
// and on iPhone/iPad (iOS 16.4+) once DEALEONE has been added to the Home Screen.
// The VAPID key pair comes from env vars if set, otherwise it's generated once and saved
// in app_settings, so there's nothing to configure on Render.
import webpush from 'web-push'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { appSettings, pushSubscriptions } from '../db/schema'

let keysPromise: Promise<{ publicKey: string; privateKey: string }> | null = null

export function vapidKeys() {
  if (!keysPromise) {
    keysPromise = (async () => {
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
      }
      const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'vapid')).limit(1)
      if (row) return JSON.parse(row.value)
      const keys = webpush.generateVAPIDKeys()
      await db.insert(appSettings).values({ key: 'vapid', value: JSON.stringify(keys) }).onConflictDoNothing()
      // Re-read in case another process won the race.
      const [saved] = await db.select().from(appSettings).where(eq(appSettings.key, 'vapid')).limit(1)
      return JSON.parse(saved.value)
    })().catch((err) => {
      keysPromise = null
      throw err
    })
  }
  return keysPromise
}

export interface PushPayload {
  title: string
  body?: string
  url?: string // in-app route, e.g. "/chats/123"
  tag?: string // same tag replaces an older notification instead of stacking
}

/** Sends to every device the user enabled. Never throws — push is best-effort. */
export async function sendPush(userId: string, payload: PushPayload): Promise<void> {
  try {
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
    if (!subs.length) return
    const { publicKey, privateKey } = await vapidKeys()
    const subject = process.env.VAPID_SUBJECT || 'mailto:support@dealeone.app'
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(payload),
            { vapidDetails: { subject, publicKey, privateKey }, TTL: 60 * 60 * 24 },
          )
        } catch (err: any) {
          // 404/410: the phone unsubscribed or the app was removed — forget it.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id))
          } else {
            console.error('push failed', err?.statusCode ?? '', err?.body ?? err?.message)
          }
        }
      }),
    )
  } catch (err) {
    console.error('sendPush error', err)
  }
}
