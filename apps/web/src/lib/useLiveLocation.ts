// Real device geolocation — the "Uber map experience" ask: center the map (and compute
// every distance) from the user's actual GPS position instead of the fixed demo constant
// every session previously used (USER_LOCATION in ./geo, which is why every single user —
// and every listing's "distance away" — was silently measured from the same hardcoded spot
// in Lumley regardless of where the phone actually was).
//
// USER_LOCATION stays as the fallback: geolocation requires a user permission prompt and
// only works over HTTPS, so there's always a window (prompt not yet answered, denied,
// unsupported browser, no signal) where we need a sane default rather than a broken map.
import { useEffect, useState } from 'react'
import { USER_LOCATION } from './geo'
import { reverseGeocode } from './geocode'

export type LocationStatus = 'locating' | 'live' | 'denied' | 'unsupported'

export interface LiveLocation {
  lat: number
  lng: number
  label: string
  accuracy: number | null
  status: LocationStatus
}

const DEFAULT_STATE: LiveLocation = {
  lat: USER_LOCATION.lat,
  lng: USER_LOCATION.lng,
  label: USER_LOCATION.label,
  accuracy: null,
  status: 'locating',
}

export function useLiveLocation(): LiveLocation {
  const [state, setState] = useState<LiveLocation>(DEFAULT_STATE)

  // Live GPS tracking (Uber-style: keeps updating as the device moves), not just a single
  // fix — watchPosition rather than getCurrentPosition.
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, status: 'unsupported' }))
      return
    }
    let cancelled = false
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (cancelled) return
        setState((s) => ({
          ...s,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          status: 'live',
        }))
      },
      () => {
        // Denied, timed out, or unavailable (e.g. desktop with no location services) —
        // stay on the default Lumley coordinate rather than an error state; the map and
        // distances still work, just not personalized.
        if (!cancelled) setState((s) => ({ ...s, status: s.status === 'live' ? s.status : 'denied' }))
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    )
    return () => {
      cancelled = true
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  // Turn the raw coordinate into a human label ("Wilkinson Road, Lumley") for TopBar/Sell —
  // reverseGeocode's own ~11m-precision cache means this is cheap even though it re-runs on
  // every GPS tick, since consecutive fixes almost always land in the same cached cell.
  useEffect(() => {
    if (state.status !== 'live') return
    let cancelled = false
    const controller = new AbortController()
    reverseGeocode(state.lat, state.lng, controller.signal).then((label) => {
      if (!cancelled && label) setState((s) => ({ ...s, label }))
    })
    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lat, state.lng, state.status])

  return state
}
