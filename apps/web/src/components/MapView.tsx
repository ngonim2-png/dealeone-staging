import { AttributionControl, MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet'
import { divIcon, latLngBounds, Map as LeafletMapClass, type Map as LeafletMap } from 'leaflet'
import { useEffect, useRef } from 'react'
import type { Listing } from '../types'
import { USER_LOCATION } from '../lib/geo'
import type { LiveLocation } from '../lib/useLiveLocation'
import { categorySvg } from '../lib/categoryIcons'
import 'leaflet/dist/leaflet.css'
import { TILE_ATTRIBUTION, TILE_URL } from '../lib/mapTiles'
import { mediaSrc } from '../lib/media'
import { useApp } from '../context/AppContext'

// Leaflet finishes a zoom animation on a 250ms timer that isn't cancelled when the map is
// removed, so leaving the home screen mid-zoom threw "Cannot read properties of undefined
// (reading '_leaflet_pos')". Make that late callback a no-op once the map is gone.
{
  const proto = LeafletMapClass.prototype as unknown as { _onZoomTransitionEnd: (this: { _mapPane?: unknown }) => void; __dealeonePatched?: boolean }
  if (!proto.__dealeonePatched) {
    const original = proto._onZoomTransitionEnd
    proto._onZoomTransitionEnd = function () {
      if (!this._mapPane) return
      return original.call(this)
    }
    proto.__dealeonePatched = true
  }
}

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
function escapeHtml(v: string): string {
  return v.replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' })[c]!)
}

function pinIcon(listing: Listing, active: boolean, lowData = false) {
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
  // Leaflet divIcons are raw HTML strings, so anything user-supplied (the title, the photo
  // value) MUST be escaped — an unescaped title or image string was a stored-XSS hole that
  // ran a seller's script on every map it appeared on. Only real photo data URLs are used
  // as <img> sources here; anything else falls back to the category glyph.
  // Stored photos use the small thumbnail (~10-20 KB) — a map can show dozens of pins.
  const isStored = !lowData && typeof image === 'string' && /^\/api\/media\/[0-9a-f-]{36}$/.test(image)
  const isInline = !lowData && typeof image === 'string' && /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)
  const content = isStored || isInline
    ? `<img src="${escapeHtml(isStored ? mediaSrc(image, 'thumb') : image)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:9999px;" />`
    : glyph

  const label = escapeHtml(title.length > 18 ? `${title.slice(0, 17)}…` : title)

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
// "Centre on this point" within the part of the map you can actually see — the strip
// between the count/locate row on top and the cards + nav floating over the bottom.
function centreInVisible(map: LeafletMap, lat: number, lng: number, zoom: number, topInset: number, bottomInset: number) {
  const shift = (bottomInset - topInset) / 2
  const target = shift ? map.unproject(map.project([lat, lng], zoom).add([0, shift]), zoom) : ([lat, lng] as [number, number])
  map.setView(target, zoom, { animate: true })
}

function RecenterOnRadius({
  lat,
  lng,
  radiusKm,
  recenterTrigger,
  justWentLive,
  topInset,
  bottomInset,
}: {
  lat: number
  lng: number
  radiusKm: number
  recenterTrigger?: number
  justWentLive: boolean
  topInset: number
  bottomInset: number
}) {
  const map = useMap()
  useEffect(() => {
    centreInVisible(map, lat, lng, RADIUS_ZOOM[radiusKm] ?? 15, topInset, bottomInset)
    // Radius changes are handled by FitToResults below (they're a filter change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterTrigger, justWentLive, map])
  return null
}

// After any filter change (category, distance, price, search words…) re-frame the map on
// what now matches, inside the visible strip. Before this, the map stayed wherever it was,
// so the matching pins were often left up under the top controls or off the edge.
function FitToResults({
  fitKey,
  listings,
  lat,
  lng,
  radiusKm,
  topInset,
  bottomInset,
}: {
  fitKey?: string
  listings: Listing[]
  lat: number
  lng: number
  radiusKm: number
  topInset: number
  bottomInset: number
}) {
  const map = useMap()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    // Let the new results render (and the card strip resize) before measuring.
    const t = setTimeout(() => {
      if (!listings.length) {
        centreInVisible(map, lat, lng, RADIUS_ZOOM[radiusKm] ?? 15, topInset, bottomInset)
        return
      }
      const bounds = latLngBounds([[lat, lng], ...listings.map((l) => [l.lat, l.lng] as [number, number])])
      map.fitBounds(bounds, {
        // A pin's artwork hangs mostly *below* its point (anchor 17px from the top of a
        // 60px icon: the round badge, then the title label), so the bottom needs more room.
        paddingTopLeft: [48, topInset + 24],
        paddingBottomRight: [48, bottomInset + 48],
        maxZoom: Math.max(RADIUS_ZOOM[radiusKm] ?? 15, 15),
        animate: true,
      })
    }, 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])
  return null
}

// Keeps Leaflet's bottom controls (the map credits) just above the floating cards.
function LiftBottomControls({ bottomInset }: { bottomInset: number }) {
  const map = useMap()
  useEffect(() => {
    map
      .getContainer()
      .querySelectorAll<HTMLElement>('.leaflet-bottom')
      .forEach((el) => (el.style.bottom = `${bottomInset}px`))
  }, [map, bottomInset])
  return null
}

// Swiping the cards selects a listing; if its pin is hidden behind the cards (or off the
// edge of the screen), glide the map just enough to bring it into the visible area.
function KeepSelectedVisible({ listing, topInset, bottomInset }: { listing?: Listing; topInset: number; bottomInset: number }) {
  const map = useMap()
  useEffect(() => {
    if (!listing) return
    const size = map.getSize()
    const p = map.latLngToContainerPoint([listing.lat, listing.lng])
    // Pin artwork: 17px above its point, 43px below (badge + title label).
    const top = topInset + 24
    const bottom = size.y - bottomInset - 48
    const left = 40
    const right = size.x - 40
    const dx = p.x < left ? p.x - left : p.x > right ? p.x - right : 0
    const dy = p.y > bottom ? p.y - bottom : p.y < top ? p.y - top : 0
    if (dx || dy) map.panBy([dx, dy], { animate: true, duration: 0.35 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?.id])
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
  bottomInset = 0,
  topInset = 0,
  fitKey,
}: {
  listings: Listing[]
  radiusKm: number
  selectedId: string | null
  onSelect: (id: string) => void
  recenterTrigger?: number
  userLocation: LiveLocation
  // Height (px) of whatever floats over the bottom of the map (Explore's listing cards).
  bottomInset?: number
  // Height (px) of what floats over the top (the count + locate row).
  topInset?: number
  // Changes whenever the filters change → the map re-frames on the new results.
  fitKey?: string
}) {
  const { lowData } = useApp()
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
      attributionControl={false}
      className="absolute inset-0"
    >
      <AttributionControl position="bottomright" />
      <LiftBottomControls bottomInset={bottomInset} />
      <TileLayer
        url={TILE_URL}
        attribution={TILE_ATTRIBUTION}
      />
      <InvalidateSizeOnResize />
      <RecenterOnRadius
        lat={lat}
        lng={lng}
        radiusKm={radiusKm}
        recenterTrigger={recenterTrigger}
        justWentLive={justWentLive}
        topInset={topInset}
        bottomInset={bottomInset}
      />
      <FitToResults
        fitKey={fitKey}
        listings={listings}
        lat={lat}
        lng={lng}
        radiusKm={radiusKm}
        topInset={topInset}
        bottomInset={bottomInset}
      />
      <KeepSelectedVisible listing={listings.find((l) => l.id === selectedId)} topInset={topInset} bottomInset={bottomInset} />
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
          icon={pinIcon(l, l.id === selectedId, lowData)}
          eventHandlers={{ click: () => onSelect(l.id) }}
        />
      ))}
    </MapContainer>
  )
}
