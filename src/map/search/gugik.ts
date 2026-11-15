// GUGiK UUG geocoder for Polish addresses and towns. Answer format from the saved samples in data/samples/geocoders
// (README there): `results` is an object keyed "1", "2", ... or null; with srid=4326, x is longitude and y latitude.
import { t } from '../../app/i18n';
import { SourceError } from '../../contracts';
import { coordinate, getText, readJson, type Place } from './place';

export const GUGIK_SOURCE = 'GUGiK UUG';
const GUGIK_URL = 'https://services.gugik.gov.pl/uug/';
const MAX_PLACES = 5;

type Row = Record<string, unknown>;

const text = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

/** "Rynek 1, 62-020 Swarzędz" for an address; "Swarzędz, poznański, wielkopolskie" for a town. */
function labelOf(row: Row): string {
  const street = [text(row.street), text(row.number)].filter(Boolean).join(' ');
  const town = [text(row.code), text(row.city)].filter(Boolean).join(' ');
  const parts = [street, town, text(row.county), text(row.voivodeship)].filter((p): p is string => !!p);
  return [...new Set(parts)].join(', ');
}

export function parseGugik(body: string): Place[] {
  const answer = readJson(GUGIK_SOURCE, body);
  if (typeof answer !== 'object' || answer === null || !('results' in answer)) {
    throw new SourceError(GUGIK_SOURCE, t('search.error.format', { source: GUGIK_SOURCE }));
  }
  const { results } = answer as { results: unknown };
  if (results === null) return [];
  if (typeof results !== 'object') throw new SourceError(GUGIK_SOURCE, t('search.error.format', { source: GUGIK_SOURCE }));
  return Object.values(results as Record<string, Row>)
    .slice(0, MAX_PLACES)
    .map((row) => ({ lat: coordinate(GUGIK_SOURCE, row.y), lon: coordinate(GUGIK_SOURCE, row.x), label: labelOf(row) }));
}

/** Places for a Polish address or town. Throws SourceError when UUG fails. */
export async function searchGugik(query: string, fetchImpl: typeof fetch = fetch): Promise<Place[]> {
  const url = `${GUGIK_URL}?${new URLSearchParams({ request: 'GetAddress', address: query, srid: '4326' })}`;
  return parseGugik(await getText(GUGIK_SOURCE, url, fetchImpl));
}
