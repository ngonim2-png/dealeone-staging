import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Send, BadgeCheck, Mic, Trash2, Square, Play, Pause, Flag, ShieldAlert, Star, CalendarDays } from 'lucide-react'
import BackHeader from '../components/BackHeader'
import ReportSheet from '../components/ReportSheet'
import DisputeSheet from '../components/DisputeSheet'
import { useApp } from '../context/AppContext'
import { CATEGORY_META, EVENT_CATEGORY_META } from '../types'
import type { ChatMessage } from '../types'
import { formatEventWhen, formatPrice, timeAgo } from '../lib/format'
import { isImageUrl } from '../lib/media'

// Post-transaction rating — only ever shows once a listing is genuinely 'sold' and the
// current user is the buyer (not the seller viewing their own thread), and only until they
// actually rate it (see AppContext's ratedListingIds/submitRating, backed by
// routes/ratings.ts). Before this round users.rating/ratingCount were pure seed-time
// numbers with no flow anywhere that ever changed them.
function RateSellerPrompt({ listingId, sellerName }: { listingId: string; sellerName: string }) {
  const { submitRating } = useApp()
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!stars) return
    setSubmitting(true)
    setError(null)
    try {
      await submitRating(listingId, stars, comment.trim() || undefined)
    } catch (err) {
      console.error('submit rating failed', err)
      setError("Couldn't submit this rating — try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card-elevated mx-3 mt-2 space-y-2 rounded-xl border border-accent/30 bg-accent/5 p-3">
      <p className="text-sm font-medium text-ink">Rate {sellerName.split(' ')[0]}</p>
      <p className="text-xs text-muted">This deal is marked sold — how did it go?</p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setStars(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className="tap-flash p-0.5 transition-transform active:scale-90"
          >
            <Star size={20} className={n <= stars ? 'fill-accent text-accent' : 'text-border'} />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment (optional)"
        rows={2}
        className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
      />
      {error && <p className="text-xs text-bad">{error}</p>}
      <button
        onClick={submit}
        disabled={!stars || submitting}
        className="btn-primary w-full py-2 text-sm"
      >
        {submitting ? 'Submitting…' : 'Submit rating'}
      </button>
    </div>
  )
}

// Voice notes — spec ask: many buyers/sellers in Sierra Leone can't read or write, so being
// able to record and send a quick voice clip has to work as well as typing does. Tap once to
// start, tap again (or the checkmark) to send, or bin it to discard — no press-and-hold,
// since a slipped thumb mid-recording on a low-end phone would otherwise silently lose the
// clip. Auto-stops at MAX_RECORD_SECONDS so a forgotten-open recording can't grow forever.
const MAX_RECORD_SECONDS = 120

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function VoiceBubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
    } else {
      el.play().catch(() => {})
    }
  }

  const duration = message.audioDurationSec ?? 0

  return (
    <div
      className={`flex max-w-[75%] items-center gap-2 rounded-2xl px-3 py-2.5 ${
        mine ? 'bg-accent text-bg' : 'bg-surface-2 text-ink'
      }`}
    >
      <audio
        ref={audioRef}
        src={message.audioUrl}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setProgress(0)
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget
          if (el.duration) setProgress(el.currentTime / el.duration)
        }}
      />
      <button
        onClick={toggle}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className={`tap-flash flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 ${
          mine ? 'bg-bg/20 text-bg' : 'bg-accent text-bg'
        }`}
      >
        {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
      </button>
      <div className="min-w-[90px] flex-1">
        <div className={`h-1.5 w-full overflow-hidden rounded-full ${mine ? 'bg-bg/25' : 'bg-border'}`}>
          <div
            className={`h-full rounded-full ${mine ? 'bg-bg' : 'bg-accent'}`}
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
        <p className={`mt-1 text-[10px] ${mine ? 'text-bg/70' : 'text-muted'}`}>
          {formatClock(duration)} · {timeAgo(message.createdAt)} ago
        </p>
      </div>
    </div>
  )
}

const AUTO_REPLIES = [
  'Thanks for reaching out — yes, still available.',
  'Sure, that works. When would you like to collect it?',
  "I'll check and get back to you shortly.",
  'Yes, I can do that price.',
]

export default function ChatThread() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    conversations,
    listings,
    events,
    sellers,
    currentUser,
    ratedListingIds,
    sendMessage,
    sendVoiceMessage,
    appendSimulatedReply,
    markConversationRead,
    loadThread,
  } = useApp()
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [sendingVoice, setSendingVoice] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [sellerTyping, setSellerTyping] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const recordSecondsRef = useRef(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelRef = useRef(false)
  // Auto-reply staged timers — "read delay" before typing starts, then "typing duration"
  // before the reply actually lands. Tracked separately so a re-send (or unmount) mid-stage
  // can cancel whichever one is still pending instead of firing a stale reply into a
  // conversation the user already navigated away from.
  const readDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const convo = conversations.find((c) => c.id === id)
  const listing = convo?.listingId ? listings.find((l) => l.id === convo.listingId) : undefined
  const event = convo?.eventId ? events.find((e) => e.id === convo.eventId) : undefined
  const seller = convo ? sellers.find((s) => s.id === convo.sellerId) : undefined
  const subject = listing?.title ?? event?.title ?? 'this'

  useEffect(() => {
    if (id) loadThread(id).catch((err) => console.error('load thread failed', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (convo && convo.unreadCount > 0) markConversationRead(convo.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convo?.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [convo?.messages.length, sellerTyping])

  // Stop any in-progress recording/stream, and cancel any staged auto-reply timers, if the
  // user navigates away mid-record or mid-reply.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (timerRef.current) clearInterval(timerRef.current)
      if (readDelayRef.current) clearTimeout(readDelayRef.current)
      if (typingDelayRef.current) clearTimeout(typingDelayRef.current)
    }
  }, [])

  if (!convo || (!listing && !event) || !seller) {
    return (
      <div className="flex min-h-dvh flex-col">
        <BackHeader title="Conversation" />
        <p className="p-6 text-center text-sm text-muted">Conversation not found.</p>
      </div>
    )
  }

  const triggerAutoReply = () => {
    // Simulated seller auto-reply for demo liveliness — local-only, not persisted (see
    // AppContext.appendSimulatedReply): there's no real seller session to send it from yet.
    // Staged in two steps so it reads like a real person on the other end rather than an
    // obviously-instant bot: a "read delay" (they haven't opened the chat yet) followed by a
    // visible "typing…" indicator (they're composing a reply) before the message lands.
    if (readDelayRef.current) clearTimeout(readDelayRef.current)
    if (typingDelayRef.current) clearTimeout(typingDelayRef.current)
    setSellerTyping(false)
    const reply = AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)]
    const readDelay = 2500 + Math.random() * 4000
    const typingDuration = 1500 + Math.random() * 2500
    readDelayRef.current = setTimeout(() => {
      setSellerTyping(true)
      typingDelayRef.current = setTimeout(() => {
        setSellerTyping(false)
        appendSimulatedReply(convo.id, seller.id, reply)
      }, typingDuration)
    }, readDelay)
  }

  const send = () => {
    if (!text.trim()) return
    const value = text.trim()
    setText('')
    sendMessage(convo.id, value).catch((err) => console.error('send message failed', err))
    triggerAutoReply()
  }

  const startRecording = async () => {
    setMicError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      cancelRef.current = false
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
        const wasCancelled = cancelRef.current
        const seconds = recordSecondsRef.current
        setRecording(false)
        setRecordSeconds(0)
        if (wasCancelled || chunksRef.current.length === 0) return
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        setSendingVoice(true)
        try {
          const dataUrl = await blobToDataUrl(blob)
          await sendVoiceMessage(convo.id, dataUrl, Math.max(1, Math.round(seconds)))
          triggerAutoReply()
        } catch (err) {
          console.error('send voice message failed', err)
        } finally {
          setSendingVoice(false)
        }
      }
      recorder.start()
      setRecording(true)
      setRecordSeconds(0)
      recordSecondsRef.current = 0
      timerRef.current = setInterval(() => {
        recordSecondsRef.current += 1
        setRecordSeconds(recordSecondsRef.current)
        if (recordSecondsRef.current >= MAX_RECORD_SECONDS) stopRecording(false)
      }, 1000)
    } catch (err) {
      console.error('mic access failed', err)
      setMicError("Can't access the microphone — check your browser's permission for this site.")
    }
  }

  const stopRecording = (cancel: boolean) => {
    cancelRef.current = cancel
    mediaRecorderRef.current?.stop()
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader
        title={seller.name}
        right={
          seller.verificationLevel >= 3 ? <BadgeCheck size={16} className="text-good" /> : undefined
        }
      />

      {listing ? (
        <button
          onClick={() => navigate(`/listing/${listing.id}`)}
          className="card-elevated card-interactive mx-3 mt-2 flex items-center gap-2 rounded-xl bg-surface p-2 text-left"
        >
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-lg">
            {isImageUrl(listing.images[0]) ? (
              <img src={listing.images[0]} alt="" className="h-full w-full object-cover" />
            ) : (
              listing.images[0] ?? CATEGORY_META[listing.category].emoji
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink">{listing.title}</p>
            <p className="text-xs text-accent">{formatPrice(listing.price)}</p>
          </div>
        </button>
      ) : event ? (
        <button
          onClick={() => navigate(`/events/${event.id}`)}
          className="card-elevated card-interactive mx-3 mt-2 flex items-center gap-2 rounded-xl bg-surface p-2 text-left"
        >
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-lg">
            {isImageUrl(event.images[0]) ? (
              <img src={event.images[0]} alt="" className="h-full w-full object-cover" />
            ) : (
              event.images[0] ?? EVENT_CATEGORY_META[event.category].emoji
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink">{event.title}</p>
            <p className="flex items-center gap-1 text-xs text-accent">
              <CalendarDays size={10} className="shrink-0" /> {formatEventWhen(event.startsAt)}
            </p>
          </div>
        </button>
      ) : null}

      {listing &&
        listing.status === 'sold' &&
        currentUser?.id !== listing.sellerId &&
        !ratedListingIds.includes(listing.id) && (
          <RateSellerPrompt listingId={listing.id} sellerName={seller.name} />
        )}

      <div className="mx-3 mt-1.5 flex items-center gap-2 text-[11px] text-muted">
        <button
          onClick={() => setReportOpen(true)}
          className="tap-flash flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 transition-transform active:scale-95"
        >
          <Flag size={12} /> Report {seller.name.split(' ')[0]}
        </button>
        <button
          onClick={() => setDisputeOpen(true)}
          className="tap-flash flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 transition-transform active:scale-95"
        >
          <ShieldAlert size={12} /> Report a problem with this deal
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {convo.messages.length === 0 && (
          <p className="pt-8 text-center text-xs text-muted">
            Say hello to {seller.name.split(' ')[0]} about {subject}.
          </p>
        )}
        {convo.messages.map((m) => {
          const mine = m.senderId === currentUser?.id
          if (m.type === 'offer' || m.type === 'counter_offer') {
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[75%] rounded-2xl border border-accent/40 bg-accent/10 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">
                    {m.type === 'counter_offer' ? 'Counter offer' : 'Offer'}
                  </p>
                  <p className="text-sm font-semibold text-ink">{formatPrice(m.amount ?? 0)}</p>
                  {m.text && <p className="mt-0.5 text-xs text-muted">{m.text}</p>}
                  <p className="mt-1 text-[10px] text-muted">{timeAgo(m.createdAt)} ago</p>
                </div>
              </div>
            )
          }
          if (m.type === 'voice') {
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <VoiceBubble message={m} mine={mine} />
              </div>
            )
          }
          if (m.type === 'system') {
            // Narrates an offer accept/reject (see routes/offers.ts's postSystemMessage) —
            // rendered centered/neutral rather than left/right like a real party's message,
            // since it's not something either the buyer or seller "said".
            return (
              <div key={m.id} className="flex justify-center">
                <p className="max-w-[85%] rounded-full bg-surface-2 px-3 py-1.5 text-center text-[11px] text-muted">
                  {m.text}
                </p>
              </div>
            )
          }
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? 'bg-accent text-bg' : 'bg-surface-2 text-ink'
                }`}
              >
                <p>{m.text}</p>
                <p className={`mt-0.5 text-[10px] ${mine ? 'text-bg/70' : 'text-muted'}`}>
                  {timeAgo(m.createdAt)} ago
                </p>
              </div>
            </div>
          )
        })}
        {sellerTyping && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl bg-surface-2 px-3.5 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {micError && (
        <p className="px-4 pb-1 text-center text-[11px] text-bad">{micError}</p>
      )}

      <div className="flex items-center gap-2 border-t border-border p-3">
        {recording ? (
          <div className="flex flex-1 items-center gap-3 rounded-full border border-accent/40 bg-accent/10 px-4 py-2.5">
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-bad" />
            <span className="flex-1 text-sm font-medium text-ink">
              Recording… {formatClock(recordSeconds)}
            </span>
            <button
              onClick={() => stopRecording(true)}
              aria-label="Discard recording"
              className="tap-flash flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink transition-transform active:scale-90"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ) : (
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Type a message…"
            className="flex-1 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
          />
        )}

        {recording ? (
          <button
            onClick={() => stopRecording(false)}
            aria-label="Stop and send voice note"
            className="icon-btn h-10 w-10 shrink-0 bg-gradient-to-b from-accent-2 to-accent text-bg shadow-[0_4px_14px_-4px_rgba(36,91,50,0.6)]"
          >
            <Square size={15} fill="currentColor" />
          </button>
        ) : text.trim() ? (
          <button
            onClick={send}
            className="icon-btn h-10 w-10 shrink-0 bg-gradient-to-b from-accent-2 to-accent text-bg shadow-[0_4px_14px_-4px_rgba(36,91,50,0.6)]"
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        ) : (
          <button
            onClick={startRecording}
            disabled={sendingVoice}
            aria-label="Record a voice note"
            className="icon-btn h-10 w-10 shrink-0 bg-gradient-to-b from-accent-2 to-accent text-bg shadow-[0_4px_14px_-4px_rgba(36,91,50,0.6)] disabled:opacity-60"
          >
            <Mic size={16} />
          </button>
        )}
      </div>

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="user"
        targetId={seller.id}
        targetLabel={seller.name}
      />
      <DisputeSheet
        open={disputeOpen}
        onClose={() => setDisputeOpen(false)}
        conversationId={convo.id}
        otherPartyName={seller.name}
      />
    </div>
  )
}
