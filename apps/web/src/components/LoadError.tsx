import { WifiOff } from 'lucide-react'

// Shown when a page's data couldn't load — instead of an endless blank screen or a
// misleading "you haven't done anything yet" empty state.
export default function LoadError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bad/10 text-bad">
        <WifiOff size={22} />
      </span>
      <p className="text-sm font-medium text-ink">{message ?? "Couldn't load this right now."}</p>
      <p className="text-xs text-muted">Check your connection and try again.</p>
      <button onClick={onRetry} className="btn-secondary mt-1 min-h-11 px-5 text-sm">
        Try again
      </button>
    </div>
  )
}
