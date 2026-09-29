import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Tags } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import EmptyState from '../../components/EmptyState'
import LoadError from '../../components/LoadError'
import { api, errorMessage } from '../../lib/api'
import { formatPrice, relativeTime } from '../../lib/format'
import { useToast } from '../../components/Toast'

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-accent bg-accent/10 border-accent/30',
  accepted: 'text-good bg-good/10 border-good/30',
  rejected: 'text-bad bg-bad/10 border-bad/30',
  countered: 'text-accent bg-accent/10 border-accent/30',
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting',
  accepted: 'Accepted',
  rejected: 'Declined',
  countered: 'Countered',
}

type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'countered'
interface OfferRow {
  id: string
  listingId: string
  amount: number
  message: string | null
  status: OfferStatus
  counterAmount: number | null
  createdAt: string
}

// Seller side — offers buyers made on my listings (GET /api/offers/received), acted on via
// PATCH /:id/accept|reject|counter.
interface ReceivedOfferRow {
  offer: OfferRow
  listing: { id: string; title: string; price: number; status: string }
  buyer: { id: string; name: string; avatarEmoji: string; rating: number; ratingCount: number }
}
// Buyer side — offers I sent (GET /api/offers). Loaded fresh each visit (instead of reading
// the copy cached at sign-in) so a seller's accept/decline/counter shows up here, and it
// carries its own listing so sold or expired items still appear.
interface SentOfferRow {
  offer: OfferRow
  listing: { id: string; title: string; price: number; status: string }
}

function useOffers<T>(path: string) {
  const [rows, setRows] = useState<T[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const load = useCallback(() => {
    setFailed(null)
    api
      .get<{ offers: T[] }>(path)
      .then((res) => setRows(res.offers))
      .catch((err) => setFailed(errorMessage(err, "Couldn't load your offers.")))
  }, [path])
  useEffect(load, [load])
  return { rows, failed, load }
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-12 text-muted">
      <Loader2 size={20} className="animate-spin" />
    </div>
  )
}

function SentTab() {
  const navigate = useNavigate()
  const { rows, failed, load } = useOffers<SentOfferRow>('/api/offers')

  if (failed) return <LoadError message={failed} onRetry={load} />
  if (!rows) return <Loading />
  if (rows.length === 0) {
    return <EmptyState icon={Tags} title="You haven't sent any offers yet" hint="Open a listing and tap Make Offer." />
  }
  return (
    <>
      {rows.map(({ offer: o, listing }) => (
        <button
          key={o.id}
          onClick={() => navigate(`/listing/${listing.id}`)}
          className="card-elevated card-interactive flex w-full items-center justify-between gap-3 rounded-xl bg-surface p-3.5 text-left"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{listing.title}</p>
            <p className="text-xs text-muted">
              Asking {formatPrice(listing.price)} · sent {relativeTime(o.createdAt)}
            </p>
            {o.status === 'countered' && o.counterAmount != null && (
              <p className="mt-1 text-xs font-medium text-accent">
                Seller countered at {formatPrice(o.counterAmount)} — reply in Messages
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold text-ink">{formatPrice(o.amount)}</p>
            <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLE[o.status]}`}>
              {STATUS_LABEL[o.status]}
            </span>
          </div>
        </button>
      ))}
    </>
  )
}

function ReceivedTab() {
  const toast = useToast()
  const { rows, failed, load } = useOffers<ReceivedOfferRow>('/api/offers/received')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [counterOpenId, setCounterOpenId] = useState<string | null>(null)
  const [counterValue, setCounterValue] = useState('')

  const act = async (id: string, action: 'accept' | 'reject' | 'counter', body?: unknown) => {
    if (busyId) return
    setBusyId(id)
    try {
      await api.patch(`/api/offers/${id}/${action}`, body)
      setCounterOpenId(null)
      setCounterValue('')
      toast.success(action === 'accept' ? 'Offer accepted — the listing is now reserved.' : action === 'reject' ? 'Offer declined.' : 'Counter-offer sent.')
      load()
    } catch (err) {
      console.error(`offer ${action} failed`, err)
      toast.error(errorMessage(err, 'Could not complete that action — please try again.'))
      load()
    } finally {
      setBusyId(null)
    }
  }

  if (failed) return <LoadError message={failed} onRetry={load} />
  if (!rows) return <Loading />
  if (rows.length === 0) {
    return <EmptyState icon={Tags} title="No offers received yet" hint="Offers buyers make on your listings show up here." />
  }

  return (
    <>
      {rows.map(({ offer, listing, buyer }) => {
        const canAct = (offer.status === 'pending' || offer.status === 'countered') && listing.status === 'active'
        const busy = busyId === offer.id
        const counter = Math.round(Number(counterValue))
        return (
          <div key={offer.id} className="card-elevated rounded-xl bg-surface p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{listing.title}</p>
                <p className="text-xs text-muted">
                  {buyer.name} · {relativeTime(offer.createdAt)} · asking {formatPrice(listing.price)}
                </p>
                {offer.message && <p className="mt-1 text-xs text-ink">“{offer.message}”</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-ink">{formatPrice(offer.amount)}</p>
                <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLE[offer.status]}`}>
                  {STATUS_LABEL[offer.status]}
                </span>
              </div>
            </div>
            {offer.status === 'countered' && offer.counterAmount != null && (
              <p className="mt-1 text-xs text-accent">You countered at {formatPrice(offer.counterAmount)}</p>
            )}
            {canAct && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  disabled={busy}
                  onClick={() => act(offer.id, 'accept')}
                  className="tap-flash flex min-h-10 items-center justify-center gap-1 rounded-full bg-good/10 px-3 text-sm font-medium text-good transition active:scale-95 disabled:opacity-60"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : 'Accept'}
                </button>
                <button
                  disabled={busy}
                  onClick={() => act(offer.id, 'reject')}
                  className="tap-flash flex min-h-10 items-center justify-center gap-1 rounded-full bg-bad/10 px-3 text-sm font-medium text-bad transition active:scale-95 disabled:opacity-60"
                >
                  Decline
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setCounterOpenId(counterOpenId === offer.id ? null : offer.id)
                    setCounterValue(String(Math.round((offer.amount + listing.price) / 2)))
                  }}
                  aria-expanded={counterOpenId === offer.id}
                  className="tap-flash flex min-h-10 items-center justify-center gap-1 rounded-full bg-surface-2 px-3 text-sm font-medium text-ink transition active:scale-95 disabled:opacity-60"
                >
                  Counter
                </button>
              </div>
            )}
            {canAct && counterOpenId === offer.id && (
              <div className="mt-2 flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={counterValue}
                  onChange={(e) => setCounterValue(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="Your counter (NLe)"
                  aria-label="Counter-offer amount in leones"
                  className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                />
                <button
                  disabled={busy || !(counter > 0)}
                  onClick={() => act(offer.id, 'counter', { counterAmount: counter })}
                  className="btn-primary min-h-10 px-4 text-sm"
                >
                  Send
                </button>
              </div>
            )}
            {!canAct && listing.status !== 'active' && offer.status === 'pending' && (
              <p className="mt-2 text-xs text-muted">This listing is no longer active.</p>
            )}
          </div>
        )
      })}
    </>
  )
}

export default function MyOffers() {
  const [tab, setTab] = useState<'sent' | 'received'>('sent')

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="My Offers" />
      <div role="tablist" className="flex gap-2 px-4 pb-1 pt-3">
        {(['sent', 'received'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`tap-flash min-h-10 rounded-full px-4 text-sm font-medium capitalize transition active:scale-95 ${
              tab === t ? 'glow-accent-ring bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">{tab === 'sent' ? <SentTab /> : <ReceivedTab />}</div>
    </div>
  )
}
