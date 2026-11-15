// Picks the geocoder for a query: Polish text goes to GUGiK, everything else and every GUGiK miss to Nominatim.
// US addresses also go to Nominatim: the Census geocoder sends no CORS header, so a browser cannot read it.
import { GUGIK_SOURCE, searchGugik } from './gugik';
import { NOMINATIM_SOURCE, nominatimThrottle, searchNominatim } from './nominatim';
import type { Place } from './place';
import type { Throttle } from './throttle';

const POLISH_LETTERS = /[ąćęłńóśźż]/i;
const POLISH_POSTCODE = /\b\d{2}-\d{3}\b/;
const POLISH_WORDS = /(^|[\s,])(ul|al|os|pl)\.\s|\b(ulica|aleja|gmina|powiat|polska)\b/i;

export function isPolishQuery(query: string): boolean {
  return POLISH_LETTERS.test(query) || POLISH_POSTCODE.test(query) || POLISH_WORDS.test(query);
}

export interface SearchResult {
  source: string; // the geocoder that gave the answer
  places: Place[];
}

/** Places for the typed text. A GUGiK failure is reported as it is, not hidden behind a Nominatim answer. */
export async function searchPlaces(
  query: string,
  fetchImpl: typeof fetch = fetch,
  throttle: Throttle = nominatimThrottle,
): Promise<SearchResult> {
  if (isPolishQuery(query)) {
    const places = await searchGugik(query, fetchImpl);
    if (places.length > 0) return { source: GUGIK_SOURCE, places };
  }
  return { source: NOMINATIM_SOURCE, places: await searchNominatim(query, fetchImpl, throttle) };
}
