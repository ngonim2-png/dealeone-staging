import { X } from 'lucide-react'
import type { Condition } from '../types'
import type { Filters, SellerType } from '../lib/filters'

const CONDITIONS: Condition[] = ['new', 'used', 'refurbished']
const SELLER_TYPES: { id: SellerType; label: string }[] = [
  { id: 'any', label: 'Any' },
  { id: 'individual', label: 'Individual' },
  { id: 'business', label: 'Business' },
  { id: 'verified', label: 'Verified' },
]

export default function FilterSheet({
  open,
  onClose,
  filters,
  onChange,
}: {
  open: boolean
  onClose: () => void
  filters: Filters
  onChange: (f: Filters) => void
}) {
  if (!open) return null

  const toggleCondition = (c: Condition) => {
    onChange({
      ...filters,
      condition: filters.condition.includes(c)
        ? filters.condition.filter((x) => x !== c)
        : [...filters.condition, c],
    })
  }

  return (
    <div className="scrim-enter fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px]">
      <div className="sheet-elevated sheet-enter max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-5 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-display font-bold tracking-tight">Filters</h2>
          <button
            onClick={onClose}
            className="icon-btn h-8 w-8 bg-surface-2"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Price (NLe)</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Min"
                value={filters.minPrice ?? ''}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    minPrice: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
              />
              <span className="text-muted">–</span>
              <input
                type="number"
                placeholder="Max"
                value={filters.maxPrice ?? ''}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    maxPrice: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Condition</p>
            <div className="flex gap-2">
              {CONDITIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => toggleCondition(c)}
                  className={`tap-flash rounded-full px-3 py-1.5 text-xs capitalize transition active:scale-95 ${
                    filters.condition.includes(c)
                      ? 'glow-accent-ring bg-accent/15 text-accent'
                      : 'bg-surface-2 text-muted'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Seller</p>
            <div className="flex flex-wrap gap-2">
              {SELLER_TYPES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onChange({ ...filters, sellerType: s.id })}
                  className={`tap-flash rounded-full px-3 py-1.5 text-xs transition active:scale-95 ${
                    filters.sellerType === s.id
                      ? 'glow-accent-ring bg-accent/15 text-accent'
                      : 'bg-surface-2 text-muted'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Availability</p>
            <div className="flex gap-2">
              {(['now', 'all'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => onChange({ ...filters, availability: a })}
                  className={`tap-flash rounded-full px-3 py-1.5 text-xs transition active:scale-95 ${
                    filters.availability === a
                      ? 'glow-accent-ring bg-accent/15 text-accent'
                      : 'bg-surface-2 text-muted'
                  }`}
                >
                  {a === 'now' ? 'Available Now' : 'All'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="btn-primary mt-6 w-full text-sm"
        >
          Show results
        </button>
      </div>
    </div>
  )
}
