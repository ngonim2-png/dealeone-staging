import { Router } from 'express'
import { z } from 'zod'
import { categoryEnum } from '../db/schema'
import { requireAuth } from '../lib/auth'

// "Fill in from photo": the seller takes a picture and gets a suggested title, category,
// condition and description to edit. Uses a vision model, so it only switches on when the
// server has an API key — ANTHROPIC_API_KEY in the environment (ASSIST_MODEL optionally
// picks the model). Without a key, /status says it's off and the app simply doesn't show
// the button; the non-AI helpers (category-from-title, fair-price guide) still work.
export const assistRouter = Router()

const API_KEY = () => process.env.ANTHROPIC_API_KEY?.trim() || ''
const MODEL = () => process.env.ASSIST_MODEL?.trim() || 'claude-sonnet-4-5'

assistRouter.get('/status', (_req, res) => {
  res.json({ photoAssist: !!API_KEY() })
})

// Per-user cooldown so one account can't run up the model bill.
const lastCall = new Map<string, number>()
const COOLDOWN_MS = 8_000

const bodySchema = z.object({
  image: z.string().max(3_000_000).regex(/^data:image\/(jpeg|png|webp);base64,/),
})

const CATEGORIES = categoryEnum.enumValues

assistRouter.post('/listing', requireAuth, async (req, res) => {
  const key = API_KEY()
  if (!key) {
    res.status(503).json({ error: 'Photo suggestions are not switched on yet.' })
    return
  }
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Send one JPEG, PNG or WebP photo.' })
    return
  }
  const now = Date.now()
  if (now - (lastCall.get(req.userId!) ?? 0) < COOLDOWN_MS) {
    res.status(429).json({ error: 'One moment — try again in a few seconds.' })
    return
  }
  lastCall.set(req.userId!, now)

  const [, mediaType, data] = /^data:(image\/[a-z]+);base64,(.*)$/.exec(parsed.data.image) ?? []
  const prompt = [
    'You help people in Sierra Leone list items for sale on a local marketplace app.',
    'Look at the photo and reply with ONLY a JSON object, no other text:',
    '{"title": string (max 60 chars, brand + model if visible),',
    ` "category": one of ${JSON.stringify(CATEGORIES)},`,
    ' "condition": "new" | "used" | "refurbished",',
    ' "description": string (2-3 short factual sentences a buyer would want; do not invent specs you cannot see)}',
    'If the photo does not show an item for sale, reply {"error": "no item"}.',
  ].join('\n')

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL(),
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    })
    if (!r.ok) {
      console.error('assist: model call failed', r.status, (await r.text()).slice(0, 300))
      res.status(502).json({ error: "Couldn't read that photo right now — fill it in yourself." })
      return
    }
    const out = (await r.json()) as { content?: { type: string; text?: string }[] }
    const text = out.content?.find((c) => c.type === 'text')?.text ?? ''
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    if (json.error) {
      res.status(422).json({ error: "We couldn't spot an item in that photo." })
      return
    }
    res.json({
      title: typeof json.title === 'string' ? json.title.slice(0, 120) : '',
      category: CATEGORIES.includes(json.category) ? json.category : null,
      condition: ['new', 'used', 'refurbished'].includes(json.condition) ? json.condition : null,
      description: typeof json.description === 'string' ? json.description.slice(0, 1000) : '',
    })
  } catch (err) {
    console.error('assist: failed', err)
    res.status(502).json({ error: "Couldn't read that photo right now — fill it in yourself." })
  }
})
