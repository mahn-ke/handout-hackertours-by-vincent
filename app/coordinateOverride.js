const GEOCODE_URL = 'https://api.geoapify.com/v1/geocode/reverse';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 512;
const addressCache = new Map();

function normalizeCoordinate(value, min, max, name) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}.`);
  }
  return coordinate;
}

async function reverseGeocode(latitude, longitude, apiKey, fetchImpl) {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('format', 'json');
  url.searchParams.set('apiKey', apiKey);

  const response = await fetchImpl(url, {
    headers: {Accept: 'application/json'},
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Reverse geocoding failed (${response.status}).`);
  const payload = await response.json();
  const address = payload.results?.[0]?.formatted;
  if (!address) throw new Error('No address found near the supplied coordinates.');
  return address;
}

async function cachedReverseGeocode(latitude, longitude, apiKey, fetchImpl) {
  const cacheKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  const cached = addressCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = reverseGeocode(latitude, longitude, apiKey, fetchImpl);
  addressCache.set(cacheKey, {expiresAt: Date.now() + CACHE_TTL_MS, promise});
  if (addressCache.size > CACHE_LIMIT) {
    addressCache.delete(addressCache.keys().next().value);
  }
  try {
    return await promise;
  } catch (error) {
    addressCache.delete(cacheKey);
    throw error;
  }
}

export async function resolveDestination(address, latitudeValue, longitudeValue, options = {}) {
  const label = String(address || '').trim();
  const latitude = normalizeCoordinate(latitudeValue, -90, 90, 'toLat');
  const longitude = normalizeCoordinate(longitudeValue, -180, 180, 'toLon');
  if (latitude === null && longitude === null) {
    if (!label) throw new Error('A destination address or coordinate pair is required.');
    return {routingQuery: label, displayAddress: label};
  }
  if (latitude === null || longitude === null) {
    throw new Error('Both toLat and toLon are required for a coordinate override.');
  }

  const apiKey = options.apiKey ?? process.env.GEOAPIFY_API_KEY;
  if (!apiKey) throw new Error('GEOAPIFY_API_KEY is required for coordinate overrides.');
  const routingQuery = await cachedReverseGeocode(
    latitude,
    longitude,
    apiKey,
    options.fetchImpl || fetch,
  );
  return {routingQuery, displayAddress: label || routingQuery};
}

export function clearCoordinateCache() {
  addressCache.clear();
}