import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet'
import { divIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'

/** Single-listing map for ListingDetail — a focused, street-level view of one item, unlike
 * MapView's multi-pin city overview. Two modes:
 *  - exact: a glowing pin at the real coordinates, zoomed in tight enough that street names
 *    are legible on the tile layer itself.
 *  - approximate: no pin at all (a pin would imply precision that isn't real) — just a soft
 *    shaded circle over the general area, zoomed out a little further, so buyers get "this
 *    neighborhood" without a false sense of exactness. */
export default function MiniMap({
  lat,
  lng,
  precision,
}: {
  lat: number
  lng: number
  precision: 'exact' | 'approximate'
}) {
  const zoom = precision === 'exact' ? 17 : 15

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={zoom}
      zoomControl={false}
      dragging={true}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      attributionControl={true}
      className="h-full w-full"
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
      />
      {precision === 'exact' ? (
        <Marker
          position={[lat, lng]}
          icon={divIcon({
            className: '',
            html: `<div style="
              width:20px;height:20px;border-radius:9999px;
              background:linear-gradient(180deg,#a6e64b,#84d61c);
              border:2px solid #ffffff;
              box-shadow:0 1px 4px rgba(0,0,0,0.25), 0 0 0 5px rgba(36,91,50,0.18), 0 0 16px rgba(132,214,28,0.5);
            "></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          })}
        />
      ) : (
        <Circle
          center={[lat, lng]}
          radius={280}
          pathOptions={{ color: '#245b32', weight: 1.5, fillOpacity: 0.12, opacity: 0.45 }}
        />
      )}
    </MapContainer>
  )
}
