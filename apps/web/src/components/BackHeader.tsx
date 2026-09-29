import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

// Back goes to the previous screen when there is one in this app's history. When there
// isn't — the app was opened straight onto this page from a shared link, a home-screen
// launch, or a reload — `navigate(-1)` did nothing (or left the app), so it falls back to
// the home map instead.
function canGoBack(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx
  return typeof idx === 'number' && idx > 0
}

export default function BackHeader({
  title,
  right,
  onBack,
}: {
  title?: string
  right?: ReactNode
  onBack?: () => void
}) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-20 grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2 border-b border-border bg-bg/95 px-3 py-2 backdrop-blur">
      <button
        type="button"
        onClick={() => (onBack ? onBack() : canGoBack() ? navigate(-1) : navigate('/'))}
        className="icon-btn h-11 w-11 bg-surface-2 text-ink"
        aria-label="Back"
      >
        <ChevronLeft size={22} />
      </button>
      {/* Centered in its own column so a long title truncates instead of shoving the
          buttons around. */}
      <h1 className="truncate text-center text-base font-display font-bold tracking-tight text-ink">{title}</h1>
      <div className="flex h-11 items-center justify-end">{right}</div>
    </header>
  )
}
