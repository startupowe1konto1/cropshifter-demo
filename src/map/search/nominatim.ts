// OpenStreetMap Nominatim geocoder for everything GUGiK does not find. Answer format from the saved samples in
// data/samples/geocoders: a JSON array with lat and lon as strings and display_name as the label.
// Usage policy: at most one request per second, and no email in the request.
import { t } from '../../app/i18n';
import { SourceError } from '../../contracts';
import { coordinate, getText, readJson, type Place } from './place';
import { createThrottle, type Throttle } from './throttle';

export const NOMINATIM_SOURCE = 'OpenStreetMap Nominatim';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/** Shared by every search in this tab, so the one-per-second limit holds across the whole app. */
export const nominatimThrottle = createThrottle(1000);

export function parseNominatim(body: string): Place[] {
  const answer = readJson(NOMINATIM_SOURCE, body);
  if (!Array.isArray(answer)) throw new SourceError(NOMINATIM_SOURCE, t('search.error.format', { source: NOMINATIM_SOURCE }));
  return answer.map((row: Record<string, unknown>) => ({
    lat: coordinate(NOMINATIM_SOURCE, row.lat),
    lon: coordinate(NOMINATIM_SOURCE, row.lon),
    label: typeof row.display_name === 'string' ? row.display_name : '',
  }));
}

/** Up to five places for any text. Waits for the throttle first. Throws SourceError when Nominatim fails. */
export async function searchNominatim(
  query: string,
  fetchImpl: typeof fetch = fetch,
  throttle: Throttle = nominatimThrottle,
): Promise<Place[]> {
  await throttle.wait();
  const url = `${NOMINATIM_URL}?${new URLSearchParams({ q: query, format: 'jsonv2', limit: '5' })}`;
  return parseNominatim(await getText(NOMINATIM_SOURCE, url, fetchImpl));
}
