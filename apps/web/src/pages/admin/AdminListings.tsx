import { useEffect, useState } from 'react'
import { ListChecks } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import EmptyState from '../../components/EmptyState'
import { api } from '../../lib/api'
import { formatPrice } from '../../lib/format'
import type { ListingStatus } from '../../types'

interface AdminListingRow {
  listing: {
    id: string
    title: string
    price: number
    status: ListingStatus
  }
  seller: { id: string; name: string; phone: string }
}

const STATUSES: ListingStatus[] = ['active', 'reserved', 'sold', 'expired', 'removed', 'draft', 'pending_payment']

export default function AdminListings() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminListingRow[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = (query: string) => {
    api
      .get<{ listings: AdminListingRow[] }>(`/api/admin/listings${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then((res) => setRows(res.listings))
  }

  useEffect(() => {
    const t = setTimeout(() => load(q), 250)
    return () => clearTimeout(t)
  }, [q])

  const setStatus = async (id: string, status: ListingStatus) => {
    setBusyId(id)
    try {
      await api.patch(`/api/admin/listings/${id}/status`, { status })
      load(q)
    } catch (err) {
      console.error('listing status change failed', err)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Listings" />
      <div className="px-4 pt-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title…"
          className="w-full rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
        />
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {rows && rows.length === 0 && <EmptyState icon={ListChecks} title="No listings found" hint="Try a different search." />}
        {rows?.map(({ listing, seller }) => (
          <div key={listing.id} className="card-elevated rounded-xl bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{listing.title}</p>
                <p className="text-xs text-muted">
                  {formatPrice(listing.price)} · {seller.name}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] capitalize text-muted">
                {listing.status.replace('_', ' ')}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {STATUSES.filter((s) => s !== listing.status).map((s) => (
                <button
                  key={s}
                  disabled={busyId === listing.id}
                  onClick={() => setStatus(listing.id, s)}
                  className={`tap-flash rounded-full px-2.5 py-1 text-[11px] capitalize transition active:scale-95 ${
                    s === 'removed' ? 'bg-bad/10 text-bad' : 'bg-surface-2 text-muted'
                  }`}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
