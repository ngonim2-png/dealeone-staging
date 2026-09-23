import { useNavigate } from 'react-router-dom'
import { Flag, ShieldAlert, ShieldCheck, Users, ListChecks, ChevronRight } from 'lucide-react'
import BackHeader from '../../components/BackHeader'

const TILES = [
  { icon: Flag, label: 'Reports', hint: 'Scam or fraud reports awaiting review', to: '/admin/reports' },
  { icon: ShieldAlert, label: 'Disputes', hint: 'Buyer/seller deals gone wrong', to: '/admin/disputes' },
  { icon: ShieldCheck, label: 'Verification', hint: 'Seller verification requests awaiting review', to: '/admin/verification' },
  { icon: Users, label: 'Users', hint: 'Search accounts, suspend bad actors', to: '/admin/users' },
  { icon: ListChecks, label: 'Listings', hint: 'Search and remove listings', to: '/admin/listings' },
]

/** Entry point for the moderation panel — only reachable via Account's "Admin Dashboard"
 * row, which only renders for currentUser.role === 'admin' (see App.tsx's AdminRoute guard
 * for the actual access gate; this page assumes it already passed). */
export default function AdminHome() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Admin Dashboard" />
      <div className="space-y-2 px-4 py-3">
        {TILES.map((t) => (
          <button
            key={t.label}
            onClick={() => navigate(t.to)}
            className="card-elevated card-interactive flex w-full items-center gap-3 rounded-xl bg-surface p-4 text-left"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
              <t.icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{t.label}</p>
              <p className="text-xs text-muted">{t.hint}</p>
            </span>
            <ChevronRight size={16} className="text-muted" />
          </button>
        ))}
      </div>
    </div>
  )
}
