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
import { USER_LOCATION, distanceKm } from './geo'
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
    // Last position we actually committed to state. Phone GPS reports a slightly different
    // point every second or so even when the phone is lying still (5-30m of noise is
    // normal), and every committed update re-renders the whole app: the "you are here" dot
    // and radius circle hop around, and every distance-sorted list (map carousel, List
    // view, Events) reshuffles its order. That constant twitching was a big part of the app
    // feeling "shaky" on phones. So a reading only gets through if it's the first fix, or
    // the device has genuinely moved further than the reading's own noise.
    let committed: { lat: number; lng: number; accuracy: number } | null = null
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (cancelled) return
        const { latitude, longitude, accuracy } = pos.coords
        if (committed) {
          const movedM = distanceKm(committed.lat, committed.lng, latitude, longitude) * 1000
          // Ignore a noticeably *worse* reading (e.g. a wifi/cell fallback fix) unless it
          // moved far enough that it can't just be noise.
          const noiseM = Math.max(30, Math.min(accuracy, 250) * 0.6)
          if (movedM < noiseM) return
          if (accuracy > committed.accuracy * 3 && movedM < 500) return
        }
        committed = { lat: latitude, lng: longitude, accuracy }
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
        if (!cancelled) setState((s) => (s.status === 'live' || s.status === 'denied' ? s : { ...s, status: 'denied' }))
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
      // Same label → return the same state object so nothing re-renders.
      if (!cancelled && label) setState((s) => (s.label === label ? s : { ...s, label }))
    })
    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lat, state.lng, state.status])

  return state
}
