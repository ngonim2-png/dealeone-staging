// Invite codes: someone opens an invite link (…/?ref=ABC1234#/ or …/#/?ref=ABC1234), we
// remember the code on this device, and it's sent with their signup. The person who
// invited them earns a free boost week once the new person publishes their first listing
// (see apps/api/src/lib/referrals.ts).
const KEY = 'dealeone.ref'
const CODE_RE = /^[A-Z0-9]{4,12}$/

export function captureReferralFromUrl() {
  try {
    const fromSearch = new URLSearchParams(window.location.search).get('ref')
    const hashQuery = window.location.hash.split('?')[1] ?? ''
    const fromHash = new URLSearchParams(hashQuery).get('ref')
    const code = (fromSearch ?? fromHash ?? '').trim().toUpperCase()
    if (CODE_RE.test(code)) localStorage.setItem(KEY, code)
  } catch {
    // storage blocked — the invitee can still type the code on the signup screen
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
