// Delivers a newly-saved chat message in real time: both people in the conversation get it
// on any open app instantly; the recipient gets a phone push if they don't have the app open.
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { users } from '../db/schema'
import { isOnline, publish } from './live'
import { sendPush } from './push'

interface ConvoLike {
  id: string
  buyerId: string
  sellerId: string
}
interface MessageLike {
  id: string
  senderId: string
  type: string
  text: string | null
  amount?: number | null
}

export async function announceMessage(convo: ConvoLike, msg: MessageLike): Promise<void> {
  try {
    const event = { type: 'message', conversationId: convo.id, message: msg }
    publish(convo.buyerId, event)
    publish(convo.sellerId, event)
    const recipient = msg.senderId === convo.buyerId ? convo.sellerId : convo.buyerId
    if (isOnline(recipient)) return
    const [sender] = await db.select({ name: users.name }).from(users).where(eq(users.id, msg.senderId)).limit(1)
    const body =
      msg.type === 'voice'
        ? '🎤 Voice note'
        : msg.type === 'offer'
          ? `Offer: NLe ${msg.amount ?? ''}`
          : msg.type === 'counter_offer'
            ? `Counter-offer: NLe ${msg.amount ?? ''}`
            : (msg.text ?? '').slice(0, 140)
    await sendPush(recipient, {
      title: msg.type === 'system' ? 'DEALEONE' : (sender?.name ?? 'New message'),
      body,
      url: `/chats/${convo.id}`,
      tag: `chat-${convo.id}`,
    })
  } catch (err) {
    console.error('announceMessage failed', err)
  }
}
