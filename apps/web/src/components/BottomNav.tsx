import { CalendarDays, MessageCircle, Plus, User, Megaphone } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

// 5 tabs, Sell dead center — Explore and Search no longer get their own tabs; they're
// merged into the single home screen's Map/List toggle (see Explore.tsx), reached via the
// DEALEONE logo / GPS pill in TopBar or simply by navigating back. This mirrors the
// reference layout the redesign was modeled on: two tabs, a raised glowing center action,
// two more tabs — no separate "home" slot in the bar itself.
const TABS = [
  { to: '/events', label: 'Events', icon: CalendarDays, match: (p: string) => p.startsWith('/events') },
  { to: '/chats', label: 'Messages', icon: MessageCircle, match: (p: string) => p.startsWith('/chats') },
  { to: '/sell', label: 'Sell', icon: Plus, match: (p: string) => p.startsWith('/sell') },
  { to: '/account', label: 'Profile', icon: User, match: (p: string) => p.startsWith('/account') && p !== '/account/promote' },
  { to: '/promote', label: 'Promote', icon: Megaphone, match: (p: string) => p.startsWith('/promote') },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { conversations } = useApp()
  const unread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)

  return (
    <nav className="sticky bottom-0 z-30 px-3 pb-3 pt-1">
      <div className="mx-auto flex max-w-md items-stretch justify-between rounded-full bg-surface/90 px-1 shadow-[0_14px_32px_-14px_rgba(0,0,0,0.7)] backdrop-blur-xl supports-[backdrop-filter]:bg-surface/75">
        {TABS.map((tab) => {
          const active = tab.match(location.pathname)
          const isSell = tab.to === '/sell'
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              onClick={(e) => {
                if (isSell) {
                  e.preventDefault()
                  navigate('/sell')
                }
              }}
              className="relative flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 text-[11px]"
            >
              {isSell ? (
                <span className="icon-btn -mt-5 h-11 w-11 bg-gradient-to-b from-accent-2 to-accent text-bg shadow-lg shadow-accent/40 ring-1 ring-accent-2/40">
                  <tab.icon size={22} strokeWidth={2.5} />
                </span>
              ) : (
                <span className="relative flex h-8 w-8 items-center justify-center">
                  <span
                    className={`icon-btn h-8 w-8 transition-colors ${
                      active ? 'text-accent' : 'text-muted'
                    }`}
                  >
                    <tab.icon size={20} className={active ? 'glow-accent' : ''} />
                  </span>
                  {tab.to === '/chats' && unread > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-bg shadow-[0_0_8px_rgba(36,91,50,0.7)]">
                      {unread}
                    </span>
                  )}
                </span>
              )}
              <span
                className={`max-w-full truncate ${active && !isSell ? 'text-accent font-medium' : 'text-muted'}`}
              >
                {tab.label}
              </span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
