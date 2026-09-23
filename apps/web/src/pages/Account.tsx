import { useState } from 'react'
import {
  BadgeCheck,
  ChevronRight,
  ListChecks,
  Tags,
  Heart,
  Search,
  CalendarDays,
  CreditCard,
  Settings,
  ShieldCheck,
  Flag,
  ShieldHalf,
  LogOut,
  Megaphone,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import Rating from '../components/Rating'
import { useApp } from '../context/AppContext'
import { VERIFICATION_LABELS } from '../types'

export default function Account() {
  const navigate = useNavigate()
  const { currentUser, listings, events, offers, wishlist, buyerRequests, reports, disputes, logout } = useApp()
  const [confirmingLogout, setConfirmingLogout] = useState(false)

  if (!currentUser) return null // App.tsx only renders this route once bootstrap is ready

  const myListingsCount = listings.filter((l) => l.sellerId === currentUser.id).length
  const myEventsCount = events.filter((e) => e.organizerId === currentUser.id).length

  const rows = [
    {
      icon: ListChecks,
      label: 'My Listings',
      sub: `${myListingsCount} listing${myListingsCount !== 1 ? 's' : ''}`,
      to: '/account/listings',
    },
    {
      icon: CalendarDays,
      label: 'My Events',
      sub: `${myEventsCount} hosted`,
      to: '/account/events',
    },
    { icon: Tags, label: 'My Offers', sub: `${offers.length} sent`, to: '/account/offers' },
    { icon: Heart, label: 'My Wishlist', sub: `${wishlist.length} saved`, to: '/account/wishlist' },
    {
      icon: Search,
      label: 'My Buyer Requests',
      sub: `${buyerRequests.length} active`,
      to: '/account/requests',
    },
    { icon: ShieldCheck, label: 'Verification', sub: VERIFICATION_LABELS[currentUser.verificationLevel], to: '/account/verification' },
    { icon: Megaphone, label: 'Promote', sub: 'Boost listings, priority access', to: '/promote' },
    {
      icon: Flag,
      label: 'My Reports',
      sub: `${reports.length + disputes.length} submitted`,
      to: '/account/reports',
    },
    { icon: CreditCard, label: 'Payments', sub: 'Billing history', to: '/account/payments' },
    {
      icon: Settings,
      label: 'Settings',
      sub: currentUser.isBusiness ? `Business · ${currentUser.businessName}` : 'Business account',
      to: '/account/settings',
    },
    ...(currentUser.role === 'admin'
      ? [{ icon: ShieldHalf, label: 'Admin Dashboard', sub: 'Reports, disputes, users, listings', to: '/admin' }]
      : []),
  ]

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />

      <div className="px-4 pb-4 pt-1">
        <div className="card-elevated flex items-center gap-3 rounded-2xl bg-surface p-4">
          <div className="glow-accent-ring flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-accent-2 to-accent text-lg font-bold text-bg">
            {currentUser.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-lg font-display font-bold tracking-tight text-ink">{currentUser.name}</p>
              {currentUser.verificationLevel >= 2 && <BadgeCheck size={15} className="text-good" />}
            </div>
            <p className="text-xs text-muted">
              {currentUser.location} · {currentUser.isBuyerAndSeller ? 'Buyer & Seller' : 'Buyer'}
            </p>
            <Rating value={currentUser.rating} size={11} className="mt-0.5 text-xs text-muted" />
          </div>
        </div>

        <div className="mt-3 space-y-1">
          {rows.map((r) => (
            <button
              key={r.label}
              onClick={() => r.to !== '#' && navigate(r.to)}
              className="tap-flash flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition active:scale-[0.98] active:bg-surface hover:bg-surface"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-accent">
                <r.icon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{r.label}</p>
                <p className="text-xs text-muted">{r.sub}</p>
              </span>
              <ChevronRight size={16} className="text-muted" />
            </button>
          ))}
        </div>

        <button
          onClick={() => setConfirmingLogout(true)}
          className="tap-flash mt-2 flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition active:scale-[0.98] active:bg-bad/10 hover:bg-bad/10"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-bad">
            <LogOut size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <p className="text-sm font-medium text-bad">Log out</p>
          </span>
        </button>
      </div>

      <BottomNav />

      {confirmingLogout && (
        <div className="scrim-enter fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px]">
          <div className="sheet-elevated sheet-enter w-full max-w-md rounded-t-3xl border-t border-border bg-surface p-5 pb-8">
            <h2 className="mb-1 text-base font-semibold text-ink">Log out of DEALEONE?</h2>
            <p className="mb-5 text-sm text-muted">
              You'll need to verify your number again to sign back in as {currentUser.name}
            </p>
            <button onClick={logout} className="btn-danger w-full text-sm">
              Log out
            </button>
            <button
              onClick={() => setConfirmingLogout(false)}
              className="btn-secondary mt-2 w-full text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
