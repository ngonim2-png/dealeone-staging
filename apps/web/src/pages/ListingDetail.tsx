import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Heart, MessageCircle, Navigation, Share2, Flag, BadgeCheck, MapPin, Pencil, ShieldCheck } from 'lucide-react'
import BackHeader from '../components/BackHeader'
import OfferModal from '../components/OfferModal'
import ListingCard from '../components/ListingCard'
import MiniMap from '../components/MiniMap'
import Rating from '../components/Rating'
import ReportSheet from '../components/ReportSheet'
import { useApp } from '../context/AppContext'
import { CATEGORY_META, VERIFICATION_LABELS } from '../types'
import { formatDistance, formatPrice, relativeTime } from '../lib/format'
import { distanceKm } from '../lib/geo'
import { isImageUrl, mediaSrc } from '../lib/media'
import { reverseGeocode } from '../lib/geocode'
import { shareLink } from '../lib/share'
import { api, errorMessage } from '../lib/api'
import { useToast } from '../components/Toast'
import { VoiceNotePlayer } from '../components/VoiceNote'
import { useT } from '../lib/i18n'

export default function ListingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    listings,
    getListing,
    loadListing,
    sellers,
    currentUser,
    isWishlisted,
    toggleWishlist,
    makeOffer,
    ensureConversation,
    userLocation,
    lowData,
  } = useApp()
  const [offerOpen, setOfferOpen] = useState(false)
  const toast = useToast()
  const t = useT()
  const [messaging, setMessaging] = useState(false)
  const [address, setAddress] = useState<string | null>(null)
  const [activePhoto, setActivePhoto] = useState(0)
  const [showPhotosAnyway, setShowPhotosAnyway] = useState(false)
  const galleryRef = useRef<HTMLDivElement>(null)
  const [heartPop, setHeartPop] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const listing = getListing(id)
  const seller = listing ? sellers.find((s) => s.id === listing.sellerId) : undefined
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'done'>('idle')

  // Not in the live feed (sold/reserved/expired, or opened from a shared link before the
  // feed loaded) → fetch it directly instead of declaring it "not found".
  useEffect(() => {
    if (!id || listing) return
    setLookup('loading')
    loadListing(id).finally(() => setLookup('done'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!listing])

  // Count this view for the seller's insights (once per person per day, server-side).
  useEffect(() => {
    if (id) api.post(`/api/listings/${encodeURIComponent(id)}/view`).catch(() => {})
  }, [id])

  // Each listing starts on its first photo (tapping a "Similar nearby" card used to keep
  // the previous listing's photo index, pointing past the end of a shorter gallery).
  useEffect(() => {
    setActivePhoto(0)
    setShowPhotosAnyway(false)
    galleryRef.current?.scrollTo({ left: 0 })
  }, [id])

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
    const loading = lookup !== 'done'
    return (
      <div className="flex min-h-dvh flex-col">
        <BackHeader title={loading ? '' : 'Not available'} />
        {loading ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted">Loading listing…</div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-muted">This listing has been removed or is no longer available.</p>
            <button onClick={() => navigate('/')} className="btn-secondary px-4 py-2 text-sm">
              Browse nearby listings
            </button>
          </div>
        )}
      </div>
    )
  }

  const isMine = listing.sellerId === currentUser?.id
  const forSale = listing.status === 'active'
  const photos = listing.images.filter(isImageUrl)

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
    if (messaging) return
    setMessaging(true)
    try {
      const convoId = await ensureConversation(listing.id)
      navigate(`/chats/${convoId}`)
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't open the chat — please try again."))
    } finally {
      setMessaging(false)
    }
  }

  // Throws on failure so OfferModal can keep itself open and show the reason inline.
  const submitOffer = async (amount: number, message: string) => {
    await makeOffer(listing.id, amount, message)
    setOfferOpen(false)
    toast.success('Offer sent — the seller will reply in Messages.')
    try {
      const convoId = await ensureConversation(listing.id)
      setTimeout(() => navigate(`/chats/${convoId}`), 600)
    } catch {
      // The offer itself went through; staying on this page is fine.
    }
  }

  const share = async () => {
    const result = await shareLink({
      title: listing.title,
      text: `${listing.title} — ${formatPrice(listing.price)} on DEALEONE`,
      path: `/listing/${listing.id}`,
    })
    if (result === 'copied') toast.success('Link copied — paste it anywhere to share.')
    if (result === 'failed') toast.error("Couldn't share this listing.")
  }

  const onGalleryScroll = () => {
    const el = galleryRef.current
    if (!el || !el.clientWidth) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== activePhoto) setActivePhoto(i)
  }

  return (
    <div className="flex min-h-dvh flex-col pb-24">
      <BackHeader
        right={
          <button
            onClick={handleWishlistToggle}
            className="icon-btn h-11 w-11 bg-surface-2"
            aria-label={isWishlisted(listing.id) ? 'Remove from wishlist' : 'Save to wishlist'}
            aria-pressed={isWishlisted(listing.id)}
          >
            <Heart
              size={17}
              className={`${isWishlisted(listing.id) ? 'fill-accent text-accent' : 'text-ink'} ${heartPop ? 'icon-pop' : ''}`}
            />
          </button>
        }
      />

      <div className="relative h-64 overflow-hidden bg-gradient-to-b from-surface-2 to-surface md:h-80">
        {photos.length > 0 && lowData && !showPhotosAnyway ? (
          // Low-data mode: nothing is downloaded until asked for.
          <button
            onClick={() => setShowPhotosAnyway(true)}
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted"
          >
            <span className="text-6xl" aria-hidden>
              {meta.emoji}
            </span>
            <span className="btn-secondary min-h-10 px-4 text-sm">
              Show {photos.length} photo{photos.length > 1 ? 's' : ''}
            </span>
          </button>
        ) : photos.length > 0 ? (
          // Swipeable photo gallery (scroll-snap) instead of tiny tap-only dots.
          <div
            ref={galleryRef}
            onScroll={onGalleryScroll}
            className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto"
          >
            {photos.map((src, i) => (
              <img
                key={i}
                src={mediaSrc(src)}
                alt={`${listing.title} — photo ${i + 1} of ${photos.length}`}
                className="h-full w-full shrink-0 snap-center object-cover"
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(36,91,50,0.14),transparent_62%)]" />
            <span className="relative text-8xl drop-shadow-[0_16px_28px_rgba(0,0,0,0.35)]" aria-hidden>
              {listing.images[0] && !isImageUrl(listing.images[0]) ? listing.images[0] : meta.emoji}
            </span>
          </div>
        )}
        {photos.length > 1 && (
          <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/25 px-2 py-1 backdrop-blur-sm">
            {photos.map((_, i) => (
              <span
                key={i}
                aria-hidden
                className={`h-1.5 rounded-full transition-all ${i === activePhoto ? 'w-4 bg-white' : 'w-1.5 bg-white/55'}`}
              />
            ))}
            <span className="sr-only">
              Photo {activePhoto + 1} of {photos.length}
            </span>
          </div>
        )}
        {!forSale && (
          <div className="absolute left-3 top-3 rounded-full bg-ink/85 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
            {listing.status === 'sold' ? 'Sold' : listing.status === 'reserved' ? 'Reserved' : 'Not available'}
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

        {isMine ? (
          // Your own listing: no "Make Offer"/"Message Seller" (that opened a chat or an
          // offer with yourself) — manage it instead.
          <div className="card-elevated flex items-center justify-between gap-2 rounded-2xl bg-surface p-3">
            <p className="min-w-0 flex-1 text-sm text-muted">{t('listing.yours')}</p>
            {(listing.status === 'active' || listing.status === 'reserved' || listing.status === 'expired') && (
              <button
                onClick={() => navigate(`/account/listings/${listing.id}/edit`)}
                className="btn-primary shrink-0 px-4 py-2.5 text-sm"
              >
                <Pencil size={14} /> {t('listing.edit')}
              </button>
            )}
            <button onClick={() => navigate('/account/listings')} className="btn-secondary shrink-0 px-4 py-2.5 text-sm">
              Manage
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            {listing.price > 0 && forSale && (
              <button
                onClick={() => setOfferOpen(true)}
                className="tap-flash glow-accent-ring min-h-12 min-w-0 flex-1 truncate rounded-full border border-accent py-3 text-sm font-semibold text-accent transition-transform active:scale-[0.97]"
              >
                {t('listing.makeOffer')}
              </button>
            )}
            <button
              onClick={messageSeller}
              disabled={messaging}
              className="btn-primary min-h-12 min-w-0 flex-1 truncate py-3 text-sm disabled:opacity-70"
            >
              <MessageCircle size={16} className="shrink-0" /> <span className="truncate">Message Seller</span>
            </button>
          </div>
        )}

        {!isMine && forSale && (
          <p className="flex items-start gap-2 rounded-xl bg-good/[0.07] px-3 py-2 text-xs leading-snug text-ink/80">
            <ShieldCheck size={14} className="mt-px shrink-0 text-good" />
            Meet in a busy public place and check the item before you pay. Never send money in advance.
          </p>
        )}

        <div>
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Description</h2>
          {listing.description.trim() ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink/90">{listing.description}</p>
          ) : (
            !listing.voiceNoteUrl && <p className="text-sm text-muted">No description — ask the seller in chat.</p>
          )}
          {listing.voiceNoteUrl && (
            <div className="mt-2">
              <VoiceNotePlayer src={listing.voiceNoteUrl} label={t('listing.voice')} />
            </div>
          )}
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
          <button
            onClick={share}
            className="tap-flash flex min-h-10 items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 transition-transform active:scale-95"
          >
            <Share2 size={14} /> Share
          </button>
          {!isMine && (
            <button
              onClick={() => setReportOpen(true)}
              className="tap-flash flex min-h-10 items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 transition-transform active:scale-95"
            >
              <Flag size={14} /> Report
            </button>
          )}
          <span className="ml-auto self-center">Listed {relativeTime(listing.createdAt)}</span>
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
