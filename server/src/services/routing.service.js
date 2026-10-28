'use strict';

const config = require('../config/env');

const cache = new Map();
let lastRequestAt = 0;
let requestQueue = Promise.resolve();
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_LIMIT = 500;

const validPoint = (point) => Array.isArray(point) && point.length === 2 &&
  Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])) &&
  Math.abs(Number(point[0])) <= 180 && Math.abs(Number(point[1])) <= 90 &&
  (Number(point[0]) !== 0 || Number(point[1]) !== 0);

const getDrivingRoute = async (from, to) => {
  if (!validPoint(from) || !validPoint(to)) return null;

  // Round coordinates to about 11 m before sending them to the routing service.
  const rounded = [from, to].map(([lng, lat]) => [Number(lng).toFixed(4), Number(lat).toFixed(4)]);
  const key = rounded.map((point) => point.join(',')).join(';');
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.route;
  if (cached) cache.delete(key);

  const lookup = requestQueue.then(async () => {
    const queuedCache = cache.get(key);
    if (queuedCache && queuedCache.expiresAt > Date.now()) return queuedCache.route;
    const delay = Math.max(0, 1000 - (Date.now() - lastRequestAt));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastRequestAt = Date.now();

    const baseUrl = config.maps.routingBaseUrl.replace(/\/$/, '');
    const coordinates = rounded.map((point) => point.join(',')).join(';');
    const url = `${baseUrl}/route/v1/driving/${coordinates}?overview=simplified&geometries=geojson&steps=false`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Farm-E/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const result = await response.json();
    const route = result.code === 'Ok' ? result.routes?.[0] : null;
    if (!Number.isFinite(route?.distance) || !Number.isFinite(route?.duration) ||
        route.geometry?.type !== 'LineString' || !Array.isArray(route.geometry.coordinates)) return null;

    const value = {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      geometry: route.geometry,
      source: 'OpenStreetMap / OSRM',
    };
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
    cache.set(key, { route: value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  });

  requestQueue = lookup.catch(() => undefined);
  try {
    return await lookup;
  } catch {
    return null;
  }
};

module.exports = { getDrivingRoute };
