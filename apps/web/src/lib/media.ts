// Real photo capture/upload for listings (Sell flow) — replaces the old mock where "taking a
// photo" just meant picking an emoji from a catalog. Listing images are still just
// `text[]` in Postgres (see schema.ts), so a captured photo is stored as a compressed
// base64 data URL string, same MVP-storage tradeoff as voice notes (no object storage in
// the stack yet — fine at demo scale, worth moving to real object storage before heavy
// real-world traffic).

/** True for a real captured/uploaded photo (data/blob/http URL) as opposed to the emoji
 * placeholder strings seed/demo data still uses for `images[0]` — every place that renders
 * a listing thumbnail needs to tell these apart so old demo listings keep showing their
 * emoji instead of trying to render it as a broken <img>. */
export function isImageUrl(value: string | undefined | null): value is string {
  if (!value) return false
  return (
    value.startsWith('data:image') || value.startsWith('http://') || value.startsWith('https://') || value.startsWith('blob:')
  )
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
