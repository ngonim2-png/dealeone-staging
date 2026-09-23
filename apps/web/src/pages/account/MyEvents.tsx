import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban, CalendarDays, Loader2, RotateCcw, Users } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import EmptyState from '../../components/EmptyState'
import { useApp } from '../../context/AppContext'
import { EVENT_CATEGORY_META } from '../../types'
import { api } from '../../lib/api'
import { mapEvent } from '../../lib/mappers'
import { formatEventWhen } from '../../lib/format'
import type { DealeoneEvent } from '../../types'
import { isImageUrl } from '../../lib/media'

const ALL_STATUSES = 'active,cancelled'

export default function MyEvents() {
  const navigate = useNavigate()
  const { currentUser, updateEventStatus } = useApp()
  const [mine, setMine] = useState<DealeoneEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!currentUser) return
    let cancelled = false
    setLoading(true)
    api
      .get<{ results: { event: any; interestedCount: number; isInterested: boolean }[] }>(
        `/api/events?organizerId=${currentUser.id}&status=${ALL_STATUSES}&when=all&radiusKm=25000`,
      )
      .then((res) => {
        if (cancelled) return
        setMine(
          res.results
            .map((r) => mapEvent({ ...r.event, interestedCount: r.interestedCount, isInterested: r.isInterested }))
            .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()),
        )
      })
      .catch((err) => console.error('failed to load my events', err))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [currentUser])

  const toggleStatus = async (event: DealeoneEvent) => {
    setBusyId(event.id)
    try {
      const updated = await updateEventStatus(event.id, event.status === 'cancelled' ? 'active' : 'cancelled')
      setMine((prev) => prev.map((e) => (e.id === updated.id ? { ...updated, interestedCount: e.interestedCount, isInterested: e.isInterested } : e)))
    } catch (err) {
      console.error('update event status failed', err)
      alert('Could not update this event — check the API server is running and try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="My Events" />
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {!loading && mine.length === 0 && (
          <EmptyState
            icon={CalendarDays}
            title="You haven't hosted any events yet"
            hint="Tap Events > Host to publish your first one."
          />
        )}
        {mine.map((event) => {
          const meta = EVENT_CATEGORY_META[event.category]
          const upcoming = new Date(event.startsAt).getTime() >= Date.now()
          return (
            <div key={event.id} className="card-elevated space-y-2 rounded-xl bg-surface p-3">
              <button
                onClick={() => navigate(`/events/${event.id}`)}
                className="flex w-full items-center gap-3 text-left"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-2xl">
                  {isImageUrl(event.images[0]) ? (
                    <img src={event.images[0]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    event.images[0] ?? meta.emoji
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{event.title}</p>
                  <p className="truncate text-xs text-muted">{formatEventWhen(event.startsAt)} · {event.venueName}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                    {event.status === 'cancelled' ? (
                      <span className="rounded-full bg-bad/10 px-1.5 py-0.5 font-medium text-bad">Cancelled</span>
                    ) : upcoming ? (
                      <span className="rounded-full bg-good/10 px-1.5 py-0.5 font-medium text-good">Upcoming</span>
                    ) : (
                      <span className="rounded-full bg-surface-2 px-1.5 py-0.5 font-medium">Past</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users size={11} /> {event.interestedCount} interested
                    </span>
                  </div>
                </div>
              </button>
              <button
                onClick={() => toggleStatus(event)}
                disabled={busyId === event.id}
                className={`tap-flash flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition active:scale-95 disabled:opacity-60 ${
                  event.status === 'cancelled' ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'
                }`}
              >
                {busyId === event.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : event.status === 'cancelled' ? (
                  <>
                    <RotateCcw size={12} /> Reactivate event
                  </>
                ) : (
                  <>
                    <Ban size={12} /> Cancel event
                  </>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
