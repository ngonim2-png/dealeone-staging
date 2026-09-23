// Reverse geocoding — turns a lat/lng into a real street address for display (ListingDetail's
// "exact location" case). Uses OpenStreetMap's free Nominatim API, which matches the map tile
// provider already in use (MapView.tsx) so there's no second API key/account to manage.
//
// This runs directly from the browser rather than proxied through our own API — fine for the
// request volume an MVP marketplace sees, but Nominatim's usage policy (1 req/sec, no heavy
// automated use: https://operations.osmfoundation.org/policies/nominatim/) means a
// production hardening pass should proxy this server-side with real caching once traffic
// grows, rather than every client hitting Nominatim directly.
//
// Note: this sandbox's outbound network policy blocks nominatim.openstreetmap.org, so the
// geocoding call itself can't be exercised end-to-end here — callers must treat failure as an
// expected, common case (see the try/catch + fallback in ListingDetail.tsx), not a bug. It
// works from a normal unrestricted host (e.g. after deploying to Render).

const cache = new Map<string, string | null>()

function cacheKey(lat: number, lng: number) {
  // ~11m precision — plenty for caching "the same spot", coarse enough to actually hit
  return `${lat.toFixed(4)},${lng.toFixed(4)}`
}

interface NominatimAddress {
  road?: string
  pedestrian?: string
  house_number?: string
  suburb?: string
  neighbourhood?: string
  quarter?: string
  city_district?: string
  town?: string
  city?: string
}

/** Resolves to a short human street label (e.g. "Wilkinson Road, Lumley"), or null if the
 * lookup failed/timed out/found nothing usable — callers should fall back to the seller's
 * neighborhood text in that case, never show an error state over this. */
export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<string | null> {
  const key = cacheKey(lat, lng)
  if (cache.has(key)) return cache.get(key) ?? null

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    const res = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`reverse geocode failed: ${res.status}`)
    const data = await res.json()
    const addr: NominatimAddress = data.address ?? {}

    const street = addr.road ?? addr.pedestrian
    const area = addr.neighbourhood ?? addr.suburb ?? addr.quarter ?? addr.city_district ?? addr.town ?? addr.city

    let label: string | null = null
    if (street && area) label = addr.house_number ? `${addr.house_number} ${street}, ${area}` : `${street}, ${area}`
    else if (street) label = street
    else if (typeof data.display_name === 'string') label = data.display_name.split(',').slice(0, 2).join(',').trim()

    // Only cache a real hit — a failed/empty lookup might just be a transient network blip
    // (or, in this dev sandbox, a blocked host) and shouldn't be remembered as permanent.
    if (label) cache.set(key, label)
    return label
  } catch {
    return null
  }
}
