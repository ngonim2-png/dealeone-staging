import { useMemo, useState } from 'react'
import { CalendarDays, MapPin, Plus, Ticket, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import EmptyState from '../components/EmptyState'
import { useApp } from '../context/AppContext'
import { EVENT_CATEGORY_META, type EventCategory } from '../types'
import { distanceKm, RADIUS_STEPS, nextRadius } from '../lib/geo'
import { formatDistance, formatEventWhen, formatPrice } from '../lib/format'
import { isImageUrl } from '../lib/media'

const CATEGORIES = Object.keys(EVENT_CATEGORY_META) as EventCategory[]

function ticketSummary(tiers: { name: string; price: number }[]): string {
  if (tiers.length === 0) return 'Free'
  const prices = tiers.map((t) => t.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? formatPrice(min) : `${formatPrice(min)}–${formatPrice(max)}`
}

export default function Events() {
  const navigate = useNavigate()
  const { events, sellers, userLocation } = useApp()
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming')
  const [categories, setCategories] = useState<EventCategory[]>([])
  const [radiusKm, setRadiusKm] = useState(25)

  const toggleCategory = (c: EventCategory) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  const now = Date.now()
  const results = useMemo(() => {
    return events
      .filter((e) => (when === 'upcoming' ? new Date(e.startsAt).getTime() >= now : new Date(e.startsAt).getTime() < now))
      .filter((e) => categories.length === 0 || categories.includes(e.category))
      .map((e) => ({ event: e, distance: distanceKm(userLocation.lat, userLocation.lng, e.lat, e.lng) }))
      .filter((r) => radiusKm === 999 || r.distance <= radiusKm)
      .sort((a, b) =>
        when === 'upcoming'
          ? new Date(a.event.startsAt).getTime() - new Date(b.event.startsAt).getTime()
          : new Date(b.event.startsAt).getTime() - new Date(a.event.startsAt).getTime(),
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, when, categories, radiusKm, userLocation])

  const expandRadius = () => {
    const next = nextRadius(radiusKm)
    if (next) setRadiusKm(next)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-1">
        <h1 className="text-xl font-display font-bold tracking-tight text-ink">Events</h1>
        <button
          onClick={() => navigate('/events/new')}
          className="tap-flash flex items-center gap-1 rounded-full bg-gradient-to-b from-accent-2 to-accent px-3 py-1.5 text-xs font-semibold text-bg shadow-[0_2px_10px_-2px_rgba(36,91,50,0.5)] transition active:scale-95"
        >
          <Plus size={13} /> Host
        </button>
      </div>

      <div className="flex gap-2 px-4 pb-2">
        {(['upcoming', 'past'] as const).map((w) => (
          <button
            key={w}
            onClick={() => setWhen(w)}
            className={`tap-flash rounded-full px-3 py-1.5 text-xs font-medium capitalize transition active:scale-95 ${
              when === w ? 'glow-accent-ring bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
            }`}
          >
            {w}
          </button>
        ))}
      </div>

      <div className="no-scrollbar scroll-fade-x flex gap-2 overflow-x-auto px-4 pb-2">
        {CATEGORIES.map((c) => {
          const active = categories.includes(c)
          return (
            <button
              key={c}
              onClick={() => toggleCategory(c)}
              className={`tap-flash flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs transition active:scale-95 ${
                active ? 'glow-accent-ring bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
              }`}
            >
              <span>{EVENT_CATEGORY_META[c].emoji}</span>
              {EVENT_CATEGORY_META[c].label}
            </button>
          )
        })}
      </div>

      <div className="no-scrollbar scroll-fade-x flex items-center gap-2 overflow-x-auto px-4 pb-3">
        {RADIUS_STEPS.map((r) => (
          <button
            key={r}
            onClick={() => setRadiusKm(r)}
            className={`tap-flash shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
              radiusKm === r
                ? 'bg-gradient-to-b from-accent-2 to-accent text-bg shadow-[0_2px_10px_-2px_rgba(36,91,50,0.5)]'
                : 'bg-surface-2 text-muted'
            }`}
          >
            {r} km
          </button>
        ))}
        <button
          onClick={() => setRadiusKm(999)}
          className={`tap-flash shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
            radiusKm === 999
              ? 'bg-gradient-to-b from-accent-2 to-accent text-bg shadow-[0_2px_10px_-2px_rgba(36,91,50,0.5)]'
              : 'bg-surface-2 text-muted'
          }`}
        >
          Anywhere
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {results.length === 0 && (
          <>
            <EmptyState
              icon={CalendarDays}
              title={when === 'upcoming' ? 'No upcoming events nearby' : 'No past events to show'}
              hint={
                when === 'upcoming'
                  ? nextRadius(radiusKm)
                    ? undefined
                    : 'Try a different category, or host your own.'
                  : undefined
              }
            />
            {when === 'upcoming' && nextRadius(radiusKm) && (
              <div className="flex justify-center">
                <button onClick={expandRadius} className="btn-primary px-4 py-1.5 text-xs">
                  Expand search to {nextRadius(radiusKm)} km
                </button>
              </div>
            )}
          </>
        )}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 lg:grid-cols-3">
        {results.map(({ event, distance }) => {
          const organizer = sellers.find((s) => s.id === event.organizerId)
          const meta = EVENT_CATEGORY_META[event.category]
          return (
            <button
              key={event.id}
              onClick={() => navigate(`/events/${event.id}`)}
              className="card-elevated card-interactive flex w-full items-center gap-3 rounded-2xl bg-surface-2 p-3 text-left"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-bg text-2xl">
                {isImageUrl(event.images[0]) ? (
                  <img src={event.images[0]} alt="" className="h-full w-full object-cover" />
                ) : (
                  event.images[0] ?? meta.emoji
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-[11px] text-muted">
                  <span>{meta.emoji}</span>
                  <span>{meta.label}</span>
                  {event.status === 'cancelled' && (
                    <span className="rounded-full bg-bad/10 px-1.5 py-0.5 text-[10px] font-medium text-bad">
                      Cancelled
                    </span>
                  )}
                </div>
                <p className="truncate text-sm font-medium text-ink">{event.title}</p>
                <p className="flex items-center gap-1 truncate text-xs text-muted">
                  <CalendarDays size={11} className="shrink-0 text-accent" /> {formatEventWhen(event.startsAt)}
                </p>
                <p className="flex items-center gap-1 truncate text-[11px] text-muted">
                  <MapPin size={10} className="shrink-0" /> {event.venueName} · {formatDistance(distance)}
                </p>
                <div className="mt-1 flex items-center gap-2 text-[11px]">
                  <span className="flex items-center gap-1 font-medium text-accent">
                    <Ticket size={11} /> {ticketSummary(event.ticketTiers)}
                  </span>
                  {event.interestedCount > 0 && (
                    <span className="flex items-center gap-1 text-muted">
                      <Users size={11} /> {event.interestedCount} interested
                    </span>
                  )}
                  {organizer && <span className="truncate text-muted">· by {organizer.name}</span>}
                </div>
              </div>
            </button>
          )
        })}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
