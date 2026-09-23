import { useEffect, useState } from 'react'
import { Flag } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import EmptyState from '../../components/EmptyState'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/format'
import { REPORT_REASON_LABELS, type ReportReason, type ReportStatus } from '../../types'

interface AdminReportRow {
  report: {
    id: string
    // Was 'listing' | 'user' only — silently mislabeled every event-target report as "User:
    // (user not found)" and had no way to act on it, even though the API (routes/admin.ts)
    // has resolved and could act on event reports since the Events round. Widened here to
    // match, and 'status' added alongside it for the new Statuses feature.
    targetType: 'listing' | 'user' | 'event' | 'status'
    targetId: string
    reason: ReportReason
    details: string
    status: ReportStatus
    createdAt: string
  }
  reporter: { id: string; name: string; phone: string }
  target: {
    id: string
    title?: string
    caption?: string
    status?: string
    name?: string
    phone?: string
    suspended?: boolean
  } | null
}

const STATUS_STYLE: Record<ReportStatus, string> = {
  open: 'text-accent bg-accent/10 border-accent/30',
  reviewing: 'text-accent bg-accent/10 border-accent/30',
  resolved: 'text-good bg-good/10 border-good/30',
  dismissed: 'text-muted bg-surface-2 border-border',
}

export default function AdminReports() {
  const [rows, setRows] = useState<AdminReportRow[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    api.get<{ reports: AdminReportRow[] }>('/api/admin/reports').then((res) => setRows(res.reports))
  }

  useEffect(load, [])

  const act = async (
    id: string,
    status: ReportStatus,
    action: 'remove_listing' | 'cancel_event' | 'remove_status' | 'suspend_user' | 'none',
  ) => {
    setBusyId(id)
    try {
      await api.patch(`/api/admin/reports/${id}`, { status, action })
      load()
    } catch (err) {
      console.error('report action failed', err)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Reports" />
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {rows && rows.length === 0 && (
          <EmptyState icon={Flag} title="No reports" hint="Scam/fraud reports will show up here." />
        )}
        {rows?.map(({ report, reporter, target }) => {
          const targetLabel =
            report.targetType === 'listing'
              ? (target?.title ?? '(listing removed)')
              : report.targetType === 'event'
                ? (target?.title ?? '(event removed)')
                : report.targetType === 'status'
                  ? (target?.caption ? `"${target.caption}"` : target ? '(status, no caption)' : '(status removed)')
                  : (target?.name ?? '(user not found)')
          const targetTypeLabel =
            report.targetType === 'listing'
              ? 'Listing'
              : report.targetType === 'event'
                ? 'Event'
                : report.targetType === 'status'
                  ? 'Status'
                  : 'User'
          const suspendLabel =
            report.targetType === 'listing'
              ? 'seller'
              : report.targetType === 'event'
                ? 'organizer'
                : report.targetType === 'status'
                  ? 'poster'
                  : 'user'
          const canAct = report.status === 'open' || report.status === 'reviewing'
          return (
            <div key={report.id} className="card-elevated rounded-xl bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{REPORT_REASON_LABELS[report.reason]}</p>
                  <p className="truncate text-xs text-muted">
                    {targetTypeLabel}: {targetLabel}
                  </p>
                  <p className="text-xs text-muted">
                    Reported by {reporter.name} · {timeAgo(report.createdAt)} ago
                  </p>
                  {report.details && <p className="mt-1 text-xs text-ink">{report.details}</p>}
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] capitalize ${STATUS_STYLE[report.status]}`}>
                  {report.status}
                </span>
              </div>
              {canAct && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    disabled={busyId === report.id}
                    onClick={() => act(report.id, 'dismissed', 'none')}
                    className="tap-flash rounded-full bg-surface-2 px-3 py-1.5 text-xs text-muted transition active:scale-95"
                  >
                    Dismiss
                  </button>
                  {report.targetType === 'listing' && (
                    <button
                      disabled={busyId === report.id}
                      onClick={() => act(report.id, 'resolved', 'remove_listing')}
                      className="tap-flash rounded-full bg-bad/10 px-3 py-1.5 text-xs text-bad transition active:scale-95"
                    >
                      Remove listing
                    </button>
                  )}
                  {report.targetType === 'event' && (
                    <button
                      disabled={busyId === report.id}
                      onClick={() => act(report.id, 'resolved', 'cancel_event')}
                      className="tap-flash rounded-full bg-bad/10 px-3 py-1.5 text-xs text-bad transition active:scale-95"
                    >
                      Cancel event
                    </button>
                  )}
                  {report.targetType === 'status' && (
                    <button
                      disabled={busyId === report.id}
                      onClick={() => act(report.id, 'resolved', 'remove_status')}
                      className="tap-flash rounded-full bg-bad/10 px-3 py-1.5 text-xs text-bad transition active:scale-95"
                    >
                      Remove status
                    </button>
                  )}
                  <button
                    disabled={busyId === report.id}
                    onClick={() => act(report.id, 'resolved', 'suspend_user')}
                    className="tap-flash rounded-full bg-bad/10 px-3 py-1.5 text-xs text-bad transition active:scale-95"
                  >
                    Suspend {suspendLabel}
                  </button>
                  <button
                    disabled={busyId === report.id}
                    onClick={() => act(report.id, 'resolved', 'none')}
                    className="tap-flash rounded-full bg-good/10 px-3 py-1.5 text-xs text-good transition active:scale-95"
                  >
                    Mark resolved
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
