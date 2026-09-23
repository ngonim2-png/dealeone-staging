import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  BadgeCheck,
  CalendarDays,
  Flag,
  MapPin,
  MessageCircle,
  Navigation,
  Share2,
  Ticket,
  Users,
} from 'lucide-react'
import BackHeader from '../components/BackHeader'
import MiniMap from '../components/MiniMap'
import Rating from '../components/Rating'
import ReportSheet from '../components/ReportSheet'
import { useApp } from '../context/AppContext'
import { EVENT_CATEGORY_META, VERIFICATION_LABELS } from '../types'
import { formatDistance, formatEventWhen, formatPrice, timeAgo } from '../lib/format'
import { distanceKm } from '../lib/geo'
import { isImageUrl } from '../lib/media'
import { reverseGeocode } from '../lib/geocode'

export default function EventDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { events, sellers, currentUser, toggleEventInterest, ensureEventConversation, userLocation } = useApp()
  const [toast, setToast] = useState<string | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [interestBusy, setInterestBusy] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const event = events.find((e) => e.id === id)
  const organizer = event ? sellers.find((s) => s.id === event.organizerId) : undefined

  const similar = useMemo(() => {
    if (!event) return []
    const now = Date.now()
    return events
      .filter(
        (e) =>
          e.id !== event.id &&
          e.category === event.category &&
          e.status === 'active' &&
          new Date(e.startsAt).getTime() >= now,
      )
      .map((e) => ({ e, d: distanceKm(userLocation.lat, userLocation.lng, e.lat, e.lng) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4)
      .map((x) => x.e)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, events, userLocation])

  useEffect(() => {
    if (!event) {
      setAddress(null)
      return
    }
    // Venue location is always exact (public by nature — no approxLocation fuzzing like
    // listings get, see schema.ts's comment on the events table).
    const controller = new AbortController()
    reverseGeocode(event.lat, event.lng, controller.signal).then((label) => {
      if (!controller.signal.aborted) setAddress(label)
    })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, event?.lat, event?.lng])

  if (!event) {
    return (
      <div className="flex min-h-dvh flex-col">
        <BackHeader title="Not found" />
        <p className="p-6 text-center text-sm text-muted">This event is no longer available.</p>
      </div>
    )
  }

  const dist = distanceKm(userLocation.lat, userLocation.lng, event.lat, event.lng)
  const meta = EVENT_CATEGORY_META[event.category]
  const isOwnEvent = currentUser?.id === event.organizerId

  const messageOrganizer = async () => {
    const convoId = await ensureEventConversation(event.id)
    navigate(`/chats/${convoId}`)
  }

  const toggleInterest = async () => {
    setInterestBusy(true)
    try {
      await toggleEventInterest(event.id)
    } catch (err) {
      console.error('toggle interest failed', err)
      setToast("Couldn't update — try again")
      setTimeout(() => setToast(null), 2000)
    } finally {
      setInterestBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col pb-24">
      <BackHeader
        right={
          <button className="icon-btn h-9 w-9 bg-surface-2" aria-label="Share">
            <Share2 size={16} className="text-ink" />
          </button>
        }
      />

      <div className="relative flex h-64 items-center justify-center overflow-hidden bg-gradient-to-b from-surface-2 to-surface">
        {isImageUrl(event.images[0]) ? (
          <img
            src={event.images[0]}
            alt={event.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(36,91,50,0.14),transparent_62%)]" />
            <span className="relative text-8xl drop-shadow-[0_16px_28px_rgba(0,0,0,0.55)]">
              {event.images[0] ?? meta.emoji}
            </span>
          </>
        )}
      </div>

      <div className="space-y-5 p-4">
        <div className="flex flex-wrap gap-1.5">
          <Tag>
            {meta.emoji} {meta.label}
          </Tag>
          {event.status === 'cancelled' ? (
            <Tag bad>Cancelled</Tag>
          ) : (
            <Tag good>{new Date(event.startsAt).getTime() >= Date.now() ? 'Upcoming' : 'Past'}</Tag>
          )}
        </div>

        <div>
          <h1 className="text-xl font-display font-bold tracking-tight text-ink">{event.title}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-accent">
            <CalendarDays size={15} className="shrink-0" /> {formatEventWhen(event.startsAt)}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={toggleInterest}
            disabled={interestBusy}
            className={`tap-flash flex min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-full border py-2.5 text-sm font-semibold transition-transform active:scale-[0.97] disabled:opacity-60 ${
              event.isInterested
                ? 'glow-accent-ring border-accent bg-accent/15 text-accent'
                : 'border-border text-ink'
            }`}
          >
            <Users size={15} className="shrink-0" />
            <span className="truncate">
              {event.isInterested ? 'Interested' : "I'm interested"}
              {event.interestedCount > 0 ? ` · ${event.interestedCount}` : ''}
            </span>
          </button>
          {!isOwnEvent && (
            <button onClick={messageOrganizer} className="btn-primary min-w-0 flex-1 truncate py-2.5 text-sm">
              <MessageCircle size={15} className="shrink-0" /> <span className="truncate">Message Organizer</span>
            </button>
          )}
        </div>

        <div>
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Tickets</h2>
          {event.ticketTiers.length === 0 ? (
            <div className="card-elevated rounded-xl bg-surface p-3 text-sm text-ink">Free entry</div>
          ) : (
            <div className="card-elevated space-y-2 rounded-xl bg-surface p-3">
              {event.ticketTiers.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-ink">
                    <Ticket size={13} className="text-accent" /> {t.name}
                  </span>
                  <span className="font-display font-bold text-accent">{formatPrice(t.price)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">About this event</h2>
          <p className="text-sm leading-relaxed text-ink/90">{event.description}</p>
        </div>

        <div>
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Venue</h2>
          <div className="card-elevated overflow-hidden rounded-xl bg-surface">
            <div className="h-36 w-full">
              <MiniMap lat={event.lat} lng={event.lng} precision="exact" />
            </div>
            <div className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0 text-sm">
                <p className="flex items-center gap-1 truncate text-ink">
                  <MapPin size={12} className="shrink-0 text-accent" />
                  {event.venueName}
                </p>
                <p className="truncate text-xs text-muted">
                  {address ?? `${formatDistance(dist)} from you`}
                </p>
              </div>
              <a
                href={`https://www.openstreetmap.org/?mlat=${event.lat}&mlon=${event.lng}#map=17/${event.lat}/${event.lng}`}
                target="_blank"
                rel="noreferrer"
                className="tap-flash flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 text-xs text-ink transition-transform active:scale-95"
              >
                <Navigation size={12} /> Directions
              </a>
            </div>
          </div>
        </div>

        {organizer && (
          <div>
            <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Organizer</h2>
            <button
              onClick={() => !isOwnEvent && messageOrganizer()}
              className="card-elevated card-interactive flex w-full items-center gap-3 rounded-xl bg-surface p-3 text-left"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-xl ring-1 ring-border">
                {organizer.avatar}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <p className="truncate text-sm font-medium text-ink">{organizer.name}</p>
                  {organizer.verificationLevel >= 3 && <BadgeCheck size={13} className="shrink-0 text-good" />}
                </div>
                <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted">
                  <Rating value={organizer.rating} count={organizer.ratingCount} size={11} />
                  <span>· {VERIFICATION_LABELS[organizer.verificationLevel]}</span>
                </p>
              </div>
            </button>
          </div>
        )}

        <div className="flex gap-2 text-xs text-muted">
          <button className="tap-flash flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 transition-transform active:scale-95">
            <Share2 size={12} /> Share
          </button>
          {!isOwnEvent && (
            <button
              onClick={() => setReportOpen(true)}
              className="tap-flash flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 transition-transform active:scale-95"
            >
              <Flag size={12} /> Report
            </button>
          )}
          <span className="ml-auto self-center">Posted {timeAgo(event.createdAt)} ago</span>
        </div>

        {similar.length > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">More {meta.label.toLowerCase()}</h2>
            <div className="space-y-2">
              {similar.map((e) => {
                const d = distanceKm(userLocation.lat, userLocation.lng, e.lat, e.lng)
                return (
                  <button
                    key={e.id}
                    onClick={() => navigate(`/events/${e.id}`)}
                    className="card-elevated card-interactive flex w-full items-center gap-3 rounded-xl bg-surface-2 p-2.5 text-left"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg text-xl">
                      {isImageUrl(e.images[0]) ? (
                        <img src={e.images[0]} alt="" className="h-full w-full object-cover" />
                      ) : (
                        e.images[0] ?? EVENT_CATEGORY_META[e.category].emoji
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{e.title}</p>
                      <p className="truncate text-xs text-muted">
                        {formatEventWhen(e.startsAt)} · {formatDistance(d)}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="event"
        targetId={event.id}
        targetLabel={event.title}
      />

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center">
          <div className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-bg shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  )
}

function Tag({ children, good, bad }: { children: ReactNode; good?: boolean; bad?: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${
        good
          ? 'border border-good/40 bg-good/10 text-good'
          : bad
            ? 'border border-bad/40 bg-bad/10 text-bad'
            : 'bg-surface-2 text-muted'
      }`}
    >
      {children}
    </span>
  )
}
