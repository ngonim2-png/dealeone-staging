import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet'
import { divIcon } from 'leaflet'
import { useEffect, useRef } from 'react'
import type { Listing } from '../types'
import { USER_LOCATION } from '../lib/geo'
import type { LiveLocation } from '../lib/useLiveLocation'
import { isImageUrl } from '../lib/media'
import { categorySvg } from '../lib/categoryIcons'
import 'leaflet/dist/leaflet.css'

function userIcon() {
  // Lime "you are here" dot (ties to the logo's own bright-green accent) with a white ring
  // so it separates cleanly from whatever color the light basemap tile underneath is.
  return divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:#84d61c;border:3px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.25), 0 0 0 4px rgba(132,214,28,0.3)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

// Light-theme pin hierarchy: normal pins are plain white badges (read clearly against any
// basemap tile color), sponsored gets a forest-green outline instead of a fill change (a
// quieter "premium" cue than the old dark-on-dark treatment needed), and the active/selected
// pin gets the one bright fill in the whole map — a lime gradient — so it's unmistakably the
// "hot" pin at a glance, the same job gold did on the old dark basemap.
function pinIcon(listing: Listing, active: boolean) {
  const { category, sponsored, title } = listing
  const image = listing.images[0]
  const bg = active ? 'linear-gradient(180deg, #a6e64b, #84d61c)' : '#ffffff'
  const border = active ? '#ffffff' : sponsored ? '#2f7a42' : '#dce2dc'
  const scale = active ? 1.22 : sponsored ? 1.06 : 1
  const glow = active
    ? '0 2px 10px rgba(0,0,0,0.25), 0 0 0 5px rgba(36,91,50,0.18), 0 0 22px rgba(132,214,28,0.55)'
    : sponsored
    ? '0 2px 8px rgba(0,0,0,0.18), 0 0 0 3px rgba(47,122,66,0.12)'
    : '0 2px 8px rgba(0,0,0,0.16)'
  const iconColor = active ? '#1a2e1f' : '#2c3b34'

  // A real listing photo fills the badge as a cropped circular thumbnail; otherwise a
  // category glyph (not emoji — reads cleaner at this size, matches the reference style).
  const glyph = categorySvg(category, 15, iconColor)
  const content = isImageUrl(image)
    ? `<img src="${image}" style="width:100%;height:100%;object-fit:cover;border-radius:9999px;" />`
    : glyph

  const label = title.length > 18 ? `${title.slice(0, 17)}…` : title

  return divIcon({
    className: '',
    html: `<div style="width:96px;display:flex;flex-direction:column;align-items:center;pointer-events:auto;">
      <div style="
        transform: scale(${scale});
        transition: transform 220ms cubic-bezier(0.16,1,0.3,1), box-shadow 220ms ease;
        width:34px;height:34px;border-radius:9999px;
        background:${bg};
        border:2px solid ${border};
        display:flex;align-items:center;justify-content:center;
        overflow:hidden;
        box-shadow:${glow};
      ">${content}</div>
      <span style="
        margin-top:5px;max-width:90px;padding:2px 7px;border-radius:9999px;
        background:rgba(20,20,20,0.78);backdrop-filter:blur(2px);
        border:1px solid ${active ? 'rgba(132,214,28,0.55)' : 'rgba(255,255,255,0.2)'};
        color:${active ? '#a6e64b' : '#f0f2ee'};
        font-size:10px;font-weight:500;line-height:1.3;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        box-shadow:0 1px 4px rgba(0,0,0,0.35);
      ">${label}</span>
    </div>`,
    iconSize: [96, 60],
    iconAnchor: [48, 17],
  })
}

// Zoom levels bumped up a couple notches from the previous mapping (which opened as far
// out as 11-13, a whole-district view where individual streets aren't legible) so the map
// opens already close enough to see actual streets, instead of a wide city overview.
const RADIUS_ZOOM: Record<number, number> = { 1: 17, 3: 16, 5: 15, 10: 14, 25: 13 }

// `recenterTrigger` is a plain incrementing number, not real state to react to — bumping it
// (see the "Locate me" button in Explore.tsx) just re-fires this effect so the map jumps
// to the user's current location on demand, without MapView needing to expose a Leaflet ref.
// Also fires once on its own the moment real GPS resolves for the first time (see
// `justWentLive` below) — the "Uber" behavior of opening on a reasonable default, then
// snapping to the live blue dot as soon as a fix comes in, rather than staying parked on a
// stale/default coordinate forever.
function RecenterOnRadius({
  lat,
  lng,
  radiusKm,
  recenterTrigger,
  justWentLive,
}: {
  lat: number
  lng: number
  radiusKm: number
  recenterTrigger?: number
  justWentLive: boolean
}) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], RADIUS_ZOOM[radiusKm] ?? 15, { animate: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusKm, recenterTrigger, justWentLive, map])
  return null
}

// Leaflet measures its container's real pixel size once, at mount — if that happens before
// the surrounding flex layout has actually settled (a known react-leaflet/Vite timing issue,
// and the likely cause of a map that opens tiny/mis-zoomed showing the wrong stretch of
// coastline), it never recovers on its own. A ResizeObserver on the map's own container
// catches every subsequent size change (initial layout settling, orientation change, the
// mobile browser's address bar showing/hiding) and tells Leaflet to re-measure each time.
function InvalidateSizeOnResize() {
  const map = useMap()
  useEffect(() => {
    const container = map.getContainer()
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(container)
    // Also catch the very first paint, one tick after mount.
    const t = setTimeout(() => map.invalidateSize(), 0)
    return () => {
      ro.disconnect()
      clearTimeout(t)
    }
  }, [map])
  return null
}

export default function MapView({
  listings,
  radiusKm,
  selectedId,
  onSelect,
  recenterTrigger,
  userLocation,
}: {
  listings: Listing[]
  radiusKm: number
  selectedId: string | null
  onSelect: (id: string) => void
  recenterTrigger?: number
  userLocation: LiveLocation
}) {
  // Tracks whether we've already auto-recentered for this "GPS just resolved" moment, so
  // RecenterOnRadius's effect only jumps to the live position once on its own — after that,
  // the user is free to pan away without the map fighting them on every GPS tick.
  const hasAutoRecentered = useRef(false)
  const justWentLive = userLocation.status === 'live' && !hasAutoRecentered.current
  if (justWentLive) hasAutoRecentered.current = true

  const { lat, lng } = userLocation

  return (
    <MapContainer
      center={[USER_LOCATION.lat, USER_LOCATION.lng]}
      zoom={15}
      zoomControl={false}
      attributionControl={true}
      className="absolute inset-0"
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
      />
      <InvalidateSizeOnResize />
      <RecenterOnRadius
        lat={lat}
        lng={lng}
        radiusKm={radiusKm}
        recenterTrigger={recenterTrigger}
        justWentLive={justWentLive}
      />
      <Circle
        center={[lat, lng]}
        radius={radiusKm * 1000}
        pathOptions={{ color: '#245b32', weight: 1, fillOpacity: 0.05, opacity: 0.4 }}
      />
      <Marker position={[lat, lng]} icon={userIcon()} />
      {listings.map((l) => (
        <Marker
          key={l.id}
          position={[l.lat, l.lng]}
          icon={pinIcon(l, l.id === selectedId)}
          eventHandlers={{ click: () => onSelect(l.id) }}
        />
      ))}
    </MapContainer>
  )
}
