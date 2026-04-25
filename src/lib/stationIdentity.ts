import { Station } from '../types';
import { calculateDistance } from './utils';

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const DEFAULT_GEOHASH_PRECISION = 6;
const GEO_DEDUPE_FALLBACK_METERS = 75;

const BRAND_ALIASES: Record<string, string[]> = {
  engen: ['engen'],
  sasol: ['sasol'],
  shell: ['shell', 'shell garage'],
  bp: ['bp', 'british petroleum'],
  'astron energy': ['astron', 'astron energy', 'caltex'],
  totalenergies: ['total', 'totalenergies', 'total energies'],
};

const KNOWN_BRANDS = [
  'shell',
  'bp',
  'engen',
  'sasol',
  'totalenergies',
  'total',
  'caltex',
  'astron',
  'quick fuel',
  'quickfuel',
  'petroport',
  'freshstop',
  'ashley',
] as const;

const normalizeToken = (value: string | undefined) =>
  (value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const detectStationBrand = (stationLike: Pick<Station, 'name' | 'address'>) => {
  const haystack = `${normalizeToken(stationLike.name)} ${normalizeToken(stationLike.address)}`;
  for (const [brand, aliases] of Object.entries(BRAND_ALIASES)) {
    if (aliases.some((alias) => haystack.includes(normalizeToken(alias)))) {
      return brand;
    }
  }
  return 'independent';
};

export const matchesBrandFilter = (station: Station, brandFilter: string) => {
  if (brandFilter === 'All') return true;
  const normalizedFilter = normalizeToken(brandFilter);
  const normalizedBrand = detectStationBrand(station);
  if (normalizedFilter === 'independent') {
    return normalizedBrand === 'independent';
  }
  return normalizedBrand === normalizedFilter;
};

const normalizeBrand = (name: string | undefined) => {
  const normalized = normalizeToken(name);
  if (!normalized) return 'unknown';

  const matchedBrand = KNOWN_BRANDS.find((brand) => normalized.includes(brand));
  if (matchedBrand) {
    return matchedBrand.replace(/\s+/g, '');
  }

  return normalized.split(' ')[0] || 'unknown';
};

const normalizeRoad = (address: string | undefined) => {
  const normalized = normalizeToken(address);
  if (!normalized) return 'unknown';

  const primarySegment = normalized.split(',')[0]?.trim() || normalized;
  const roadTokens = primarySegment
    .split(' ')
    .filter((token) => token && !/^\d+$/.test(token))
    .slice(0, 3);

  return roadTokens.join('-') || 'unknown';
};

export const encodeGeohash = (lat: number, lng: number, precision = DEFAULT_GEOHASH_PRECISION) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'unknown';

  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = '';

  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        idx = idx * 2 + 1;
        lngMin = mid;
      } else {
        idx = idx * 2;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        idx = idx * 2 + 1;
        latMin = mid;
      } else {
        idx = idx * 2;
        latMax = mid;
      }
    }

    evenBit = !evenBit;
    if (++bit === 5) {
      geohash += BASE32[idx];
      bit = 0;
      idx = 0;
    }
  }

  return geohash;
};

export const buildCanonicalStationKey = (stationLike: Pick<Station, 'name' | 'address' | 'lat' | 'lng'>) => {
  return `${normalizeBrand(stationLike.name)}|${normalizeRoad(stationLike.address)}|${encodeGeohash(stationLike.lat, stationLike.lng, 6)}`;
};

const stationRichnessScore = (station: Station) => {
  let score = station.reports_count || 0;
  if (typeof station.diesel_price === 'number') score += 3;
  if (typeof station.petrol_price === 'number') score += 3;
  if (station.latest_image_url) score += 1;
  return score + (station.last_updated || 0) / 1_000_000_000_000;
};

const choosePreferred = (a: Station, b: Station) => (stationRichnessScore(a) >= stationRichnessScore(b) ? a : b);

export const dedupeStations = (stations: Station[]) => {
  const canonicalMap = new Map<string, Station>();
  const deduped: Station[] = [];

  for (const station of stations) {
    const canonicalKey = station.canonical_key || buildCanonicalStationKey(station);

    const existingByKey = canonicalMap.get(canonicalKey);
    if (existingByKey) {
      const preferred = choosePreferred(existingByKey, station);
      canonicalMap.set(canonicalKey, preferred);
      continue;
    }

    const fallbackIndex = deduped.findIndex((existing) => {
      const distanceMeters = calculateDistance(station.lat, station.lng, existing.lat, existing.lng) * 1000;
      return distanceMeters <= GEO_DEDUPE_FALLBACK_METERS;
    });

    if (fallbackIndex >= 0) {
      deduped[fallbackIndex] = choosePreferred(deduped[fallbackIndex], station);
      continue;
    }

    canonicalMap.set(canonicalKey, station);
    deduped.push(station);
  }

  return deduped;
};
