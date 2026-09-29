import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, BellOff, Search, Trash2, ChevronRight } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import EmptyState from '../../components/EmptyState'
import LoadError from '../../components/LoadError'
import { useToast } from '../../components/Toast'
import { api, errorMessage } from '../../lib/api'
import { formatPrice, relativeTime } from '../../lib/format'
import { useT } from '../../lib/i18n'
import { CATEGORY_META, type Category } from '../../types'

interface SavedSearch {
  id: string
  query: string
  categories: Category[]
  maxPrice: number | null
  radiusKm: number
  active: boolean
  createdAt: string
  lastNotifiedAt: string | null
}

function describe(s: SavedSearch) {
  const parts: string[] = []
  if (s.categories.length) parts.push(s.categories.map((c) => CATEGORY_META[c]?.label ?? c).join(', '))
  if (s.maxPrice != null) parts.push(`under ${formatPrice(s.maxPrice)}`)
  parts.push(s.radiusKm >= 999 ? 'anywhere' : `within ${s.radiusKm} km`)
  return parts.join(' · ')
}

function searchUrl(s: SavedSearch) {
  const p = new URLSearchParams({ view: 'list' })
  if (s.query) p.set('q', s.query)
  if (s.categories.length) p.set('cats', s.categories.join(','))
  if (s.maxPrice != null) p.set('max', String(s.maxPrice))
  p.set('r', String(s.radiusKm))
  return `/?${p.toString()}`
}

// Saved searches ("alert me when…"). Each one is checked against every new listing as it's
// published (apps/api/src/lib/alerts.ts); a match sends a notification (and a phone push
// if the app is closed). Pausing keeps the search but stops the alerts.
export default function SavedSearches() {
  const navigate = useNavigate()
  const toast = useToast()
  const t = useT()
  const [items, setItems] = useState<SavedSearch[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    setFailed(false)
    api
      .get<{ savedSearches: SavedSearch[] }>('/api/saved-searches')
      .then((res) => setItems(res.savedSearches))
      .catch(() => setFailed(true))
  }, [])
  useEffect(load, [load])

  const toggle = async (s: SavedSearch) => {
    setBusyId(s.id)
    try {
      await api.patch(`/api/saved-searches/${s.id}`, { active: !s.active })
      setItems((prev) => prev?.map((x) => (x.id === s.id ? { ...x, active: !s.active } : x)) ?? prev)
      toast.info(s.active ? 'Alerts paused for this search.' : "Alerts are back on — we'll tell you about new matches.")
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (s: SavedSearch) => {
    setBusyId(s.id)
    try {
      await api.delete(`/api/saved-searches/${s.id}`)
      setItems((prev) => prev?.filter((x) => x.id !== s.id) ?? prev)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title={t('account.searches')} />
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-3">
        {failed ? (
          <LoadError onRetry={load} />
        ) : items === null ? (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-2" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <>
            <EmptyState
              icon={Search}
              title="No saved searches yet"
              hint={'Search for something on the home screen, then tap "Save search". We\'ll tell you the moment a match is posted nearby.'}
            />
            <div className="mt-5 flex justify-center">
              <button onClick={() => navigate('/?view=list')} className="btn-primary min-h-11 px-5 text-sm">
                Start a search
              </button>
            </div>
          </>
        ) : (
          <ul className="space-y-2">
            {items.map((s) => (
              <li key={s.id} className={`card-elevated rounded-2xl bg-surface p-3 transition-opacity ${s.active ? '' : 'opacity-70'}`}>
                <button onClick={() => navigate(searchUrl(s))} className="tap-flash flex w-full items-start gap-3 text-left">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      s.active ? 'bg-accent/12 text-accent' : 'bg-surface-2 text-muted'
                    }`}
                  >
                    {s.active ? <BellRing size={17} /> : <BellOff size={17} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{s.query ? `“${s.query}”` : 'Any item'}</span>
                    <span className="mt-0.5 block text-xs text-muted">{describe(s)}</span>
                    <span className="mt-1 block text-[11px] text-muted">
                      {s.lastNotifiedAt ? `Last match ${relativeTime(s.lastNotifiedAt)}` : 'No matches yet'}
                      {s.active ? '' : ' · Paused'}
                    </span>
                  </span>
                  <ChevronRight size={16} className="mt-3 shrink-0 text-muted" />
                </button>
                <div className="mt-2 flex gap-2 border-t border-border pt-2">
                  <button
                    onClick={() => toggle(s)}
                    disabled={busyId === s.id}
                    className="btn-secondary min-h-10 flex-1 text-xs"
                  >
                    {s.active ? 'Pause alerts' : 'Resume alerts'}
                  </button>
                  <button
                    onClick={() => remove(s)}
                    disabled={busyId === s.id}
                    aria-label="Delete saved search"
                    className="icon-btn h-10 w-10 bg-bad/10 text-bad"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
