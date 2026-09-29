import { useEffect, useState } from 'react'
import { BarChart3, CheckCircle2, ListChecks, Loader2, MapPin, Megaphone, Pencil, Rocket, Star, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BackHeader from '../../components/BackHeader'
import ListingCard from '../../components/ListingCard'
import EmptyState from '../../components/EmptyState'
import { useApp } from '../../context/AppContext'
import { ApiError } from '../../lib/api'
import type { Listing, ListingStatus } from '../../types'
import { api } from '../../lib/api'
import { mapListing } from '../../lib/mappers'
import { formatPrice } from '../../lib/format'
import { useToast } from '../../components/Toast'
import LoadError from '../../components/LoadError'
import ListingPackagePicker from '../../components/ListingPackagePicker'
import { listingsAreFree, useRateCard } from '../../lib/rateCard'

// Prices come from the API's rate card (GET /api/rate-card, see lib/rateCard.ts); the real
// charge (simulated until Monime is connected) happens server-side in the renew/boost/
// feature/pin-category/banner-ad routes.

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const TABS: { id: ListingStatus | 'all'; label: string }[] = [
  { id: 'active', label: 'Active' },
  // Reserved = an offer was accepted and the deal is in progress. These used to vanish
  // from My Listings entirely, since no tab showed them.
  { id: 'reserved', label: 'Reserved' },
  { id: 'sold', label: 'Sold' },
  { id: 'expired', label: 'Expired' },
  { id: 'draft', label: 'Drafts' },
]

const ALL_STATUSES = 'draft,pending_payment,active,reserved,sold,expired,removed'

type ActionKind = 'renew' | 'boost' | 'feature' | 'pin' | 'banner' | 'sold' | 'remove'

export default function MyListings() {
  const toast = useToast()
  const { currentUser, renewListing, boostListing, featureListing, pinListingCategory, bannerListing, updateListingStatus } =
    useApp()
  const [tab, setTab] = useState<ListingStatus | 'all'>('active')
  const [mine, setMine] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState<Record<string, ActionKind | undefined>>({})
  const card = useRateCard()
  const freeNow = listingsAreFree(card)
  // Renewal package chosen per listing (defaults to 1 week).
  const [renewWeeks, setRenewWeeks] = useState<Record<string, number>>({})
  const navigate = useNavigate()
  // Free boost weeks earned by inviting friends (see account/Invite.tsx) — spent before paying.
  const [boostCredits, setBoostCredits] = useState(0)
  useEffect(() => {
    api
      .get<{ boostCredits: number }>('/api/referrals/me')
      .then((r) => setBoostCredits(r.boostCredits))
      .catch(() => {})
  }, [])
  const boostWithCredit = async (id: string) => {
    const updated = await boostListing(id, true)
    setBoostCredits((c) => Math.max(0, c - 1))
    toast.success('Boosted for a week — free, thanks to your invites.')
    return updated
  }

  useEffect(() => {
    if (!currentUser) return
    let cancelled = false
    setLoading(true)
    setLoadFailed(false)
    api
      .get<{ results: { listing: any; seller: any }[] }>(
        `/api/listings?sellerId=${currentUser.id}&status=${ALL_STATUSES}&radiusKm=25000`,
      )
      .then((res) => {
        if (cancelled) return
        setMine(res.results.map((r) => mapListing(r.listing)))
      })
      .catch((err) => {
        console.error('failed to load my listings', err)
        if (!cancelled) setLoadFailed(true)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [currentUser, reloadKey])

  const filtered = mine.filter((l) => l.status === tab)

  const describeError = (err: unknown) =>
    err instanceof ApiError && err.message ? err.message : 'Could not complete that action — please try again.'


  const runAction = async (listingId: string, kind: ActionKind, action: (id: string) => Promise<Listing>) => {
    setBusy((b) => ({ ...b, [listingId]: kind }))
    try {
      const updated = await action(listingId)
      setMine((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
    } catch (err) {
      console.error(`${kind} failed`, err)
      toast.error(describeError(err))
    } finally {
      setBusy((b) => ({ ...b, [listingId]: undefined }))
    }
  }

  const markSold = (listingId: string) => runAction(listingId, 'sold', (id) => updateListingStatus(id, 'sold'))
  // In-app confirm sheet instead of the browser's window.confirm() popup.
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const removeListing = (listingId: string) => {
    setConfirmRemoveId(null)
    runAction(listingId, 'remove', (id) => updateListingStatus(id, 'removed'))
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader
        title="My Listings"
        right={
          <button onClick={() => navigate('/account/insights')} className="icon-btn h-11 w-11 bg-surface-2 text-accent" aria-label="Seller insights">
            <BarChart3 size={18} />
          </button>
        }
      />
      <div className="no-scrollbar scroll-fade-x flex gap-2 overflow-x-auto px-4 pb-3 pt-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as ListingStatus)}
            className={`tap-flash min-h-9 shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition active:scale-95 ${
              tab === t.id ? 'glow-accent-ring bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
            }`}
          >
            {t.label} ({mine.filter((l) => l.status === t.id).length})
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {loadFailed && <LoadError message="Couldn't load your listings." onRetry={() => setReloadKey((k) => k + 1)} />}
        {!loading && !loadFailed && filtered.length === 0 && (
          <EmptyState
            icon={ListChecks}
            title={mine.length === 0 ? 'You have not listed anything yet' : `No ${tab} listings`}
            hint={mine.length === 0 ? 'Tap Sell to publish your first listing.' : undefined}
          />
        )}
        {loading && (
          <div className="flex justify-center py-10 text-muted">
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((l) => {
          const isBusy = !!busy[l.id]
          const promos: {
            kind: ActionKind
            label: string
            icon: typeof Rocket
            activeUntil?: string
            price: number
            run: (id: string) => Promise<Listing>
            hint?: string
          }[] = [
            {
              kind: 'boost',
              label: 'Boost',
              icon: Rocket,
              activeUntil: l.sponsored ? l.sponsoredUntil : undefined,
              price: card.boostPerWeek,
              run: boostCredits > 0 ? boostWithCredit : (id) => boostListing(id),
              hint: boostCredits > 0 ? `Free week · ${boostCredits} left` : undefined,
            },
            { kind: 'feature', label: 'Feature', icon: Star, activeUntil: l.featured ? l.featuredUntil : undefined, price: card.featurePerWeek, run: featureListing },
            { kind: 'pin', label: 'Top of category', icon: MapPin, activeUntil: l.categoryPinned ? l.categoryPinnedUntil : undefined, price: card.topOfCategoryPerWeek, run: pinListingCategory },
            {
              kind: 'banner',
              label: 'Banner ad',
              icon: Megaphone,
              activeUntil: l.banner ? l.bannerUntil : undefined,
              price: card.bannerPerPeriod,
              run: bannerListing,
              hint: currentUser?.isBusiness ? undefined : 'Business accounts only',
            },
          ]
          return (
            <div key={l.id} className="space-y-2">
              <ListingCard listing={l} />
              {(l.status === 'active' || l.status === 'expired') && (
                <div className="card-elevated space-y-3 rounded-2xl bg-surface p-3">
                  {/* Listing fee: when it's paid until, and renewing for 1–4 weeks. */}
                  <div className="space-y-2">
                    <p className={`text-xs leading-snug ${l.status === 'expired' ? 'font-medium text-bad' : 'text-muted'}`}>
                      {l.status === 'expired'
                        ? `Hidden from buyers — fee unpaid since ${shortDate(l.feePaidUntil)}`
                        : `Listing fee paid until ${shortDate(l.feePaidUntil)}`}
                    </p>
                    <div className="space-y-2">
                      <div>
                        <ListingPackagePicker
                          card={card}
                          compact
                          weeks={(renewWeeks[l.id] ?? 1)}
                          onChange={(w) => setRenewWeeks((prev) => ({ ...prev, [l.id]: w }))}
                        />
                      </div>
                      <button
                        onClick={() => runAction(l.id, 'renew', (id) => renewListing(id, (renewWeeks[l.id] ?? 1)))}
                        disabled={isBusy}
                        className={`tap-flash flex min-h-11 w-full items-center justify-center gap-1 rounded-full px-4 text-sm font-semibold transition active:scale-95 disabled:opacity-60 ${
                          l.status === 'expired'
                            ? 'bg-gradient-to-b from-accent-2 to-accent text-white'
                            : 'bg-surface-2 text-ink'
                        }`}
                      >
                        {busy[l.id] === 'renew' ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : freeNow ? (
                          'Renew'
                        ) : (
                          `Renew · ${formatPrice(card.listingFeePerWeek * (renewWeeks[l.id] ?? 1))}`
                        )}
                      </button>
                    </div>
                  </div>

                  {l.status === 'active' && (
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Promote</p>
                      <div className="grid grid-cols-2 gap-2">
                        {promos.map((p) => {
                          const Icon = p.icon
                          const on = !!p.activeUntil
                          return (
                            <button
                              key={p.kind}
                              onClick={() => runAction(l.id, p.kind, p.run)}
                              disabled={isBusy}
                              title={p.hint}
                              className={`tap-flash flex min-h-12 items-center gap-2 rounded-xl px-3 py-2 text-left transition active:scale-[0.97] disabled:opacity-60 ${
                                on ? 'bg-accent/10 ring-1 ring-accent/30' : 'bg-surface-2'
                              }`}
                            >
                              <span className={`shrink-0 ${on ? 'text-accent' : 'text-muted'}`}>
                                {busy[l.id] === p.kind ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-semibold text-ink">{p.label}</span>
                                <span className={`block truncate text-[11px] ${on ? 'text-accent' : 'text-muted'}`}>
                                  {p.kind === 'boost' && p.hint
                                    ? p.hint
                                    : on
                                      ? `Active until ${shortDate(p.activeUntil!)} · extend`
                                      : p.hint ?? `${formatPrice(p.price)} / ${p.kind === 'banner' ? `${card.bannerPeriodDays} days` : 'week'}`}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {(l.status === 'active' || l.status === 'reserved' || l.status === 'expired') && (
                <div className={`grid gap-2 ${l.status === 'expired' ? 'grid-cols-1' : 'grid-cols-3'}`}>
                  <button
                    onClick={() => navigate(`/account/listings/${l.id}/edit`)}
                    disabled={isBusy}
                    className="tap-flash flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-surface-2 text-sm font-medium text-ink transition active:scale-95 disabled:opacity-60"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  {l.status !== 'expired' && (
                  <>
                  <button
                    onClick={() => markSold(l.id)}
                    disabled={isBusy}
                    className="tap-flash flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-good/10 text-sm font-medium text-good transition active:scale-95 disabled:opacity-60"
                  >
                    {busy[l.id] === 'sold' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    Sold
                  </button>
                  <button
                    onClick={() => setConfirmRemoveId(l.id)}
                    disabled={isBusy}
                    className="tap-flash flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-bad/10 text-sm font-medium text-bad transition active:scale-95 disabled:opacity-60"
                  >
                    {busy[l.id] === 'remove' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={15} />}
                    Remove
                  </button>
                  </>
                  )}
                </div>
              )}
            </div>
          )
        })}
        </div>
      </div>
      {confirmRemoveId && (
        <div
          className="scrim-enter fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px]"
          onClick={(e) => e.target === e.currentTarget && setConfirmRemoveId(null)}
        >
          <div role="alertdialog" aria-modal="true" aria-labelledby="remove-title" className="sheet-elevated sheet-enter w-full max-w-md rounded-t-3xl border-t border-border bg-surface p-5">
            <h2 id="remove-title" className="text-lg font-display font-bold tracking-tight text-ink">
              Remove this listing?
            </h2>
            <p className="mt-1 text-sm text-muted">Buyers won't be able to find it any more. This can't be undone.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmRemoveId(null)} className="btn-secondary min-h-12 text-sm">
                Keep it
              </button>
              <button onClick={() => removeListing(confirmRemoveId)} className="btn-danger min-h-12 text-sm">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
