// Simple great-circle distance, matches spec §44 (geospatial queries)

export const USER_LOCATION = {
  label: 'Lumley, Freetown',
  lat: 8.4657,
  lng: -13.2983,
}

export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// spec §8 — automatic search radius progression
export const RADIUS_STEPS = [1, 3, 5, 10, 25] as const

export function nextRadius(current: number): number | null {
  const idx = RADIUS_STEPS.indexOf(current as (typeof RADIUS_STEPS)[number])
  if (idx === -1 || idx === RADIUS_STEPS.length - 1) return null
  return RADIUS_STEPS[idx + 1]
}
