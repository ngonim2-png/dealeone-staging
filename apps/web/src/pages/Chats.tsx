import { useEffect, useState } from 'react'
import { BadgeCheck, MessageCircle, Mic } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import EmptyState from '../components/EmptyState'
import StatusRow from '../components/StatusRow'
import StatusComposer from '../components/StatusComposer'
import StatusViewer from '../components/StatusViewer'
import { useApp } from '../context/AppContext'
import { CATEGORY_META, EVENT_CATEGORY_META } from '../types'
import { formatEventWhen, formatPrice, timeAgo } from '../lib/format'

export default function Chats() {
  const navigate = useNavigate()
  const { conversations, listings, events, sellers, refreshStatuses } = useApp()
  const [composerOpen, setComposerOpen] = useState(false)
  const [viewerUserId, setViewerUserId] = useState<string | null>(null)

  useEffect(() => {
    refreshStatuses().catch((err) => console.error('refresh statuses failed', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <div className="px-4 pb-2 pt-1">
        <h1 className="text-xl font-display font-bold tracking-tight text-ink">Messages</h1>
      </div>

      <StatusRow onOpenViewer={setViewerUserId} onOpenComposer={() => setComposerOpen(true)} />

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {conversations.length === 0 && (
          <EmptyState
            icon={MessageCircle}
            title="No conversations yet"
            hint="Message a seller or an event organizer to start one."
          />
        )}
        <div className="space-y-1">
          {conversations
            .filter((c) => c.messages.length > 0)
            .map((c) => {
              const listing = c.listingId ? listings.find((l) => l.id === c.listingId) : undefined
              const event = c.eventId ? events.find((e) => e.id === c.eventId) : undefined
              const seller = sellers.find((s) => s.id === c.sellerId)
              const last = c.messages[c.messages.length - 1]
              if ((!listing && !event) || !seller || !last) return null
              return (
                <button
                  key={c.id}
                  onClick={() => navigate(`/chats/${c.id}`)}
                  className="tap-flash flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition active:scale-[0.98] hover:bg-surface active:bg-surface"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xl">
                    {seller.avatar}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex min-w-0 items-center gap-1">
                        <p className="truncate text-sm font-medium text-ink">{seller.name}</p>
                        {seller.verificationLevel >= 3 && (
                          <BadgeCheck size={12} className="shrink-0 text-good" />
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] text-muted">{timeAgo(c.lastMessageAt)}</span>
                    </div>
                    <p className="truncate text-xs text-accent">
                      {listing ? (
                        <>
                          {CATEGORY_META[listing.category].emoji} {listing.title} · {formatPrice(listing.price)}
                        </>
                      ) : (
                        event && (
                          <>
                            {EVENT_CATEGORY_META[event.category].emoji} {event.title} · {formatEventWhen(event.startsAt)}
                          </>
                        )
                      )}
                    </p>
                    <p className="flex items-center gap-1 truncate text-xs text-muted">
                      {last.type === 'offer' ? (
                        `Offer: ${formatPrice(last.amount ?? 0)}`
                      ) : last.type === 'counter_offer' ? (
                        `Countered: ${formatPrice(last.amount ?? 0)}`
                      ) : last.type === 'voice' ? (
                        <>
                          <Mic size={11} className="shrink-0" /> Voice note ·{' '}
                          {Math.max(1, Math.round(last.audioDurationSec ?? 0))}s
                        </>
                      ) : (
                        last.text
                      )}
                    </p>
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-bg shadow-[0_0_8px_rgba(36,91,50,0.7)]">
                      {c.unreadCount}
                    </span>
                  )}
                </button>
              )
            })}
        </div>
      </div>

      <BottomNav />

      <StatusComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
      <StatusViewer userId={viewerUserId} onClose={() => setViewerUserId(null)} />
    </div>
  )
}
