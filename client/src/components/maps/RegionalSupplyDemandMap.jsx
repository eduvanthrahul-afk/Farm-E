import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Moon, Sun } from 'lucide-react';
import { addFarmBaseMap } from './mapTiles';

const INDIA_CENTER = [22.9734, 78.6569];

const regionalPopup = (cell) => {
  const content = document.createElement('div');
  const heading = document.createElement('strong');
  heading.className = 'block text-sm text-slate-900';
  heading.textContent = 'Regional activity';
  const supply = document.createElement('p');
  supply.className = 'mt-1 text-xs text-emerald-800';
  supply.textContent = `${cell.listings} active ${cell.listings === 1 ? 'listing' : 'listings'}`;
  const demand = document.createElement('p');
  demand.className = 'text-xs text-amber-800';
  demand.textContent = `${cell.requirements} open ${cell.requirements === 1 ? 'buyer request' : 'buyer requests'}`;
  content.append(heading, supply, demand);
  return content;
};

/** Aggregated 0.25-degree cells; never plots individual buyer or farm coordinates. */
export default function RegionalSupplyDemandMap({ cells = [] }) {
  const [isDarkMap, setIsDarkMap] = useState(true);
  const elementRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef([]);
  const cellsRef = useRef(cells);
  const cellsKey = cells.map((cell) => `${cell.coordinates?.join(',')}:${cell.listings}:${cell.requirements}`).join('|');

  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return undefined;
    const map = L.map(elementRef.current, { center: INDIA_CENTER, zoom: 5, scrollWheelZoom: false });
    addFarmBaseMap(map);
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      layersRef.current.forEach((layer) => layer.remove());
      layersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    layersRef.current.forEach((layer) => layer.remove());
    layersRef.current = [];

    const points = [];
    cellsRef.current.forEach((cell) => {
      const [lng, lat] = cell.coordinates || [];
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
      const supply = Number(cell.listings) || 0;
      const demand = Number(cell.requirements) || 0;
      const color = supply > demand ? '#16845b' : demand > supply ? '#d97706' : '#2563eb';
      const radius = Math.min(24, 8 + Math.sqrt(supply + demand) * 2);
      const marker = L.circleMarker([lat, lng], {
        radius,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.82,
      }).bindPopup(regionalPopup(cell)).addTo(map);
      points.push([lat, lng]);
      layersRef.current.push(marker);
    });

    if (points.length === 1) map.setView(points[0], 7);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 7 });
    else map.setView(INDIA_CENTER, 5);

    return () => {
      layersRef.current.forEach((layer) => layer.remove());
      layersRef.current = [];
    };
  }, [cellsKey]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="regional-supply-map-frame">
        <div ref={elementRef} className={`regional-supply-map-canvas h-[min(60vh,500px)] min-h-[320px] w-full bg-emerald-50 ${isDarkMap ? 'is-dark-map' : ''}`} aria-label="Aggregated regional supply and buyer demand map" />
        <button type="button" className="regional-map-theme-toggle" onClick={() => setIsDarkMap((value) => !value)} aria-label={isDarkMap ? 'Switch to light map' : 'Switch to dark map'} title={isDarkMap ? 'Switch to light map' : 'Switch to dark map'}>{isDarkMap ? <Sun size={15} /> : <Moon size={15} />}<span>{isDarkMap ? 'Light map' : 'Dark map'}</span></button>
      </div>
      <div className="flex flex-wrap gap-4 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-emerald-700" /> More listings</span>
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-amber-600" /> More buyer requests</span>
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-blue-600" /> Similar activity</span>
        <span>Each point combines a broad region, not an exact address.</span>
      </div>
    </div>
  );
}
