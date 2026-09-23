import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Tags } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import EmptyState from '../../components/EmptyState'
import { useApp } from '../../context/AppContext'
import { api } from '../../lib/api'
import { formatPrice, timeAgo } from '../../lib/format'

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-accent bg-accent/10 border-accent/30',
  accepted: 'text-good bg-good/10 border-good/30',
  rejected: 'text-bad bg-bad/10 border-bad/30',
  countered: 'text-accent bg-accent/10 border-accent/30',
}

// Seller-side counterpart to the buyer's "Sent" tab below — reads routes/offers.ts's GET
// /received (joined to listing + buyer info) and acts via PATCH /:id/accept|reject|counter.
// Before this round, an offer made on your own listing just sat at 'pending' forever with
// nothing anywhere to act on it.
interface ReceivedOfferRow {
  offer: {
    id: string
    listingId: string
    amount: number
    message: string | null
    status: 'pending' | 'accepted' | 'rejected' | 'countered'
    counterAmount: number | null
    createdAt: string
  }
  listing: { id: string; title: string; price: number; status: string }
  buyer: { id: string; name: string; avatarEmoji: string; rating: number; ratingCount: number }
}

function ReceivedTab() {
  const [rows, setRows] = useState<ReceivedOfferRow[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [counterOpenId, setCounterOpenId] = useState<string | null>(null)
  const [counterValue, setCounterValue] = useState('')

  const load = () => {
    api.get<{ offers: ReceivedOfferRow[] }>('/api/offers/received').then((res) => setRows(res.offers))
  }

  useEffect(load, [])

  const act = async (id: string, action: 'accept' | 'reject' | 'counter', body?: unknown) => {
    setBusyId(id)
    try {
      await api.patch(`/api/offers/${id}/${action}`, body)
      setCounterOpenId(null)
      setCounterValue('')
      load()
    } catch (err) {
      console.error(`offer ${action} failed`, err)
      alert('Could not complete that action — try again.')
    } finally {
      setBusyId(null)
    }
  }

  if (rows && rows.length === 0) {
    return (
      <EmptyState icon={Tags} title="No offers received yet" hint="Offers buyers make on your listings show up here." />
    )
  }

  return (
    <>
      {rows?.map(({ offer, listing, buyer }) => {
        const canAct = offer.status === 'pending'
        return (
          <div key={offer.id} className="card-elevated rounded-xl bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{listing.title}</p>
                <p className="text-xs text-muted">
                  {buyer.name} · {timeAgo(offer.createdAt)} ago
                </p>
                {offer.message && <p className="mt-1 text-xs text-ink">"{offer.message}"</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-ink">{formatPrice(offer.amount)}</p>
                <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] capitalize ${STATUS_STYLE[offer.status]}`}>
                  {offer.status}
                </span>
              </div>
            </div>
            {offer.status === 'countered' && offer.counterAmount != null && (
              <p className="mt-1 text-xs text-accent">You countered at {formatPrice(offer.counterAmount)}</p>
            )}
            {canAct && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  disabled={busyId === offer.id}
                  onClick={() => act(offer.id, 'accept')}
                  className="tap-flash flex items-center gap-1 rounded-full bg-good/10 px-3 py-1.5 text-xs text-good transition active:scale-95 disabled:opacity-60"
                >
                  {busyId === offer.id ? <Loader2 size={12} className="animate-spin" /> : 'Accept'}
                </button>
                <button
                  disabled={busyId === offer.id}
                  onClick={() => act(offer.id, 'reject')}
                  className="tap-flash flex items-center gap-1 rounded-full bg-bad/10 px-3 py-1.5 text-xs text-bad transition active:scale-95 disabled:opacity-60"
                >
                  {busyId === offer.id ? <Loader2 size={12} className="animate-spin" /> : 'Decline'}
                </button>
                <button
                  disabled={busyId === offer.id}
                  onClick={() => {
                    setCounterOpenId(counterOpenId === offer.id ? null : offer.id)
                    setCounterValue(String(offer.amount))
                  }}
                  className="tap-flash flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 text-xs text-muted transition active:scale-95 disabled:opacity-60"
                >
                  Counter
                </button>
              </div>
            )}
            {counterOpenId === offer.id && (
              <div className="mt-2 flex gap-2">
                <input
                  type="number"
                  value={counterValue}
                  onChange={(e) => setCounterValue(e.target.value)}
                  placeholder="Your counter amount"
                  className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
                />
                <button
                  disabled={busyId === offer.id || !counterValue}
                  onClick={() => act(offer.id, 'counter', { counterAmount: Number(counterValue) })}
                  className="btn-primary px-3 py-1.5 text-xs"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

export default function MyOffers() {
  const navigate = useNavigate()
  const { offers, listings } = useApp()
  const [tab, setTab] = useState<'sent' | 'received'>('sent')

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="My Offers" />
      <div className="flex gap-2 px-4 pb-1 pt-3">
        {(['sent', 'received'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`tap-flash rounded-full px-3 py-1.5 text-xs font-medium capitalize transition active:scale-95 ${
              tab === t ? 'glow-accent-ring bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {tab === 'sent' ? (
          <>
            {offers.length === 0 && (
              <EmptyState
                icon={Tags}
                title="You have not sent any offers yet"
                hint="Open a listing and tap Make Offer."
              />
            )}
            {offers.map((o) => {
              const listing = listings.find((l) => l.id === o.listingId)
              if (!listing) return null
              return (
                <button
                  key={o.id}
                  onClick={() => navigate(`/listing/${listing.id}`)}
                  className="card-elevated card-interactive flex w-full items-center justify-between rounded-xl bg-surface p-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{listing.title}</p>
                    <p className="text-xs text-muted">
                      Listed {formatPrice(listing.price)} · {timeAgo(o.createdAt)} ago
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-ink">{formatPrice(o.amount)}</p>
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] capitalize ${STATUS_STYLE[o.status]}`}
                    >
                      {o.status}
                    </span>
                  </div>
                </button>
              )
            })}
          </>
        ) : (
          <ReceivedTab />
        )}
      </div>
    </div>
  )
}
