import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellRing, Clock, Gift, Search, Tag, TrendingDown, CheckCheck, Smartphone } from 'lucide-react'
import BackHeader from '../components/BackHeader'
import EmptyState from '../components/EmptyState'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import { relativeTime } from '../lib/format'
import { enablePush, disablePush, getPushState, type PushState } from '../lib/push'
import type { AppNotification } from '../types'

const ICONS: Record<AppNotification['type'], typeof Bell> = {
  offer: Tag,
  offer_update: Tag,
  price_drop: TrendingDown,
  saved_search: Search,
  referral: Gift,
  reminder: Clock,
  system: Bell,
}

// Phone notifications are asked for here — when someone is looking at their alerts and
// the value is obvious — never as a pop-up on first open.
function PushCard() {
  const toast = useToast()
  const [state, setState] = useState<PushState | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    getPushState()
      .then(setState)
      .catch(() => setState('unsupported'))
  }, [])

  if (state === 'loading' || state === 'unsupported') return null

  const toggle = async () => {
    setBusy(true)
    try {
      const next = state === 'on' ? await disablePush() : await enablePush()
      setState(next)
      if (next === 'on') toast.success("Done — you'll get a notification for new messages and offers.")
      if (next === 'denied') toast.error('Notifications are blocked for DEALEONE in your phone settings.')
    } catch (err) {
      console.error('push toggle failed', err)
      toast.error("Couldn't turn on notifications on this device.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card-elevated mb-3 flex items-start gap-3 rounded-2xl bg-surface p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
        {state === 'needs-install' ? <Smartphone size={18} /> : <BellRing size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">
          {state === 'on' ? 'Phone notifications are on' : 'Get notified on your phone'}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {state === 'needs-install'
            ? 'On iPhone/iPad: tap Share → "Add to Home Screen", open DEALEONE from there, then turn this on.'
            : state === 'denied'
              ? 'Notifications are blocked. Allow them for this site in your browser or phone settings.'
              : 'New messages, offers and price drops — even when the app is closed.'}
        </p>
        {(state === 'off' || state === 'on') && (
          <button
            onClick={toggle}
            disabled={busy}
            className={`mt-3 min-h-10 px-4 text-sm ${state === 'on' ? 'btn-secondary' : 'btn-primary'}`}
          >
            {busy ? 'Please wait…' : state === 'on' ? 'Turn off' : 'Turn on notifications'}
          </button>
        )}
      </div>
    </div>
  )
}

export default function Notifications() {
  const navigate = useNavigate()
  const { notifications, unreadNotifications, markAllNotificationsRead, markNotificationRead } = useApp()

  const open = (n: AppNotification) => {
    if (!n.read) markNotificationRead(n.id)
    if (n.url) navigate(n.url)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader
        title="Notifications"
        right={
          unreadNotifications > 0 ? (
            <button onClick={markAllNotificationsRead} className="icon-btn h-11 w-11 bg-surface-2 text-ink" aria-label="Mark all as read">
              <CheckCheck size={18} />
            </button>
          ) : undefined
        }
      />
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-3">
        <PushCard />
        {notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Nothing new yet"
            hint="Offers, price drops on saved items and matches for your saved searches will show up here."
          />
        ) : (
          <ul className="space-y-1.5">
            {notifications.map((n) => {
              const Icon = ICONS[n.type] ?? Bell
              return (
                <li key={n.id}>
                  <button
                    onClick={() => open(n)}
                    className={`tap-flash flex w-full items-start gap-3 rounded-2xl p-3 text-left transition active:scale-[0.99] ${
                      n.read ? 'bg-transparent' : 'bg-accent/[0.06]'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        n.read ? 'bg-surface-2 text-muted' : 'bg-accent/15 text-accent'
                      }`}
                    >
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${n.read ? 'text-ink' : 'font-semibold text-ink'}`}>{n.title}</span>
                      {n.body && <span className="mt-0.5 block text-xs text-muted">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-muted">{relativeTime(n.createdAt)}</span>
                    </span>
                    {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
