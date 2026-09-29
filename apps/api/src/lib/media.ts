// Media storage: photos and voice notes live in the `media` table and are referenced
// everywhere else by URL ("/api/media/<id>"). This file is the only place that knows where
// the bytes are kept — swapping Postgres for S3/R2 later means changing storeMedia/loadMedia
// here, nothing else.
import sharp from 'sharp'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { media } from '../db/schema'

export const MEDIA_PREFIX = '/api/media/'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
export const MEDIA_URL_RE = new RegExp(`^/api/media/${UUID}$`)

const FULL_MAX = 1280
const THUMB_MAX = 360

export function isMediaUrl(v: unknown): v is string {
  return typeof v === 'string' && MEDIA_URL_RE.test(v)
}

export function isDataUrl(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:')
}

function parseDataUrl(dataUrl: string): { mime: string; buf: Buffer } {
  const m = /^data:([a-z0-9.+/-]+)(?:;[^,]*)?;base64,(.*)$/i.exec(dataUrl)
  if (!m) throw new Error('Unsupported data URL')
  return { mime: m[1].toLowerCase(), buf: Buffer.from(m[2], 'base64') }
}

/** Store an image or audio data URL; returns its public media URL. */
export async function storeDataUrl(dataUrl: string, ownerId: string | null): Promise<string> {
  const { mime, buf } = parseDataUrl(dataUrl)
  if (mime.startsWith('image/')) {
    // .rotate() applies the photo's EXIF orientation (phone photos are often stored sideways).
    const base = sharp(buf, { failOn: 'error' }).rotate()
    const full = await base
      .clone()
      .resize({ width: FULL_MAX, height: FULL_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true })
    const thumb = await base
      .clone()
      .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'cover', position: 'attention' })
      .webp({ quality: 68 })
      .toBuffer()
    const [row] = await db
      .insert(media)
      .values({
        ownerId,
        kind: 'image',
        mime: 'image/webp',
        data: full.data,
        thumb,
        thumbMime: 'image/webp',
        width: full.info.width,
        height: full.info.height,
        bytes: full.data.length,
      })
      .returning({ id: media.id })
    return MEDIA_PREFIX + row.id
  }
  if (mime.startsWith('audio/')) {
    const [row] = await db
      .insert(media)
      .values({ ownerId, kind: 'audio', mime, data: buf, bytes: buf.length })
      .returning({ id: media.id })
    return MEDIA_PREFIX + row.id
  }
  throw new Error('Unsupported media type')
}

/** Normalises an images[] array on the way in: new photos (data URLs) are stored and
 * replaced by their media URL; existing media URLs and emoji placeholders pass through. */
export async function normalizeImages(images: string[], ownerId: string | null): Promise<string[]> {
  const out: string[] = []
  for (const img of images) out.push(isDataUrl(img) ? await storeDataUrl(img, ownerId) : img)
  return out
}

export async function loadMedia(id: string, size: 'full' | 'thumb') {
  const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1)
  if (!row) return null
  if (size === 'thumb' && row.thumb) return { body: row.thumb, mime: row.thumbMime ?? 'image/webp' }
  return { body: row.data, mime: row.mime }
}
