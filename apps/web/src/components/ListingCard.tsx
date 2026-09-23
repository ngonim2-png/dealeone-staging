import { useNavigate } from 'react-router-dom'
import type { Listing } from '../types'
import { CATEGORY_META } from '../types'
import { formatDistance, formatPrice } from '../lib/format'
import { distanceKm } from '../lib/geo'
import { isImageUrl } from '../lib/media'
import { useApp } from '../context/AppContext'
import { BadgeCheck, Star } from 'lucide-react'
import Rating from './Rating'

export default function ListingCard({
  listing,
  compact = false,
}: {
  listing: Listing
  compact?: boolean
}) {
  const navigate = useNavigate()
  const { sellers, userLocation } = useApp()
  const seller = sellers.find((s) => s.id === listing.sellerId)
  const dist = distanceKm(userLocation.lat, userLocation.lng, listing.lat, listing.lng)
  const meta = CATEGORY_META[listing.category]

  return (
    <button
      onClick={() => navigate(`/listing/${listing.id}`)}
      className={`card-elevated card-interactive flex w-full items-center gap-3 rounded-2xl bg-surface p-3.5 text-left ${
        compact ? '' : ''
      }`}
    >
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-2xl">
        {isImageUrl(listing.images[0]) ? (
          <img src={listing.images[0]} alt="" className="h-full w-full object-cover" />
        ) : (
          listing.images[0] ?? meta.emoji
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-ink">{listing.title}</p>
          {listing.sponsored && (
            <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-semibold text-accent">
              SPONSORED
            </span>
          )}
          {listing.featured && (
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-accent-2/15 px-2 py-0.5 text-[9px] font-semibold text-accent-2">
              <Star size={9} className="fill-current" /> FEATURED
            </span>
          )}
        </div>
        <p className="text-base font-display font-bold tracking-tight text-accent">
          {listing.price > 0 ? formatPrice(listing.price) : 'Visit store'}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span>{formatDistance(dist)}</span>
          <span>·</span>
          <span className="capitalize">{listing.condition}</span>
          {listing.status !== 'active' && (
            <>
              <span>·</span>
              <span className="capitalize">{listing.status.replace('_', ' ')}</span>
            </>
          )}
        </div>
        {seller && (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
            <span className="truncate">{seller.name}</span>
            {seller.verificationLevel >= 3 && (
              <BadgeCheck size={12} className="shrink-0 text-good" />
            )}
            <Rating value={seller.rating} size={10} />
          </div>
        )}
      </div>
    </button>
  )
}
