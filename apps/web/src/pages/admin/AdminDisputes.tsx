import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import EmptyState from '../../components/EmptyState'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/format'
import { DISPUTE_REASON_LABELS, type DisputeReason, type DisputeStatus } from '../../types'

interface AdminDisputeRow {
  dispute: {
    id: string
    conversationId: string
    reason: DisputeReason
    details: string
    status: DisputeStatus
    createdAt: string
  }
  listing: { id: string; title: string }
  buyer: { id: string; name: string; phone: string } | null
  seller: { id: string; name: string; phone: string } | null
  raisedBy: { id: string; name: string; phone: string } | null
}

const STATUS_STYLE: Record<DisputeStatus, string> = {
  open: 'text-accent bg-accent/10 border-accent/30',
  in_review: 'text-accent bg-accent/10 border-accent/30',
  resolved_buyer: 'text-good bg-good/10 border-good/30',
  resolved_seller: 'text-good bg-good/10 border-good/30',
  resolved_other: 'text-good bg-good/10 border-good/30',
  dismissed: 'text-muted bg-surface-2 border-border',
}

export default function AdminDisputes() {
  const [rows, setRows] = useState<AdminDisputeRow[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    api.get<{ disputes: AdminDisputeRow[] }>('/api/admin/disputes').then((res) => setRows(res.disputes))
  }

  useEffect(load, [])

  const resolve = async (id: string, status: DisputeStatus) => {
    setBusyId(id)
    try {
      await api.patch(`/api/admin/disputes/${id}`, { status })
      load()
    } catch (err) {
      console.error('dispute resolve failed', err)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Disputes" />
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {rows && rows.length === 0 && (
          <EmptyState icon={ShieldAlert} title="No disputes" hint="Deals flagged as gone wrong will show up here." />
        )}
        {rows?.map(({ dispute, listing, buyer, seller, raisedBy }) => {
          const canAct = dispute.status === 'open' || dispute.status === 'in_review'
          return (
            <div key={dispute.id} className="card-elevated rounded-xl bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{DISPUTE_REASON_LABELS[dispute.reason]}</p>
                  <p className="truncate text-xs text-muted">{listing.title}</p>
                  <p className="text-xs text-muted">
                    Buyer: {buyer?.name ?? '—'} · Seller: {seller?.name ?? '—'}
                  </p>
                  <p className="text-xs text-muted">
                    Raised by {raisedBy?.name ?? '—'} · {timeAgo(dispute.createdAt)} ago
                  </p>
                  {dispute.details && <p className="mt-1 text-xs text-ink">{dispute.details}</p>}
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] capitalize ${STATUS_STYLE[dispute.status]}`}>
                  {dispute.status.replace('_', ' ')}
                </span>
              </div>
              {canAct && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    disabled={busyId === dispute.id}
                    onClick={() => resolve(dispute.id, 'in_review')}
                    className="tap-flash rounded-full bg-surface-2 px-3 py-1.5 text-xs text-muted transition active:scale-95"
                  >
                    Mark in review
                  </button>
                  <button
                    disabled={busyId === dispute.id}
                    onClick={() => resolve(dispute.id, 'resolved_buyer')}
                    className="tap-flash rounded-full bg-good/10 px-3 py-1.5 text-xs text-good transition active:scale-95"
                  >
                    Resolve for buyer
                  </button>
                  <button
                    disabled={busyId === dispute.id}
                    onClick={() => resolve(dispute.id, 'resolved_seller')}
                    className="tap-flash rounded-full bg-good/10 px-3 py-1.5 text-xs text-good transition active:scale-95"
                  >
                    Resolve for seller
                  </button>
                  <button
                    disabled={busyId === dispute.id}
                    onClick={() => resolve(dispute.id, 'dismissed')}
                    className="tap-flash rounded-full bg-surface-2 px-3 py-1.5 text-xs text-muted transition active:scale-95"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
