// GUGiK ULDK client: Polish cadastral parcel by point or by full parcel number (TERYT id).
// Answer format from the saved samples in data/samples/uldk (README there): first line "0" when found, then
// "SRID=<n>;<WKT>|<teryt>"; "-1 ..." when there is no parcel.
import type { Polygon, Position } from 'geojson';
import { t } from '../../app/i18n';
import { SourceError, type Field } from '../../contracts';
import { areaHa } from '../area';
import { toWgs84 } from './reproject';

export const ULDK_SOURCE = 'GUGiK ULDK';
export const ULDK_URL = 'https://uldk.gugik.gov.pl/';
const TIMEOUT_MS = 15_000;

export interface UldkParcel {
  teryt: string;
  polygon: Polygon; // WGS84, closed rings
}

const fail = (message: string): never => {
  throw new SourceError(ULDK_SOURCE, message);
};

/** WKT body after the type name, e.g. "((x y,x y),(x y,...))", as nested arrays. */
function wktNumbers(text: string): unknown {
  const json = text
    .replace(/(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s+(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, '[$1,$2]')
    .replace(/\(/g, '[')
    .replace(/\)/g, ']');
  try {
    return JSON.parse(json);
  } catch {
    return fail('ULDK sent a geometry that could not be read.');
  }
}

const isRing = (ring: unknown): ring is number[][] =>
  Array.isArray(ring) &&
  ring.length >= 3 &&
  ring.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n)));

function closed(ring: Position[]): Position[] {
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

/** Rings of every polygon in a POLYGON or MULTIPOLYGON, still in the source coordinates. */
function readWkt(wkt: string): number[][][][] {
  const match = /^\s*(MULTIPOLYGON|POLYGON)\s*(\(.*\))\s*$/i.exec(wkt);
  if (!match) return fail('ULDK sent a geometry that is not a polygon.');
  const nested = wktNumbers(match[2]!);
  const polygons = (match[1]!.toUpperCase() === 'POLYGON' ? [nested] : nested) as unknown[];
  if (!Array.isArray(polygons) || polygons.length === 0) return fail('ULDK sent an empty geometry.');
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0 || !polygon.every(isRing)) {
      fail('ULDK sent a geometry that could not be read.');
    }
  }
  return polygons as number[][][][];
}

/**
 * Parses a ULDK answer requested with `result=geom_wkt,teryt`. Returns null for the "-1" (no parcel) answer.
 * A MULTIPOLYGON keeps its largest part: a field is one outline, and the farmer can redraw it later.
 */
export function parseUldk(body: string): UldkParcel | null {
  const lines = body.replace(/\r/g, '').trim().split('\n');
  const status = lines[0]?.trim() ?? '';
  if (status.startsWith('-1')) return null;
  if (!/^\d+$/.test(status)) return fail('ULDK sent an answer in an unknown format.');

  const record = lines[1]?.trim() ?? '';
  const bar = record.lastIndexOf('|');
  if (bar < 0) return fail('ULDK sent a parcel without its number.');
  const teryt = record.slice(bar + 1).trim();
  if (!teryt) return fail('ULDK sent a parcel without its number.');

  const srid = /^SRID=(\d+);/i.exec(record);
  if (!srid) return fail('ULDK sent a geometry without its coordinate system.');
  const project =
    srid[1] === '4326' ? (p: number[]) => [p[0]!, p[1]!] : srid[1] === '2180' ? toWgs84 : fail(`ULDK sent coordinates in SRID ${srid[1]}.`);

  const polygons: Polygon[] = readWkt(record.slice(srid[0].length, bar)).map((rings) => ({
    type: 'Polygon',
    coordinates: rings.map((ring) => closed(ring.map(project))),
  }));
  const largest = polygons.reduce((best, p) => (areaHa(p) > areaHa(best) ? p : best));
  return { teryt, polygon: largest };
}

/** Area-weighted centre of the outer ring. Planar in degrees, which is close enough at parcel size. */
function centroidOf(polygon: Polygon): { lat: number; lon: number } {
  const ring = polygon.coordinates[0]!;
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1 = 0, y1 = 0] = ring[i]!;
    const [x2 = 0, y2 = 0] = ring[i + 1]!;
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (twiceArea === 0) {
    const [lon = 0, lat = 0] = ring[0]!;
    return { lat, lon };
  }
  return { lat: cy / (3 * twiceArea), lon: cx / (3 * twiceArea) };
}

let fieldCount = 0;
const runId = Date.now().toString(36);

/** The id is unique per created field: tapping the same parcel again must not replace a field the farmer reshaped. */
export function parcelToField({ teryt, polygon }: UldkParcel): Field {
  return {
    id: `parcel-${teryt}-${runId}${++fieldCount}`,
    name: t('parcels.field.name', { teryt }),
    country: 'PL',
    polygon,
    centroid: centroidOf(polygon),
    areaHa: areaHa(polygon),
    parcelIds: [teryt],
  };
}

async function request(params: Record<string, string>, fetchImpl: typeof fetch): Promise<Field | null> {
  const url = `${ULDK_URL}?${new URLSearchParams({ ...params, result: 'geom_wkt,teryt', srid: '4326' })}`;
  let res: Response;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw new SourceError(ULDK_SOURCE, error instanceof Error ? error.message : String(error));
  }
  if (!res.ok) fail(`ULDK answered with HTTP ${res.status}.`);
  const parcel = parseUldk(await res.text());
  return parcel ? parcelToField(parcel) : null;
}

/** The parcel under a WGS84 point, or null when there is none. Throws SourceError when ULDK fails. */
export function getParcelByPoint(lat: number, lon: number, fetchImpl: typeof fetch = fetch): Promise<Field | null> {
  return request({ request: 'GetParcelByXY', xy: `${lon},${lat},4326` }, fetchImpl);
}

/** The parcel with this full number, e.g. 302116_5.0008.428/1, or null when there is none. Throws SourceError when ULDK fails. */
export function getParcelById(id: string, fetchImpl: typeof fetch = fetch): Promise<Field | null> {
  return request({ request: 'GetParcelById', id: id.trim() }, fetchImpl);
}
