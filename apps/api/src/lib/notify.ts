// One call for "tell this person about X": saves it to their bell (notifications table),
// updates any open app instantly (live stream), and — only if they don't have the app
// open — sends a phone push notification.
import { db } from '../db/client'
import { notifications } from '../db/schema'
import { isOnline, publish } from './live'
import { sendPush } from './push'

export interface NotifyInput {
  type: 'offer' | 'offer_update' | 'price_drop' | 'saved_search' | 'referral' | 'system'
  title: string
  body?: string
  url?: string
}

export async function notify(userId: string, n: NotifyInput): Promise<void> {
  try {
    const [row] = await db
      .insert(notifications)
      .values({ userId, type: n.type, title: n.title, body: n.body ?? '', url: n.url })
      .returning()
    publish(userId, { type: 'notification', notification: row })
    if (!isOnline(userId)) await sendPush(userId, { title: n.title, body: n.body, url: n.url, tag: n.type })
  } catch (err) {
    // A notification failing must never fail the action that triggered it.
    console.error('notify failed', err)
  }
}
