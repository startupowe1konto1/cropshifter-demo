// Parser and client tests against the ULDK answers saved in data/samples/uldk (see its README for the URLs).
import { readFileSync } from 'node:fs';
import { SourceError } from '../../contracts';
import { demoFields } from '../../fixtures';
import { areaHa } from '../area';
import { ULDK_SOURCE, getParcelById, getParcelByPoint, parseUldk } from './uldk';

const SAMPLES = 'data/samples/uldk';
const sample = (file: string) => readFileSync(`${SAMPLES}/${file}`, 'utf8');

const byXy4326 = sample('parcel-by-xy-poznan-srid4326.txt');
const byXy2180 = sample('parcel-by-xy-poznan-srid2180.txt');
const byId4326 = sample('parcel-by-id-428-1-srid4326.txt');
const byId2180 = sample('parcel-by-id-428-1-srid2180.txt');
const notFoundXy = sample('not-found-by-xy-sea.txt');
const notFoundId = sample('not-found-by-id.txt');

// Values read from the sample itself, not typed in: the teryt after the last '|' and the WGS84 vertices.
const sampleTeryt = byId4326.trim().split('|').pop()!;
const sampleRing = /POLYGON\(\(([^)]+)\)\)/
  .exec(byId4326)![1]!
  .split(',')
  .map((pair) => pair.trim().split(/\s+/).map(Number));

const ok = (body: string) => vi.fn(async () => new Response(body, { status: 200 }));

describe('parseUldk', () => {
  it('reads the teryt and a closed WGS84 ring from a 4326 answer', () => {
    const parsed = parseUldk(byId4326);
    expect(parsed?.teryt).toBe(sampleTeryt);
    const ring = parsed!.polygon.coordinates[0]!;
    expect(ring).toEqual(sampleRing);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('reprojects a 2180 answer to the same ring as the 4326 answer', () => {
    const ring = parseUldk(byId2180)!.polygon.coordinates[0]!;
    expect(ring).toHaveLength(sampleRing.length);
    ring.forEach(([lon, lat], i) => {
      expect(Math.abs(lon! - sampleRing[i]![0]!)).toBeLessThan(1e-5);
      expect(Math.abs(lat! - sampleRing[i]![1]!)).toBeLessThan(1e-5);
    });
  });

  it('reads the by-point answers the same way', () => {
    expect(parseUldk(byXy4326)?.teryt).toBe(sampleTeryt);
    expect(parseUldk(byXy2180)?.teryt).toBe(sampleTeryt);
  });

  it('returns null for the "-1" answers', () => {
    expect(parseUldk(notFoundXy)).toBeNull();
    expect(parseUldk(notFoundId)).toBeNull();
  });

  it('copes with Windows line ends', () => {
    expect(parseUldk(byId4326.replace(/\n/g, '\r\n'))?.teryt).toBe(sampleTeryt);
  });

  it('keeps the largest part of a MULTIPOLYGON', () => {
    // Built from the sample: the real parcel plus a tiny triangle near its first vertex.
    const big = sampleRing.map(([x, y]) => `${x} ${y}`).join(',');
    const [x0, y0] = sampleRing[0]!;
    const tiny = `${x0} ${y0},${x0! + 1e-5} ${y0},${x0} ${y0! + 1e-5},${x0} ${y0}`;
    const body = `0\nSRID=4326;MULTIPOLYGON(((${tiny})),((${big})))|${sampleTeryt}\n`;
    expect(parseUldk(body)!.polygon.coordinates[0]).toEqual(sampleRing);
  });

  it('closes a ring the service left open', () => {
    const open = sampleRing.slice(0, -1).map(([x, y]) => `${x} ${y}`).join(',');
    const ring = parseUldk(`0\nSRID=4326;POLYGON((${open}))|${sampleTeryt}`)!.polygon.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it.each([
    ['an HTML page', '<html><body>Service unavailable</body></html>'],
    ['an empty body', ''],
    ['a geometry without a teryt', '0\nSRID=4326;POLYGON((17 52,17.1 52,17.1 52.1,17 52))'],
    ['an unknown SRID', `0\nSRID=3857;POLYGON((1 2,3 4,5 6,1 2))|${sampleTeryt}`],
    ['a broken WKT', `0\nSRID=4326;POLYGON((17 52,abc))|${sampleTeryt}`],
  ])('throws a SourceError for %s', (_label, body) => {
    expect(() => parseUldk(body)).toThrow(SourceError);
  });
});

describe('getParcelById', () => {
  it('asks ULDK for the id in WGS84 and returns a Polish field', async () => {
    const fetchImpl = ok(byId4326);
    const field = await getParcelById(`  ${sampleTeryt} `, fetchImpl as unknown as typeof fetch);

    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]));
    expect(url.host).toBe('uldk.gugik.gov.pl');
    expect(url.searchParams.get('request')).toBe('GetParcelById');
    expect(url.searchParams.get('id')).toBe(sampleTeryt);
    expect(url.searchParams.get('srid')).toBe('4326');

    expect(field).not.toBeNull();
    expect(field!.country).toBe('PL');
    expect(field!.parcelIds).toEqual([sampleTeryt]);
    expect(field!.name).toContain(sampleTeryt);
    expect(field!.areaHa).toBeCloseTo(areaHa(field!.polygon), 10);
    expect(field!.areaHa).toBeGreaterThan(0);
  });

  it('puts the centroid inside the parcel bounds', async () => {
    const field = (await getParcelById(sampleTeryt, ok(byId4326) as unknown as typeof fetch))!;
    const lons = sampleRing.map(([lon]) => lon!);
    const lats = sampleRing.map(([, lat]) => lat!);
    expect(field.centroid.lon).toBeGreaterThan(Math.min(...lons));
    expect(field.centroid.lon).toBeLessThan(Math.max(...lons));
    expect(field.centroid.lat).toBeGreaterThan(Math.min(...lats));
    expect(field.centroid.lat).toBeLessThan(Math.max(...lats));
  });

  it('matches the parcel id of the Poznań demo field', async () => {
    const id = demoFields.poznan.parcelIds![0]!;
    const field = await getParcelById(id, ok(byId4326) as unknown as typeof fetch);
    expect(field?.parcelIds).toEqual([id]);
  });

  it('returns null when ULDK has no such parcel', async () => {
    expect(await getParcelById('nope', ok(notFoundId) as unknown as typeof fetch)).toBeNull();
  });

  it('throws a SourceError on an HTTP error', async () => {
    const fetchImpl = vi.fn(async () => new Response('oops', { status: 503 }));
    await expect(getParcelById(sampleTeryt, fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({
      name: 'SourceError',
      source: ULDK_SOURCE,
    });
  });

  it('throws a SourceError when the network fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(getParcelById(sampleTeryt, fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(SourceError);
  });
});

describe('getParcelByPoint', () => {
  it('sends the point as lon,lat,4326 and returns the parcel there', async () => {
    const { lat, lon } = demoFields.poznan.centroid;
    const fetchImpl = ok(byXy4326);
    const field = await getParcelByPoint(lat, lon, fetchImpl as unknown as typeof fetch);

    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('request')).toBe('GetParcelByXY');
    expect(url.searchParams.get('xy')).toBe(`${lon},${lat},4326`);
    expect(field?.parcelIds).toEqual([sampleTeryt]);
  });

  it('returns null where there is no parcel', async () => {
    expect(await getParcelByPoint(54.85, 16.5, ok(notFoundXy) as unknown as typeof fetch)).toBeNull();
  });
});
