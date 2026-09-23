import { Flag, ShieldAlert } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import EmptyState from '../../components/EmptyState'
import { useApp } from '../../context/AppContext'
import { timeAgo } from '../../lib/format'
import {
  DISPUTE_REASON_LABELS,
  REPORT_REASON_LABELS,
  type DisputeStatus,
  type ReportStatus,
} from '../../types'

const REPORT_STATUS_STYLE: Record<ReportStatus, string> = {
  open: 'text-accent bg-accent/10 border-accent/30',
  reviewing: 'text-accent bg-accent/10 border-accent/30',
  resolved: 'text-good bg-good/10 border-good/30',
  dismissed: 'text-muted bg-surface-2 border-border',
}

const DISPUTE_STATUS_STYLE: Record<DisputeStatus, string> = {
  open: 'text-accent bg-accent/10 border-accent/30',
  in_review: 'text-accent bg-accent/10 border-accent/30',
  resolved_buyer: 'text-good bg-good/10 border-good/30',
  resolved_seller: 'text-good bg-good/10 border-good/30',
  resolved_other: 'text-good bg-good/10 border-good/30',
  dismissed: 'text-muted bg-surface-2 border-border',
}

/** Transparency for the reporter/disputer — see whether anything came of what they
 * submitted (see ListingDetail/ChatThread's Report + "Report a problem" actions, and
 * routes/reports.ts + routes/disputes.ts's /mine endpoints). Read-only: the actual
 * moderation happens in Admin > Reports/Disputes. */
export default function MyReports() {
  const { reports, disputes, listings, conversations } = useApp()

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="My Reports" />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {reports.length === 0 && disputes.length === 0 && (
          <EmptyState
            icon={Flag}
            title="You haven't reported anything"
            hint="Use Report on a listing, or Report a problem in a chat, if something needs a look."
          />
        )}

        {reports.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Reports</p>
            <div className="space-y-2">
              {reports.map((r) => (
                <div key={r.id} className="card-elevated flex items-center justify-between rounded-xl bg-surface p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-bad">
                      <Flag size={13} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {REPORT_REASON_LABELS[r.reason]}
                      </p>
                      <p className="text-xs text-muted">{timeAgo(r.createdAt)} ago</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] capitalize ${REPORT_STATUS_STYLE[r.status]}`}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {disputes.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Disputes</p>
            <div className="space-y-2">
              {disputes.map((d) => {
                const convo = conversations.find((c) => c.id === d.conversationId)
                const listing = convo ? listings.find((l) => l.id === convo.listingId) : undefined
                return (
                  <div key={d.id} className="card-elevated flex items-center justify-between rounded-xl bg-surface p-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
                        <ShieldAlert size={13} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {DISPUTE_REASON_LABELS[d.reason]}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {listing ? `${listing.title} · ` : ''}
                          {timeAgo(d.createdAt)} ago
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] capitalize ${DISPUTE_STATUS_STYLE[d.status]}`}>
                      {d.status.replace('_', ' ')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
