// App-wide toast messages — replaces the browser `alert()` popups that used to block the
// whole screen (and look like a system error on phones) whenever an action failed.
// Success/info toasts auto-dismiss after ~4s; errors stay ~7s and can be tapped away.
// Announced to screen readers via an aria-live region.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}

interface ToastApi {
  success: (text: string) => void
  error: (text: string) => void
  info: (text: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (kind: ToastKind, text: string) => {
      const id = nextId.current++
      // Keep at most 2 on screen — a burst of failures shouldn't bury the UI.
      setItems((prev) => [...prev.filter((t) => t.text !== text).slice(-1), { id, kind, text }])
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (t) => push('success', t),
      error: (t) => push('error', t),
      info: (t) => push('info', t),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="toast-region pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            className={`toast-enter pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl px-4 py-3 text-left text-sm font-medium shadow-[0_12px_32px_-12px_rgba(20,30,25,0.45)] ${
              t.kind === 'error' ? 'bg-bad text-white' : t.kind === 'success' ? 'bg-ink text-white' : 'bg-ink text-white'
            }`}
          >
            {t.kind === 'error' ? (
              <AlertCircle size={18} className="mt-px shrink-0" />
            ) : t.kind === 'success' ? (
              <CheckCircle2 size={18} className="mt-px shrink-0 text-[#a6e64b]" />
            ) : (
              <Info size={18} className="mt-px shrink-0" />
            )}
            <span className="min-w-0 flex-1 leading-snug">{t.text}</span>
            <X size={16} className="mt-0.5 shrink-0 opacity-70" aria-hidden />
            <span className="sr-only">Dismiss</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
