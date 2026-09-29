import { useState } from 'react'
import { Briefcase, CircleCheck, Gauge, Languages, Megaphone, Trash2, UserRound } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import { useApp } from '../../context/AppContext'
import { ApiError } from '../../lib/api'
import { LANGS, setLang, useLang, useT } from '../../lib/i18n'

// The real business-account toggle — before this round `isBusiness` existed in the DB/API
// but a real user could never actually set it themselves (seed-data only). This is what
// gates the Explore banner ad (routes/listings.ts's POST /:id/banner-ad) and buyer-request
// priority-access (routes/buyerRequests.ts's POST /priority-access) purchases.
export default function Settings() {
  const { currentUser, updateBusinessProfile, updateName, deleteAccount, lowData, setLowData, updateMarketingOptIn } = useApp()
  const [optInBusy, setOptInBusy] = useState(false)
  const lang = useLang()
  const t = useT()
  const [name, setName] = useState(currentUser?.name ?? '')
  const [nameState, setNameState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [nameError, setNameError] = useState<string | null>(null)
  const [isBusiness, setIsBusiness] = useState(currentUser?.isBusiness ?? false)
  const [businessName, setBusinessName] = useState(currentUser?.businessName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Account deletion (Apple App Store guideline 5.1.1(v) requires this in-app; Google Play
  // expects the equivalent) — a real, findable path, not a support-ticket workaround. Gated
  // behind the account's own PIN, the same "reauthenticate before something irreversible"
  // pattern Apple's own guidance explicitly allows.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletePin, setDeletePin] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (!currentUser) return null

  // lib/api.ts already turns every API error into one readable sentence.
  const friendlyError = (err: unknown, fallback: string) =>
    err instanceof ApiError && err.message ? err.message : fallback

  const confirmDelete = async () => {
    if (!/^\d{4}$/.test(deletePin)) {
      setDeleteError('Enter your 4-digit PIN.')
      return
    }
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteAccount(deletePin)
      // deleteAccount() already signs the device out on success — App.tsx swaps to the
      // Login screen the moment currentUser goes null, no navigation needed here.
    } catch (err) {
      console.error('delete account failed', err)
      setDeleteError(friendlyError(err, "Couldn't delete your account — try again."))
      setDeleting(false)
    }
  }

  const dirty = isBusiness !== currentUser.isBusiness || (isBusiness && businessName !== (currentUser.businessName ?? ''))

  const save = async () => {
    if (isBusiness && !businessName.trim()) {
      setError('Enter a business name to register as a business.')
      return
    }
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await updateBusinessProfile({ isBusiness, businessName: isBusiness ? businessName.trim() : undefined })
      setSaved(true)
    } catch (err) {
      console.error('update business profile failed', err)
      setError(friendlyError(err, "Couldn't save — please try again."))
    } finally {
      setSaving(false)
    }
  }

  const nameDirty = name.trim() !== currentUser.name
  const saveName = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Enter your name.')
      return
    }
    setNameState('saving')
    setNameError(null)
    try {
      await updateName(trimmed)
      setNameState('saved')
    } catch (err) {
      setNameState('error')
      setNameError(friendlyError(err, "Couldn't save your name — please try again."))
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Settings" />
      <div className="mx-auto w-full max-w-xl flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="card-elevated space-y-3 rounded-xl bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
              <UserRound size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <label htmlFor="settings-name" className="text-sm font-medium text-ink">
                Your name
              </label>
              <p className="text-xs text-muted">Shown to buyers and sellers you chat with.</p>
            </div>
          </div>
          <input
            id="settings-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameState('idle')
            }}
            maxLength={80}
            autoComplete="name"
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
          />
          {nameError && <p className="text-xs text-bad">{nameError}</p>}
          {nameState === 'saved' && !nameDirty && (
            <p className="flex items-center gap-1 text-xs text-good">
              <CircleCheck size={13} /> Saved
            </p>
          )}
          <button
            onClick={saveName}
            disabled={!nameDirty || nameState === 'saving'}
            className="btn-primary min-h-11 w-full py-2.5 text-sm disabled:opacity-50"
          >
            {nameState === 'saving' ? 'Saving…' : 'Save name'}
          </button>
        </div>

        <div className="card-elevated rounded-xl bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
              <Languages size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{t('settings.language')}</p>
              <p className="text-xs text-muted">{t('settings.languageHint')}</p>
            </div>
          </div>
          <div role="radiogroup" aria-label={t('settings.language')} className="mt-3 grid grid-cols-2 gap-2">
            {LANGS.map((l) => (
              <button
                key={l.id}
                role="radio"
                aria-checked={lang === l.id}
                onClick={() => setLang(l.id)}
                className={`tap-flash min-h-11 rounded-xl text-sm font-medium transition active:scale-[0.97] ${
                  lang === l.id ? 'glow-accent-ring bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
                }`}
              >
                {l.native}
              </button>
            ))}
          </div>
        </div>

        <div className="card-elevated rounded-xl bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
              <Megaphone size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p id="optin-label" className="text-sm font-medium text-ink">Deals and updates</p>
              <p className="text-xs text-muted">Occasional SMS or WhatsApp messages about deals near you and new features.</p>
            </div>
            <button
              onClick={async () => {
                if (!currentUser) return
                setOptInBusy(true)
                try {
                  await updateMarketingOptIn(!currentUser.marketingOptIn)
                } catch {
                  // the switch simply stays where it was
                } finally {
                  setOptInBusy(false)
                }
              }}
              disabled={optInBusy}
              role="switch"
              aria-checked={!!currentUser?.marketingOptIn}
              aria-labelledby="optin-label"
              className={`tap-flash relative h-7 w-12 shrink-0 rounded-full transition-colors before:absolute before:-inset-2.5 before:content-[''] disabled:opacity-60 ${
                currentUser?.marketingOptIn ? 'bg-accent' : 'bg-[#c3ccc4]'
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  currentUser?.marketingOptIn ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="card-elevated rounded-xl bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
              <Gauge size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p id="lowdata-label" className="text-sm font-medium text-ink">Low-data mode</p>
              <p className="text-xs text-muted">
                Don't download photos until you tap them. Saves mobile data and loads faster on a weak signal.
              </p>
            </div>
            <button
              onClick={() => setLowData(!lowData)}
              role="switch"
              aria-checked={lowData}
              aria-labelledby="lowdata-label"
              className={`tap-flash relative h-7 w-12 shrink-0 rounded-full transition-colors before:absolute before:-inset-2.5 before:content-[''] ${
                lowData ? 'bg-accent' : 'bg-[#c3ccc4]'
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  lowData ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="card-elevated space-y-3 rounded-xl bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
              <Briefcase size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">Business account</p>
              <p className="text-xs text-muted">
                Unlocks home-screen banner ads (NLe 100 per 10 days) and buyer-request priority access (NLe 50/week).
              </p>
            </div>
            <button
              onClick={() => setIsBusiness((v) => !v)}
              aria-label="Business account"
              role="switch"
              aria-checked={isBusiness}
              className={`tap-flash relative h-7 w-12 shrink-0 rounded-full transition-colors before:absolute before:-inset-2.5 before:content-[''] ${
                isBusiness ? 'bg-accent' : 'bg-[#c3ccc4]'
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  isBusiness ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {isBusiness && (
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Business name, e.g. ABC Electronics Ltd"
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
            />
          )}

          {error && <p className="text-xs text-bad">{error}</p>}
          {saved && !dirty && (
            <p className="flex items-center gap-1 text-xs text-good">
              <CircleCheck size={13} /> Saved
            </p>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="btn-primary min-h-11 w-full py-2.5 text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save business settings'}
          </button>
        </div>

        <div className="card-elevated space-y-3 rounded-xl bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-bad">
              <Trash2 size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-bad">Delete account</p>
              <p className="text-xs text-muted">
                Permanently deletes your account and personal info. Your active listings and
                events come down immediately. This can't be undone.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setDeleteError(null)
              setDeletePin('')
              setConfirmingDelete(true)
            }}
            className="btn-danger w-full py-2.5 text-sm"
          >
            Delete my account
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <div className="scrim-enter fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px]">
          <div className="sheet-elevated sheet-enter w-full max-w-md rounded-t-3xl border-t border-border bg-surface p-5 pb-8">
            <h2 className="mb-1 text-base font-semibold text-bad">Delete your account?</h2>
            <p className="mb-4 text-sm text-muted">
              This removes your personal info, signs you out everywhere, and takes down any
              listings or events you're hosting right away. Existing chats, offers, and
              sold-item history stay in place for the other people involved, but you'll show
              up to them as "Deleted User." This can't be undone — enter your PIN to confirm.
            </p>
            <input
              value={deletePin}
              onChange={(e) => setDeletePin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="4-digit PIN"
              autoFocus
              className="mb-3 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-center text-lg tracking-[0.5em] text-ink outline-none transition focus:border-bad focus:shadow-[0_0_0_3px_rgba(194,58,58,0.15)]"
            />
            {deleteError && <p className="mb-3 text-xs text-bad">{deleteError}</p>}
            <button
              onClick={confirmDelete}
              disabled={deleting || deletePin.length !== 4}
              className="btn-danger w-full text-sm disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Permanently delete my account'}
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="btn-secondary mt-2 w-full text-sm disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
