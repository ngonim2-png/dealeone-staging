import { useEffect, useRef, useState } from 'react'
import { Mic, Pause, Play, Square, Trash2 } from 'lucide-react'
import { mediaSrc } from '../lib/media'

// Spoken descriptions for listings. Many sellers find it far easier to say "it's a 2019
// fridge, works well, small dent on the side" than to type it — and buyers hear the
// seller's voice, which builds trust. Recording happens in the browser; the clip is sent as
// a data URL and stored by the API as a media file (see apps/api/src/lib/media.ts).

const MAX_SECONDS = 60

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function VoiceNotePlayer({ src, label }: { src: string; label?: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const url = src.startsWith('data:') ? src : mediaSrc(src)

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-accent/[0.07] p-2.5 pr-4">
      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setProgress(0)
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget
          if (el.duration && Number.isFinite(el.duration)) setProgress(el.currentTime / el.duration)
        }}
      />
      <button
        type="button"
        onClick={() => (playing ? ref.current?.pause() : ref.current?.play().catch(() => {}))}
        aria-label={playing ? 'Pause voice description' : 'Play voice description'}
        className="icon-btn h-10 w-10 shrink-0 bg-gradient-to-b from-accent-2 to-accent text-bg"
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        {label && <p className="mb-1 truncate text-xs font-medium text-ink">{label}</p>}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      </div>
      {duration > 0 && <span className="shrink-0 text-[11px] tabular-nums text-muted">{clock(duration)}</span>}
    </div>
  )
}

// value: undefined/null = no recording; a data: URL (new, unsaved) or a /api/media/… URL
// (already on the listing). onChange(null) removes it.
export function VoiceNoteRecorder({
  value,
  onChange,
  label,
}: {
  value: string | null | undefined
  onChange: (next: string | null) => void
  label: string
}) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelledRef = useRef(false)

  useEffect(
    () => () => {
      cancelledRef.current = true
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (timerRef.current) clearInterval(timerRef.current)
    },
    [],
  )

  const start = async () => {
    setError(null)
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record audio.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      cancelledRef.current = false
      const rec = new MediaRecorder(stream)
      recorderRef.current = rec
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = null
        setRecording(false)
        if (cancelledRef.current || chunksRef.current.length === 0) return
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        if (blob.size > 2_000_000) {
          setError('That recording is too long — keep it under a minute.')
          return
        }
        onChange(await blobToDataUrl(blob))
      }
      rec.start()
      setRecording(true)
      setSeconds(0)
      let s = 0
      timerRef.current = setInterval(() => {
        s += 1
        setSeconds(s)
        if (s >= MAX_SECONDS) rec.stop()
      }, 1000)
    } catch {
      setError("Can't use the microphone — allow it for DEALEONE in your browser settings.")
    }
  }

  const stop = (cancel: boolean) => {
    cancelledRef.current = cancel
    recorderRef.current?.stop()
  }

  return (
    <div role="group" aria-label={label}>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {recording ? (
        <div className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-2.5">
          <span className="ml-1.5 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-bad" />
          <span className="flex-1 text-sm font-medium tabular-nums text-ink">
            Recording… {clock(seconds)} / {clock(MAX_SECONDS)}
          </span>
          <button type="button" onClick={() => stop(true)} aria-label="Discard recording" className="icon-btn h-10 w-10 bg-surface-2 text-ink">
            <Trash2 size={15} />
          </button>
          <button
            type="button"
            onClick={() => stop(false)}
            aria-label="Stop recording"
            className="icon-btn h-10 w-10 bg-gradient-to-b from-accent-2 to-accent text-bg"
          >
            <Square size={14} fill="currentColor" />
          </button>
        </div>
      ) : value ? (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <VoiceNotePlayer src={value} />
          </div>
          <button type="button" onClick={() => onChange(null)} aria-label="Remove voice description" className="icon-btn h-10 w-10 shrink-0 bg-bad/10 text-bad">
            <Trash2 size={15} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          className="tap-flash flex min-h-12 w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-surface-2 px-3 text-left text-sm text-muted transition active:scale-[0.99]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/12 text-accent">
            <Mic size={15} />
          </span>
          Tap to record up to 1 minute
        </button>
      )}
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  )
}
