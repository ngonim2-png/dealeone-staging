import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, Eye, Heart, Lightbulb, MessageCircle, Tag, Rocket } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import EmptyState from '../../components/EmptyState'
import LoadError from '../../components/LoadError'
import { api } from '../../lib/api'
import { formatPrice } from '../../lib/format'
import { isImageUrl, mediaSrc } from '../../lib/media'
import { useT } from '../../lib/i18n'
import { useApp } from '../../context/AppContext'

interface ListingStats {
  id: string
  title: string
  price: number
  status: string
  images: string[]
  views: number
  views7d: number
  saves: number
  chats: number
  offers: number
  daily: number[] // last 14 days, oldest first
  promotion: { promotedDays: number; avgViewsPromoted: number | null; avgViewsNormal: number | null } | null
}
interface InsightsResponse {
  listings: ListingStats[]
  totals: { views: number; views7d: number; saves: number; chats: number; offers: number }
}

function Bars({ values, tall = false }: { values: number[]; tall?: boolean }) {
  const max = Math.max(1, ...values)
  return (
    <div className={`flex items-end gap-[3px] ${tall ? 'h-20' : 'h-9'}`} aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className={`flex-1 rounded-t-[3px] ${i === values.length - 1 ? 'bg-accent' : 'bg-accent/35'}`}
          style={{ height: `${Math.max(v ? 8 : 3, (v / max) * 100)}%`, opacity: v ? 1 : 0.4 }}
        />
      ))}
    </div>
  )
}

// One honest, specific suggestion per listing — only when the numbers clearly say something.
function tipFor(l: ListingStats): string | null {
  if (l.status !== 'active') return null
  if (l.views7d >= 15 && l.chats === 0 && l.offers === 0)
    return 'Lots of people look but nobody messages — the price may be high, or the photos may not show enough.'
  if (l.views7d < 3) return 'Few people are seeing this. A clear first photo and a specific title ("Samsung A14 64GB") help most.'
  if (l.saves >= 3 && l.offers === 0) return `${l.saves} people saved it but haven't offered — a small price drop will alert all of them.`
  return null
}

export default function Insights() {
  const navigate = useNavigate()
  const t = useT()
  const { lowData } = useApp()
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    api
      .get<InsightsResponse>('/api/insights/listings')
      .then(setData)
      .catch(() => setFailed(true))
  }, [])
  useEffect(load, [load])

  const overall = data
    ? Array.from({ length: 14 }, (_, i) => data.listings.reduce((s, l) => s + (l.daily[i] ?? 0), 0))
    : []
  const sorted = data ? [...data.listings].sort((a, b) => b.views7d - a.views7d || b.views - a.views) : []

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title={t('account.insights')} />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-3">
        {failed ? (
          <LoadError onRetry={load} />
        ) : !data ? (
          <div className="space-y-3" aria-hidden>
            <div className="h-28 animate-pulse rounded-2xl bg-surface-2" />
            <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />
          </div>
        ) : data.listings.length === 0 ? (
          <EmptyState icon={BarChart3} title="No listings yet" hint="Once you list something, you'll see how many people view, save and message about it here." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { icon: Eye, label: 'Views', value: data.totals.views, sub: `${data.totals.views7d} this week` },
                { icon: Heart, label: 'Saves', value: data.totals.saves },
                { icon: MessageCircle, label: 'Chats', value: data.totals.chats },
                { icon: Tag, label: 'Offers', value: data.totals.offers },
              ].map((s) => (
                <div key={s.label} className="card-elevated rounded-2xl bg-surface p-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <s.icon size={13} className="text-accent" /> {s.label}
                  </p>
                  <p className="mt-1 text-2xl font-display font-bold tabular-nums tracking-tight text-ink">{s.value}</p>
                  {s.sub && <p className="text-[11px] text-muted">{s.sub}</p>}
                </div>
              ))}
            </div>

            <div className="card-elevated mt-3 rounded-2xl bg-surface p-3">
              <p className="mb-2 text-xs font-medium text-muted">Views per day · last 14 days</p>
              <Bars values={overall} tall />
              <div className="mt-1 flex justify-between text-[10px] text-muted">
                <span>2 weeks ago</span>
                <span>Today</span>
              </div>
            </div>

            <h2 className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-muted">Your listings</h2>
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {sorted.map((l) => {
                const tip = tipFor(l)
                const photo = l.images.find((x) => isImageUrl(x))
                const promo = l.promotion
                return (
                  <li key={l.id} className="card-elevated rounded-2xl bg-surface p-3">
                    <button onClick={() => navigate(`/listing/${l.id}`)} className="tap-flash flex w-full items-center gap-3 text-left">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-xl">
                        {photo && !lowData ? (
                          <img src={mediaSrc(photo, 'thumb')} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          (isImageUrl(l.images[0]) ? null : l.images[0]) ?? '📦'
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{l.title}</span>
                        <span className="block text-xs text-muted">
                          {formatPrice(l.price)} · <span className="capitalize">{l.status}</span>
                        </span>
                      </span>
                    </button>
                    <div className="mt-3">
                      <Bars values={l.daily} />
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px] text-muted">
                      <span>
                        <b className="block text-sm tabular-nums text-ink">{l.views}</b>views
                      </span>
                      <span>
                        <b className="block text-sm tabular-nums text-ink">{l.saves}</b>saves
                      </span>
                      <span>
                        <b className="block text-sm tabular-nums text-ink">{l.chats}</b>chats
                      </span>
                      <span>
                        <b className="block text-sm tabular-nums text-ink">{l.offers}</b>offers
                      </span>
                    </div>
                    {promo && promo.avgViewsPromoted != null && (
                      <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-accent/[0.07] px-2.5 py-2 text-[11px] leading-snug text-ink/80">
                        <Rocket size={12} className="mt-px shrink-0 text-accent" />
                        {promo.avgViewsNormal != null
                          ? `While boosted: ${promo.avgViewsPromoted} views/day vs ${promo.avgViewsNormal} normally.`
                          : `Boosted ${promo.promotedDays} day${promo.promotedDays === 1 ? '' : 's'}: ${promo.avgViewsPromoted} views/day.`}
                      </p>
                    )}
                    {tip && (
                      <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-surface-2 px-2.5 py-2 text-[11px] leading-snug text-ink/80">
                        <Lightbulb size={12} className="mt-px shrink-0 text-warn" />
                        {tip}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
