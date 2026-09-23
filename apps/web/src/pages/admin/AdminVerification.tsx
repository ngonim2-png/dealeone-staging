import { useEffect, useState } from 'react'
import { ShieldCheck, Zap } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import EmptyState from '../../components/EmptyState'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/format'

interface AdminVerificationRow {
  request: {
    id: string
    targetLevel: number
    note: string
    photo: string | null
    priority: boolean
    status: 'pending' | 'approved' | 'rejected'
    createdAt: string
  }
  requester: { id: string; name: string; phone: string; verificationLevel: number }
}

// Mirrors AdminReports.tsx/AdminDisputes.tsx's review pattern — reads
// routes/admin.ts's GET /verification-requests (sorted priority-first, then oldest-first)
// and resolves via PATCH /verification-requests/:id.
export default function AdminVerification() {
  const [rows, setRows] = useState<AdminVerificationRow[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    api.get<{ verificationRequests: AdminVerificationRow[] }>('/api/admin/verification-requests?status=pending').then((res) =>
      setRows(res.verificationRequests),
    )
  }

  useEffect(load, [])

  const act = async (id: string, status: 'approved' | 'rejected') => {
    setBusyId(id)
    try {
      await api.patch(`/api/admin/verification-requests/${id}`, { status })
      load()
    } catch (err) {
      console.error('verification review failed', err)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Verification Requests" />
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {rows && rows.length === 0 && (
          <EmptyState icon={ShieldCheck} title="No pending requests" hint="Seller verification requests will show up here." />
        )}
        {rows?.map(({ request, requester }) => (
          <div key={request.id} className="card-elevated rounded-xl bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  {requester.name}
                  {request.priority && (
                    <span className="flex items-center gap-0.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent">
                      <Zap size={9} /> PRIORITY
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {requester.phone} · currently level {requester.verificationLevel} → requesting level{' '}
                  {request.targetLevel} · {timeAgo(request.createdAt)} ago
                </p>
                {request.note && <p className="mt-1 text-xs text-ink">{request.note}</p>}
              </div>
            </div>
            {request.photo && (
              <img src={request.photo} alt="Verification document" className="mt-2 h-32 w-full rounded-lg object-cover" />
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                disabled={busyId === request.id}
                onClick={() => act(request.id, 'approved')}
                className="tap-flash rounded-full bg-good/10 px-3 py-1.5 text-xs text-good transition active:scale-95"
              >
                Approve
              </button>
              <button
                disabled={busyId === request.id}
                onClick={() => act(request.id, 'rejected')}
                className="tap-flash rounded-full bg-bad/10 px-3 py-1.5 text-xs text-bad transition active:scale-95"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
