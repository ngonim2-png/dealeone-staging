import { Star } from 'lucide-react'

/** Consistent star-rating readout — used anywhere a seller's rating appears
 * (listing cards, listing detail, account profile) so it's rendered as a
 * crisp SVG glyph in the accent color rather than a plain-text "★" that
 * inherits whatever muted color surrounds it. */
export default function Rating({
  value,
  count,
  size = 11,
  className = '',
}: {
  value: number
  count?: number
  size?: number
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      <Star size={size} className="shrink-0 fill-accent text-accent" />
      <span>{value.toFixed(1)}</span>
      {count !== undefined && <span className="text-muted">({count})</span>}
    </span>
  )
}
