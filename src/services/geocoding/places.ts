export type PlaceSuggestion = {
  id: string;
  placeName: string;
  city: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
};

export type GeocodingCountry = {
  code: string;
  label: string;
};

export const GEOCODING_COUNTRIES: GeocodingCountry[] = [
  { code: 'pl', label: 'Polska' },
  { code: 'de', label: 'Deutschland' },
  { code: 'us', label: 'United States' },
  { code: 'gb', label: 'United Kingdom' },
  { code: 'fr', label: 'France' },
  { code: 'es', label: 'España' },
  { code: 'it', label: 'Italia' },
  { code: 'nl', label: 'Nederland' },
  { code: 'be', label: 'België' },
  { code: 'se', label: 'Sverige' },
  { code: 'no', label: 'Norge' },
  { code: 'dk', label: 'Danmark' },
  { code: 'cz', label: 'Česko' },
  { code: 'sk', label: 'Slovensko' },
  { code: 'at', label: 'Österreich' },
  { code: 'ch', label: 'Schweiz' },
  { code: 'ie', label: 'Ireland' },
  { code: 'ca', label: 'Canada' },
  { code: 'au', label: 'Australia' },
];

type NominatimResult = {
  place_id?: number | string;
  osm_type?: string;
  osm_id?: number | string;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    country?: string;
  };
};

const DEFAULT_NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

function getNominatimEndpoint() {
  if (typeof process !== 'undefined') {
    return process.env?.EXPO_PUBLIC_NOMINATIM_ENDPOINT || DEFAULT_NOMINATIM_ENDPOINT;
  }

  return DEFAULT_NOMINATIM_ENDPOINT;
}

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapNominatimResult(result: NominatimResult): PlaceSuggestion | null {
  const latitude = toNumber(result.lat);
  const longitude = toNumber(result.lon);
  const placeName = String(result.display_name || '').trim();

  if (latitude === null || longitude === null || !placeName) return null;

  const address = result.address ?? {};
  const city =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.county ??
    null;

  return {
    id: String(result.place_id ?? `${result.osm_type ?? 'place'}-${result.osm_id ?? placeName}`),
    placeName,
    city,
    country: address.country ?? null,
    latitude,
    longitude,
  };
}

export function getPlaceLocalityName(place: PlaceSuggestion): string {
  return place.city || place.placeName.split(',')[0]?.trim() || place.placeName;
}

export async function searchPlaces(query: string, countryCode?: string | null): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const params: Record<string, string> = {
    q: trimmed,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '5',
  };

  if (countryCode) {
    params.countrycodes = countryCode.toLowerCase();
  }

  const url =
    `${getNominatimEndpoint()}?` +
    new URLSearchParams(params).toString();

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`GEOCODING_FAILED_${response.status}`);
  }

  const data = (await response.json()) as NominatimResult[];
  return data.map(mapNominatimResult).filter((item): item is PlaceSuggestion => item !== null);
}
