import { useCallback, useEffect, useState } from 'react'
import { Copy, Download, Loader2, Plus, UserPlus } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import LoadError from '../../components/LoadError'
import { useToast } from '../../components/Toast'
import { api, BASE_URL, errorMessage, getSessionToken } from '../../lib/api'
import { formatPrice } from '../../lib/format'

interface Summary {
  users: Record<string, number>
  listings: Record<string, number>
  renewal: { due30d: number; renewed30d: number; rate: number | null }
  revenue: { kind: string; last7d: number; last30d: number; payments30d: number }[]
  signupSources30d: { source: string; signups: number; becameSellers: number }[]
}
interface Agent {
  id: string
  name: string
  phone: string | null
  region: string | null
  code: string
  active: boolean
  signups: number
  signups30d: number
  sellers: number
  promotionsTotal: number
  promotions30d: number
}

const EXPORTS = [
  { name: 'users', label: 'Users', hint: 'Phone numbers only for people who opted in' },
  { name: 'listings', label: 'Listings', hint: 'Views, saves, chats and offers per listing' },
  { name: 'payments', label: 'Payments', hint: 'Every fee and promotion charged' },
  { name: 'signups-daily', label: 'Daily sign-ups', hint: 'Sign-ups per day, by agent and invite' },
]

async function download(path: string, fallbackName: string) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${getSessionToken() ?? ''}` } })
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const blob = await res.blob()
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// Growth tools for the team: exports for spreadsheets (and for handing to Claude), a quick
// look at this week's numbers, and field agents with their own sign-up codes.
export default function AdminGrowth() {
  const toast = useToast()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [rate, setRate] = useState(0.1)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', region: '', phone: '' })
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    Promise.all([
      api.get<Summary>('/api/admin/growth/summary'),
      api.get<{ agents: Agent[]; commissionRate: number }>('/api/admin/growth/agents'),
    ])
      .then(([s, a]) => {
        setSummary(s)
        setAgents(a.agents)
        setRate(a.commissionRate)
      })
      .catch(() => setFailed(true))
  }, [])
  useEffect(load, [load])

  const doDownload = async (path: string, name: string) => {
    setBusy(name)
    try {
      await download(path, `dealeone-${name}.csv`)
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't download that file."))
    } finally {
      setBusy(null)
    }
  }

  const addAgent = async () => {
    if (form.name.trim().length < 2) {
      toast.error('Add the agent’s name.')
      return
    }
    setAdding(true)
    try {
      await api.post('/api/admin/growth/agents', {
        name: form.name.trim(),
        ...(form.region.trim() ? { region: form.region.trim() } : {}),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      })
      setForm({ name: '', region: '', phone: '' })
      toast.success('Agent added — share their code or link.')
      load()
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't add the agent."))
    } finally {
      setAdding(false)
    }
  }

  const toggleAgent = async (a: Agent) => {
    try {
      await api.patch(`/api/admin/growth/agents/${a.id}`, { active: !a.active })
      setAgents((prev) => prev?.map((x) => (x.id === a.id ? { ...x, active: !a.active } : x)) ?? prev)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const copyLink = async (a: Agent) => {
    const url = `${window.location.origin}${window.location.pathname}?agent=${a.code}&utm_source=agent#/`
    try {
      await navigator.clipboard.writeText(url)
      toast.success(`Link for ${a.name} copied.`)
    } catch {
      toast.info(url)
    }
  }

  const rev30 = summary?.revenue.reduce((s, r) => s + r.last30d, 0) ?? 0
  const input =
    'w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-accent'

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Growth" />
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-4">
        {failed ? (
          <LoadError onRetry={load} />
        ) : !summary || !agents ? (
          <div className="flex justify-center py-10 text-muted">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : (
          <>
            <section>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">At a glance</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  ['New users (7 days)', summary.users.new_7d?.toLocaleString()],
                  ['Active users (7 days)', summary.users.active_7d?.toLocaleString()],
                  ['Live listings', summary.listings.live?.toLocaleString()],
                  [
                    'Renewal rate (30 days)',
                    summary.renewal.rate == null ? '—' : `${Math.round(summary.renewal.rate * 100)}% of ${summary.renewal.due30d}`,
                  ],
                  ['Charged (30 days)', formatPrice(rev30)],
                  ['Opted in to deals', summary.users.opted_in?.toLocaleString()],
                ].map(([label, value]) => (
                  <div key={label} className="card-elevated rounded-2xl bg-surface p-3">
                    <p className="text-[11px] text-muted">{label}</p>
                    <p className="mt-0.5 text-lg font-display font-bold tabular-nums text-ink">{value}</p>
                  </div>
                ))}
              </div>
              {summary.signupSources30d.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  Sign-ups in 30 days by source:{' '}
                  {summary.signupSources30d.map((s) => `${s.source} ${s.signups} (${s.becameSellers} selling)`).join(' · ')}
                </p>
              )}
            </section>

            <section>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Download data (CSV)</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {EXPORTS.map((e) => (
                  <button
                    key={e.name}
                    onClick={() => doDownload(`/api/admin/growth/export/${e.name}.csv`, e.name)}
                    disabled={!!busy}
                    className="card-elevated tap-flash flex items-center gap-3 rounded-2xl bg-surface p-3 text-left disabled:opacity-60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
                      {busy === e.name ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{e.label}</span>
                      <span className="block text-[11px] text-muted">{e.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted">
                PINs are never exported. Keep these files private — they're your customers' data.
              </p>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Field agents</h2>
                <button
                  onClick={() => doDownload('/api/admin/growth/export-agents', 'agents')}
                  className="flex items-center gap-1 text-xs font-medium text-accent"
                >
                  <Download size={13} /> Agents CSV
                </button>
              </div>
              <div className="card-elevated space-y-2 rounded-2xl bg-surface p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <UserPlus size={16} className="text-accent" /> Add an agent
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input className={input} placeholder="Name" aria-label="Agent name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <input className={input} placeholder="Region (e.g. Bo)" aria-label="Agent region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
                  <input className={input} placeholder="Phone (optional)" aria-label="Agent phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <button onClick={addAgent} disabled={adding} className="btn-primary min-h-11 w-full text-sm">
                  {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create agent code
                </button>
              </div>

              {agents.length === 0 ? (
                <p className="mt-3 text-center text-sm text-muted">No agents yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {agents.map((a) => (
                    <li key={a.id} className={`card-elevated rounded-2xl bg-surface p-3 ${a.active ? '' : 'opacity-60'}`}>
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ink">
                            {a.name} {a.region && <span className="font-normal text-muted">· {a.region}</span>}
                          </p>
                          <p className="mt-0.5 font-mono text-sm tracking-widest text-accent">{a.code}</p>
                        </div>
                        <button onClick={() => copyLink(a)} className="icon-btn h-10 w-10 bg-surface-2 text-ink" aria-label={`Copy sign-up link for ${a.name}`}>
                          <Copy size={15} />
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px] text-muted">
                        <span>
                          <b className="block text-sm tabular-nums text-ink">{a.signups30d}</b>sign-ups 30d
                        </span>
                        <span>
                          <b className="block text-sm tabular-nums text-ink">{a.sellers}</b>sellers
                        </span>
                        <span>
                          <b className="block text-sm tabular-nums text-ink">{formatPrice(a.promotions30d)}</b>promos 30d
                        </span>
                        <span>
                          <b className="block text-sm tabular-nums text-ink">{formatPrice(Math.round(a.promotions30d * rate))}</b>
                          commission est.
                        </span>
                      </div>
                      <button onClick={() => toggleAgent(a)} className="mt-2 text-xs font-medium text-muted underline underline-offset-2">
                        {a.active ? 'Deactivate code' : 'Reactivate code'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-muted">
                New users type the agent's code in the "Invite or agent code" box when they create their PIN, or open the
                agent's link. Commission shown at {Math.round(rate * 100)}% of promotions bought by that agent's users.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
