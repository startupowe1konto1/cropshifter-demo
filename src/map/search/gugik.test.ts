// Parser and client tests against the GUGiK UUG answers saved in data/samples/geocoders (see its README for the URLs).
import { readFileSync } from 'node:fs';
import { SourceError } from '../../contracts';
import { GUGIK_SOURCE, parseGugik, searchGugik } from './gugik';

const sample = (file: string) => readFileSync(`data/samples/geocoders/${file}`, 'utf8');
const address = sample('gugik-address-swarzedz-rynek-1.json');
const city = sample('gugik-city-swarzedz.json');
const empty = sample('gugik-empty.json');
const firstResult = (body: string) => Object.values(JSON.parse(body).results)[0] as Record<string, string>;

describe('parseGugik', () => {
  it('reads lon from x and lat from y of an address answer', () => {
    const raw = firstResult(address);
    const places = parseGugik(address);
    expect(places).toHaveLength(1);
    expect(places[0]!.lat).toBe(Number(raw.y));
    expect(places[0]!.lon).toBe(Number(raw.x));
    expect(places[0]!.label).toContain(`${raw.street} ${raw.number}`);
    expect(places[0]!.label).toContain(raw.city);
  });

  it('labels a town with its county and voivodeship', () => {
    const raw = firstResult(city);
    const [place] = parseGugik(city);
    expect(place!.lat).toBe(Number(raw.y));
    expect(place!.lon).toBe(Number(raw.x));
    expect(place!.label).toContain(raw.city);
    expect(place!.label).toContain(raw.voivodeship);
  });

  it('returns an empty list when nothing matches', () => {
    expect(parseGugik(empty)).toEqual([]);
  });

  const raw = firstResult(address);
  it.each([
    ['a body that is not JSON', '<html>Service unavailable</html>'],
    ['an answer without results', '{}'],
    ['coordinates that are not numbers', address.replace(`"x":"${raw.x}"`, '"x":"abc"')],
  ])('throws a SourceError for %s', (_case, body) => {
    expect(() => parseGugik(body)).toThrow(SourceError);
    try {
      parseGugik(body);
    } catch (error) {
      expect((error as SourceError).source).toBe(GUGIK_SOURCE);
    }
  });
});

describe('searchGugik', () => {
  it('asks UUG for WGS84 coordinates of the typed address', async () => {
    const fetchMock = vi.fn(async () => new Response(address, { status: 200 }));
    const places = await searchGugik('Swarzędz, Rynek 1', fetchMock);
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.hostname).toBe('services.gugik.gov.pl');
    expect(url.searchParams.get('request')).toBe('GetAddress');
    expect(url.searchParams.get('srid')).toBe('4326');
    expect(url.searchParams.get('address')).toBe('Swarzędz, Rynek 1');
    expect(places).toEqual(parseGugik(address));
  });

  it('turns an HTTP error or a failed request into a SourceError', async () => {
    await expect(searchGugik('Swarzędz', vi.fn(async () => new Response('', { status: 503 })))).rejects.toBeInstanceOf(SourceError);
    await expect(searchGugik('Swarzędz', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))).rejects.toMatchObject({
      source: GUGIK_SOURCE,
    });
  });
});
