import { sql } from 'drizzle-orm'
import { PgColumn } from 'drizzle-orm/pg-core'
import { listings, events } from '../db/schema'

/** Great-circle distance (km) from a fixed point to a table's lat/lng columns, as a raw-SQL
 * expression usable in select/where/orderBy. Plain haversine in SQL — no PostGIS needed, so
 * this runs unmodified on Render's managed Postgres or any other stock Postgres. Shared by
 * distanceKmExpr (listings) and eventDistanceKmExpr (events) below — same formula, just
 * pointed at a different pair of columns. */
function haversineExpr(lat: number, lng: number, latCol: PgColumn, lngCol: PgColumn) {
  return sql<number>`(
    6371 * acos(
      LEAST(1, GREATEST(-1,
        cos(radians(${lat})) * cos(radians(${latCol})) *
        cos(radians(${lngCol}) - radians(${lng})) +
        sin(radians(${lat})) * sin(radians(${latCol}))
      ))
    )
  )`
}

export function distanceKmExpr(lat: number, lng: number) {
  return haversineExpr(lat, lng, listings.lat, listings.lng)
}

/** Same haversine distance, for events (routes/events.ts) — a separate first-class entity
 * from listings, not a listing category, so it gets its own lat/lng distance expression. */
export function eventDistanceKmExpr(lat: number, lng: number) {
  return haversineExpr(lat, lng, events.lat, events.lng)
}

export const RADIUS_STEPS = [1, 3, 5, 10, 25] as const

export function nextRadius(current: number): number | null {
  const idx = RADIUS_STEPS.indexOf(current as (typeof RADIUS_STEPS)[number])
  if (idx === -1 || idx === RADIUS_STEPS.length - 1) return null
  return RADIUS_STEPS[idx + 1]
}

/** Tiny deterministic string hash (djb2) — used to seed the jitter below so the same
 * listing always fuzzes to the same nearby point instead of jumping around on every
 * request (which would look broken and would let anyone triangulate the real spot by
 * averaging repeated requests). */
function seedFromString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i)
  }
  return h >>> 0
}

/** Small deterministic PRNG (mulberry32) — plain Math.random() would defeat the point of
 * seeding by seedFromString. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Offsets a coordinate by a stable, listing-seeded 80–320m nudge in a random direction —
 * enough to hide the exact building/street while still landing in the right
 * neighborhood/block, for listings where the seller asked for approximate location. */
export function jitterCoordinate(lat: number, lng: number, seed: string) {
  const rand = mulberry32(seedFromString(seed))
  const angle = rand() * 2 * Math.PI
  const meters = 80 + rand() * 240
  const dLat = (meters * Math.cos(angle)) / 111320
  const dLng = (meters * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180))
  return { lat: lat + dLat, lng: lng + dLng }
}

/** The privacy boundary for exact listing locations lives here, not in the DB or the
 * frontend: the real lat/lng is stored and used for internal distance math always, but a
 * listing with approxLocation=true only ever leaves the server as its true coordinates for
 * the seller viewing their own listing — everyone else gets a stable, fuzzed nearby point
 * (see jitterCoordinate above). Every route that embeds a listing row in a response
 * (search, detail, wishlist, offers, conversations) must pass it through this first. */
export function presentListing<
  T extends { id: string; sellerId: string; lat: number; lng: number; approxLocation: boolean },
>(listing: T, viewerUserId: string | undefined): T {
  if (viewerUserId && listing.sellerId === viewerUserId) return listing
  if (!listing.approxLocation) return listing
  const { lat, lng } = jitterCoordinate(listing.lat, listing.lng, listing.id)
  return { ...listing, lat, lng }
}
