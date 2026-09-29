// Photo capture/compression for the Sell/Host/Status flows, plus helpers for showing
// stored media. Photos are uploaded once as a compressed data URL; the API stores them in
// its media table and hands back a short URL ("/api/media/<id>") — the listing feed only
// ever carries those URLs, never the photo bytes.
import { BASE_URL } from './api'

/** True for a real photo (a stored media URL, or a data/blob/http URL still being edited)
 * as opposed to the emoji placeholder strings seed/demo data uses for `images[0]`. */
export function isImageUrl(value: string | undefined | null): value is string {
  if (!value) return false
  return (
    value.startsWith('/api/media/') ||
    value.startsWith('data:image') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('blob:')
  )
}

/** Browser-usable URL for a stored photo/voice note. `thumb` gets the small (≈360px, ~10-20 KB)
 * version for cards and map pins; detail views use the full size. Non-media values (data
 * URLs being edited) pass through unchanged. */
export function mediaSrc(value: string, size: 'full' | 'thumb' = 'full'): string {
  if (value.startsWith('/api/media/')) return `${BASE_URL}${value}${size === 'thumb' ? '?size=thumb' : ''}`
  return value
}

const MAX_DIMENSION = 1280
const JPEG_QUALITY = 0.82

/** Downscale + re-encode a captured/selected photo before it ever touches the network —
 * a raw phone camera photo can be 5-10MB, which is both slow to upload on the kind of
 * connection this app is built for and wasteful to store as a Postgres text column. Caps
 * the longest edge at MAX_DIMENSION and re-encodes as JPEG, which brings a typical photo
 * down to a few hundred KB. */
export function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not decode image'))
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas not supported'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
