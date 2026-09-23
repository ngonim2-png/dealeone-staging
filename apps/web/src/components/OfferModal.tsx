import { useState } from 'react'
import { X } from 'lucide-react'
import type { Listing } from '../types'
import { formatPrice } from '../lib/format'

export default function OfferModal({
  listing,
  onClose,
  onSubmit,
}: {
  listing: Listing
  onClose: () => void
  onSubmit: (amount: number, message: string) => void
}) {
  const [amount, setAmount] = useState(String(Math.round(listing.price * 0.9)))
  const [message, setMessage] = useState('')

  return (
    <div className="scrim-enter fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px]">
      <div className="sheet-elevated sheet-enter w-full max-w-md rounded-t-3xl border-t border-border bg-surface p-5 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-display font-bold tracking-tight">Make an offer</h2>
          <button
            onClick={onClose}
            className="icon-btn h-8 w-8 bg-surface-2"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mb-1 text-xs text-muted">Listed price</p>
        <p className="mb-4 text-xl font-display font-bold tracking-tight text-ink">{formatPrice(listing.price)}</p>

        <label className="mb-1 block text-xs text-muted">My Offer (NLe)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mb-4 w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
        />

        <label className="mb-1 block text-xs text-muted">Optional message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder='e.g. "Can collect today."'
          rows={2}
          className="mb-5 w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
        />

        <button
          onClick={() => onSubmit(Number(amount) || 0, message)}
          disabled={!amount || Number(amount) <= 0}
          className="btn-primary w-full text-sm"
        >
          Send Offer
        </button>
      </div>
    </div>
  )
}
