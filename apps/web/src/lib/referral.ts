// Invite codes: someone opens an invite link (…/?ref=ABC1234#/ or …/#/?ref=ABC1234), we
// remember the code on this device, and it's sent with their signup. The person who
// invited them earns a free boost week once the new person publishes their first listing
// (see apps/api/src/lib/referrals.ts).
const KEY = 'dealeone.ref'
const CODE_RE = /^[A-Z0-9]{4,12}$/ // friend invite codes are 7 characters, field-agent codes 8 (AG…)

const SOURCE_KEY = 'dealeone.source'

export function captureReferralFromUrl() {
  try {
    const search = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
    const get = (k: string) => search.get(k) ?? hash.get(k)
    const code = (get('ref') ?? get('agent') ?? '').trim().toUpperCase()
    if (CODE_RE.test(code)) localStorage.setItem(KEY, code)
    // Where this person came from, e.g. ?utm_source=facebook&utm_campaign=wk3-freetown or
    // ?src=radio-qr — kept until they sign up (first touch wins).
    const source = get('utm_source') ?? get('src')
    const campaign = get('utm_campaign')
    if (source && !localStorage.getItem(SOURCE_KEY)) {
      localStorage.setItem(SOURCE_KEY, JSON.stringify({ source: source.slice(0, 60), campaign: campaign?.slice(0, 100) ?? null }))
    }
  } catch {
    // storage blocked — the invitee can still type the code on the signup screen
  }
}

export function getStoredSource(): { source: string; campaign: string | null } | null {
  try {
    const raw = localStorage.getItem(SOURCE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearStoredSource() {
  try {
    localStorage.removeItem(SOURCE_KEY)
  } catch {
    // ignore
  }
}

export function getStoredReferralCode(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearStoredReferralCode() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

export function setStoredReferralCode(code: string) {
  const c = code.trim().toUpperCase()
  try {
    if (CODE_RE.test(c)) localStorage.setItem(KEY, c)
    else if (!c) localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
