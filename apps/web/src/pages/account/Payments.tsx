import { useEffect, useState } from 'react'
import { CreditCard, Loader2 } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import EmptyState from '../../components/EmptyState'
import { api } from '../../lib/api'
import { formatPrice, relativeTime } from '../../lib/format'
import LoadError from '../../components/LoadError'

// Billing history — reads the listingPayments ledger built across the monetization round
// (listing fee renewals, Boost/Featured/Top-Placement/Banner purchases, the two
// account-scoped priority upgrades). Before this round, Account.tsx's "Payments" row linked
// to '#' — there was no real payments screen anywhere in the app.
interface PaymentRow {
  payment: {
    id: string
    kind: string
    amount: number
    periodStart: string
    periodEnd: string
    createdAt: string
  }
  listingTitle: string | null
}

const KIND_LABELS: Record<string, string> = {
  listing_fee: 'Listing fee',
  boost: 'Boost',
  featured: 'Featured',
  category_pin: 'Top search placement',
  banner_ad: 'Banner ad',
  verification_priority: 'Verification fast-track',
  buyer_request_priority: 'Buyer-request priority',
}

export default function Payments() {
  const [rows, setRows] = useState<PaymentRow[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  const load = () => {
    setLoadError(false)
    api
      .get<{ payments: PaymentRow[] }>('/api/users/me/payments')
      .then((res) => setRows(res.payments))
      .catch(() => setLoadError(true))
  }
  useEffect(load, [])

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Payments" />
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {loadError && <LoadError onRetry={load} />}
        {!rows && !loadError && (
          <div className="flex justify-center py-10 text-muted">
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}
        {rows && rows.length === 0 && (
          <EmptyState
            icon={CreditCard}
            title="No payments yet"
            hint="Listing fees and promotions you pay for will show up here."
          />
        )}
        {rows?.map(({ payment, listingTitle }) => (
          <div key={payment.id} className="card-elevated flex items-center justify-between rounded-xl bg-surface p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{KIND_LABELS[payment.kind] ?? payment.kind}</p>
              <p className="truncate text-xs text-muted">
                {listingTitle ?? 'Account-wide'} · {relativeTime(payment.createdAt)}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold text-ink">{formatPrice(payment.amount)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
