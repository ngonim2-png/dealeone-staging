import { Plus } from 'lucide-react'
import { useApp } from '../context/AppContext'

// WhatsApp-style Status row at the top of Chats.tsx — a horizontal strip of circular avatar
// tiles, one per poster with at least one currently-active status (see routes/statuses.ts's
// GET / for the grouping: the current user's own group always comes first, then everyone
// else with any unviewed status ahead of fully-seen posters). Posting is gated server-side
// to business accounts with an active paid promotion (see statusEligibility.ts) — canPostStatus
// here is only ever a UI hint for whether to show the "+" compose affordance.
export default function StatusRow({
  onOpenViewer,
  onOpenComposer,
}: {
  onOpenViewer: (userId: string) => void
  onOpenComposer: () => void
}) {
  const { statusGroups, sellers, currentUser, canPostStatus } = useApp()

  if (statusGroups.length === 0 && !canPostStatus) return null

  const myGroup = statusGroups.find((g) => g.userId === currentUser?.id)
  const otherGroups = statusGroups.filter((g) => g.userId !== currentUser?.id)
  const me = currentUser ? sellers.find((s) => s.id === currentUser.id) : undefined

  return (
    <div className="scrollbar-none flex gap-3 overflow-x-auto px-4 pb-3 pt-1">
      {(myGroup || canPostStatus) && (
        // Two independent tap targets (open viewer vs. open composer) live here, so this
        // can't be a single wrapping <button> around both — a <button> nested inside another
        // <button> is invalid HTML (React warns on it, and real browsers handle the nesting
        // inconsistently, which made the "+" badge's clicks unreliable). The avatar circle
        // and the "+" badge are now sibling buttons inside a plain, non-interactive wrapper.
        <div className="flex shrink-0 flex-col items-center gap-1">
          <div className="relative">
            <button
              onClick={() => (myGroup ? onOpenViewer(currentUser!.id) : onOpenComposer())}
              className={`tap-flash flex h-14 w-14 items-center justify-center rounded-full text-2xl transition active:scale-95 ${
                myGroup ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : 'bg-surface-2'
              }`}
            >
              {me?.avatar ?? '🙂'}
            </button>
            {canPostStatus && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenComposer()
                }}
                aria-label="Add status"
                className="tap-flash absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-bg shadow-[0_0_0_2px_var(--color-bg)] transition active:scale-90"
              >
                <Plus size={12} strokeWidth={3} />
              </button>
            )}
          </div>
          <span className="max-w-[60px] truncate text-[11px] text-muted">
            {myGroup ? 'My status' : 'Add status'}
          </span>
        </div>
      )}
      {otherGroups.map((g) => {
        const poster = sellers.find((s) => s.id === g.userId)
        if (!poster) return null
        return (
          <button
            key={g.userId}
            onClick={() => onOpenViewer(g.userId)}
            className="tap-flash flex shrink-0 flex-col items-center gap-1 transition active:scale-95"
          >
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl ${
                g.allViewed ? 'ring-2 ring-border' : 'ring-2 ring-accent'
              } ring-offset-2 ring-offset-bg`}
            >
              {poster.avatar}
            </div>
            <span className="max-w-[60px] truncate text-[11px] text-muted">
              {poster.name.split(' ')[0]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
