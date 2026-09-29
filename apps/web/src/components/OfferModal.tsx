import { useEffect, useId, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import type { Listing } from '../types'
import { formatPrice } from '../lib/format'
import { errorMessage } from '../lib/api'

// Quick-pick amounts help people who find typing numbers hard (a real consideration for
// this app's audience) and anchor offers to sensible values.
const QUICK_PERCENTS = [0.8, 0.9, 0.95]

export default function OfferModal({
  listing,
  onClose,
  onSubmit,
}: {
  listing: Listing
  onClose: () => void
  // Must throw on failure — the modal stays open and shows the reason.
  onSubmit: (amount: number, message: string) => Promise<void>
}) {
  const [amount, setAmount] = useState(String(Math.round(listing.price * 0.9)))
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const amountId = useId()
  const messageId = useId()

  // Escape closes (keyboard users, and Android hardware back via some browsers).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !sending && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, sending])

  const value = Math.round(Number(amount))
  const valid = Number.isFinite(value) && value > 0
  const aboveAsking = valid && value > listing.price

  const submit = async () => {
    if (!valid || sending) return
    setSending(true)
    setError(null)
    try {
      await onSubmit(value, message.trim())
    } catch (err) {
      setError(errorMessage(err, "Your offer wasn't sent — please try again."))
      setSending(false)
    }
  }

  return (
    <div
      className="scrim-enter fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && !sending && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sheet-elevated sheet-enter w-full max-w-md rounded-t-3xl border-t border-border bg-surface p-5 pb-8"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-xl font-display font-bold tracking-tight">
            Make an offer
          </h2>
          <button onClick={onClose} disabled={sending} aria-label="Close" className="icon-btn h-11 w-11 bg-surface-2">
            <X size={18} />
          </button>
        </div>

        <p className="mb-1 text-xs text-muted">Listed price</p>
        <p className="mb-4 text-xl font-display font-bold tracking-tight text-ink">{formatPrice(listing.price)}</p>

        <label htmlFor={amountId} className="mb-1 block text-xs font-medium text-muted">
          Your offer (NLe)
        </label>
        <input
          id={amountId}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value.replace(/[^\d]/g, ''))
            setError(null)
          }}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-3 text-base font-semibold text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
        />
        <div className="mb-4 mt-2 flex gap-2">
          {QUICK_PERCENTS.map((p) => {
            const v = Math.max(1, Math.round(listing.price * p))
            return (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(String(v))}
                className={`tap-flash min-h-10 flex-1 rounded-full px-2 text-xs font-medium transition active:scale-95 ${
                  value === v ? 'bg-accent/15 text-accent glow-accent-ring' : 'bg-surface-2 text-muted'
                }`}
              >
                {formatPrice(v)}
              </button>
            )
          })}
        </div>
        {aboveAsking && (
          <p className="-mt-2 mb-3 text-xs text-muted">That's above the asking price — you could just message the seller instead.</p>
        )}

        <label htmlFor={messageId} className="mb-1 block text-xs font-medium text-muted">
          Message <span className="font-normal">(optional)</span>
        </label>
        <textarea
          id={messageId}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder='e.g. "Can collect today."'
          rows={2}
          maxLength={500}
          className="mb-4 w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
        />

        {error && (
          <p role="alert" className="mb-3 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}

        <button onClick={submit} disabled={!valid || sending} className="btn-primary min-h-12 w-full text-sm">
          {sending ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Sending…
            </>
          ) : valid ? (
            `Send offer · ${formatPrice(value)}`
          ) : (
            'Enter an amount'
          )}
        </button>
      </div>
    </div>
  )
}
