import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Clock, Loader2, Lock, X, Zap } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import { useApp } from '../../context/AppContext'
import { api } from '../../lib/api'
import { compressImageFile } from '../../lib/media'
import { formatPrice } from '../../lib/format'
import type { VerificationLevel } from '../../types'
import { VERIFICATION_LABELS } from '../../types'

const DESCRIPTIONS: Record<VerificationLevel, string> = {
  0: 'Not started.',
  1: 'Confirm your phone number by OTP.',
  2: 'Upload a government ID for identity checks.',
  3: 'Complete your first successful sale and seller history review.',
  4: 'Register documentation for your business to unlock storefronts and advertising.',
}

const VERIFICATION_PRIORITY_FEE_PER_WEEK = 100

interface VerificationRequestRow {
  id: string
  targetLevel: number
  status: 'pending' | 'approved' | 'rejected'
  resolutionNote: string | null
  createdAt: string
}

// Makes users.verificationLevel genuinely real — before this round the "Start" button below
// had no onClick handler at all. Submits to routes/verificationRequests.ts's POST /, which an
// admin then reviews from Admin > Verification (mirrors the reports/disputes pattern).
export default function Verification() {
  const { currentUser, purchaseVerificationPriority } = useApp()
  const [requests, setRequests] = useState<VerificationRequestRow[] | null>(null)
  const [sheetLevel, setSheetLevel] = useState<VerificationLevel | null>(null)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<string | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [priorityBusy, setPriorityBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadRequests = () => {
    api.get<{ verificationRequests: VerificationRequestRow[] }>('/api/verification-requests/me').then((res) =>
      setRequests(res.verificationRequests),
    )
  }

  useEffect(loadRequests, [])

  if (!currentUser) return null // App.tsx only renders this route once bootstrap is ready

  const levels: VerificationLevel[] = [1, 2, 3, 4]
  const pendingRequest = requests?.find((r) => r.status === 'pending')
  const hasPriority = !!(currentUser.verificationPriorityUntil && new Date(currentUser.verificationPriorityUntil) > new Date())

  const openSheet = (lvl: VerificationLevel) => {
    setSheetLevel(lvl)
    setNote('')
    setPhoto(undefined)
    setError(null)
  }

  const pickPhoto = async (file: File) => {
    try {
      setPhoto(await compressImageFile(file))
    } catch (err) {
      console.error('photo compress failed', err)
    }
  }

  const submit = async () => {
    if (sheetLevel == null) return
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/api/verification-requests', { targetLevel: sheetLevel, note: note.trim(), photo })
      setSheetLevel(null)
      loadRequests()
    } catch (err) {
      console.error('verification request failed', err)
      setError("Couldn't submit — try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const buyPriority = async () => {
    setPriorityBusy(true)
    try {
      await purchaseVerificationPriority()
    } catch (err) {
      console.error('purchase verification priority failed', err)
      alert('Could not complete that payment — try again.')
    } finally {
      setPriorityBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Verification" />
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <p className="text-sm text-muted">
          Verification builds trust with buyers and sellers on DEALEONE. Higher levels unlock more
          features and appear as a trust badge on your listings.
        </p>

        <div className="card-elevated flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Zap size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Verified-seller fast-track</p>
            <p className="text-xs text-muted">
              {hasPriority
                ? `Active until ${new Date(currentUser.verificationPriorityUntil!).toLocaleDateString()}`
                : `Jump to the front of the admin review queue · ${formatPrice(VERIFICATION_PRIORITY_FEE_PER_WEEK)}/wk`}
            </p>
          </div>
          <button
            onClick={buyPriority}
            disabled={priorityBusy}
            className="tap-flash shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-accent transition active:scale-95 disabled:opacity-60"
          >
            {priorityBusy ? <Loader2 size={12} className="animate-spin" /> : hasPriority ? 'Extend' : 'Buy'}
          </button>
        </div>

        {levels.map((lvl, i) => {
          const done = currentUser.verificationLevel >= lvl
          const isNext = currentUser.verificationLevel + 1 === lvl
          const pendingForThis = pendingRequest?.targetLevel === lvl
          return (
            <div
              key={lvl}
              style={{ animationDelay: `${i * 60}ms` }}
              className={`stagger-in card-elevated flex items-start gap-3 rounded-xl p-3 ${
                done ? 'border border-good/30 bg-good/5' : 'bg-surface'
              }`}
            >
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-shadow ${
                  done ? 'bg-good text-bg shadow-[0_0_10px_rgba(20,128,90,0.5)]' : 'bg-surface-2 text-muted'
                }`}
              >
                {done ? <Check size={14} /> : <Lock size={13} />}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">
                  Level {lvl} — {VERIFICATION_LABELS[lvl]}
                </p>
                <p className="text-xs text-muted">{DESCRIPTIONS[lvl]}</p>
                {pendingForThis && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-accent">
                    <Clock size={11} /> Pending admin review
                  </p>
                )}
              </div>
              {isNext && !pendingForThis && (
                <button onClick={() => openSheet(lvl)} className="btn-primary shrink-0 self-center px-3 py-1.5 text-[11px]">
                  Start
                </button>
              )}
            </div>
          )
        })}
      </div>

      {sheetLevel != null && (
        <div className="scrim-enter fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px]">
          <div className="sheet-elevated sheet-enter w-full max-w-md rounded-t-3xl border-t border-border bg-surface p-5 pb-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-display font-bold tracking-tight text-ink">
                Request Level {sheetLevel}
              </h2>
              <button onClick={() => setSheetLevel(null)} className="icon-btn h-8 w-8 bg-surface-2">
                <X size={16} />
              </button>
            </div>
            <p className="mb-3 text-xs text-muted">{DESCRIPTIONS[sheetLevel]}</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note for the reviewer (optional)"
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="tap-flash mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-2 py-3 text-xs text-muted transition active:scale-[0.98]"
            >
              <Camera size={14} /> {photo ? 'Photo attached — tap to replace' : 'Attach a photo (optional)'}
            </button>
            {photo && (
              <img src={photo} alt="" className="mt-2 h-24 w-full rounded-lg object-cover" />
            )}
            {error && <p className="mt-2 text-xs text-bad">{error}</p>}
            <button onClick={submit} disabled={submitting} className="btn-primary mt-4 w-full text-sm">
              {submitting ? 'Submitting…' : 'Submit for review'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
