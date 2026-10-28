'use strict';

const config = require('../config/env');

const cache = new Map();
let lastRequestAt = 0;
let requestQueue = Promise.resolve();

const first = (...values) => values.find((value) => typeof value === 'string' && value.trim())?.trim() || '';

const uniqueParts = (parts) => [...new Set(parts.map((part) => String(part || '').trim()).filter(Boolean))];

const normalizeAddress = (result) => {
  const parts = result.address || {};
  const locality = first(parts.village, parts.hamlet, parts.suburb, parts.town, parts.city_district, parts.city);
  const road = [parts.house_number, parts.road].filter(Boolean).join(' ');
  const address = uniqueParts([road, parts.neighbourhood, locality, parts.county, parts.state, parts.postcode, parts.country]).join(', ');

  return {
    address: address || result.display_name || '',
    village: locality,
    district: first(parts.state_district, parts.county, parts.district, parts.city_district, parts.city, parts.town),
    state: first(parts.state),
    pincode: first(parts.postcode),
    displayName: result.display_name || '',
  };
};

const reverseGeocode = (lat, lng) => {
  const key = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key));

  const lookup = requestQueue.then(async () => {
    if (cache.has(key)) return cache.get(key);
    const waitMs = Math.max(0, 1000 - (Date.now() - lastRequestAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastRequestAt = Date.now();

    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.search = new URLSearchParams({
      format: 'jsonv2',
      lat: String(lat),
      lon: String(lng),
      zoom: '18',
      addressdetails: '1',
      'accept-language': 'en',
    }).toString();
    const response = await fetch(url, {
      headers: { 'User-Agent': config.geocoding.userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Address lookup service returned ${response.status}`);
    const result = await response.json();
    if (!result?.address && !result?.display_name) throw new Error('No address was found for that map pin');

    const location = normalizeAddress(result);
    if (cache.size >= 500) cache.delete(cache.keys().next().value);
    cache.set(key, location);
    return location;
  });
  requestQueue = lookup.catch(() => undefined);
  return lookup;
};

module.exports = { reverseGeocode };
