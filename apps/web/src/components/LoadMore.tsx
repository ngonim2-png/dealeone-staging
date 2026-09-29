import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'

// Bottom-of-list pager: loads the next page automatically when it scrolls into view, with
// a tap-able button as a fallback (and for anyone who prefers to control data use).
export default function LoadMore({ onLoad, loading }: { onLoad: () => void; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && onLoad(), { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [onLoad])
  return (
    <div ref={ref} className="flex justify-center py-4">
      {loading ? (
        <Loader2 size={20} className="animate-spin text-muted" aria-label="Loading more" />
      ) : (
        <button onClick={onLoad} className="btn-secondary min-h-11 px-5 text-sm">
          Show more listings
        </button>
      )}
    </div>
  )
}
