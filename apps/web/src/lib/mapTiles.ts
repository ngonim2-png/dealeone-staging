// Map tiles: CARTO "Voyager" basemap, with the project's CARTO API key. Tile URLs are
// requested straight from the phone, so the key is visible to anyone using the app — that's
// normal for map tiles; restrict it to your domains in the CARTO dashboard. To rotate the
// key without a code change, set VITE_MAP_TILES_URL on the web service and redeploy.
export const TILE_URL =
  import.meta.env.VITE_MAP_TILES_URL ??
  'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_433z_1_1d57e50ffc472730362387d8'

export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
