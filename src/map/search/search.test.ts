// Which geocoder answers a query. Answers come from the saved samples in data/samples/geocoders.
import { readFileSync } from 'node:fs';
import { SourceError } from '../../contracts';
import { GUGIK_SOURCE, parseGugik } from './gugik';
import { NOMINATIM_SOURCE, parseNominatim } from './nominatim';
import { isPolishQuery, searchPlaces } from './search';
import { createThrottle } from './throttle';

const sample = (file: string) => readFileSync(`data/samples/geocoders/${file}`, 'utf8');
const gugikHit = sample('gugik-address-swarzedz-rynek-1.json');
const gugikEmpty = sample('gugik-empty.json');
const nominatimHit = sample('nominatim-ames-iowa.json');
const nominatimEmpty = sample('nominatim-empty.json');

const hostsOf = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map((call) => new URL(String(call[0])).hostname);
const answers = (...bodies: (string | number)[]) => {
  const fetchMock = vi.fn<typeof fetch>();
  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce(typeof body === 'number' ? new Response('', { status: body }) : new Response(body, { status: 200 }));
  }
  return fetchMock;
};

describe('isPolishQuery', () => {
  it.each(['Swarzędz, Rynek 1', 'ul. Polna 3, Gniezno', '62-020 Swarzedz', 'Kórnik'])('treats "%s" as Polish', (query) => {
    expect(isPolishQuery(query)).toBe(true);
  });

  it.each(['Ames, Iowa', '1007 E Grand Ave, Des Moines, IA 50319', 'Paris'])('does not treat "%s" as Polish', (query) => {
    expect(isPolishQuery(query)).toBe(false);
  });
});

describe('searchPlaces', () => {
  const noWait = createThrottle(0);

  it('sends Polish text to GUGiK and stops there when it finds the address', async () => {
    const fetchMock = answers(gugikHit);
    const result = await searchPlaces('Swarzędz, Rynek 1', fetchMock, noWait);
    expect(hostsOf(fetchMock)).toEqual(['services.gugik.gov.pl']);
    expect(result).toEqual({ source: GUGIK_SOURCE, places: parseGugik(gugikHit) });
  });

  it('asks Nominatim when GUGiK finds nothing', async () => {
    const fetchMock = answers(gugikEmpty, nominatimHit);
    const result = await searchPlaces('Swarzędz, Rynek 999', fetchMock, noWait);
    expect(hostsOf(fetchMock)).toEqual(['services.gugik.gov.pl', 'nominatim.openstreetmap.org']);
    expect(result).toEqual({ source: NOMINATIM_SOURCE, places: parseNominatim(nominatimHit) });
  });

  it('sends a US address to Nominatim, because the Census geocoder does not allow browser requests', async () => {
    const fetchMock = answers(nominatimHit);
    await searchPlaces('1007 E Grand Ave, Des Moines, IA 50319', fetchMock, noWait);
    expect(hostsOf(fetchMock)).toEqual(['nominatim.openstreetmap.org']);
  });

  it('returns an empty list from Nominatim when no source finds the place', async () => {
    const result = await searchPlaces('Swarzędz, Rynek 999', answers(gugikEmpty, nominatimEmpty), noWait);
    expect(result).toEqual({ source: NOMINATIM_SOURCE, places: [] });
  });

  it('reports a GUGiK failure as a GUGiK source error instead of hiding it', async () => {
    const fetchMock = answers(503);
    await expect(searchPlaces('Swarzędz', fetchMock, noWait)).rejects.toBeInstanceOf(SourceError);
    expect(hostsOf(fetchMock)).toEqual(['services.gugik.gov.pl']);
  });
});

describe('createThrottle', () => {
  it('spaces calls at least one interval apart, also when they start together', async () => {
    const sleeps: number[] = [];
    // The clock stands still: all three calls start at the same moment.
    const clock = { now: () => 0, sleep: async (ms: number) => void sleeps.push(ms) };
    const throttle = createThrottle(1000, clock);
    await Promise.all([throttle.wait(), throttle.wait(), throttle.wait()]);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('does not wait when the last call is older than the interval', async () => {
    let now = 0;
    const sleep = vi.fn(async () => {});
    const throttle = createThrottle(1000, { now: () => now, sleep });
    await throttle.wait();
    now = 5000;
    await throttle.wait();
    expect(sleep).not.toHaveBeenCalled();
  });
});
