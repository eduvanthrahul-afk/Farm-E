import L from 'leaflet';

const cartoKey = import.meta.env.VITE_CARTO_BASEMAP_KEY?.trim();
const cartoTileUrl = 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const openStreetMapTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const cartoAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';
const openStreetMapAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/** Add the production CARTO basemap when configured, retaining OSM for local development. */
export function addFarmBaseMap(map) {
  const hasCartoKey = Boolean(cartoKey);
  const url = hasCartoKey
    ? `${cartoTileUrl}?key=${encodeURIComponent(cartoKey)}`
    : openStreetMapTileUrl;

  return L.tileLayer(url, {
    maxZoom: 19,
    attribution: hasCartoKey ? cartoAttribution : openStreetMapAttribution,
  }).addTo(map);
}

