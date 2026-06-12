import { encodeGeohash } from './geohash';

const BROWSER_AREA_CACHE_KEY = 'noteds:browser-area';
const BROWSER_AREA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface BrowserArea {
  label: string;
  geohash: string;
  latitude: number;
  longitude: number;
  country?: string;
  state?: string;
  city?: string;
  suburb?: string;
  postcode?: string;
  detectedAt: number;
}

export interface LocationSuggestion {
  label: string;
  geohash: string;
  latitude: number;
  longitude: number;
  country?: string;
  state?: string;
  city?: string;
  suburb?: string;
  postcode?: string;
}

interface NominatimGeocodeJson {
  features?: Array<{
    properties?: {
      geocoding?: {
        label?: string;
        country?: string;
        state?: string;
        city?: string;
        town?: string;
        village?: string;
        suburb?: string;
        neighbourhood?: string;
        postcode?: string;
        admin?: {
          level2?: string;
          level4?: string;
          level6?: string;
          level7?: string;
          level8?: string;
        };
      };
    };
  }>;
}

interface NominatimSearchJsonItem {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    country?: string;
    state?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    neighbourhood?: string;
    postcode?: string;
  };
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function safeReadCache(): BrowserArea | null {
  if (!isBrowser()) return null;
  const stored = localStorage.getItem(BROWSER_AREA_CACHE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as BrowserArea;
    if (
      typeof parsed?.label !== 'string' ||
      typeof parsed?.geohash !== 'string' ||
      typeof parsed?.latitude !== 'number' ||
      typeof parsed?.longitude !== 'number' ||
      typeof parsed?.detectedAt !== 'number'
    ) {
      return null;
    }
    if (Date.now() - parsed.detectedAt > BROWSER_AREA_CACHE_TTL_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(area: BrowserArea): void {
  if (!isBrowser()) return;
  localStorage.setItem(BROWSER_AREA_CACHE_KEY, JSON.stringify(area));
}

export function getCachedBrowserArea(): BrowserArea | null {
  return safeReadCache();
}

export function clearCachedBrowserArea(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(BROWSER_AREA_CACHE_KEY);
}

export function formatAreaLabel(parts: {
  suburb?: string;
  city?: string;
  state?: string;
  country?: string;
}): string {
  const values = [parts.suburb, parts.city, parts.state, parts.country].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
  return values.join(', ');
}

function parseNominatimGeocodeJson(json: NominatimGeocodeJson): Omit<BrowserArea, 'latitude' | 'longitude' | 'geohash' | 'detectedAt'> | null {
  const geocoding = json.features?.[0]?.properties?.geocoding;
  if (!geocoding) return null;

  const suburb = geocoding.suburb ?? geocoding.neighbourhood ?? geocoding.town ?? geocoding.village;
  const city = geocoding.city ?? geocoding.admin?.level7 ?? geocoding.admin?.level6;
  const state = geocoding.state ?? geocoding.admin?.level4;
  const country = geocoding.country ?? geocoding.admin?.level2;
  const label = geocoding.label?.trim() || formatAreaLabel({ suburb, city, state, country });

  if (!label) return null;

  return {
    label,
    country,
    state,
    city,
    suburb,
    postcode: geocoding.postcode
  };
}

export async function reverseGeocodeNominatim(
  latitude: number,
  longitude: number,
  fetchImpl: typeof fetch = fetch
): Promise<Omit<BrowserArea, 'latitude' | 'longitude' | 'geohash' | 'detectedAt'> | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'geocodejson');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('zoom', '13');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('layer', 'address');
  url.searchParams.set('accept-language', typeof navigator !== 'undefined' ? navigator.language : 'en');

  const response = await fetchImpl(url.toString(), {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as NominatimGeocodeJson;
  return parseNominatimGeocodeJson(json);
}

function parseNominatimSearchItem(item: NominatimSearchJsonItem, precision = 6): LocationSuggestion | null {
  const latitude = Number(item.lat);
  const longitude = Number(item.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const address = item.address ?? {};
  const suburb = address.suburb ?? address.neighbourhood ?? address.town ?? address.village;
  const city = address.city ?? address.town ?? address.village;
  const state = address.state;
  const country = address.country;
  const label = item.display_name?.trim() || formatAreaLabel({ suburb, city, state, country });

  if (!label) return null;

  return {
    label,
    latitude,
    longitude,
    geohash: encodeGeohash(latitude, longitude, precision),
    country,
    state,
    city,
    suburb,
    postcode: address.postcode
  };
}

export async function searchNominatimLocations(
  query: string,
  options: { limit?: number; precision?: number; fetchImpl?: typeof fetch; signal?: AbortSignal } = {}
): Promise<LocationSuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', trimmed);
  url.searchParams.set('limit', String(options.limit ?? 5));
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', typeof navigator !== 'undefined' ? navigator.language : 'en');

  const response = await (options.fetchImpl ?? fetch)(url.toString(), {
    headers: {
      Accept: 'application/json'
    },
    signal: options.signal
  });

  if (!response.ok) {
    return [];
  }

  const json = (await response.json()) as NominatimSearchJsonItem[];
  return json
    .map((item) => parseNominatimSearchItem(item, options.precision ?? 6))
    .filter((value): value is LocationSuggestion => value !== null);
}

export function watchLocationSearch(
  query: string,
  setState: (state: { suggestions: LocationSuggestion[]; searching: boolean; error: string | null }) => void,
  options?: { limit?: number }
): () => void {
  const trimmed = query.trim();
  if (!trimmed) {
    setState({ suggestions: [], searching: false, error: null });
    return () => {};
  }

  setState({ suggestions: [], searching: true, error: null });

  const controller = new AbortController();
  const timer = setTimeout(() => {
    void searchNominatimLocations(trimmed, { limit: options?.limit ?? 5, signal: controller.signal }).then(
      (results) => {
        setState({
          suggestions: results,
          searching: false,
          error: results.length === 0 ? 'No matching places found.' : null
        });
      },
      () => {
        if (controller.signal.aborted) return;
        setState({ suggestions: [], searching: false, error: 'Could not search for places right now.' });
      }
    );
  }, 300);

  return () => {
    clearTimeout(timer);
    controller.abort();
  };
}

export async function detectBrowserArea(
  options: { precision?: number; fetchImpl?: typeof fetch } = {}
): Promise<BrowserArea | null> {
  const cached = getCachedBrowserArea();
  if (cached) return cached;
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

  const precision = options.precision ?? 5;

  const position = await new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (value) => resolve(value),
      () => resolve(null),
      {
        enableHighAccuracy: false,
        maximumAge: 30 * 60 * 1000,
        timeout: 5000
      }
    );
  });

  if (!position) return null;

  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;
  const location = await reverseGeocodeNominatim(latitude, longitude, options.fetchImpl);
  if (!location) return null;

  const area: BrowserArea = {
    ...location,
    latitude,
    longitude,
    geohash: encodeGeohash(latitude, longitude, precision),
    detectedAt: Date.now()
  };

  saveCache(area);
  return area;
}
