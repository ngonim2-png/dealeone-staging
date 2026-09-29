import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Clock, Lock, X } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import { useApp } from '../../context/AppContext'
import { api } from '../../lib/api'
import { compressImageFile } from '../../lib/media'
import type { VerificationLevel } from '../../types'
import { VERIFICATION_LABELS } from '../../types'

const DESCRIPTIONS: Record<VerificationLevel, string> = {
  0: 'Not started.',
  1: 'Signed up with a phone number and your own PIN.',
  2: 'Upload a government ID for identity checks.',
  3: 'Complete your first successful sale and seller history review.',
  4: 'Register documentation for your business to unlock storefronts and advertising.',
}

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
  const { currentUser } = useApp()
  const [requests, setRequests] = useState<VerificationRequestRow[] | null>(null)
  const [sheetLevel, setSheetLevel] = useState<VerificationLevel | null>(null)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<string | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadRequests = () => {
    api
      .get<{ verificationRequests: VerificationRequestRow[] }>('/api/verification-requests/me')
      .then((res) => setRequests(res.verificationRequests))
      .catch((err) => {
        // Fall back to "no pending requests" rather than hiding the page; the server still
        // rejects a duplicate submission (409) if one is actually pending.
        console.error('load verification requests failed', err)
        setRequests([])
      })
  }

  useEffect(loadRequests, [])

  if (!currentUser) return null // App.tsx only renders this route once bootstrap is ready

  const levels: VerificationLevel[] = [1, 2, 3, 4]
  const pendingRequest = requests?.find((r) => r.status === 'pending')

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

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Verification" />
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <p className="text-sm text-muted">
          Verification builds trust with buyers and sellers on DEALEONE. Higher levels unlock more
          features and appear as a trust badge on your listings.
        </p>

        <p className="flex items-center gap-2 rounded-xl bg-good/[0.08] px-3 py-2 text-xs text-ink/80">
          <Check size={14} className="shrink-0 text-good" /> Verification is free. Requests are reviewed in the order they arrive.
        </p>

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
                <button onClick={() => openSheet(lvl)} className="btn-primary min-h-10 shrink-0 self-center px-4 text-xs">
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
              <button onClick={() => setSheetLevel(null)} aria-label="Close" className="icon-btn h-11 w-11 bg-surface-2">
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
