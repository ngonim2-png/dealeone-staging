import { Bell, MapPin } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import logoMark from '../assets/logo-mark.png'

// The brand block doubles as the Home button: the bottom nav (Events / Messages / Sell /
// Profile / Promote) deliberately has no Home tab, so without this there was no way back
// to the map after navigating away (e.g. after reopening the app on Messages). The
// location line lives under the wordmark so the street name gets a full line instead of
// being truncated to "Lu…" on small phones.
//
// The bell opens Notifications (offers, price drops, saved-search matches…) and shows the
// real unread count, kept current by the live stream. Chat unread counts stay on the
// Messages tab.
export default function TopBar() {
  const navigate = useNavigate()
  const { userLocation, unreadNotifications } = useApp()
  const unread = unreadNotifications
  const gpsLive = userLocation.status === 'live'
  const gpsLabel = gpsLive ? 'GPS on' : userLocation.status === 'locating' ? 'Locating…' : 'Approximate'

  return (
    <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
      <button
        type="button"
        onClick={() => navigate('/')}
        aria-label="DEALEONE — go to the home map"
        className="-ml-1 flex min-w-0 items-center gap-2.5 rounded-2xl py-1 pl-1 pr-2 text-left transition-transform active:scale-[0.98]"
      >
        <img src={logoMark} alt="" className="glow-accent h-9 w-9 shrink-0" />
        <span className="min-w-0">
          <span className="block font-display text-[15px] font-bold leading-tight tracking-wide text-accent">
            DEALEONE
          </span>
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
            <MapPin size={12} className="shrink-0 text-accent" aria-hidden />
            <span className="truncate">{userLocation.label}</span>
            <span className="shrink-0" aria-hidden>
              ·
            </span>
            <span className={`flex shrink-0 items-center gap-1 ${gpsLive ? 'text-good' : ''}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${gpsLive ? 'bg-good' : 'bg-muted/60'}`} aria-hidden />
              {gpsLabel}
            </span>
          </span>
        </span>
      </button>
      <button
        type="button"
        className="icon-btn h-11 w-11 shrink-0 bg-surface-2 text-ink"
        onClick={() => navigate('/notifications')}
        aria-label={unread > 0 ? `Notifications — ${unread} unread` : 'Notifications'}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-bold leading-none text-white ring-2 ring-bg">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </header>
  )
}
