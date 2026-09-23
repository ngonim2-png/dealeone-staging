import { useEffect, useState } from 'react'
import { Loader2, Rocket, Star, MapPin as PinIcon, Megaphone, Zap, Search, BadgeCheck, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import ListingCard from '../components/ListingCard'
import EmptyState from '../components/EmptyState'
import { useApp } from '../context/AppContext'
import { ApiError, api } from '../lib/api'
import { mapListing } from '../lib/mappers'
import { formatPrice } from '../lib/format'
import type { Listing } from '../types'

// New bottom-nav tab that centralizes every paid-promotion action that already existed
// scattered across Account (My Listings' boost/feature/pin/banner buttons, Verification's
// fast-track purchase, Buyer Requests' priority purchase). Nothing here is new server-side —
// it all calls the same AppContext actions those pages already use — this just gives sellers
// one place to go instead of hunting through Account for "how do I get more visibility."
const BOOST_FEE_PER_WEEK = 100
const FEATURE_FEE_PER_WEEK = 100
const CATEGORY_PIN_FEE_PER_WEEK = 100
const BANNER_FEE_PER_WEEK = 100
const VERIFICATION_PRIORITY_FEE_PER_WEEK = 100
const BUYER_REQUEST_PRIORITY_FEE_PER_WEEK = 100

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

type ActionKind = 'boost' | 'feature' | 'pin' | 'banner'

export default function Promote() {
  const navigate = useNavigate()
  const {
    currentUser,
    boostListing,
    featureListing,
    pinListingCategory,
    bannerListing,
    purchaseVerificationPriority,
    purchaseBuyerRequestPriority,
  } = useApp()
  const [mine, setMine] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Record<string, ActionKind | undefined>>({})
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [requestBusy, setRequestBusy] = useState(false)

  useEffect(() => {
    if (!currentUser) return
    let cancelled = false
    setLoading(true)
    api
      .get<{ results: { listing: any }[] }>(
        `/api/listings?sellerId=${currentUser.id}&status=active,expired&radiusKm=25000`,
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

  if (!currentUser) return null // App.tsx only renders this route once bootstrap is ready

  const hasVerifyPriority = !!(
    currentUser.verificationPriorityUntil && new Date(currentUser.verificationPriorityUntil) > new Date()
  )
  const hasRequestPriority = !!(
    currentUser.buyerRequestPriorityUntil && new Date(currentUser.buyerRequestPriorityUntil) > new Date()
  )

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

  const buyVerifyPriority = async () => {
    setVerifyBusy(true)
    try {
      await purchaseVerificationPriority()
    } catch (err) {
      console.error('purchase verification priority failed', err)
      alert(describeError(err))
    } finally {
      setVerifyBusy(false)
    }
  }

  const buyRequestPriority = async () => {
    setRequestBusy(true)
    try {
      await purchaseBuyerRequestPriority()
    } catch (err) {
      console.error('purchase buyer request priority failed', err)
      alert(describeError(err))
    } finally {
      setRequestBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">Promote</h1>
          <p className="text-sm text-muted">Get seen first — boost listings, get verified faster, or jump the queue.</p>
        </div>

        {!currentUser.isBusiness && (
          <button
            onClick={() => navigate('/account/settings')}
            className="tap-flash card-elevated card-interactive flex w-full items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 p-3.5 text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Megaphone size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">Switch to a business account</p>
              <p className="text-xs text-muted">Required for banner ads and status updates — free to enable.</p>
            </div>
            <ArrowRight size={14} className="shrink-0 text-muted" />
          </button>
        )}

        <div className="card-elevated flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 p-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Zap size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Verified-seller fast-track</p>
            <p className="text-xs text-muted">
              {hasVerifyPriority
                ? `Active until ${new Date(currentUser.verificationPriorityUntil!).toLocaleDateString()}`
                : `Jump to the front of the admin review queue · ${formatPrice(VERIFICATION_PRIORITY_FEE_PER_WEEK)}/wk`}
            </p>
          </div>
          <button
            onClick={buyVerifyPriority}
            disabled={verifyBusy}
            className="tap-flash shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-accent transition active:scale-95 disabled:opacity-60"
          >
            {verifyBusy ? <Loader2 size={12} className="animate-spin" /> : hasVerifyPriority ? 'Extend' : 'Buy'}
          </button>
        </div>

        <div className="card-elevated flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 p-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Search size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Buyer request priority</p>
            <p className="text-xs text-muted">
              {hasRequestPriority
                ? `Active until ${new Date(currentUser.buyerRequestPriorityUntil!).toLocaleDateString()}`
                : `See buyer requests before anyone else · ${formatPrice(BUYER_REQUEST_PRIORITY_FEE_PER_WEEK)}/wk`}
            </p>
          </div>
          <button
            onClick={buyRequestPriority}
            disabled={requestBusy}
            className="tap-flash shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-accent transition active:scale-95 disabled:opacity-60"
          >
            {requestBusy ? <Loader2 size={12} className="animate-spin" /> : hasRequestPriority ? 'Extend' : 'Buy'}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Boost your listings</h2>
          {mine.length > 0 && <p className="text-xs text-muted">{mine.length} eligible</p>}
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin text-muted" />
          </div>
        )}

        {!loading && mine.length === 0 && (
          <EmptyState
            icon={Rocket}
            title="Nothing to promote yet"
            hint="Tap Sell to publish a listing, then come back here to boost it."
          />
        )}

        {mine.map((l) => (
          <div key={l.id} className="space-y-1.5">
            <ListingCard listing={l} />
            <div className="card-elevated rounded-xl bg-surface p-2.5 text-xs">
              <p className={l.status === 'expired' ? 'text-bad' : 'text-muted'}>
                {l.status === 'expired'
                  ? `Fee unpaid since ${shortDate(l.feePaidUntil)} — hidden from buyers until renewed in My Listings`
                  : `Fee paid until ${shortDate(l.feePaidUntil)}`}
              </p>
              <div className="mt-2 flex gap-1.5">
                <button
                  onClick={() => runAction(l.id, 'boost', boostListing)}
                  disabled={!!busy[l.id] || l.status === 'expired'}
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
                  disabled={!!busy[l.id] || l.status === 'expired'}
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
                        <PinIcon size={12} />
                        {l.categoryPinned
                          ? `Until ${shortDate(l.categoryPinnedUntil!)}`
                          : `Top of category · ${formatPrice(CATEGORY_PIN_FEE_PER_WEEK)}/wk`}
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => runAction(l.id, 'banner', bannerListing)}
                    disabled={!!busy[l.id] || !currentUser.isBusiness}
                    className="tap-flash flex flex-1 items-center justify-center gap-1 rounded-lg bg-surface-2 py-1.5 font-medium text-muted transition active:scale-95 disabled:opacity-60"
                    title={currentUser.isBusiness ? undefined : 'Business accounts only — see Account > Settings'}
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
          </div>
        ))}

        {currentUser.isBusiness && (
          <button
            onClick={() => navigate('/chats')}
            className="tap-flash card-elevated card-interactive flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3.5 text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <BadgeCheck size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">Post a status</p>
              <p className="text-xs text-muted">
                Business accounts with an active promotion can post a 24h photo status shown to everyone in Chats.
              </p>
            </div>
            <ArrowRight size={14} className="shrink-0 text-muted" />
          </button>
        )}

        <button
          onClick={() => navigate('/account/listings')}
          className="tap-flash flex w-full items-center justify-center gap-1 rounded-xl bg-surface-2 py-2.5 text-xs font-medium text-muted transition active:scale-95"
        >
          Manage all listings (renew, mark sold, remove) <ArrowRight size={12} />
        </button>
      </div>

      <BottomNav />
    </div>
  )
}
