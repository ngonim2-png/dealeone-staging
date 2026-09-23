import { useRef, useState } from 'react'
import { X, Camera, Sparkles } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { compressImageFile } from '../lib/media'

const CAPTION_MAX = 200

// Bottom-sheet status composer — capture/pick a photo (same compress-before-upload pattern
// as listing/event photos, see lib/media.ts), add an optional caption, post it. Real
// eligibility is enforced server-side (see isEligibleForStatus); a rejected post here means
// the account's promotion lapsed since the Status row last refreshed, not a UI bug.
export default function StatusComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { postStatus } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const reset = () => {
    setImageUrl(null)
    setCaption('')
    setError(null)
    setBusy(false)
  }

  const close = () => {
    reset()
    onClose()
  }

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const dataUrl = await compressImageFile(file)
      setImageUrl(dataUrl)
    } catch (err) {
      console.error('compress status photo failed', err)
      setError("Couldn't read that photo — try another.")
    }
  }

  const submit = async () => {
    if (!imageUrl) return
    setBusy(true)
    setError(null)
    try {
      await postStatus(imageUrl, caption.trim() || undefined)
      close()
    } catch (err: any) {
      console.error('post status failed', err)
      setError(
        err?.status === 403
          ? "This account doesn't currently qualify — statuses need an active paid promotion."
          : "Couldn't post that status — try again.",
      )
      setBusy(false)
    }
  }

  return (
    <div className="scrim-enter fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px]">
      <div className="sheet-elevated sheet-enter w-full max-w-md rounded-t-3xl border-t border-border bg-surface p-5 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-display font-bold tracking-tight text-ink">
            <Sparkles size={17} className="text-accent" /> New status
          </h2>
          <button onClick={close} className="icon-btn h-8 w-8 bg-surface-2">
            <X size={16} />
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />

        {imageUrl ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="tap-flash block aspect-[4/5] w-full overflow-hidden rounded-2xl bg-surface-2"
          >
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          </button>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="tap-flash flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface-2 text-muted transition active:scale-[0.98]"
          >
            <Camera size={28} />
            <span className="text-sm">Take or choose a photo</span>
          </button>
        )}

        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
          placeholder="Add a caption (optional)"
          rows={2}
          className="mt-3 w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
        />
        <p className="mt-1 text-right text-[10px] text-muted">
          {caption.length}/{CAPTION_MAX}
        </p>

        {error && <p className="text-xs text-bad">{error}</p>}

        <p className="mt-1 text-[11px] text-muted">
          Visible for 24 hours to everyone who opens Messages.
        </p>

        <button onClick={submit} disabled={!imageUrl || busy} className="btn-primary mt-3 w-full text-sm">
          {busy ? 'Posting…' : 'Post status'}
        </button>
      </div>
    </div>
  )
}
