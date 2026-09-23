import { useEffect, useState } from 'react'
import { Users, ShieldHalf } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import EmptyState from '../../components/EmptyState'
import { api } from '../../lib/api'

interface AdminUserRow {
  id: string
  name: string
  phone: string
  role: 'user' | 'admin'
  suspended: boolean
  verificationLevel: number
  isBusiness: boolean
  createdAt: string
}

export default function AdminUsers() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminUserRow[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = (query: string) => {
    api
      .get<{ users: AdminUserRow[] }>(`/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then((res) => setRows(res.users))
  }

  useEffect(() => {
    const t = setTimeout(() => load(q), 250)
    return () => clearTimeout(t)
  }, [q])

  const toggleSuspend = async (u: AdminUserRow) => {
    setBusyId(u.id)
    try {
      await api.patch(`/api/admin/users/${u.id}`, { suspended: !u.suspended })
      load(q)
    } catch (err) {
      console.error('suspend toggle failed', err)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Users" />
      <div className="px-4 pt-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or phone…"
          className="w-full rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
        />
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {rows && rows.length === 0 && <EmptyState icon={Users} title="No users found" hint="Try a different search." />}
        {rows?.map((u) => (
          <div key={u.id} className="card-elevated flex items-center justify-between gap-2 rounded-xl bg-surface p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-medium text-ink">{u.name}</p>
                {u.role === 'admin' && <ShieldHalf size={12} className="shrink-0 text-accent" />}
                {u.suspended && (
                  <span className="shrink-0 rounded-full border border-bad/30 bg-bad/10 px-1.5 py-0.5 text-[9px] text-bad">
                    SUSPENDED
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">{u.phone}</p>
            </div>
            <button
              disabled={busyId === u.id || u.role === 'admin'}
              onClick={() => toggleSuspend(u)}
              className={`tap-flash shrink-0 rounded-full px-3 py-1.5 text-xs transition active:scale-95 disabled:opacity-40 ${
                u.suspended ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'
              }`}
            >
              {u.suspended ? 'Unsuspend' : 'Suspend'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
