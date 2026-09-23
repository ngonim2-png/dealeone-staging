import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search as SearchIcon,
  SlidersHorizontal,
  BadgeCheck,
  Sparkles,
  LocateFixed,
  Megaphone,
  Map as MapIcon,
  List as ListIcon,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import MapView from '../components/MapView'
import FilterSheet from '../components/FilterSheet'
import ListingCard from '../components/ListingCard'
import { useApp } from '../context/AppContext'
import { CATEGORY_META, type Category } from '../types'
import { applyFilters, rank, type RankMode } from '../lib/filters'
import { DEFAULT_FILTERS } from '../lib/filters'
import { nextRadius, RADIUS_STEPS } from '../lib/geo'
import { formatDistance, formatPrice } from '../lib/format'
import { isImageUrl } from '../lib/media'
import { parseQuery } from '../lib/aiParse'
import { api } from '../lib/api'
import { mapListing } from '../lib/mappers'
import type { Listing } from '../types'

const CATEGORIES = Object.keys(CATEGORY_META) as Category[]

const RANK_MODES: { id: RankMode; label: string }[] = [
  { id: 'closest', label: 'Closest' },
  { id: 'best_deal', label: 'Best Deal' },
  { id: 'recommended', label: 'Recommended' },
  { id: 'sponsored', label: 'Sponsored' },
  { id: 'newest', label: 'Newest' },
  { id: 'price_asc', label: 'Price: Low → High' },
  { id: 'price_desc', label: 'Price: High → Low' },
]

type ListKind = 'all' | 'products' | 'services' | 'verified'
const LIST_KINDS: { id: ListKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'products', label: 'Products' },
  { id: 'services', label: 'Services' },
  { id: 'verified', label: 'Verified' },
]

// Home page — this is both the old "Explore" (map) and the old "Search" (list) page merged
// into one screen with a Map/List pill toggle, per the nav-redesign round: Explore and
// Search used to be two separate bottom-nav tabs with near-identical filtering logic
// duplicated between them (see git history / build log for the pre-merge versions). Now
// there's a single home screen — it opens on Map by default, and tapping "List" reveals the
// same filtered results as a scrollable ranked list (with quick Products/Services/Verified
// filters) instead of pins on the map. The old dedicated /search route now just redirects
// here with ?view=list (see App.tsx) so nothing that linked to it breaks.
function BannerCarousel({ lat, lng }: { lat: number; lng: number }) {
  const navigate = useNavigate()
  const [banners, setBanners] = useState<Listing[] | null>(null)

  useEffect(() => {
    api
      .get<{ results: { listing: any }[] }>(`/api/listings/banners/active?lat=${lat}&lng=${lng}`)
      .then((res) => setBanners(res.results.map((r) => mapListing(r.listing))))
      .catch((err) => console.error('failed to load banners', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!banners || banners.length === 0) return null

  return (
    <div className="no-scrollbar scroll-fade-x flex gap-2 overflow-x-auto px-4 pb-2">
      {banners.map((b) => (
        <button
          key={b.id}
          onClick={() => navigate(`/listing/${b.id}`)}
          className="tap-flash card-elevated card-interactive flex w-64 shrink-0 items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 p-2.5 text-left"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-xl">
            {isImageUrl(b.images[0]) ? (
              <img src={b.images[0]} alt="" className="h-full w-full object-cover" />
            ) : (
              b.images[0] ?? CATEGORY_META[b.category].emoji
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-xs font-medium text-ink">
              <Megaphone size={10} className="shrink-0 text-accent" /> {b.title}
            </p>
            <p className="text-[11px] text-muted">{b.price > 0 ? formatPrice(b.price) : 'Visit store'}</p>
          </div>
        </button>
      ))}
    </div>
  )
}

export default function Explore() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { listings, sellers, userLocation } = useApp()
  const [view, setView] = useState<'map' | 'list'>(searchParams.get('view') === 'list' ? 'list' : 'map')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [recenterTick, setRecenterTick] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'search' | 'ai'>('search')
  const [rankMode, setRankMode] = useState<RankMode>('closest')
  const [listKind, setListKind] = useState<ListKind>('all')
  const [aiSummary, setAiSummary] = useState<string[] | null>(null)

  const sellerVerified = (id: string) => sellers.find((s) => s.id === id)?.verificationLevel ?? 0
  const sellerIsBusiness = (id: string) => sellers.find((s) => s.id === id)?.isBusiness ?? false
  const sellerRating = (id: string) => sellers.find((s) => s.id === id)?.rating ?? 4

  const toggleCategory = (c: Category) => {
    setFilters((f) => ({
      ...f,
      categories: f.categories.includes(c)
        ? f.categories.filter((x) => x !== c)
        : [...f.categories, c],
    }))
  }

  // AI mode reparses the free-text query into structured filters on every keystroke (see
  // lib/aiParse.ts) — same behavior the old dedicated Search page had, just applied here.
  const effectiveFilters = useMemo(() => {
    const f = { ...filters }
    if (mode === 'ai' && query.trim()) {
      const parsed = parseQuery(query)
      const summary: string[] = []
      if (parsed.category) {
        f.categories = [parsed.category]
        summary.push(`Category: ${CATEGORY_META[parsed.category].label}`)
      }
      if (parsed.maxPrice) {
        f.maxPrice = parsed.maxPrice
        summary.push(`Max price: NLe ${parsed.maxPrice.toLocaleString()}`)
      }
      if (parsed.minPrice) {
        f.minPrice = parsed.minPrice
        summary.push(`Min price: NLe ${parsed.minPrice.toLocaleString()}`)
      }
      if (parsed.condition) {
        f.condition = [parsed.condition]
        summary.push(`Condition: ${parsed.condition}`)
      }
      if (parsed.radiusKm) {
        f.radiusKm = parsed.radiusKm
        summary.push(`Radius: ${parsed.radiusKm} km`)
      }
      setAiSummary(summary.length ? summary : ['No specific filters detected — showing broad matches'])
    } else {
      setAiSummary(null)
    }
    return f
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, mode, query])

  // Text/AI-keyword filtering on top of the category+radius+price+condition+seller filters —
  // this runs regardless of view, so typing a query narrows the map pins too, not just the list.
  const textFiltered = useMemo(() => {
    const base = applyFilters(listings, effectiveFilters, sellerVerified, sellerIsBusiness, userLocation)
    if (mode === 'search' && query.trim()) {
      const q = query.toLowerCase()
      return base.filter(
        ({ listing }) =>
          listing.title.toLowerCase().includes(q) ||
          listing.description.toLowerCase().includes(q) ||
          listing.category.includes(q),
      )
    }
    if (mode === 'ai' && query.trim()) {
      const parsed = parseQuery(query)
      if (parsed.keywords.length) {
        const filteredByKw = base.filter(({ listing }) =>
          parsed.keywords.some(
            (kw) => listing.title.toLowerCase().includes(kw) || listing.description.toLowerCase().includes(kw),
          ),
        )
        if (filteredByKw.length) return filteredByKw
      }
    }
    return base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, effectiveFilters, query, mode, userLocation])

  // Products / Services / Verified quick filter — the fast top-level narrowing List view
  // asked for, on top of the full category chip list and the detailed filter sheet.
  const kindFiltered = useMemo(() => {
    if (listKind === 'all') return textFiltered
    if (listKind === 'verified') return textFiltered.filter(({ listing }) => sellerVerified(listing.sellerId) >= 3)
    if (listKind === 'services') return textFiltered.filter(({ listing }) => listing.category === 'services')
    return textFiltered.filter(({ listing }) => listing.category !== 'services')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textFiltered, listKind])

  // Map pins + the swipeable carousel underneath always read closest-first, independent of
  // the List view's rank mode (rank mode is a "how should the list be sorted" concept — a
  // map doesn't really have an order, so distance is the only sensible default there).
  const mapResults = useMemo(() => [...kindFiltered].sort((a, b) => a.distance - b.distance), [kindFiltered])
  const listResults = useMemo(
    () => rank(kindFiltered, rankMode, sellerRating),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kindFiltered, rankMode],
  )

  useEffect(() => {
    if (mapResults.length && !mapResults.find((r) => r.listing.id === selectedId)) {
      setSelectedId(mapResults[0].listing.id)
    }
    if (!mapResults.length) setSelectedId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapResults])

  const expandRadius = () => {
    const next = nextRadius(filters.radiusKm)
    if (next) setFilters((f) => ({ ...f, radiusKm: next }))
  }

  const selectFromMap = (id: string) => {
    setSelectedId(id)
    const idx = mapResults.findIndex((r) => r.listing.id === id)
    const el = carouselRef.current?.children[idx] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  const onCarouselScroll = () => {
    const el = carouselRef.current
    if (!el) return
    const idx = Math.round(el.scrollLeft / el.clientWidth)
    const item = mapResults[idx]
    if (item) setSelectedId(item.listing.id)
  }

  const openAskAi = () => {
    setMode('ai')
    setView('list')
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <div className="flex items-center gap-2 px-4 pb-2">
        <div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 transition focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]">
          {mode === 'search' ? (
            <SearchIcon size={16} className="shrink-0 text-muted" />
          ) : (
            <Sparkles size={16} className="shrink-0 text-ai" />
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setView('list')
            }}
            placeholder={
              mode === 'search'
                ? 'What are you looking for?'
                : 'e.g. "used iPhone under NLe 15,000 within 5 km"'
            }
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </div>
        <button
          onClick={openAskAi}
          aria-label="Ask AI"
          className="tap-flash glow-ai-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ai/12 text-ai transition-transform active:scale-90"
        >
          <Sparkles size={17} />
        </button>
      </div>

      <BannerCarousel lat={userLocation.lat} lng={userLocation.lng} />

      <div className="no-scrollbar scroll-fade-x flex gap-2 overflow-x-auto px-4 pb-2">
        {CATEGORIES.map((c) => {
          const active = filters.categories.includes(c)
          return (
            <button
              key={c}
              onClick={() => toggleCategory(c)}
              className={`tap-flash flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs transition active:scale-95 ${
                active ? 'glow-accent-ring bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
              }`}
            >
              <span>{CATEGORY_META[c].emoji}</span>
              {CATEGORY_META[c].label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2 px-4 pb-3">
        <div className="no-scrollbar scroll-fade-x flex flex-1 items-center gap-2 overflow-x-auto">
          {RADIUS_STEPS.map((r) => (
            <button
              key={r}
              onClick={() => setFilters((f) => ({ ...f, radiusKm: r }))}
              className={`tap-flash shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
                filters.radiusKm === r
                  ? 'bg-gradient-to-b from-accent-2 to-accent text-bg shadow-[0_2px_10px_-2px_rgba(36,91,50,0.5)]'
                  : 'bg-surface-2 text-muted'
              }`}
            >
              {r} km
            </button>
          ))}
          <button
            onClick={() => setFilters((f) => ({ ...f, radiusKm: 999 }))}
            className={`tap-flash shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
              filters.radiusKm === 999
                ? 'bg-gradient-to-b from-accent-2 to-accent text-bg shadow-[0_2px_10px_-2px_rgba(36,91,50,0.5)]'
                : 'bg-surface-2 text-muted'
            }`}
          >
            Anywhere
          </button>
        </div>
        <button
          onClick={() => setSheetOpen(true)}
          className="icon-btn h-8 w-8 shrink-0 bg-surface-2 text-muted"
          aria-label="More filters"
        >
          <SlidersHorizontal size={14} />
        </button>
      </div>

      {/* Map / List toggle — the one control that decides everything below it. */}
      <div className="flex justify-center pb-3">
        <div className="flex items-center gap-1 rounded-full bg-surface-2 p-1 shadow-inner">
          <button
            onClick={() => setView('map')}
            className={`tap-flash flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition active:scale-95 ${
              view === 'map'
                ? 'glow-accent-ring bg-gradient-to-b from-accent-2 to-accent text-bg shadow-[0_2px_10px_-2px_rgba(36,91,50,0.5)]'
                : 'text-muted'
            }`}
          >
            <MapIcon size={14} /> Map
          </button>
          <button
            onClick={() => setView('list')}
            className={`tap-flash flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition active:scale-95 ${
              view === 'list'
                ? 'glow-accent-ring bg-gradient-to-b from-accent-2 to-accent text-bg shadow-[0_2px_10px_-2px_rgba(36,91,50,0.5)]'
                : 'text-muted'
            }`}
          >
            <ListIcon size={14} /> List
          </button>
        </div>
      </div>

      {view === 'map' ? (
        <>
          <div className="relative flex-1 min-h-[320px]">
            <MapView
              listings={mapResults.map((r) => r.listing)}
              radiusKm={filters.radiusKm === 999 ? 25 : filters.radiusKm}
              selectedId={selectedId}
              onSelect={selectFromMap}
              recenterTrigger={recenterTick}
              userLocation={userLocation}
            />

            <div className="absolute bottom-3 right-3 z-[400] flex flex-col gap-2">
              <button
                onClick={() => setRecenterTick((t) => t + 1)}
                aria-label="Center on my location"
                className="tap-flash glow-accent-ring flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface/95 text-accent shadow-lg backdrop-blur transition-transform active:scale-90"
              >
                <LocateFixed size={16} />
              </button>
            </div>

            {mapResults.length === 0 && (
              <div className="pointer-events-none absolute inset-x-4 top-4 z-[400] rounded-2xl border border-border bg-surface/95 p-4 text-center text-sm shadow-lg backdrop-blur">
                <p className="text-ink">No matching products within {filters.radiusKm} km.</p>
                {nextRadius(filters.radiusKm) ? (
                  <button
                    onClick={expandRadius}
                    className="btn-primary pointer-events-auto mt-2 px-4 py-1.5 text-xs"
                  >
                    Expand search to {nextRadius(filters.radiusKm)} km
                  </button>
                ) : (
                  <p className="mt-1 text-xs text-muted">Try a different category or clear filters.</p>
                )}
              </div>
            )}
          </div>

          {mapResults.length > 0 && (
            <div className="border-t border-border bg-surface pb-1 pt-2">
              <p className="px-4 pb-2 text-xs text-muted">
                {mapResults.length} listing{mapResults.length !== 1 ? 's' : ''} within{' '}
                {filters.radiusKm === 999 ? 'anywhere' : `${filters.radiusKm} km`} — swipe
              </p>
              <div
                ref={carouselRef}
                onScroll={onCarouselScroll}
                className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3"
              >
                {mapResults.map(({ listing, distance }) => {
                  const seller = sellers.find((s) => s.id === listing.sellerId)
                  return (
                    <button
                      key={listing.id}
                      onClick={() => navigate(`/listing/${listing.id}`)}
                      className="card-elevated card-interactive flex w-[calc(100%-24px)] shrink-0 snap-center items-center gap-3 rounded-2xl bg-surface-2 p-3 text-left"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-bg text-2xl">
                        {isImageUrl(listing.images[0]) ? (
                          <img src={listing.images[0]} alt="" className="h-full w-full object-cover" />
                        ) : (
                          listing.images[0] ?? CATEGORY_META[listing.category].emoji
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{listing.title}</p>
                        <p className="text-sm font-display font-bold tracking-tight text-accent">
                          {listing.price > 0 ? formatPrice(listing.price) : 'Visit store'}
                        </p>
                        <div className="flex items-center gap-1 text-[11px] text-muted">
                          <span>{formatDistance(distance)} away</span>
                          <span>·</span>
                          <span className="text-good">Available</span>
                          {seller && seller.verificationLevel >= 3 && (
                            <BadgeCheck size={11} className="text-good" />
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 px-4 pb-2">
            <button
              onClick={() => setMode('search')}
              className={`tap-flash rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
                mode === 'search'
                  ? 'bg-gradient-to-b from-accent-2 to-accent text-bg shadow-[0_2px_10px_-2px_rgba(36,91,50,0.5)]'
                  : 'bg-surface-2 text-muted'
              }`}
            >
              Search
            </button>
            <button
              onClick={() => setMode('ai')}
              className={`tap-flash flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
                mode === 'ai' ? 'bg-ai text-bg shadow-[0_2px_10px_-2px_rgba(109,87,232,0.55)]' : 'bg-surface-2 text-muted'
              }`}
            >
              <Sparkles size={12} /> Ask AI
            </button>
          </div>

          <div className="no-scrollbar scroll-fade-x flex gap-1.5 overflow-x-auto px-4 pb-2">
            {LIST_KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => setListKind(k.id)}
                className={`tap-flash shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
                  listKind === k.id
                    ? 'glow-accent-ring bg-accent/15 text-accent'
                    : 'bg-surface-2 text-muted'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          {aiSummary && (
            <div className="mx-4 mb-2 rounded-xl bg-ai/10 p-2.5 text-xs text-ink">
              <p className="mb-1 flex items-center gap-1 font-medium text-ai">
                <Sparkles size={12} /> AI understood
              </p>
              <p className="text-muted">{aiSummary.join(' · ')}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 px-4 pb-2">
            <p className="shrink-0 text-xs text-muted">{listResults.length} results</p>
            <div className="no-scrollbar scroll-fade-x flex max-w-[70%] gap-1.5 overflow-x-auto">
              {RANK_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setRankMode(m.id)}
                  className={`tap-flash shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition active:scale-95 ${
                    rankMode === m.id
                      ? 'bg-gradient-to-b from-accent-2 to-accent text-bg shadow-[0_2px_8px_-2px_rgba(36,91,50,0.5)]'
                      : 'bg-surface-2 text-muted'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
            {listResults.length === 0 && (
              <p className="pt-8 text-center text-sm text-muted">No listings match yet — try widening the radius or clearing filters.</p>
            )}
            {listResults.map(({ listing }) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </>
      )}

      <BottomNav />
      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        onChange={setFilters}
      />
    </div>
  )
}
