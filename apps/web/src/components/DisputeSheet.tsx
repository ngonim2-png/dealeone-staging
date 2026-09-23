import { useState } from 'react'
import { X, ShieldAlert, CircleCheck } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { DISPUTE_REASON_LABELS, type DisputeReason } from '../types'

const REASONS = Object.keys(DISPUTE_REASON_LABELS) as DisputeReason[]

/** "Report a problem with this deal" — tied to the conversation itself, since there's no
 * payments or accepted-offer record yet for a dispute to attach to (see the disputes table
 * in apps/api/src/db/schema.ts). An admin resolves these from Admin > Disputes. */
export default function DisputeSheet({
  open,
  onClose,
  conversationId,
  otherPartyName,
}: {
  open: boolean
  onClose: () => void
  conversationId: string
  otherPartyName: string
}) {
  const { submitDispute } = useApp()
  const [reason, setReason] = useState<DisputeReason | null>(null)
  const [details, setDetails] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!open) return null

  const close = () => {
    setReason(null)
    setDetails('')
    setError(null)
    setDone(false)
    onClose()
  }

  const submit = async () => {
    if (!reason) return
    setLoading(true)
    setError(null)
    try {
      await submitDispute(conversationId, reason, details.trim() || undefined)
      setDone(true)
    } catch {
      setError("Couldn't submit this — try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="scrim-enter fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px]">
      <div className="sheet-elevated sheet-enter w-full max-w-md rounded-t-3xl border-t border-border bg-surface p-5 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-display font-bold tracking-tight text-ink">
            <ShieldAlert size={17} className="text-accent" /> Report a problem
          </h2>
          <button onClick={close} className="icon-btn h-8 w-8 bg-surface-2">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CircleCheck size={32} className="text-good" />
            <p className="text-sm font-medium text-ink">Submitted for review</p>
            <p className="text-xs text-muted">
              An admin will look into this deal with {otherPartyName} and follow up.
            </p>
            <button onClick={close} className="btn-secondary mt-3 w-full text-sm">
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted">What went wrong with this deal?</p>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`tap-flash rounded-full px-3 py-1.5 text-xs transition active:scale-95 ${
                    reason === r ? 'glow-accent-ring bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
                  }`}
                >
                  {DISPUTE_REASON_LABELS[r]}
                </button>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe what happened (optional)"
              rows={3}
              className="mt-3 w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
            />
            {error && <p className="mt-2 text-xs text-bad">{error}</p>}
            <button
              onClick={submit}
              disabled={!reason || loading}
              className="btn-primary mt-4 w-full text-sm"
            >
              {loading ? 'Submitting…' : 'Submit'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
