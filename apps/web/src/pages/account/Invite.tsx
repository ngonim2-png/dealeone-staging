import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Gift, Rocket, Share2, UserPlus, Check } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import LoadError from '../../components/LoadError'
import { useToast } from '../../components/Toast'
import { api } from '../../lib/api'
import { shareLink } from '../../lib/share'
import { useT } from '../../lib/i18n'

interface ReferralInfo {
  code: string
  invited: number
  rewarded: number
  boostCredits: number
}

// Invite friends: each friend who joins with your link and posts their first listing earns
// you one free Boost week (apps/api/src/lib/referrals.ts). Rewarding the first *listing*
// rather than the signup keeps it from being farmed with throwaway accounts.
export default function Invite() {
  const navigate = useNavigate()
  const toast = useToast()
  const t = useT()
  const [info, setInfo] = useState<ReferralInfo | null>(null)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    api
      .get<ReferralInfo>('/api/referrals/me')
      .then(setInfo)
      .catch(() => setFailed(true))
  }, [])
  useEffect(load, [load])

  const share = async () => {
    if (!info) return
    const r = await shareLink({
      title: 'Join me on DEALEONE',
      text: `Buy and sell near you on DEALEONE — see what's for sale around you on a map. Use my invite code ${info.code}:`,
      path: '/',
      query: `ref=${info.code}&utm_source=invite`,
    })
    if (r === 'copied') toast.success('Invite link copied — paste it in WhatsApp or SMS.')
    if (r === 'failed') toast.error("Couldn't share — copy your code instead.")
  }

  const copyCode = async () => {
    if (!info) return
    try {
      await navigator.clipboard.writeText(info.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error("Couldn't copy — write the code down instead.")
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title={t('account.invite')} />
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-4">
        {failed ? (
          <LoadError onRetry={load} />
        ) : !info ? (
          <div className="h-56 animate-pulse rounded-3xl bg-surface-2" aria-hidden />
        ) : (
          <>
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent-2 to-accent p-5 text-white shadow-[0_18px_40px_-18px_rgba(36,91,50,0.8)]">
              <Gift size={72} className="absolute right-2 top-2 rotate-12 text-white/10" aria-hidden />
              <p className="text-sm font-medium text-white/80">Invite friends, get free boosts</p>
              <p className="mt-1 text-xl font-display font-bold leading-tight tracking-tight">
                1 free Boost week for every friend who lists something
              </p>
              <div className="mt-4 flex items-center gap-2">
                <span className="flex-1 rounded-xl bg-white/15 px-3 py-2.5 text-center font-mono text-lg font-bold tracking-[0.2em]">
                  {info.code}
                </span>
                <button
                  onClick={copyCode}
                  aria-label="Copy invite code"
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 transition active:scale-90"
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
              <button
                onClick={share}
                className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-accent transition active:scale-[0.98]"
              >
                <Share2 size={16} /> Share invite link
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Joined', value: info.invited },
                { label: 'Listed', value: info.rewarded },
                { label: 'Free boosts', value: info.boostCredits },
              ].map((s) => (
                <div key={s.label} className="card-elevated rounded-2xl bg-surface p-3">
                  <p className="text-2xl font-display font-bold tabular-nums text-ink">{s.value}</p>
                  <p className="text-[11px] text-muted">{s.label}</p>
                </div>
              ))}
            </div>

            {info.boostCredits > 0 && (
              <button
                onClick={() => navigate('/account/listings')}
                className="card-elevated tap-flash mt-3 flex w-full items-center gap-3 rounded-2xl bg-surface p-3 text-left"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/12 text-accent">
                  <Rocket size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">
                    You have {info.boostCredits} free Boost week{info.boostCredits === 1 ? '' : 's'}
                  </span>
                  <span className="block text-xs text-muted">Open My Listings and tap Boost on any active listing.</span>
                </span>
              </button>
            )}

            <h2 className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-muted">How it works</h2>
            <ol className="space-y-3">
              {[
                { icon: Share2, text: 'Send your link to friends on WhatsApp, SMS or anywhere.' },
                { icon: UserPlus, text: 'They join DEALEONE with your link (or type your code when they create their PIN).' },
                { icon: Gift, text: 'When they post their first listing, you get a free Boost week — no limit.' },
              ].map((s, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
                    <s.icon size={15} />
                  </span>
                  <p className="pt-1.5 text-sm text-ink/90">{s.text}</p>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  )
}
