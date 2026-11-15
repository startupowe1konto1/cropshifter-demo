// Parser tests against the US Census geocoder answers saved in data/samples/geocoders (see its README for the URLs).
import { readFileSync } from 'node:fs';
import { SourceError } from '../../contracts';
import { CENSUS_SOURCE, parseCensus } from './census';

const sample = (file: string) => readFileSync(`data/samples/geocoders/${file}`, 'utf8');
const capitol = sample('census-iowa-capitol.json');
const empty = sample('census-empty.json');
const match = JSON.parse(capitol).result.addressMatches[0] as { coordinates: { x: number; y: number }; matchedAddress: string };

describe('parseCensus', () => {
  it('reads lon from x, lat from y and the matched address', () => {
    expect(parseCensus(capitol)).toEqual([{ lat: match.coordinates.y, lon: match.coordinates.x, label: match.matchedAddress }]);
  });

  it('returns an empty list when no address matches', () => {
    expect(parseCensus(empty)).toEqual([]);
  });

  it.each([
    ['a body that is not JSON', '<html>Forbidden</html>'],
    ['an answer without address matches', '{"result":{}}'],
    ['a match without coordinates', capitol.replace(/"coordinates":\{[^}]*\},/, '')],
  ])('throws a SourceError for %s', (_case, body) => {
    expect(() => parseCensus(body)).toThrow(SourceError);
    try {
      parseCensus(body);
    } catch (error) {
      expect((error as SourceError).source).toBe(CENSUS_SOURCE);
    }
  });
});
