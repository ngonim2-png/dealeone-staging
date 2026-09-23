import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Heart, MessageCircle, Navigation, Share2, Flag, BadgeCheck, MapPin } from 'lucide-react'
import BackHeader from '../components/BackHeader'
import OfferModal from '../components/OfferModal'
import ListingCard from '../components/ListingCard'
import MiniMap from '../components/MiniMap'
import Rating from '../components/Rating'
import ReportSheet from '../components/ReportSheet'
import { useApp } from '../context/AppContext'
import { CATEGORY_META, VERIFICATION_LABELS } from '../types'
import { formatDistance, formatPrice, timeAgo } from '../lib/format'
import { distanceKm } from '../lib/geo'
import { isImageUrl } from '../lib/media'
import { reverseGeocode } from '../lib/geocode'

export default function ListingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    listings,
    sellers,
    currentUser,
    isWishlisted,
    toggleWishlist,
    makeOffer,
    ensureConversation,
    userLocation,
  } = useApp()
  const [offerOpen, setOfferOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [activePhoto, setActivePhoto] = useState(0)
  const [heartPop, setHeartPop] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const listing = listings.find((l) => l.id === id)
  const seller = listing ? sellers.find((s) => s.id === listing.sellerId) : undefined

  const similar = useMemo(() => {
    if (!listing) return []
    return listings
      .filter((l) => l.id !== listing.id && l.category === listing.category && l.status === 'active')
      .map((l) => ({ l, d: distanceKm(userLocation.lat, userLocation.lng, l.lat, l.lng) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4)
      .map((x) => x.l)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing, listings, userLocation])

  // "Exact" here mirrors the same rule the API already enforces server-side (see
  // presentListing in apps/api/src/lib/geo.ts): the seller always sees their own listing's
  // real spot, and a listing with approxLocation off shows the real spot to everyone. Any
  // other viewer of an approxLocation-on listing only ever has the server's fuzzed
  // coordinates to work with, so there's nothing precise to reverse-geocode — we don't even
  // try, rather than showing a street name that isn't actually where the item is.
  const isExactLocation = !!listing && (listing.sellerId === currentUser?.id || !listing.approxLocation)

  useEffect(() => {
    if (!listing || !isExactLocation) {
      setAddress(null)
      return
    }
    const controller = new AbortController()
    reverseGeocode(listing.lat, listing.lng, controller.signal).then((label) => {
      if (!controller.signal.aborted) setAddress(label)
    })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?.id, listing?.lat, listing?.lng, isExactLocation])

  if (!listing || !seller) {
    return (
      <div className="flex min-h-dvh flex-col">
        <BackHeader title="Not found" />
        <p className="p-6 text-center text-sm text-muted">This listing is no longer available.</p>
      </div>
    )
  }

  const dist = distanceKm(userLocation.lat, userLocation.lng, listing.lat, listing.lng)
  const meta = CATEGORY_META[listing.category]
  const sellerListingsCount = listings.filter(
    (l) => l.sellerId === seller.id && l.status === 'active',
  ).length

  // Pop the heart only on the moment of *saving* (not un-saving) — a small burst of
  // feedback for the positive action, rather than the icon just silently swapping fill.
  const handleWishlistToggle = () => {
    const wasWishlisted = isWishlisted(listing.id)
    toggleWishlist(listing.id)
    if (!wasWishlisted) {
      setHeartPop(true)
      setTimeout(() => setHeartPop(false), 400)
    }
  }

  const messageSeller = async () => {
    const convoId = await ensureConversation(listing.id)
    navigate(`/chats/${convoId}`)
  }

  const submitOffer = async (amount: number, message: string) => {
    await makeOffer(listing.id, amount, message)
    setOfferOpen(false)
    setToast('Offer sent to seller')
    setTimeout(() => setToast(null), 2200)
    const convoId = await ensureConversation(listing.id)
    setTimeout(() => navigate(`/chats/${convoId}`), 700)
  }

  return (
    <div className="flex min-h-dvh flex-col pb-24">
      <BackHeader
        right={
          <button
            onClick={handleWishlistToggle}
            className="icon-btn h-9 w-9 bg-surface-2"
            aria-label="Save to wishlist"
          >
            <Heart
              size={17}
              className={`${isWishlisted(listing.id) ? 'fill-accent text-accent' : 'text-ink'} ${heartPop ? 'icon-pop' : ''}`}
            />
          </button>
        }
      />

      <div className="relative flex h-64 items-center justify-center overflow-hidden bg-gradient-to-b from-surface-2 to-surface">
        {isImageUrl(listing.images[activePhoto]) ? (
          <img
            src={listing.images[activePhoto]}
            alt={listing.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(36,91,50,0.14),transparent_62%)]" />
            <span className="relative text-8xl drop-shadow-[0_16px_28px_rgba(0,0,0,0.55)]">
              {listing.images[0] ?? meta.emoji}
            </span>
          </>
        )}
        {listing.images.filter(isImageUrl).length > 1 && (
          <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {listing.images.map((img, i) =>
              isImageUrl(img) ? (
                <button
                  key={i}
                  onClick={() => setActivePhoto(i)}
                  aria-label={`Show photo ${i + 1}`}
                  className={`h-1.5 rounded-full transition ${
                    i === activePhoto ? 'w-4 bg-accent shadow-[0_0_6px_rgba(36,91,50,0.7)]' : 'w-1.5 bg-bg/60'
                  }`}
                />
              ) : null,
            )}
          </div>
        )}
      </div>

      <div className="space-y-5 p-4">
        <div className="flex flex-wrap gap-1.5">
          <Tag>{meta.label}</Tag>
          <Tag good={listing.status === 'active'}>
            {listing.status === 'active' ? 'Available Now' : listing.status.replace('_', ' ')}
          </Tag>
          <Tag>{listing.condition}</Tag>
          {listing.negotiable && <Tag>Negotiable</Tag>}
          {listing.type === 'deal' && <Tag accent>Deal</Tag>}
        </div>

        <div>
          <h1 className="text-xl font-display font-bold tracking-tight text-ink">{listing.title}</h1>
          {listing.dealOriginalPrice ? (
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-display font-bold tracking-tight text-accent">{formatPrice(listing.price)}</p>
              <p className="text-sm text-muted line-through">{formatPrice(listing.dealOriginalPrice)}</p>
            </div>
          ) : (
            <p className="text-2xl font-display font-bold tracking-tight text-accent">
              {listing.price > 0 ? formatPrice(listing.price) : 'Visit store for pricing'}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          {listing.price > 0 && (
            <button
              onClick={() => setOfferOpen(true)}
              className="tap-flash glow-accent-ring min-w-0 flex-1 truncate rounded-full border border-accent py-2.5 text-sm font-semibold text-accent transition-transform active:scale-[0.97]"
            >
              Make Offer
            </button>
          )}
          <button
            onClick={messageSeller}
            className="btn-primary min-w-0 flex-1 truncate py-2.5 text-sm"
          >
            <MessageCircle size={15} className="shrink-0" /> <span className="truncate">Message Seller</span>
          </button>
        </div>

        <div>
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Description</h2>
          <p className="text-sm leading-relaxed text-ink/90">{listing.description}</p>
        </div>

        <div>
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Location</h2>
          <div className="card-elevated overflow-hidden rounded-xl bg-surface">
            <div className="h-36 w-full">
              <MiniMap
                lat={listing.lat}
                lng={listing.lng}
                precision={isExactLocation ? 'exact' : 'approximate'}
              />
            </div>
            <div className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0 text-sm">
                <p className="flex items-center gap-1 truncate text-ink">
                  <MapPin size={12} className="shrink-0 text-accent" />
                  {isExactLocation
                    ? address ?? `${seller.location}, Freetown`
                    : `${seller.location} area, Freetown`}
                </p>
                <p className="truncate text-xs text-muted">
                  {formatDistance(dist)} from you · {isExactLocation ? 'exact location' : 'approximate area'}
                </p>
              </div>
              <a
                href={`https://www.openstreetmap.org/?mlat=${listing.lat}&mlon=${listing.lng}#map=${
                  isExactLocation ? 17 : 15
                }/${listing.lat}/${listing.lng}`}
                target="_blank"
                rel="noreferrer"
                className="tap-flash flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 text-xs text-ink transition-transform active:scale-95"
              >
                <Navigation size={12} /> Directions
              </a>
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Seller</h2>
          <button
            onClick={async () => navigate(`/chats/${await ensureConversation(listing.id)}`)}
            className="card-elevated card-interactive flex w-full items-center gap-3 rounded-xl bg-surface p-3 text-left"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-xl ring-1 ring-border">
              {seller.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="truncate text-sm font-medium text-ink">{seller.name}</p>
                {seller.verificationLevel >= 3 && <BadgeCheck size={13} className="shrink-0 text-good" />}
              </div>
              <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted">
                <Rating value={seller.rating} count={seller.ratingCount} size={11} />
                <span>· {sellerListingsCount} listings · {VERIFICATION_LABELS[seller.verificationLevel]}</span>
              </p>
            </div>
          </button>
        </div>

        <div className="flex gap-2 text-xs text-muted">
          <button className="tap-flash flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 transition-transform active:scale-95">
            <Share2 size={12} /> Share
          </button>
          <button
            onClick={() => setReportOpen(true)}
            className="tap-flash flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 transition-transform active:scale-95"
          >
            <Flag size={12} /> Report
          </button>
          <span className="ml-auto self-center">Listed {timeAgo(listing.createdAt)} ago</span>
        </div>

        {similar.length > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              Similar nearby
            </h2>
            <div className="space-y-2">
              {similar.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          </div>
        )}
      </div>

      {offerOpen && (
        <OfferModal listing={listing} onClose={() => setOfferOpen(false)} onSubmit={submitOffer} />
      )}

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="listing"
        targetId={listing.id}
        targetLabel={listing.title}
      />

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center">
          <div className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-bg shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  )
}

function Tag({
  children,
  good,
  accent,
}: {
  children: ReactNode
  good?: boolean
  accent?: boolean
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${
        good
          ? 'border border-good/40 bg-good/10 text-good'
          : accent
          ? 'border border-accent/40 bg-accent/10 text-accent'
          : 'bg-surface-2 text-muted'
      }`}
    >
      {children}
    </span>
  )
}
