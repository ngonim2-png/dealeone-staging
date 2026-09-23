import { useState } from 'react'
import { X, Flag, CircleCheck } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { REPORT_REASON_LABELS, type ReportReason } from '../types'

const REASONS = Object.keys(REPORT_REASON_LABELS) as ReportReason[]

/** Scam/fraud reporting — targets a listing (ListingDetail's Report button), a user
 * (ChatThread's "Report user"), an event (EventDetail's Report button), or a status
 * (StatusViewer's Report button). Submits to the moderation queue an admin works through in
 * Admin > Reports (see routes/admin.ts); this component itself never removes anything. */
export default function ReportSheet({
  open,
  onClose,
  targetType,
  targetLabel,
  targetId,
}: {
  open: boolean
  onClose: () => void
  targetType: 'listing' | 'user' | 'event' | 'status'
  targetLabel: string
  targetId: string
}) {
  const { submitReport } = useApp()
  const [reason, setReason] = useState<ReportReason | null>(null)
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
      await submitReport(targetType, targetId, reason, details.trim() || undefined)
      setDone(true)
    } catch {
      setError("Couldn't submit your report — try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="scrim-enter fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px]">
      <div className="sheet-elevated sheet-enter w-full max-w-md rounded-t-3xl border-t border-border bg-surface p-5 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-display font-bold tracking-tight text-ink">
            <Flag size={17} className="text-bad" /> Report {targetType}
          </h2>
          <button onClick={close} className="icon-btn h-8 w-8 bg-surface-2">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CircleCheck size={32} className="text-good" />
            <p className="text-sm font-medium text-ink">Report submitted</p>
            <p className="text-xs text-muted">
              Our team will review {targetLabel} — thanks for flagging it.
            </p>
            <button onClick={close} className="btn-secondary mt-3 w-full text-sm">
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="mb-3 truncate text-xs text-muted">Reporting: {targetLabel}</p>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`tap-flash rounded-full px-3 py-1.5 text-xs transition active:scale-95 ${
                    reason === r ? 'glow-accent-ring bg-bad/15 text-bad' : 'bg-surface-2 text-muted'
                  }`}
                >
                  {REPORT_REASON_LABELS[r]}
                </button>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Anything else that would help our team review this? (optional)"
              rows={3}
              className="mt-3 w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
            />
            {error && <p className="mt-2 text-xs text-bad">{error}</p>}
            <button
              onClick={submit}
              disabled={!reason || loading}
              className="btn-danger mt-4 w-full text-sm"
            >
              {loading ? 'Submitting…' : 'Submit report'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
