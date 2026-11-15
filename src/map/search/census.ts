// US Census geocoder answers (onelineaddress, format=json). Answer format from the saved samples in
// data/samples/geocoders: matches in result.addressMatches, coordinates.x is longitude and y latitude.
// The Census server sends no CORS header for our origins, so the browser cannot call it; this parser waits for a
// server-side call and US addresses go to Nominatim meanwhile (README in data/samples/geocoders).
import { t } from '../../app/i18n';
import { SourceError } from '../../contracts';
import { coordinate, readJson, type Place } from './place';

export const CENSUS_SOURCE = 'US Census Geocoder';

const malformed = (): never => {
  throw new SourceError(CENSUS_SOURCE, t('search.error.format', { source: CENSUS_SOURCE }));
};

export function parseCensus(body: string): Place[] {
  const answer = readJson(CENSUS_SOURCE, body) as { result?: { addressMatches?: unknown } } | null;
  const matches = answer?.result?.addressMatches;
  if (!Array.isArray(matches)) return malformed();
  return matches.map((match: { coordinates?: { x?: unknown; y?: unknown }; matchedAddress?: unknown }) => {
    if (!match.coordinates) return malformed();
    return {
      lat: coordinate(CENSUS_SOURCE, match.coordinates.y),
      lon: coordinate(CENSUS_SOURCE, match.coordinates.x),
      label: typeof match.matchedAddress === 'string' ? match.matchedAddress : '',
    };
  });
}
