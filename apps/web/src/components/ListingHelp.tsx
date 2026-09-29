import { useEffect, useState } from 'react'
import { Lightbulb, Loader2, Plus, Sparkles, TrendingUp } from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import { formatPrice } from '../lib/format'
import { descriptionPrompts, suggestCategory, type PriceGuide } from '../lib/listingHelp'
import { CATEGORY_META, type Category, type Condition } from '../types'
import { useApp } from '../context/AppContext'

// Small, honest helpers for the Sell and Edit screens. None of these are AI: the category
// hint reads the title, the prompts are the questions buyers always ask, and the price
// guide is the spread of real prices for similar items nearby (GET /api/listings/price-guide).
// PhotoAssist is the one AI piece, and only appears when the server has a model key.

export function CategoryHint({ title, category, onPick }: { title: string; category: Category; onPick: (c: Category) => void }) {
  const guess = title.trim().length >= 3 ? suggestCategory(title) : null
  if (!guess || guess === category) return null
  return (
    <button
      type="button"
      onClick={() => onPick(guess)}
      className="tap-flash mt-1.5 flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-xs text-accent transition active:scale-95"
    >
      <Lightbulb size={12} /> Looks like {CATEGORY_META[guess].emoji} {CATEGORY_META[guess].label} — use it
    </button>
  )
}

export function DescriptionPrompts({ category, description, onAdd }: { category: Category; description: string; onAdd: (line: string) => void }) {
  const prompts = descriptionPrompts(category).filter((p) => !description.includes(p))
  if (!prompts.length) return null
  return (
    <div className="no-scrollbar scroll-fade-x mt-1.5 flex gap-1.5 overflow-x-auto pb-0.5">
      {prompts.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onAdd(p)}
          className="tap-flash flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1.5 text-[11px] text-muted transition active:scale-95"
        >
          <Plus size={11} /> {p.replace(/[:?]$/, '')}
        </button>
      ))}
    </div>
  )
}

export function PriceGuideCard({
  category,
  title,
  price,
  excludeId,
  onUse,
}: {
  category: Category
  title: string
  price: string
  excludeId?: string
  onUse: (price: number) => void
}) {
  const { userLocation } = useApp()
  const [guide, setGuide] = useState<PriceGuide | null>(null)

  // Debounced so typing the title doesn't fire a request per keystroke.
  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      const p = new URLSearchParams({
        category,
        q: title.trim().slice(0, 120),
        lat: String(userLocation.lat),
        lng: String(userLocation.lng),
      })
      if (excludeId) p.set('exclude', excludeId)
      api
        .get<PriceGuide>(`/api/listings/price-guide?${p}`, { signal: ctrl.signal })
        .then(setGuide)
        .catch(() => {})
    }, 500)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [category, title, excludeId, userLocation.lat, userLocation.lng])

  if (!guide || guide.basis === 'none' || guide.median == null) return null
  const n = Number(price)
  const high = guide.high ?? guide.median
  const low = guide.low ?? guide.median
  const verdict =
    price === '' || !n
      ? null
      : n > high * 1.5
        ? { text: 'Higher than most — expect fewer offers.', cls: 'text-warn' }
        : n < low * 0.6
          ? { text: 'Much lower than similar items — double-check the price.', cls: 'text-warn' }
          : { text: 'In line with similar items nearby.', cls: 'text-good' }

  return (
    <div className="mt-1.5 rounded-xl bg-surface-2/70 p-2.5 text-xs">
      <p className="flex items-center gap-1.5 text-muted">
        <TrendingUp size={12} className="shrink-0 text-accent" />
        {guide.basis === 'similar' ? 'Similar items nearby' : `${CATEGORY_META[category].label} nearby`}:{' '}
        <span className="font-semibold text-ink">
          {low === high ? formatPrice(low) : `${formatPrice(low)} – ${formatPrice(high)}`}
        </span>
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {verdict ? <p className={verdict.cls}>{verdict.text}</p> : <p className="text-muted">Based on {guide.count} listings.</p>}
        {Number(price) !== guide.median && (
          <button type="button" onClick={() => onUse(guide.median!)} className="shrink-0 font-semibold text-accent">
            Use {formatPrice(guide.median)}
          </button>
        )}
      </div>
    </div>
  )
}

export interface PhotoSuggestion {
  title: string
  category: Category | null
  condition: Condition | null
  description: string
}

let assistStatus: Promise<boolean> | null = null
function photoAssistEnabled() {
  assistStatus ??= api
    .get<{ photoAssist: boolean }>('/api/assist/status')
    .then((r) => r.photoAssist)
    .catch(() => false)
  return assistStatus
}

export function PhotoAssist({ photo, onSuggest }: { photo: string | undefined; onSuggest: (s: PhotoSuggestion) => void }) {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    photoAssistEnabled().then(setEnabled)
  }, [])
  if (!enabled || !photo || !photo.startsWith('data:image/')) return null

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      onSuggest(await api.post<PhotoSuggestion>('/api/assist/listing', { image: photo }))
    } catch (err) {
      setError(errorMessage(err, "Couldn't read that photo — fill it in yourself."))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="tap-flash flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ai/12 text-sm font-semibold text-ai transition active:scale-[0.98]"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {busy ? 'Reading your photo…' : 'Fill in from my photo'}
      </button>
      {error && <p className="mt-1 text-center text-xs text-bad">{error}</p>}
    </div>
  )
}
