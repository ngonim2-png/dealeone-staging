// Strips the salted PIN hash off a user row before it goes into any API response. scrypt
// hashes are one-way and salted, but there's no reason a hash — even a strong one — should
// ever leave the server; every route that returns a `users` row must pass it through this.
export function omitPinHash<T extends { pinHash?: string | null }>(user: T): Omit<T, 'pinHash'> {
  const { pinHash: _pinHash, ...rest } = user
  return rest
}

/** The fields of a user that are safe to show to OTHER people (a seller's public profile).
 * Never includes phone, role, suspension state, priority-purchase windows or deletedAt. */
export function publicUser(u: {
  id: string
  name: string
  avatarEmoji: string | null
  isBusiness: boolean
  businessName?: string | null
  verificationLevel: number
  rating: number | null
  ratingCount: number
  location: string | null
  createdAt?: Date | null
}) {
  return {
    id: u.id,
    name: u.name,
    avatarEmoji: u.avatarEmoji,
    isBusiness: u.isBusiness,
    businessName: u.businessName ?? null,
    verificationLevel: u.verificationLevel,
    rating: u.rating,
    ratingCount: u.ratingCount,
    location: u.location,
    createdAt: u.createdAt ?? null,
  }
}

/** A listing/event photo as stored: either a real compressed photo (base64 JPEG/PNG/WebP
 * data URL from the in-app camera/gallery) or a short emoji placeholder (seed data, and the
 * category fallback when a listing has no photo). Anything else — arbitrary URLs, strings
 * with quotes or angle brackets — is rejected, since image values end up inside HTML on
 * the map (Leaflet pin icons) and were a stored-XSS vector. */
export function isSafeImageValue(v: string): boolean {
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) return true
  if (/^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)) return true
  return v.length <= 16 && !/[<>"'`&\\/=]/.test(v)
}
