// Parser and client tests against the Nominatim answers saved in data/samples/geocoders (see its README for the URLs).
import { readFileSync } from 'node:fs';
import { SourceError } from '../../contracts';
import { NOMINATIM_SOURCE, parseNominatim, searchNominatim } from './nominatim';
import { createThrottle } from './throttle';

const sample = (file: string) => readFileSync(`data/samples/geocoders/${file}`, 'utf8');
const ames = sample('nominatim-ames-iowa.json');
const empty = sample('nominatim-empty.json');
const raw = JSON.parse(ames)[0] as { lat: string; lon: string; display_name: string };

describe('parseNominatim', () => {
  it('reads lat, lon and the display name', () => {
    expect(parseNominatim(ames)).toEqual([{ lat: Number(raw.lat), lon: Number(raw.lon), label: raw.display_name }]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(parseNominatim(empty)).toEqual([]);
  });

  it.each([
    ['a body that is not JSON', '<html>Bad gateway</html>'],
    ['an answer that is not a list', '{"error":"Unable to geocode"}'],
    ['coordinates that are not numbers', ames.replace(`"lat":"${raw.lat}"`, '"lat":"north"')],
  ])('throws a SourceError for %s', (_case, body) => {
    expect(() => parseNominatim(body)).toThrow(SourceError);
    try {
      parseNominatim(body);
    } catch (error) {
      expect((error as SourceError).source).toBe(NOMINATIM_SOURCE);
    }
  });
});

describe('searchNominatim', () => {
  const noWait = () => createThrottle(0);

  it('asks for at most five places as JSON and sends no email', async () => {
    const fetchMock = vi.fn(async () => new Response(ames, { status: 200 }));
    const places = await searchNominatim('Ames, Iowa', fetchMock, noWait());
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.hostname).toBe('nominatim.openstreetmap.org');
    expect(url.searchParams.get('q')).toBe('Ames, Iowa');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.has('email')).toBe(false);
    expect(places).toEqual(parseNominatim(ames));
  });

  it('waits for the throttle before each request', async () => {
    const order: string[] = [];
    const throttle = { wait: vi.fn(async () => void order.push('wait')) };
    const fetchMock = vi.fn(async () => {
      order.push('fetch');
      return new Response(empty, { status: 200 });
    });
    await searchNominatim('Ames', fetchMock, throttle);
    expect(order).toEqual(['wait', 'fetch']);
  });

  it('turns an HTTP error into a SourceError', async () => {
    await expect(searchNominatim('Ames', vi.fn(async () => new Response('', { status: 429 })), noWait())).rejects.toMatchObject({
      source: NOMINATIM_SOURCE,
    });
  });
});
