import type { Category, Condition, Listing } from '../types'
import { distanceKm } from './geo'

export type SellerType = 'any' | 'individual' | 'business' | 'verified'
export type Availability = 'all' | 'now'
export type RankMode = 'closest' | 'best_deal' | 'recommended' | 'sponsored' | 'newest' | 'price_asc' | 'price_desc'

export interface Filters {
  radiusKm: number
  categories: Category[]
  minPrice: number | null
  maxPrice: number | null
  condition: Condition[]
  sellerType: SellerType
  availability: Availability
}

export const DEFAULT_FILTERS: Filters = {
  radiusKm: 5,
  categories: [],
  minPrice: null,
  maxPrice: null,
  condition: [],
  sellerType: 'any',
  availability: 'all',
}

export function withDistance(listings: Listing[], from: { lat: number; lng: number }) {
  return listings.map((l) => ({
    listing: l,
    distance: distanceKm(from.lat, from.lng, l.lat, l.lng),
  }))
}

export function applyFilters(
  listings: Listing[],
  filters: Filters,
  sellerVerifiedLevel: (sellerId: string) => number,
  sellerIsBusiness: (sellerId: string) => boolean,
  from: { lat: number; lng: number },
) {
  return withDistance(listings, from)
    .filter(({ listing, distance }) => {
      if (listing.status !== 'active') return false
      if (distance > filters.radiusKm) return false
      if (filters.categories.length && !filters.categories.includes(listing.category))
        return false
      if (filters.minPrice != null && listing.price < filters.minPrice) return false
      if (filters.maxPrice != null && listing.price > filters.maxPrice) return false
      if (filters.condition.length && !filters.condition.includes(listing.condition))
        return false
      if (filters.sellerType === 'individual' && sellerIsBusiness(listing.sellerId))
        return false
      if (filters.sellerType === 'business' && !sellerIsBusiness(listing.sellerId))
        return false
      if (filters.sellerType === 'verified' && sellerVerifiedLevel(listing.sellerId) < 3)
        return false
      if (filters.availability === 'now' && listing.status !== 'active') return false
      return true
    })
    .map((x) => x)
}

export function rank(
  items: { listing: Listing; distance: number }[],
  mode: RankMode,
  sellerRating: (sellerId: string) => number,
) {
  const arr = [...items]
  switch (mode) {
    case 'closest':
      return arr.sort((a, b) => a.distance - b.distance)
    case 'price_asc':
      return arr.sort((a, b) => a.listing.price - b.listing.price)
    case 'price_desc':
      return arr.sort((a, b) => b.listing.price - a.listing.price)
    case 'newest':
      return arr.sort(
        (a, b) => new Date(b.listing.createdAt).getTime() - new Date(a.listing.createdAt).getTime(),
      )
    case 'sponsored':
      return arr.sort((a, b) => Number(b.listing.sponsored) - Number(a.listing.sponsored) || a.distance - b.distance)
    case 'best_deal':
      return arr.sort((a, b) => {
        const da = a.listing.dealOriginalPrice ? a.listing.dealOriginalPrice - a.listing.price : 0
        const db = b.listing.dealOriginalPrice ? b.listing.dealOriginalPrice - b.listing.price : 0
        return db - da || a.distance - b.distance
      })
    case 'recommended':
    default:
      return arr.sort((a, b) => {
        const scoreA =
          (a.listing.sponsored ? 2 : 0) + sellerRating(a.listing.sellerId) - a.distance * 0.3
        const scoreB =
          (b.listing.sponsored ? 2 : 0) + sellerRating(b.listing.sellerId) - b.distance * 0.3
        return scoreB - scoreA
      })
  }
}
