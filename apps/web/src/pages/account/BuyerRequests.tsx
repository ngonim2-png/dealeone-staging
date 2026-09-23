import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Plus, Search, Zap } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import EmptyState from '../../components/EmptyState'
import { useApp } from '../../context/AppContext'
import { api } from '../../lib/api'
import { formatPrice } from '../../lib/format'

const BUYER_REQUEST_PRIORITY_FEE_PER_WEEK = 100

interface FeedRow {
  buyerRequest: {
    id: string
    product: string
    maxOffer: number
    radiusKm: number
    condition: 'new' | 'used' | 'either'
    createdAt: string
    responses: number
  }
  requester: { id: string; name: string; location: string }
}

// Seller-facing feed of open buyer requests (routes/buyerRequests.ts's GET /feed) — before
// this round there was no way for a seller to browse buyer requests at all. Deliberately NOT
// geo-matched (buyerRequests/users have no lat/lng — see the API route's comment) — sellers
// just read the free-text product description themselves, same as a bulletin board.
function FeedTab() {
  const navigate = useNavigate()
  const { currentUser, purchaseBuyerRequestPriority } = useApp()
  const [rows, setRows] = useState<FeedRow[] | null>(null)
  const [hasPriority, setHasPriority] = useState(false)
  const [myListings, setMyListings] = useState<{ id: string; title: string }[]>([])
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [selectedListingId, setSelectedListingId] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [priorityBusy, setPriorityBusy] = useState(false)

  const load = () => {
    api
      .get<{ buyerRequests: FeedRow[]; hasPriority: boolean }>('/api/buyer-requests/feed')
      .then((res) => {
        setRows(res.buyerRequests)
        setHasPriority(res.hasPriority)
      })
  }

  useEffect(() => {
    load()
    if (currentUser) {
      api
        .get<{ results: { listing: { id: string; title: string } }[] }>(
          `/api/listings?sellerId=${currentUser.id}&status=active&radiusKm=25000`,
        )
        .then((res) => setMyListings(res.results.map((r) => r.listing)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startResponding = (id: string) => {
    setRespondingId(id)
    setSelectedListingId(myListings[0]?.id ?? '')
    setMessage('')
  }

  const respond = async (id: string) => {
    if (!selectedListingId) return
    setBusy(true)
    try {
      const res = await api.post<{ conversationId: string }>(`/api/buyer-requests/${id}/respond`, {
        listingId: selectedListingId,
        message: message.trim() || undefined,
      })
      setRespondingId(null)
      navigate(`/chats/${res.conversationId}`)
    } catch (err) {
      console.error('respond to buyer request failed', err)
      alert('Could not respond — try again.')
    } finally {
      setBusy(false)
    }
  }

  const buyPriority = async () => {
    setPriorityBusy(true)
    try {
      await purchaseBuyerRequestPriority()
      load()
    } catch (err) {
      console.error('purchase buyer request priority failed', err)
      alert(err instanceof Error ? err.message : 'Could not complete that payment — try again.')
    } finally {
      setPriorityBusy(false)
    }
  }

  return (
    <>
      <div className="card-elevated flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Zap size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Priority access</p>
          <p className="text-xs text-muted">
            {!currentUser?.isBusiness
              ? 'Register as a business in Account > Settings to unlock this.'
              : hasPriority
                ? 'Active — you see new requests immediately.'
                : `See new requests 24h before everyone else · ${formatPrice(BUYER_REQUEST_PRIORITY_FEE_PER_WEEK)}/wk`}
          </p>
        </div>
        {currentUser?.isBusiness && (
          <button
            onClick={buyPriority}
            disabled={priorityBusy}
            className="tap-flash shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-accent transition active:scale-95 disabled:opacity-60"
          >
            {priorityBusy ? <Loader2 size={12} className="animate-spin" /> : hasPriority ? 'Extend' : 'Buy'}
          </button>
        )}
      </div>

      {rows && rows.length === 0 && (
        <EmptyState icon={Search} title="No open requests right now" hint="Check back later — buyers post what they're looking for here." />
      )}

      {rows?.map(({ buyerRequest: r, requester }) => (
        <div key={r.id} className="card-elevated rounded-xl bg-surface p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink">{r.product}</p>
            <span className="text-xs text-muted">{requester.location}</span>
          </div>
          <p className="text-xs text-muted">
            Up to {formatPrice(r.maxOffer)} · within {r.radiusKm} km · {r.condition}
          </p>
          {r.responses > 0 && <p className="mt-1 text-xs text-accent">{r.responses} seller responses so far</p>}
          {respondingId === r.id ? (
            <div className="mt-2 space-y-2">
              {myListings.length === 0 ? (
                <p className="text-xs text-bad">You need an active listing to respond.</p>
              ) : (
                <select
                  value={selectedListingId}
                  onChange={(e) => setSelectedListingId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-ink outline-none"
                >
                  {myListings.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>
              )}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a message (optional)"
                rows={2}
                className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => respond(r.id)}
                  disabled={busy || !selectedListingId}
                  className="btn-primary flex-1 py-1.5 text-xs"
                >
                  {busy ? 'Sending…' : 'Send'}
                </button>
                <button onClick={() => setRespondingId(null)} className="btn-secondary flex-1 py-1.5 text-xs">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => startResponding(r.id)}
              className="tap-flash mt-2 rounded-full bg-surface-2 px-3 py-1.5 text-xs text-accent transition active:scale-95"
            >
              Respond with a listing
            </button>
          )}
        </div>
      ))}
    </>
  )
}

export default function BuyerRequests() {
  const { buyerRequests, addBuyerRequest } = useApp()
  const [tab, setTab] = useState<'mine' | 'feed'>('mine')
  const [open, setOpen] = useState(false)
  const [product, setProduct] = useState('')
  const [maxOffer, setMaxOffer] = useState('')
  const [radiusKm, setRadiusKm] = useState(10)
  const [condition, setCondition] = useState<'new' | 'used' | 'either'>('either')

  const submit = () => {
    if (!product || !maxOffer) return
    addBuyerRequest({
      product,
      maxOffer: Number(maxOffer),
      radiusKm,
      condition,
    })
    setProduct('')
    setMaxOffer('')
    setOpen(false)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader
        title="Buyer Requests"
        right={
          tab === 'mine' ? (
            <button
              onClick={() => setOpen((o) => !o)}
              className="icon-btn h-9 w-9 bg-gradient-to-b from-accent-2 to-accent text-bg shadow-[0_4px_14px_-4px_rgba(36,91,50,0.6)]"
            >
              <Plus size={16} className={`transition-transform ${open ? 'rotate-45' : ''}`} />
            </button>
          ) : undefined
        }
      />

      <div className="flex gap-2 px-4 pb-1 pt-3">
        {(['mine', 'feed'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`tap-flash rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
              tab === t ? 'glow-accent-ring bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
            }`}
          >
            {t === 'mine' ? 'My Requests' : 'Browse'}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {tab === 'mine' ? (
          <>
            {open && (
              <div className="sheet-enter card-elevated space-y-3 rounded-xl border border-accent/30 bg-accent/5 p-3">
                <p className="text-sm font-medium text-ink">Find me a product</p>
                <input
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  placeholder="Product, e.g. Samsung S24 Ultra"
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={maxOffer}
                    onChange={(e) => setMaxOffer(e.target.value)}
                    placeholder="Maximum offer (NLe)"
                    className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
                  />
                  <select
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(Number(e.target.value))}
                    className="rounded-xl border border-border bg-surface-2 px-2 py-2 text-sm text-ink outline-none"
                  >
                    {[5, 10, 25].map((r) => (
                      <option key={r} value={r}>
                        {r} km
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  {(['new', 'used', 'either'] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCondition(c)}
                      className={`tap-flash rounded-full px-3 py-1.5 text-xs capitalize transition active:scale-95 ${
                        condition === c ? 'glow-accent-ring bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <button onClick={submit} className="btn-primary w-full py-2.5 text-sm">
                  Submit request
                </button>
              </div>
            )}

            {buyerRequests.length === 0 && !open && (
              <EmptyState
                icon={Search}
                title="No buyer requests yet"
                hint="Tell DEALEONE what you're looking for and nearby sellers will be notified."
              />
            )}

            {buyerRequests.map((r) => (
              <div key={r.id} className="card-elevated rounded-xl bg-surface p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">{r.product}</p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] capitalize ${
                      r.status === 'matched'
                        ? 'border-good/30 bg-good/10 text-good'
                        : 'border-accent/30 bg-accent/10 text-accent'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  Up to {formatPrice(r.maxOffer)} · within {r.radiusKm} km · {r.condition}
                </p>
                {r.responses > 0 && (
                  <p className="mt-1 text-xs text-accent">{r.responses} seller responses</p>
                )}
              </div>
            ))}
          </>
        ) : (
          <FeedTab />
        )}
      </div>
    </div>
  )
}
