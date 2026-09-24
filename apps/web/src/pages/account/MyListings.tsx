import { useEffect, useState } from 'react'
import { CheckCircle2, ListChecks, Loader2, MapPin, Megaphone, Rocket, Star, Trash2 } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import ListingCard from '../../components/ListingCard'
import EmptyState from '../../components/EmptyState'
import { useApp } from '../../context/AppContext'
import { ApiError } from '../../lib/api'
import type { Listing, ListingStatus } from '../../types'
import { api } from '../../lib/api'
import { mapListing } from '../../lib/mappers'
import { formatPrice } from '../../lib/format'

// Kept in sync with apps/api/src/lib/billing.ts's constants — shown here purely for
// copy/button labels, the real charge (simulated — no payment gateway yet) happens
// server-side in the renew/boost/feature/pin-category/banner-ad routes, which are the
// actual source of truth.
const LISTING_FEE_PER_MONTH = 30
const BOOST_FEE_PER_WEEK = 100
const FEATURE_FEE_PER_WEEK = 100
const CATEGORY_PIN_FEE_PER_WEEK = 100
const BANNER_FEE_PER_WEEK = 100

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const TABS: { id: ListingStatus | 'all'; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'sold', label: 'Sold' },
  { id: 'expired', label: 'Expired' },
  { id: 'draft', label: 'Drafts' },
]

const ALL_STATUSES = 'draft,pending_payment,active,reserved,sold,expired,removed'

type ActionKind = 'renew' | 'boost' | 'feature' | 'pin' | 'banner' | 'sold' | 'remove'

export default function MyListings() {
  const { currentUser, renewListing, boostListing, featureListing, pinListingCategory, bannerListing, updateListingStatus } =
    useApp()
  const [tab, setTab] = useState<ListingStatus | 'all'>('active')
  const [mine, setMine] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Record<string, ActionKind | undefined>>({})

  useEffect(() => {
    if (!currentUser) return
    let cancelled = false
    setLoading(true)
    api
      .get<{ results: { listing: any; seller: any }[] }>(
        `/api/listings?sellerId=${currentUser.id}&status=${ALL_STATUSES}&radiusKm=25000`,
      )
      .then((res) => {
        if (cancelled) return
        setMine(res.results.map((r) => mapListing(r.listing)))
      })
      .catch((err) => console.error('failed to load my listings', err))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [currentUser])

  const filtered = mine.filter((l) => l.status === tab)

  const describeError = (err: unknown) => {
    if (err instanceof ApiError) {
      try {
        const parsed = JSON.parse(err.message)
        if (typeof parsed === 'string') return parsed
      } catch {
        // not JSON — fall through to the raw message
      }
      return err.message
    }
    return 'Could not complete that action — check the API server is running and try again.'
  }

  const runAction = async (listingId: string, kind: ActionKind, action: (id: string) => Promise<Listing>) => {
    setBusy((b) => ({ ...b, [listingId]: kind }))
    try {
      const updated = await action(listingId)
      setMine((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
    } catch (err) {
      console.error(`${kind} failed`, err)
      alert(describeError(err))
    } finally {
      setBusy((b) => ({ ...b, [listingId]: undefined }))
    }
  }

  const markSold = (listingId: string) => runAction(listingId, 'sold', (id) => updateListingStatus(id, 'sold'))
  const removeListing = (listingId: string) => {
    if (!window.confirm('Remove this listing? Buyers will no longer be able to find it.')) return
    runAction(listingId, 'remove', (id) => updateListingStatus(id, 'removed'))
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="My Listings" />
      <div className="flex gap-2 px-4 pb-3 pt-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as ListingStatus)}
            className={`tap-flash rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
              tab === t.id ? 'glow-accent-ring bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
            }`}
          >
            {t.label} ({mine.filter((l) => l.status === t.id).length})
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {!loading && filtered.length === 0 && (
          <EmptyState
            icon={ListChecks}
            title={mine.length === 0 ? 'You have not listed anything yet' : `No ${tab} listings`}
            hint={mine.length === 0 ? 'Tap Sell to publish your first listing.' : undefined}
          />
        )}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 lg:grid-cols-3">
        {filtered.map((l) => (
          <div key={l.id} className="space-y-1.5">
            <ListingCard listing={l} />
            {(l.status === 'active' || l.status === 'expired') && (
              <div className="card-elevated rounded-xl bg-surface p-2.5 text-xs">
                <p className={l.status === 'expired' ? 'text-bad' : 'text-muted'}>
                  {l.status === 'expired'
                    ? `Fee unpaid since ${shortDate(l.feePaidUntil)} — hidden from buyers until renewed`
                    : `Fee paid until ${shortDate(l.feePaidUntil)}`}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => runAction(l.id, 'renew', renewListing)}
                    disabled={!!busy[l.id]}
                    className={`tap-flash flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 font-medium transition active:scale-95 disabled:opacity-60 ${
                      l.status === 'expired' ? 'glow-accent-ring bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
                    }`}
                  >
                    {busy[l.id] === 'renew' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      `Renew · ${formatPrice(LISTING_FEE_PER_MONTH)}`
                    )}
                  </button>
                  <button
                    onClick={() => runAction(l.id, 'boost', boostListing)}
                    disabled={!!busy[l.id]}
                    className="tap-flash flex flex-1 items-center justify-center gap-1 rounded-lg bg-surface-2 py-1.5 font-medium text-muted transition active:scale-95 disabled:opacity-60"
                  >
                    {busy[l.id] === 'boost' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <>
                        <Rocket size={12} />
                        {l.sponsored ? `Until ${shortDate(l.sponsoredUntil!)}` : `Boost · ${formatPrice(BOOST_FEE_PER_WEEK)}/wk`}
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => runAction(l.id, 'feature', featureListing)}
                    disabled={!!busy[l.id]}
                    className="tap-flash flex flex-1 items-center justify-center gap-1 rounded-lg bg-surface-2 py-1.5 font-medium text-muted transition active:scale-95 disabled:opacity-60"
                  >
                    {busy[l.id] === 'feature' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <>
                        <Star size={12} />
                        {l.featured ? `Until ${shortDate(l.featuredUntil!)}` : `Feature · ${formatPrice(FEATURE_FEE_PER_WEEK)}/wk`}
                      </>
                    )}
                  </button>
                </div>
                {l.status === 'active' && (
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      onClick={() => runAction(l.id, 'pin', pinListingCategory)}
                      disabled={!!busy[l.id]}
                      className="tap-flash flex flex-1 items-center justify-center gap-1 rounded-lg bg-surface-2 py-1.5 font-medium text-muted transition active:scale-95 disabled:opacity-60"
                    >
                      {busy[l.id] === 'pin' ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <>
                          <MapPin size={12} />
                          {l.categoryPinned
                            ? `Until ${shortDate(l.categoryPinnedUntil!)}`
                            : `Top of category · ${formatPrice(CATEGORY_PIN_FEE_PER_WEEK)}/wk`}
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => runAction(l.id, 'banner', bannerListing)}
                      disabled={!!busy[l.id]}
                      className="tap-flash flex flex-1 items-center justify-center gap-1 rounded-lg bg-surface-2 py-1.5 font-medium text-muted transition active:scale-95 disabled:opacity-60"
                      title={currentUser?.isBusiness ? undefined : 'Business accounts only — see Account > Settings'}
                    >
                      {busy[l.id] === 'banner' ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <>
                          <Megaphone size={12} />
                          {l.banner ? `Until ${shortDate(l.bannerUntil!)}` : `Banner ad · ${formatPrice(BANNER_FEE_PER_WEEK)}/wk`}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
            {(l.status === 'active' || l.status === 'reserved') && (
              <div className="flex gap-1.5">
                <button
                  onClick={() => markSold(l.id)}
                  disabled={!!busy[l.id]}
                  className="tap-flash flex flex-1 items-center justify-center gap-1 rounded-lg bg-good/10 py-1.5 text-xs font-medium text-good transition active:scale-95 disabled:opacity-60"
                >
                  {busy[l.id] === 'sold' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  Mark as Sold
                </button>
                <button
                  onClick={() => removeListing(l.id)}
                  disabled={!!busy[l.id]}
                  className="tap-flash flex flex-1 items-center justify-center gap-1 rounded-lg bg-bad/10 py-1.5 text-xs font-medium text-bad transition active:scale-95 disabled:opacity-60"
                >
                  {busy[l.id] === 'remove' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
        </div>
      </div>
    </div>
  )
}
