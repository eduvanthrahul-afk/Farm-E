import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ExternalLink, LocateFixed, MapPin, Maximize2, Minus, Moon, Plus, Sun } from 'lucide-react';
import { locationsApi } from '@/api/index';

const INDIA_CENTER = [22.9734, 78.6569];

const readPoint = (point) => {
  if (Array.isArray(point) && point.length === 2) {
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) && (lng !== 0 || lat !== 0) ? { lat, lng } : null;
  }
  if (point?.type === 'Point' && Array.isArray(point.coordinates)) return readPoint(point.coordinates);
  if (Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng))) {
    return { lat: Number(point.lat), lng: Number(point.lng) };
  }
  return null;
};

const osmUrl = (points) => {
  const valid = points.map((entry) => readPoint(entry.position)).filter(Boolean);
  if (valid.length > 1) {
    const [from, to] = valid;
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${from.lat}%2C${from.lng}%3B${to.lat}%2C${to.lng}`;
  }
  if (valid[0]) return `https://www.openstreetmap.org/?mlat=${valid[0].lat}&mlon=${valid[0].lng}#map=13/${valid[0].lat}/${valid[0].lng}`;
  return 'https://www.openstreetmap.org/';
};

const getStraightLineDistanceKm = (points) => {
  const [from, to] = points.slice(0, 2).map((location) => readPoint(location.position));
  if (!from || !to) return null;
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latDelta = radians(to.lat - from.lat);
  const lngDelta = radians(to.lng - from.lng);
  const value = Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(lngDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const makeMarker = (label) => L.divIcon({
  className: 'farm-map-marker-wrap',
  html: `<span class="farm-map-marker"><span>${label || ''}</span></span>`,
  iconSize: [30, 38],
  iconAnchor: [15, 34],
});

const formatLocationAccuracy = (meters) => meters >= 1000
  ? `±${(meters / 1000).toFixed(1)} km accuracy`
  : `±${Math.max(1, Math.round(meters))} m accuracy`;

/** Interactive OpenStreetMap location picker and multi-point route preview. */
export default function OpenStreetMapField({ value, onChange, onLocationResolved, interactive = false, locations = [], routeGeometry, routeSummary, routeState, className = '' }) {
  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const mapControlsRef = useRef(null);
  const markersRef = useRef([]);
  const accuracyCircleRef = useRef(null);
  const routeRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onLocationResolvedRef = useRef(onLocationResolved);
  const reverseTimerRef = useRef(null);
  const reverseRequestIdRef = useRef(0);
  const [mapReady, setMapReady] = useState(false);
  const [isDarkMap, setIsDarkMap] = useState(true);
  const [mapError, setMapError] = useState('');
  const [addressStatus, setAddressStatus] = useState('');
  const [locationAccuracy, setLocationAccuracy] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const selectedPoint = readPoint(value);
  const selectedLatitude = selectedPoint?.lat;
  const selectedLongitude = selectedPoint?.lng;
  const mapLocations = interactive
    ? (selectedPoint ? [{ position: selectedPoint, label: 'Selected location' }] : [])
    : locations;
  const validLocations = mapLocations
    .map((location) => ({ ...location, position: readPoint(location.position) }))
    .filter((location) => location.position);
  const pointsKey = validLocations.map(({ position }) => `${position.lat},${position.lng}`).join('|');
  const routePoints = Array.isArray(routeGeometry?.coordinates)
    ? routeGeometry.coordinates.map(readPoint).filter(Boolean)
    : [];
  const routeKey = routePoints.map(({ lat, lng }) => `${lat},${lng}`).join('|');

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onLocationResolvedRef.current = onLocationResolved; }, [onLocationResolved]);
  useEffect(() => {
    if (mapControlsRef.current) L.DomEvent.disableClickPropagation(mapControlsRef.current);
  }, [mapReady]);

  const selectPoint = useCallback((coordinates, reportedAccuracyMeters = null) => {
    setLocationAccuracy(Number.isFinite(reportedAccuracyMeters) && reportedAccuracyMeters > 0
      ? reportedAccuracyMeters
      : null);
    onChangeRef.current?.(coordinates);
    if (!onLocationResolvedRef.current) return;

    window.clearTimeout(reverseTimerRef.current);
    const requestId = ++reverseRequestIdRef.current;
    setMapError('');
    setAddressStatus('Finding the address for this pin…');
    reverseTimerRef.current = window.setTimeout(async () => {
      try {
        const response = await locationsApi.reverseGeocode(coordinates);
        if (requestId !== reverseRequestIdRef.current) return;
        onLocationResolvedRef.current?.(response.data.data.location);
        setAddressStatus('Address details filled. Please review them before saving.');
      } catch {
        if (requestId !== reverseRequestIdRef.current) return;
        setAddressStatus('');
        setMapError('Could not find address details. You can enter them manually.');
      }
    }, 600);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(reverseTimerRef.current);
    reverseRequestIdRef.current += 1;
  }, []);

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return undefined;
    const map = L.map(mapElement.current, {
      center: INDIA_CENTER,
      zoom: 5,
      zoomControl: false,
      scrollWheelZoom: false,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);
    if (interactive) {
      map.on('click', (event) => selectPoint([event.latlng.lng, event.latlng.lat]));
    }
    mapRef.current = map;
    setMapReady(true);
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [interactive, selectPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    accuracyCircleRef.current?.remove();
    accuracyCircleRef.current = null;
    routeRef.current?.remove();
    routeRef.current = null;

    validLocations.forEach((location, index) => {
      const marker = L.marker([location.position.lat, location.position.lng], {
        icon: makeMarker(interactive ? '' : String(index + 1)),
        draggable: interactive,
        title: location.label || `Location ${index + 1}`,
      }).addTo(map);
      if (interactive) marker.on('dragend', (event) => {
        const point = event.target.getLatLng();
        selectPoint([point.lng, point.lat]);
      });
      markersRef.current.push(marker);
    });

    if (validLocations.length > 1) {
      const points = routePoints.length > 1
        ? routePoints.map((point) => [point.lat, point.lng])
        : validLocations.map(({ position }) => [position.lat, position.lng]);
      routeRef.current = L.polyline(points, { color: '#16845b', weight: 4, opacity: 0.82 }).addTo(map);
      map.fitBounds(routeRef.current.getBounds(), { padding: [36, 36], maxZoom: 12 });
    } else if (validLocations.length === 1) {
      const zoom = !interactive || !locationAccuracy ? (interactive ? 13 : 11)
        : locationAccuracy <= 20 ? 17
          : locationAccuracy <= 50 ? 16
            : locationAccuracy <= 100 ? 15
              : locationAccuracy <= 250 ? 14 : 13;
      map.setView([validLocations[0].position.lat, validLocations[0].position.lng], zoom);
    } else {
      map.setView(INDIA_CENTER, 5);
    }
  // pointsKey captures location coordinate changes without recreating the map.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, pointsKey, routeKey, interactive, selectPoint, locationAccuracy]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !interactive || selectedLatitude === undefined || selectedLongitude === undefined || !locationAccuracy) return undefined;
    accuracyCircleRef.current = L.circle([selectedLatitude, selectedLongitude], {
      radius: locationAccuracy,
      color: '#24804d',
      weight: 1.5,
      opacity: 0.85,
      fillColor: '#48a66d',
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(map);
    return () => {
      accuracyCircleRef.current?.remove();
      accuracyCircleRef.current = null;
    };
  }, [interactive, locationAccuracy, mapReady, pointsKey, selectedLatitude, selectedLongitude]);

  const locateMe = useCallback(() => {
    if (!navigator.geolocation) {
      setMapError('Location services are not available in this browser.');
      return;
    }
    setMapError('');
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setIsLocating(false);
        selectPoint([coords.longitude, coords.latitude], coords.accuracy);
      },
      (error) => {
        setIsLocating(false);
        if (error.code === 1) {
          setMapError('Location access is blocked. Allow it in your browser site settings, then try again.');
        } else if (error.code === 2) {
          setMapError('Your device could not get a location fix. Turn on device location or place the pin manually.');
        } else {
          setMapError('High-accuracy location timed out. Try again where you have a clearer signal, or place the pin manually.');
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, [selectPoint]);

  const fitMap = () => {
    const map = mapRef.current;
    if (!map) return;
    const points = validLocations.map(({ position }) => [position.lat, position.lng]);
    if (routeRef.current) map.fitBounds(routeRef.current.getBounds(), { padding: [44, 44], maxZoom: 13, animate: true });
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [44, 44], maxZoom: 13, animate: true });
    else if (points.length === 1) map.flyTo(points[0], interactive ? 14 : 12, { duration: 0.55 });
    else map.flyTo(INDIA_CENTER, 5, { duration: 0.55 });
  };

  const mapUrl = osmUrl(mapLocations.length ? mapLocations : [{ position: value }]);
  const distanceKm = getStraightLineDistanceKm(validLocations);
  const routeMinutes = Number.isFinite(Number(routeSummary?.durationSeconds))
    ? Math.max(1, Math.round(Number(routeSummary.durationSeconds) / 60))
    : null;
  const routeDuration = routeMinutes === null ? '' : routeMinutes < 60
    ? `${routeMinutes} min`
    : `${Math.floor(routeMinutes / 60)} hr${Math.floor(routeMinutes / 60) === 1 ? '' : 's'} ${routeMinutes % 60} min`;

  return (
    <div className={`farm-location-map ${className}`}>
      <div className="farm-location-map-heading">
        <div className="farm-location-map-title"><span className="farm-location-map-icon"><MapPin size={16} /></span><div><span>FARM-E LOCATION</span><b>{interactive ? 'Choose a farm pin' : 'Farm location'}</b></div></div>
        <div className="farm-location-map-actions">
          {interactive && <button type="button" onClick={locateMe} className="farm-location-action" disabled={isLocating} aria-busy={isLocating}><LocateFixed size={14} /> {isLocating ? 'Getting location…' : 'Use my location'}</button>}
          <button type="button" onClick={() => setIsDarkMap((value) => !value)} className="farm-location-action" aria-label={isDarkMap ? 'Switch to light map' : 'Switch to dark map'} title={isDarkMap ? 'Switch to light map' : 'Switch to dark map'}>{isDarkMap ? <Sun size={14} /> : <Moon size={14} />}<span>{isDarkMap ? 'Light map' : 'Dark map'}</span></button>
          <span className="farm-location-privacy" aria-live="polite" title={interactive ? 'Your farm pin is private. Public listings use an approximate area.' : 'Farm locations are approximate to protect privacy.'}><i />{interactive ? (selectedPoint ? (locationAccuracy ? formatLocationAccuracy(locationAccuracy) : 'Private pin') : 'No pin yet') : 'Approximate'}</span>
          <a href={mapUrl} target="_blank" rel="noreferrer" className="farm-location-action farm-location-external">Open map <ExternalLink size={13} /></a>
        </div>
      </div>
      <div className="farm-location-map-canvas-wrap">
        <div ref={mapElement} className={`farm-location-map-canvas ${isDarkMap ? 'is-dark-map' : ''}`} aria-label={interactive ? 'Map for selecting your private farm location' : 'Approximate farm location on OpenStreetMap'} />
        <div ref={mapControlsRef} className="farm-location-map-controls" role="group" aria-label="Location map controls">
          <button type="button" title="Fit location" aria-label="Fit location" onClick={fitMap}><Maximize2 size={15} /></button><span />
          <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}><Plus size={17} /></button>
          <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}><Minus size={17} /></button>
        </div>
        {interactive && !selectedPoint && <div className="farm-map-select-hint">Click the map to drop a pin</div>}
      </div>
      {interactive && <p className="farm-location-map-note">Use your device location for a fresh high-accuracy fix, then drag the pin to refine it. The circle shows the accuracy reported by your device. Public listings display an approximate area; your exact farm pin stays private.</p>}
      {interactive && addressStatus && <p role="status" aria-live="polite" className="farm-location-map-status">{addressStatus}</p>}
      {interactive && locationAccuracy !== null && <p role="status" aria-live="polite" className="farm-location-map-status">Your device reports {formatLocationAccuracy(locationAccuracy)}; the circle shows that radius. Public listing maps still show an approximate area.</p>}
      {validLocations.length > 1 && <div className="farm-location-map-points">{validLocations.map((location, index) => <span key={`${location.label}-${index}`}><b>{index + 1}</b>{location.label}</span>)}</div>}
      {routeState === 'loading' && <p role="status" className="farm-location-map-status">Calculating driving distance and travel time…</p>}
      {routeSummary && <p className="farm-location-map-status">Driving route: {(Number(routeSummary.distanceMeters) / 1000).toFixed(1)} km · estimated {routeDuration}. Traffic is not included.</p>}
      {!routeSummary && routeState === 'unavailable' && distanceKm !== null && <p className="farm-location-map-status is-warning">Driving route unavailable. The line shows about {Math.round(distanceKm)} km straight-line distance.</p>}
      {!routeSummary && !routeState && distanceKm !== null && <p className="farm-location-map-status">Approx. {Math.round(distanceKm)} km straight-line distance.</p>}
      {mapError && <p role="status" className="farm-location-map-status is-warning">{mapError}</p>}
    </div>
  );
}
