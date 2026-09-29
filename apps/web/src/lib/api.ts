// Thin fetch client for the DEALEONE API (apps/api). Real session auth: after the phone+PIN
// login flow (see AppContext's login/signup), the API returns a signed JWT which is
// stored here and sent as `Authorization: Bearer <token>` on every request.

export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'
const SESSION_KEY = 'dealeone.token'

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

export function setSessionToken(token: string) {
  try {
    localStorage.setItem(SESSION_KEY, token)
  } catch {
    // ignore — session just won't persist across reloads
  }
}

export function clearSessionToken() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** True when the request never reached the server (offline, DNS, the free-tier API still
 * waking up) — as opposed to the server answering with an error. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0
}

// The API answers errors as { error: string } or, for validation failures, zod's
// { error: { formErrors: string[], fieldErrors: { field: string[] } } }. Turn either into
// one readable sentence instead of showing people raw JSON.
function readableError(body: any, fallback: string): string {
  const e = body?.error
  if (typeof e === 'string' && e.trim()) return e
  if (e && typeof e === 'object') {
    const form: string[] = Array.isArray(e.formErrors) ? e.formErrors : []
    if (form.length) return form[0]
    const fields = e.fieldErrors && typeof e.fieldErrors === 'object' ? Object.entries(e.fieldErrors) : []
    for (const [field, msgs] of fields) {
      if (Array.isArray(msgs) && msgs.length) return `${field}: ${msgs[0]}`
    }
  }
  return fallback
}

/** A message that's safe and useful to show a person for any error thrown by `api`. */
export function errorMessage(err: unknown, fallback = 'Something went wrong — please try again.'): string {
  if (err instanceof ApiError) return err.message || fallback
  return fallback
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken()
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    // fetch only throws when there was no HTTP response at all.
    throw new ApiError(0, "Can't reach DEALEONE — check your internet connection and try again.")
  }
  if (!res.ok) {
    if (res.status === 401) {
      // Token missing/expired/invalid — drop it so the next reload shows the login
      // screen instead of silently retrying with a dead token forever.
      clearSessionToken()
    }
    const body = await res.json().catch(() => ({}))
    const fallback =
      res.status >= 500
        ? 'DEALEONE had a problem on its side — please try again in a moment.'
        : res.status === 429
          ? 'Too many attempts — please wait a minute and try again.'
          : 'That didn’t work — please check and try again.'
    throw new ApiError(res.status, readableError(body, fallback))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, init),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
}
