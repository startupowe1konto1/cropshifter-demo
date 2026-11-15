// SMAP L4 root-zone soil moisture at a point, read from a NASA GIBS WMS pixel and the GIBS colormap.
// Port of context/scripts/gibs_point.py. Colormap parser written against data/samples/field-shift/cmap_rz.xml;
// the WMS pixel test runs against data/samples/field-shift/wms_rz.png.
import cmapRzXml from '../../data/samples/field-shift/cmap_rz.xml?raw';
import { SourceError, type Sourced } from '../contracts';

const SOURCE = 'NASA GIBS (SMAP)';
export const SMAP_DATASET_ID = 'smap-l4-rootzone';
/** GIBS layer of the SMAP L4 analysed root-zone soil moisture (colormap SMAP_Analyzed_Soil_Moisture.xml). */
export const SMAP_LAYER = 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture';
const WMS_BASE = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
/** Half the box side in degrees, as in gibs_point.py: 0.1 x 0.1 degrees over 11 x 11 px. */
const HALF_BOX_DEG = 0.05;
const BOX_PX = 11;
const UNIT = 'm³/m³';
/** First full month of SMAP L4 data (the record starts on 31 March 2015). */
const FIRST_MONTH = '2015-04';
const SAMPLE_DAYS = ['01', '15'];
const NO_VALUE_REASON = 'no SMAP value at this point (transparent pixel, e.g. water, frozen soil or outside the model grid)';

export type Rgb = [number, number, number];
export type Rgba = [number, number, number, number];

export interface ColormapEntry {
  rgb: Rgb;
  low: number | null;    // lower bound of the bin, m³/m³; null for no-data
  high: number | null;   // upper bound (exclusive); null for no-data and for the open last bin
  label: string;         // the colormap's own value text, e.g. '[0.119,0.121)'
  nodata: boolean;
  transparent: boolean;
}

export interface SmapReading {
  value: number;                                  // bin midpoint; lower bound for the open last bin
  bin: { low: number; high: number | null };
}

export interface SmapPoint {
  date: string;                                   // YYYY-MM-DD asked for
  value: number | null;
  bin: SmapReading['bin'] | null;
  missingReason?: string;
}

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** Parses the GIBS colormap XML (ColorMap_v1.3): every ColorMapEntry with its colour, bin and no-data flag. */
export function parseColormap(xml: string): ColormapEntry[] {
  const entries: ColormapEntry[] = [];
  for (const m of xml.matchAll(/<ColorMapEntry\b[^>]*>/g)) {
    const tag = m[0];
    const rgbText = attr(tag, 'rgb');
    const label = attr(tag, 'value') ?? '';
    const parts = rgbText?.split(',').map(Number);
    if (!parts || parts.length !== 3 || parts.some((n) => !Number.isInteger(n))) continue;
    const nodata = attr(tag, 'nodata') === 'true';
    const transparent = attr(tag, 'transparent') === 'true';
    let low: number | null = null;
    let high: number | null = null;
    if (!nodata) {
      const bounds = /^\[\s*([-\d.]+)\s*,\s*([-+\d.]+|\+?INF)\s*\)$/i.exec(label);
      if (!bounds) continue;
      low = Number(bounds[1]);
      high = /INF/i.test(bounds[2]!) ? null : Number(bounds[2]);
    }
    entries.push({ rgb: parts as Rgb, low, high, label, nodata, transparent });
  }
  return entries;
}

let defaultColormap: ColormapEntry[] | null = null;
/** The SMAP root-zone colormap shipped with the app (copy of GIBS SMAP_Analyzed_Soil_Moisture.xml). */
export function smapColormap(): ColormapEntry[] {
  defaultColormap ??= parseColormap(cmapRzXml);
  return defaultColormap;
}

/** Maps a pixel colour to a soil moisture value. Null for a transparent pixel, the no-data colour or an unknown colour. */
export function colorToValue(pixel: Rgb | Rgba, colormap: ColormapEntry[]): SmapReading | null {
  const [r, g, b] = pixel;
  if (pixel.length === 4 && pixel[3] === 0) return null;
  const entry = colormap.find((e) => e.rgb[0] === r && e.rgb[1] === g && e.rgb[2] === b);
  if (!entry || entry.nodata || entry.transparent || entry.low === null) return null;
  const value = entry.high === null ? entry.low : (entry.low + entry.high) / 2;
  return { value, bin: { low: entry.low, high: entry.high } };
}

const coord = (x: number): string => String(Number(x.toFixed(6)));

/** GIBS WMS GetMap for an 11 x 11 px PNG centred on the point, as gibs_point.py builds it. */
export function smapWmsUrl(lat: number, lon: number, date: string): string {
  const bbox = [lon - HALF_BOX_DEG, lat - HALF_BOX_DEG, lon + HALF_BOX_DEG, lat + HALF_BOX_DEG].map(coord).join(',');
  return (
    `${WMS_BASE}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1` +
    `&LAYERS=${SMAP_LAYER}&SRS=EPSG:4326&BBOX=${bbox}` +
    `&WIDTH=${BOX_PX}&HEIGHT=${BOX_PX}&FORMAT=image/png&TIME=${date}&STYLES=`
  );
}

export type DecodePixel = (bytes: ArrayBuffer) => Promise<Rgba>;

/** Browser decoder: draws the PNG on a canvas and reads the centre pixel. No smoothing, so colours stay exact. */
export const decodeCentrePixelBrowser: DecodePixel = async (bytes) => {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const { width, height } = bitmap;
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('no 2D canvas');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const d = ctx.getImageData(Math.floor(width / 2), Math.floor(height / 2), 1, 1).data;
  return [d[0]!, d[1]!, d[2]!, d[3]!];
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface SmapPointOptions {
  decodePixel?: DecodePixel;
  colormap?: ColormapEntry[];
}

/** Reads SMAP L4 root-zone soil moisture at one point on one day. Throws SourceError when GIBS fails. */
export async function fetchSmapPoint(
  lat: number,
  lon: number,
  date: string,
  fetchImpl: typeof fetch = fetch,
  { decodePixel = decodeCentrePixelBrowser, colormap = smapColormap() }: SmapPointOptions = {},
): Promise<SmapPoint> {
  let res: Response;
  try {
    res = await fetchImpl(smapWmsUrl(lat, lon, date));
  } catch (e) {
    throw new SourceError(SOURCE, `NASA GIBS could not be reached: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new SourceError(SOURCE, `NASA GIBS answered with status ${res.status}`);
  const bytes = await res.arrayBuffer();
  const head = new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength));
  if (head.length < 8 || PNG_SIGNATURE.some((b, i) => head[i] !== b)) {
    throw new SourceError(SOURCE, 'NASA GIBS sent an unexpected response: not a PNG image');
  }
  let pixel: Rgba;
  try {
    pixel = await decodePixel(bytes);
  } catch (e) {
    throw new SourceError(SOURCE, `the GIBS image could not be read: ${e instanceof Error ? e.message : String(e)}`);
  }
  const reading = colorToValue(pixel, colormap);
  if (!reading) {
    const known = pixel[3] === 0 || colormap.some((e) => e.nodata && e.rgb.every((c, i) => c === pixel[i]));
    return { date, value: null, bin: null, missingReason: known ? NO_VALUE_REASON : `colour ${pixel.slice(0, 3).join(',')} is not in the SMAP colormap` };
  }
  return { date, value: reading.value, bin: reading.bin };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** YYYY-MM of the month before `now`, in the user's local calendar. */
export function lastFullMonth(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function monthsBetween(from: string, to: string): string[] {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  const out: string[] = [];
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) out.push(`${y}-${pad2(m)}`);
  return out;
}

const localIsoDate = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export interface SmapMonth { month: string; value: Sourced }

export interface SmapMonthlyOptions {
  fetchPoint?: (lat: number, lon: number, date: string) => Promise<SmapPoint>;
  fetchImpl?: typeof fetch;
  now?: Date;
  concurrency?: number;   // requests in flight at once, default 4
}

/**
 * Monthly means of SMAP L4 root-zone soil moisture at a point, sampled on day 1 and 15 of each month.
 * A month with no usable sample is null with a reason. Throws SourceError when every request fails.
 */
export async function smapMonthlyMeans(
  lat: number,
  lon: number,
  range: { from?: string; to?: string } = {},
  { fetchPoint, fetchImpl, now = new Date(), concurrency = 4 }: SmapMonthlyOptions = {},
): Promise<SmapMonth[]> {
  const getPoint = fetchPoint ?? ((la: number, lo: number, date: string) => fetchSmapPoint(la, lo, date, fetchImpl ?? fetch));
  const months = monthsBetween(range.from ?? FIRST_MONTH, range.to ?? lastFullMonth(now));
  const dates = months.flatMap((m) => SAMPLE_DAYS.map((d) => `${m}-${d}`));

  type Outcome = { ok: true; point: SmapPoint } | { ok: false; reason: string };
  const outcomes = new Map<string, Outcome>();
  let next = 0;
  const worker = async () => {
    while (next < dates.length) {
      const date = dates[next++]!;
      try {
        outcomes.set(date, { ok: true, point: await getPoint(lat, lon, date) });
      } catch (e) {
        outcomes.set(date, { ok: false, reason: e instanceof Error ? e.message : String(e) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, dates.length)) }, worker));

  if (dates.length > 0 && dates.every((d) => outcomes.get(d)?.ok === false)) {
    const first = outcomes.get(dates[0]!) as { ok: false; reason: string };
    throw new SourceError(SOURCE, `every SMAP request failed, e.g. ${first.reason}`);
  }

  const retrievedAt = localIsoDate(now);
  return months.map((month) => {
    const samples = SAMPLE_DAYS.map((d) => outcomes.get(`${month}-${d}`)!);
    const values = samples.flatMap((s) => (s.ok && s.point.value !== null ? [s.point.value] : []));
    const base = { unit: UNIT, datasetIds: [SMAP_DATASET_ID], kind: 'model' as const, retrievedAt };
    if (values.length > 0) return { month, value: { ...base, value: values.reduce((a, b) => a + b, 0) / values.length } };
    const reasons = [...new Set(samples.map((s) => (s.ok ? s.point.missingReason ?? NO_VALUE_REASON : `request failed: ${s.reason}`)))];
    return { month, value: { ...base, value: null, missingReason: reasons.join('; ') } };
  });
}
