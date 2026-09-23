import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

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
    <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-bg/95 px-3 py-3 backdrop-blur">
      <button
        onClick={() => (onBack ? onBack() : navigate(-1))}
        className="icon-btn h-9 w-9 bg-surface-2 text-ink"
        aria-label="Back"
      >
        <ChevronLeft size={20} />
      </button>
      {title && <h1 className="text-base font-display font-bold tracking-tight text-ink">{title}</h1>}
      <div className="flex h-9 min-w-9 items-center justify-end">{right}</div>
    </div>
  )
}
