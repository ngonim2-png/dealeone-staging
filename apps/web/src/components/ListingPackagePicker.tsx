import { formatPrice } from '../lib/format'
import { listingsAreFree, type RateCard } from '../lib/rateCard'

// The four listing packages from the rate card (NLe 25 a week: 1, 2, 3 weeks or 1 month).
// Used when publishing (Sell) and when renewing (My Listings).
export default function ListingPackagePicker({
  card,
  weeks,
  onChange,
  compact = false,
}: {
  card: RateCard
  weeks: number
  onChange: (weeks: number) => void
  compact?: boolean
}) {
  const free = listingsAreFree(card)
  return (
    <div role="radiogroup" aria-label="How long to list" className="grid grid-cols-4 gap-1.5">
      {card.listingPackages.map((p) => {
        const on = p.weeks === weeks
        return (
          <button
            key={p.weeks}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(p.weeks)}
            className={`tap-flash flex flex-col items-center justify-center rounded-xl text-center transition active:scale-95 ${
              compact ? 'min-h-11 px-1 py-1.5' : 'min-h-14 px-1 py-2'
            } ${on ? 'glow-accent-ring bg-accent/15 text-accent' : 'bg-surface-2 text-muted'}`}
          >
            <span className={`whitespace-nowrap font-semibold ${compact ? 'text-[11px]' : 'text-xs'}`}>
              {compact ? (p.weeks === 4 ? '1 month' : `${p.weeks} wk${p.weeks > 1 ? 's' : ''}`) : p.label}
            </span>
            <span className={`whitespace-nowrap ${compact ? 'text-[10px]' : 'text-[11px]'} ${on ? 'text-accent' : 'text-muted'}`}>
              {free ? 'Free' : formatPrice(p.price)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
