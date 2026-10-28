import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, Maximize, Minus, Moon, Plus, Sun } from 'lucide-react';
import { formatINR, formatQty } from '@/utils/format';
import { cropThumbnail } from '@/utils/cropThumbnail';
import { addFarmBaseMap } from './mapTiles';

const INDIA_CENTER = [22.9734, 78.6569];
const MARKER_CELL_PIXELS = 62;

const pointFromListing = (listing) => {
  const coordinates = listing.location?.coordinates?.coordinates || listing.farm?.location?.coordinates?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const listingPopup = (listings) => {
  const content = document.createElement('div');
  content.className = 'farm-market-map-popup';
  listings.slice(0, 6).forEach((listing) => {
    const entry = document.createElement('article');
    entry.className = 'farm-market-map-popup-card';
    const image = document.createElement('img');
    image.className = 'farm-market-map-popup-image';
    image.src = listing.images?.[0] || cropThumbnail(listing.crop?.name);
    image.alt = `${listing.crop?.name || 'Fresh produce'} harvest`;
    image.onerror = () => { image.onerror = null; image.src = cropThumbnail(listing.crop?.name); };
    const copy = document.createElement('div');
    copy.className = 'farm-market-map-popup-copy';
    const title = document.createElement('strong');
    title.textContent = listing.crop?.name || 'Produce listing';
    const price = document.createElement('b');
    price.textContent = `${formatINR(listing.pricePerUnit?.expected)} / ${listing.quantity?.unit || 'unit'}`;
    const detail = document.createElement('span');
    detail.textContent = `${formatQty(listing.quantity?.available, listing.quantity?.unit)} available · ${listing.location?.district || listing.farm?.location?.district || 'Farm location private'}`;
    const link = document.createElement('a');
    link.href = `/marketplace/${encodeURIComponent(listing._id)}`;
    link.textContent = 'View harvest';
    copy.append(title, price, detail, link);
    entry.append(image, copy);
    content.append(entry);
  });
  if (listings.length > 6) {
    const more = document.createElement('p');
    more.className = 'farm-market-map-popup-more';
    more.textContent = `+ ${listings.length - 6} more harvests at this location`;
    content.append(more);
  }
  return content;
};

const listingMarker = (listings) => {
  const isCluster = listings.length > 1;
  const item = listings[0];
  const html = isCluster
    ? `<div class="farm-market-marker farm-market-cluster"><b>${listings.length}</b><span>harvests</span></div>`
    : `<div class="farm-market-marker farm-market-price"><span>${escapeHtml(item.crop?.name || 'Fresh crop')}</span><b>${escapeHtml(formatINR(item.pricePerUnit?.expected))}</b></div>`;
  const iconSize = isCluster ? [50, 50] : [118, 48];
  return L.divIcon({
    className: 'farm-market-marker-wrap',
    html,
    iconSize,
    iconAnchor: [iconSize[0] / 2, iconSize[1] / 2],
  });
};

/** Interactive marketplace map with approximate public listing locations. */
export default function MarketplaceMap({ listings, searchCenter, radiusKm, pickSearchPoint, onPickSearchPoint }) {
  const [locationError, setLocationError] = useState('');
  const [isDarkMap, setIsDarkMap] = useState(true);
  const elementRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef([]);
  const initializedViewRef = useRef(false);
  const pickRef = useRef(pickSearchPoint);
  const callbackRef = useRef(onPickSearchPoint);
  const listingsRef = useRef(listings);
  const searchCenterRef = useRef(searchCenter);
  const radiusRef = useRef(radiusKm);

  useEffect(() => { pickRef.current = pickSearchPoint; }, [pickSearchPoint]);
  useEffect(() => { callbackRef.current = onPickSearchPoint; }, [onPickSearchPoint]);
  useEffect(() => { listingsRef.current = listings; }, [listings]);
  useEffect(() => { searchCenterRef.current = searchCenter; }, [searchCenter]);
  useEffect(() => { radiusRef.current = radiusKm; }, [radiusKm]);

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return undefined;
    const map = L.map(elementRef.current, {
      center: INDIA_CENTER,
      zoom: 5,
      scrollWheelZoom: false,
      zoomControl: false,
      preferCanvas: true,
    });
    addFarmBaseMap(map);
    map.on('click', (event) => {
      if (pickRef.current) callbackRef.current?.([event.latlng.lng, event.latlng.lat]);
    });
    mapRef.current = map;
    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(elementRef.current);
    window.setTimeout(() => map.invalidateSize({ pan: false }), 40);
    return () => {
      resizeObserver.disconnect();
      layersRef.current.forEach((layer) => layer.remove());
      layersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const listingsKey = listings.map((listing) => `${listing._id}:${listing.pricePerUnit?.expected}:${listing.quantity?.available}:${listing.images?.[0] || ''}`).join('|');
  const centerLat = searchCenter?.lat;
  const centerLng = searchCenter?.lng;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const drawLayers = () => {
      layersRef.current.forEach((layer) => layer.remove());
      layersRef.current = [];
      const valid = listingsRef.current.map((listing) => ({ listing, point: pointFromListing(listing) })).filter(({ point }) => point);
      const buckets = new Map();
      valid.forEach(({ listing, point }) => {
        const projected = map.latLngToContainerPoint([point.lat, point.lng]);
        const key = `${Math.floor(projected.x / MARKER_CELL_PIXELS)}:${Math.floor(projected.y / MARKER_CELL_PIXELS)}`;
        const bucket = buckets.get(key) || [];
        bucket.push({ listing, point });
        buckets.set(key, bucket);
      });

      for (const bucket of buckets.values()) {
        const lat = bucket.reduce((sum, row) => sum + row.point.lat, 0) / bucket.length;
        const lng = bucket.reduce((sum, row) => sum + row.point.lng, 0) / bucket.length;
        const marker = L.marker([lat, lng], { icon: listingMarker(bucket.map((row) => row.listing)), keyboard: true })
          .bindPopup(listingPopup(bucket.map((row) => row.listing)), { maxWidth: 360, minWidth: 260, className: 'farm-market-map-popup-shell' })
          .addTo(map);
        if (bucket.length > 1) marker.on('click', () => {
          const bounds = L.latLngBounds(bucket.map((row) => [row.point.lat, row.point.lng]));
          if (map.getZoom() < 13) map.fitBounds(bounds, { padding: [56, 56], maxZoom: 13, animate: true });
        });
        layersRef.current.push(marker);
      }

      const center = searchCenterRef.current;
      if (center && Number.isFinite(Number(center.lat)) && Number.isFinite(Number(center.lng))) {
        const circle = L.circle([center.lat, center.lng], {
          radius: Number(radiusRef.current) * 1000,
          color: '#2563eb',
          weight: 2,
          dashArray: '5 7',
          fillColor: '#60a5fa',
          fillOpacity: 0.1,
        }).bindTooltip(`${radiusRef.current} km search area`).addTo(map);
        const pin = L.circleMarker([center.lat, center.lng], {
          radius: 8,
          color: '#fff',
          weight: 3,
          fillColor: '#2563eb',
          fillOpacity: 1,
        }).bindTooltip('Search center').addTo(map);
        layersRef.current.push(circle, pin);
      }

      if (!initializedViewRef.current) {
        if (center) map.setView([center.lat, center.lng], 9);
        else if (valid.length === 1) map.setView([valid[0].point.lat, valid[0].point.lng], 8);
        else if (valid.length > 1) map.fitBounds(L.latLngBounds(valid.map(({ point }) => [point.lat, point.lng])), { padding: [48, 48], maxZoom: 10 });
        initializedViewRef.current = true;
      }
    };

    map.on('moveend', drawLayers);
    map.on('zoomend', drawLayers);
    drawLayers();
    return () => {
      map.off('moveend', drawLayers);
      map.off('zoomend', drawLayers);
      layersRef.current.forEach((layer) => layer.remove());
      layersRef.current = [];
    };
  }, [listingsKey, centerLat, centerLng, radiusKm]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || centerLat == null || centerLng == null) return;
    if (Number.isFinite(Number(centerLat)) && Number.isFinite(Number(centerLng))) map.setView([centerLat, centerLng], Math.max(map.getZoom(), 9), { animate: true });
  }, [centerLat, centerLng]);

  const fitResults = () => {
    const map = mapRef.current;
    if (!map) return;
    const points = listingsRef.current.map(pointFromListing).filter(Boolean).map(({ lat, lng }) => [lat, lng]);
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 11, animate: true });
    else if (points.length === 1) map.flyTo(points[0], 9);
    else if (searchCenterRef.current) map.flyTo([searchCenterRef.current.lat, searchCenterRef.current.lng], 9);
    else map.setView(INDIA_CENTER, 5, { animate: true });
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Location services are not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setLocationError(''); callbackRef.current?.([coords.longitude, coords.latitude]); },
      (error) => {
        if (error.code === 1) setLocationError('Allow location access in your browser settings, or choose a point on the map.');
        else if (error.code === 2) setLocationError('Your device could not get a location fix. Turn on device location or choose a point on the map.');
        else setLocationError('High-accuracy location timed out. Try again where you have a clearer signal, or choose a point on the map.');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const validLocationCount = listings.filter(pointFromListing).length;

  return (
    <div className="market-map-shell">
      <div className="market-map-heading">
        <div><span className="market-map-eyebrow">LIVE MARKET VIEW</span><h2>Harvests around you</h2><p>Explore approximate farm locations, price and availability.</p></div>
        <div className="market-map-heading-actions">
          <button type="button" className="market-map-theme-toggle" onClick={() => setIsDarkMap((value) => !value)} aria-label={isDarkMap ? 'Switch to light map' : 'Switch to dark map'} title={isDarkMap ? 'Switch to light map' : 'Switch to dark map'}>{isDarkMap ? <Sun size={15} /> : <Moon size={15} />}<span>{isDarkMap ? 'Light map' : 'Dark map'}</span></button>
          <span className="market-map-count"><i /> {listings.length} {listings.length === 1 ? 'listing' : 'listings'}</span>
        </div>
      </div>
      <div className="market-map-frame">
        <div ref={elementRef} className={`market-map-canvas ${isDarkMap ? 'is-dark-map' : ''}`} aria-label="Interactive map of available produce listings" />
        <div className="market-map-controls" role="group" aria-label="Map controls" onClick={(event) => event.stopPropagation()}>
          <button type="button" title="Fit listings on map" aria-label="Fit listings on map" onClick={fitResults}><Maximize size={17} /></button>
          <span />
          <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}><Plus size={18} /></button>
          <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}><Minus size={18} /></button>
          {onPickSearchPoint && <><span /><button type="button" title="Use current location as search center" aria-label="Use my location on the map" onClick={useMyLocation}><LocateFixed size={17} /></button></>}
        </div>
        {pickSearchPoint && <div className="market-map-pick-hint">Click anywhere on the map to choose your search center</div>}
        {validLocationCount === 0 && <div className="market-map-empty-hint">No location pins are available for these listings yet.</div>}
        {locationError && <div role="status" className="market-map-location-error">{locationError}</div>}
      </div>
      <div className="market-map-footer"><span><i className="market-map-legend-pin" /> Listing price</span><span><i className="market-map-legend-cluster" /> Multiple harvests</span><span>Locations are approximate to protect farm privacy.</span></div>
    </div>
  );
}
