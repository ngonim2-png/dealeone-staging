import { Bell, MapPin } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import logoMark from '../assets/logo-mark.png'

export default function TopBar({ notifications = 1 }: { notifications?: number }) {
  const navigate = useNavigate()
  const { userLocation } = useApp()
  const gpsLive = userLocation.status === 'live'
  return (
    <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
      <button
        className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-ink"
        onClick={() => navigate('/account')}
      >
        <MapPin size={16} className="shrink-0 text-accent" />
        <span className="truncate">{userLocation.label}</span>
        <span
          className={`ml-0.5 flex shrink-0 items-center gap-1 text-[11px] font-normal ${
            gpsLive ? 'text-good' : 'text-muted'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${gpsLive ? 'bg-good' : 'bg-muted'}`} />
          {gpsLive ? 'GPS on' : userLocation.status === 'locating' ? 'Locating…' : 'GPS off'}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <img src={logoMark} alt="" className="glow-accent h-6 w-6 shrink-0" />
        <span className="text-sm font-display font-bold tracking-wide text-accent">DEALEONE</span>
        <button
          className="icon-btn ml-1 h-8 w-8 shrink-0 bg-surface-2 text-ink"
          onClick={() => navigate('/account')}
          aria-label="Notifications"
        >
          <Bell size={16} />
          {notifications > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative h-2 w-2 rounded-full bg-accent" />
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
