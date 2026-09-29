import { useEffect, useState } from 'react'
import { api } from './api'

// The agreed rate card (29 Sep 2026). The API is the source of truth (GET /api/rate-card,
// built from apps/api/src/lib/billing.ts); these are the same values, used until that
// loads or if it can't be reached, so a price is never blank.
export interface RateCard {
  currency: 'NLe'
  listingFeePerWeek: number
  listingPackages: { weeks: number; label: string; price: number }[]
  freeListingsUntil: string | null
  boostPerWeek: number
  featurePerWeek: number
  topOfCategoryPerWeek: number
  bannerPerPeriod: number
  bannerPeriodDays: number
  buyerRequestPriorityPerWeek: number
}

export const DEFAULT_RATE_CARD: RateCard = {
  currency: 'NLe',
  listingFeePerWeek: 25,
  listingPackages: [
    { weeks: 1, label: '1 week', price: 25 },
    { weeks: 2, label: '2 weeks', price: 50 },
    { weeks: 3, label: '3 weeks', price: 75 },
    { weeks: 4, label: '1 month', price: 100 },
  ],
  freeListingsUntil: null,
  boostPerWeek: 50,
  featurePerWeek: 25,
  topOfCategoryPerWeek: 50,
  bannerPerPeriod: 100,
  bannerPeriodDays: 10,
  buyerRequestPriorityPerWeek: 50,
}

let cached: RateCard | null = null
let inflight: Promise<RateCard> | null = null

function load(): Promise<RateCard> {
  inflight ??= api
    .get<RateCard>('/api/rate-card')
    .then((r) => (cached = { ...DEFAULT_RATE_CARD, ...r }))
    .catch(() => DEFAULT_RATE_CARD)
  return inflight
}

export function useRateCard(): RateCard {
  const [card, setCard] = useState<RateCard>(cached ?? DEFAULT_RATE_CARD)
  useEffect(() => {
    let alive = true
    load().then((c) => alive && setCard(c))
    return () => {
      alive = false
    }
  }, [])
  return card
}

/** True while the launch promotion makes listings free. */
export function listingsAreFree(card: RateCard) {
  return !!card.freeListingsUntil && new Date(card.freeListingsUntil) > new Date()
}
