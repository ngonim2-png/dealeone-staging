export function formatPrice(amount: number): string {
  return `NLe ${amount.toLocaleString('en-US')}`
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

// Events (Events.tsx/EventDetail.tsx card + detail dates) — "Today · 7:00 PM" / "Tomorrow ·
// ..." for the next two days (the cases someone glances at without needing the actual date),
// falling back to a full weekday/date/time otherwise so a browsed event next month doesn't
// read as a vague "in N days".
export function formatEventWhen(iso: string): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000)
  if (dayDiff === 0) return `Today · ${time}`
  if (dayDiff === 1) return `Tomorrow · ${time}`
  if (dayDiff === -1) return `Yesterday · ${time}`
  return `${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${time}`
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  return new Date(iso).toLocaleDateString()
}
