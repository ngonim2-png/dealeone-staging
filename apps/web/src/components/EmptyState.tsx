import type { LucideIcon } from 'lucide-react'

/** Consistent "nothing here yet" treatment — an icon in a soft circle plus a
 * short message, used across Chats, My Listings, My Offers, Wishlist, and
 * Buyer Requests instead of a lone line of muted text floating in empty
 * space. */
export default function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon
  title: string
  hint?: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 pt-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon size={24} />
      </span>
      <div className="max-w-[240px]">
        <p className="text-sm text-ink">{title}</p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
    </div>
  )
}
