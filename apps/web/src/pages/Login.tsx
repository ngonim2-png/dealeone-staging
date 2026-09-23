import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { ApiError } from '../lib/api'
import logoMark from '../assets/logo-mark.png'

type Step = 'phone' | 'pin-login' | 'pin-create' | 'name'

/** Phone number + a self-chosen 4-digit PIN — replaces the earlier phone-OTP flow. There's
 * no SMS provider wired up (never was — the old "OTP" was just shown on screen instead of
 * texted, so it never actually proved phone ownership either), so instead of a code, a
 * returning user unlocks with their own PIN and a new user picks one at signup. Once signed
 * in, the device just stays signed in (see AppContext's stored JWT) — no re-verifying on
 * every open, matching how WhatsApp and most chat apps behave on a trusted device. */
export default function Login() {
  const { checkPhone, signup, login, completeProfile } = useApp()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const friendlyError = (err: unknown, fallback: string) => {
    if (err instanceof ApiError) {
      try {
        const parsed = JSON.parse(err.message)
        if (typeof parsed === 'string') return parsed
      } catch {
        // not JSON — fall through
      }
    }
    return fallback
  }

  const digitsOnly = (v: string) => v.replace(/\D/g, '').slice(0, 4)

  const continueFromPhone = async () => {
    const trimmed = phone.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const { exists } = await checkPhone(trimmed)
      setPin('')
      setNewPin('')
      setConfirmPin('')
      setStep(exists ? 'pin-login' : 'pin-create')
    } catch (err) {
      setError(friendlyError(err, "Couldn't check that number — try again."))
    } finally {
      setLoading(false)
    }
  }

  const submitLogin = async () => {
    if (pin.length < 4) return
    setLoading(true)
    setError(null)
    try {
      await login(phone.trim(), pin)
      // AppContext's currentUser + ready flip on, and App.tsx swaps straight to the main
      // routes — nothing else to do here.
    } catch (err) {
      setError(friendlyError(err, 'Incorrect phone number or PIN.'))
    } finally {
      setLoading(false)
    }
  }

  const submitSignup = async () => {
    if (newPin.length < 4 || confirmPin.length < 4) return
    if (newPin !== confirmPin) {
      setError("Those PINs don't match — try again.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      await signup(phone.trim(), newPin)
      setStep('name')
    } catch (err) {
      setError(friendlyError(err, "Couldn't create your account — try again."))
    } finally {
      setLoading(false)
    }
  }

  const finishProfile = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      await completeProfile(trimmed)
      // App.tsx swaps to the main routes once this resolves — currentUser now has a name.
    } catch (err) {
      setError(friendlyError(err, 'Could not save your name — try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-10 flex flex-col items-center">
        <div className="relative mb-3 flex h-20 w-20 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-accent/15 blur-2xl" />
          <img
            src={logoMark}
            alt="DEALEONE"
            className="logo-glow-pulse relative h-16 w-16 drop-shadow-[0_0_18px_rgba(36,91,50,0.4)]"
          />
        </div>
        <p className="text-2xl font-display font-bold tracking-wide text-accent">DEALEONE</p>
        <p className="mt-1 text-sm text-muted">Find it. Near you.</p>
      </div>

      <div className="w-full max-w-xs">
        {step === 'phone' && (
          <>
            <h1 className="mb-1 text-left text-xl font-display font-bold tracking-tight text-ink">What's your number?</h1>
            <p className="mb-4 text-left text-xs text-muted">
              We'll check if you already have a DEALEONE account.
            </p>
            <input
              type="tel"
              inputMode="tel"
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && continueFromPhone()}
              placeholder="+232 76 000001"
              className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
            />
            {error && <p className="mt-2 text-left text-xs text-bad">{error}</p>}
            <button
              onClick={continueFromPhone}
              disabled={loading || !phone.trim()}
              className="btn-primary mt-4 w-full text-sm"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? 'Checking…' : 'Continue'}
            </button>
          </>
        )}

        {step === 'pin-login' && (
          <>
            <h1 className="mb-1 text-left text-xl font-display font-bold tracking-tight text-ink">Enter your PIN</h1>
            <p className="mb-4 text-left text-xs text-muted">Signing in as {phone.trim()}.</p>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => setPin(digitsOnly(e.target.value))}
              onKeyDown={(e) => e.key === 'Enter' && submitLogin()}
              placeholder="••••"
              className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-center text-lg tracking-[0.5em] text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
            />
            {error && <p className="mt-2 text-left text-xs text-bad">{error}</p>}
            <button
              onClick={submitLogin}
              disabled={loading || pin.length < 4}
              className="btn-primary mt-4 w-full text-sm"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              onClick={() => {
                setStep('phone')
                setPin('')
                setError(null)
              }}
              className="tap-flash mt-3 w-full rounded-lg py-2 text-xs text-muted transition-colors hover:text-ink"
            >
              Use a different number
            </button>
          </>
        )}

        {step === 'pin-create' && (
          <>
            <h1 className="mb-1 text-left text-xl font-display font-bold tracking-tight text-ink">Create a PIN</h1>
            <p className="mb-4 text-left text-xs text-muted">
              No account found for {phone.trim()} — set a 4-digit PIN to create one. You'll use it to
              sign in on a new device.
            </p>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={newPin}
              onChange={(e) => setNewPin(digitsOnly(e.target.value))}
              placeholder="Choose a 4-digit PIN"
              className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-center text-lg tracking-[0.5em] text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
            />
            <input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => setConfirmPin(digitsOnly(e.target.value))}
              onKeyDown={(e) => e.key === 'Enter' && submitSignup()}
              placeholder="Confirm PIN"
              className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-center text-lg tracking-[0.5em] text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
            />
            {error && <p className="mt-2 text-left text-xs text-bad">{error}</p>}
            <button
              onClick={submitSignup}
              disabled={loading || newPin.length < 4 || confirmPin.length < 4}
              className="btn-primary mt-4 w-full text-sm"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? 'Creating account…' : 'Create account'}
            </button>
            <button
              onClick={() => {
                setStep('phone')
                setNewPin('')
                setConfirmPin('')
                setError(null)
              }}
              className="tap-flash mt-3 w-full rounded-lg py-2 text-xs text-muted transition-colors hover:text-ink"
            >
              Use a different number
            </button>
          </>
        )}

        {step === 'name' && (
          <>
            <h1 className="mb-1 text-left text-xl font-display font-bold tracking-tight text-ink">
              What should sellers call you?
            </h1>
            <p className="mb-4 text-left text-xs text-muted">
              This is shown on your listings and in messages.
            </p>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && finishProfile()}
              placeholder="Your name"
              className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
            />
            {error && <p className="mt-2 text-left text-xs text-bad">{error}</p>}
            <button
              onClick={finishProfile}
              disabled={loading || !name.trim()}
              className="btn-primary mt-4 w-full text-sm"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? 'Saving…' : 'Continue'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
