// Thin fetch client for the DEALEONE API (apps/api). Real session auth: after the phone-OTP
// login flow (see AppContext's requestOtp/verifyOtp), the API returns a signed JWT which is
// stored here and sent as `Authorization: Bearer <token>` on every request.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    if (res.status === 401) {
      // Token missing/expired/invalid — drop it so the next reload shows the login
      // screen instead of silently retrying with a dead token forever.
      clearSessionToken()
    }
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ? JSON.stringify(body.error) : res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
}
