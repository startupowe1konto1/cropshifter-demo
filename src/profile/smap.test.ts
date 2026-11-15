// @vitest-environment node
// Node environment so the test can read the saved GIBS samples and decode a PNG with node:zlib.
// node:zlib is used here only; browser code in smap.ts decodes with createImageBitmap + canvas.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { SourceError } from '../contracts';
import { datasets } from './datasets';
import {
  SMAP_DATASET_ID,
  SMAP_LAYER,
  colorToValue,
  fetchSmapPoint,
  lastFullMonth,
  parseColormap,
  smapMonthlyMeans,
  smapWmsUrl,
  type SmapPoint,
} from './smap';

const SAMPLES = 'data/samples/field-shift';
const cmapXml = readFileSync(`${SAMPLES}/cmap_rz.xml`, 'utf8');
const colormap = parseColormap(cmapXml);

/** Minimal PNG reader for the test only: 8-bit RGBA, non-interlaced (what GIBS sends). Returns the centre pixel. */
function decodeCentrePixelNode(bytes: ArrayBuffer): Promise<[number, number, number, number]> {
  const b = Buffer.from(bytes);
  let p = 8;
  let width = 0, height = 0;
  const idat: Buffer[] = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p);
    const type = b.toString('latin1', p + 4, p + 8);
    const data = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error('test decoder handles 8-bit RGBA, non-interlaced only');
    }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]!;
      const a = x >= bpp ? out[y * stride + x - bpp]! : 0;
      const up = y > 0 ? out[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp]! : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = up;
      else if (filter === 3) pred = (a + up) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      out[y * stride + x] = (v + pred) & 0xff;
    }
  }
  const i = Math.floor(height / 2) * stride + Math.floor(width / 2) * bpp;
  return Promise.resolve([out[i]!, out[i + 1]!, out[i + 2]!, out[i + 3]!]);
}

const toArrayBuffer = (buf: Buffer): ArrayBuffer => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

describe('parseColormap', () => {
  it('reads 256 entries: one no-data entry and 255 value bins', () => {
    expect(colormap).toHaveLength(256);
    expect(colormap.filter((e) => e.nodata)).toHaveLength(1);
  });

  it('reads the first value bin, and the open last bin', () => {
    expect(colormap[1]).toMatchObject({ rgb: [255, 162, 0], low: 0, high: 0.003, label: '[0.000,0.003)', nodata: false });
    expect(colormap[255]).toMatchObject({ rgb: [80, 80, 80], low: 0.7, high: null, label: '[0.700,+INF)' });
  });

  it('marks the no-data entry as transparent', () => {
    expect(colormap[0]).toMatchObject({ rgb: [0, 0, 0], nodata: true, transparent: true });
  });
});

describe('colorToValue against smap_rz_summer_series.tsv', () => {
  const rows = readFileSync(`${SAMPLES}/smap_rz_summer_series.tsv`, 'utf8')
    .trim()
    .split('\n')
    .map((line) => line.split('\t'))
    .map(([date, text]) => {
      const m = /^([\d.]+) m3\/m3 \(bin \[([\d.]+),([\d.]+)\)\)$/.exec(text ?? '');
      return m ? { date, value: Number(m[1]), low: Number(m[2]), high: Number(m[3]) } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  it('has rows to check', () => {
    expect(rows.length).toBeGreaterThan(150);
  });

  it.each([0, 3, 7, 40, 90, 140])('row %i: the colour of the stated bin maps back to its value and bin', (i) => {
    const row = rows[i]!;
    const entry = colormap.find((e) => e.low === row.low && e.high === row.high);
    expect(entry).toBeDefined();
    const got = colorToValue([...entry!.rgb, 255], colormap);
    expect(got).not.toBeNull();
    expect(got!.bin).toEqual({ low: row.low, high: row.high });
    // gibs_point.py prints the bin midpoint with 3 decimals; the midpoint itself is exact.
    expect(Math.abs(got!.value - row.value)).toBeLessThanOrEqual(0.0005 + 1e-9);
    expect(got!.value).toBeCloseTo((row.low + row.high) / 2, 9);
  });

  it('every row of the tsv has a bin in the colormap', () => {
    for (const row of rows) expect(colormap.some((e) => e.low === row.low && e.high === row.high)).toBe(true);
  });

  it('a transparent pixel is no data', () => {
    expect(colorToValue([0, 0, 0, 0], colormap)).toBeNull();
    expect(colorToValue([255, 162, 0, 0], colormap)).toBeNull();
  });

  it('the no-data colour is no data', () => {
    expect(colorToValue([0, 0, 0, 255], colormap)).toBeNull();
  });

  it('a colour that is not in the colormap is no data', () => {
    expect(colorToValue([1, 2, 3, 255], colormap)).toBeNull();
  });

  it('the open last bin returns its lower bound', () => {
    expect(colorToValue([80, 80, 80, 255], colormap)).toEqual({ value: 0.7, bin: { low: 0.7, high: null } });
  });
});

describe('smapWmsUrl', () => {
  it('builds the GIBS WMS GetMap request for an 11 x 11 px box around the point', () => {
    const url = new URL(smapWmsUrl(52.4, 16.9, '2026-07-01'));
    expect(url.origin).toBe('https://gibs.earthdata.nasa.gov');
    expect(url.pathname).toBe('/wms/epsg4326/best/wms.cgi');
    const q = Object.fromEntries(url.searchParams);
    expect(q).toEqual({
      SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1',
      LAYERS: SMAP_LAYER, SRS: 'EPSG:4326',
      BBOX: '16.85,52.35,16.95,52.45',
      WIDTH: '11', HEIGHT: '11', FORMAT: 'image/png', TIME: '2026-07-01', STYLES: '',
    });
  });
});

describe('fetchSmapPoint', () => {
  const png = readFileSync(`${SAMPLES}/wms_rz.png`);
  const okFetch = (async () => new Response(toArrayBuffer(png), { status: 200, headers: { 'content-type': 'image/png' } })) as typeof fetch;

  it('decodes the saved WMS sample and maps its centre pixel to a plausible root-zone value', async () => {
    const p = await fetchSmapPoint(52.4, 16.9, '2026-07-01', okFetch, { decodePixel: decodeCentrePixelNode, colormap });
    expect(p.date).toBe('2026-07-01');
    expect(p.value).not.toBeNull();
    expect(p.value!).toBeGreaterThan(0);
    expect(p.value!).toBeLessThan(0.7);
    expect(p.bin!.high! - p.bin!.low).toBeLessThan(0.004);
  });

  it('asks the WMS URL for the point and date', async () => {
    const calls: string[] = [];
    const f = (async (u: RequestInfo | URL) => {
      calls.push(String(u));
      return new Response(toArrayBuffer(png));
    }) as typeof fetch;
    await fetchSmapPoint(52.4, 16.9, '2026-07-01', f, { decodePixel: decodeCentrePixelNode, colormap });
    expect(calls).toEqual([smapWmsUrl(52.4, 16.9, '2026-07-01')]);
  });

  it('returns null with a reason for a transparent pixel', async () => {
    const p = await fetchSmapPoint(52.4, 16.9, '2026-07-01', okFetch, { decodePixel: async () => [0, 0, 0, 0], colormap });
    expect(p.value).toBeNull();
    expect(p.missingReason).toMatch(/no SMAP value/i);
  });

  it('throws SourceError on HTTP 500', async () => {
    const f = (async () => new Response('boom', { status: 500 })) as typeof fetch;
    await expect(fetchSmapPoint(52.4, 16.9, '2026-07-01', f, { decodePixel: decodeCentrePixelNode, colormap })).rejects.toBeInstanceOf(SourceError);
    await expect(fetchSmapPoint(52.4, 16.9, '2026-07-01', f, { decodePixel: decodeCentrePixelNode, colormap })).rejects.toMatchObject({ source: 'NASA GIBS (SMAP)' });
  });

  it('throws SourceError when the network fails', async () => {
    const f = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    await expect(fetchSmapPoint(52.4, 16.9, '2026-07-01', f, { decodePixel: decodeCentrePixelNode, colormap })).rejects.toBeInstanceOf(SourceError);
  });

  it('throws SourceError when the body is not a PNG (a WMS service exception)', async () => {
    const f = (async () => new Response('<ServiceExceptionReport/>', { status: 200 })) as typeof fetch;
    await expect(fetchSmapPoint(52.4, 16.9, '2026-07-01', f, { decodePixel: decodeCentrePixelNode, colormap })).rejects.toBeInstanceOf(SourceError);
  });
});

describe('lastFullMonth', () => {
  it('is the month before the current one', () => {
    expect(lastFullMonth(new Date(2026, 10, 14))).toBe('2026-10');
    expect(lastFullMonth(new Date(2026, 0, 3))).toBe('2025-12');
  });
});

describe('smapMonthlyMeans', () => {
  const now = new Date(2026, 10, 14);
  const point = (date: string, value: number | null): SmapPoint =>
    value === null
      ? { date, value: null, bin: null, missingReason: 'no SMAP value at this point (transparent pixel)' }
      : { date, value, bin: { low: value - 0.001, high: value + 0.001 } };

  it('samples day 1 and day 15 of each month and averages them', async () => {
    const asked: string[] = [];
    const fetchPoint = async (_lat: number, _lon: number, date: string) => {
      asked.push(date);
      return point(date, date.endsWith('-01') ? 0.1 : 0.2);
    };
    const out = await smapMonthlyMeans(52.4, 16.9, { from: '2026-01', to: '2026-03' }, { fetchPoint, now });
    expect([...asked].sort()).toEqual(['2026-01-01', '2026-01-15', '2026-02-01', '2026-02-15', '2026-03-01', '2026-03-15']);
    expect(out.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(out[0]!.value.value).toBeCloseTo(0.15, 9);
    expect(out[0]!.value).toMatchObject({
      unit: 'm³/m³', datasetIds: [SMAP_DATASET_ID], kind: 'model', retrievedAt: '2026-11-14',
    });
    expect(out[0]!.value.missingReason).toBeUndefined();
  });

  it('a month whose requests all fail is null with a reason, not a filled value', async () => {
    const fetchPoint = async (_lat: number, _lon: number, date: string) => {
      if (date.startsWith('2026-02')) throw new SourceError('NASA GIBS (SMAP)', 'NASA GIBS answered with status 500');
      return point(date, 0.12);
    };
    const out = await smapMonthlyMeans(52.4, 16.9, { from: '2026-01', to: '2026-03' }, { fetchPoint, now });
    expect(out[1]!.value.value).toBeNull();
    expect(out[1]!.value.missingReason).toMatch(/status 500/);
    expect(out[0]!.value.value).toBeCloseTo(0.12, 9);
    expect(out[2]!.value.value).toBeCloseTo(0.12, 9);
  });

  it('a month with only transparent pixels is null with the no-data reason', async () => {
    const fetchPoint = async (_lat: number, _lon: number, date: string) => point(date, date.startsWith('2026-01') ? null : 0.2);
    const out = await smapMonthlyMeans(52.4, 16.9, { from: '2026-01', to: '2026-02' }, { fetchPoint, now });
    expect(out[0]!.value).toMatchObject({ value: null, missingReason: expect.stringMatching(/no SMAP value/) });
  });

  it('a month with one good sample uses that sample only', async () => {
    const fetchPoint = async (_lat: number, _lon: number, date: string) => {
      if (date === '2026-01-15') throw new Error('timeout');
      return point(date, 0.3);
    };
    const out = await smapMonthlyMeans(52.4, 16.9, { from: '2026-01', to: '2026-01' }, { fetchPoint, now });
    expect(out[0]!.value.value).toBeCloseTo(0.3, 9);
  });

  it('throws SourceError when every request fails', async () => {
    const fetchPoint = async () => { throw new SourceError('NASA GIBS (SMAP)', 'down'); };
    await expect(smapMonthlyMeans(52.4, 16.9, { from: '2026-01', to: '2026-02' }, { fetchPoint, now })).rejects.toMatchObject({
      name: 'SourceError', source: 'NASA GIBS (SMAP)',
    });
  });

  it('defaults to April 2015 through the last full month', async () => {
    const fetchPoint = async (_lat: number, _lon: number, date: string) => point(date, 0.1);
    const out = await smapMonthlyMeans(52.4, 16.9, {}, { fetchPoint, now, concurrency: 8 });
    expect(out[0]!.month).toBe('2015-04');
    expect(out.at(-1)!.month).toBe('2026-10');
    expect(out).toHaveLength(9 + 11 * 12 - 2);
  });

  it('runs no more requests at once than the concurrency limit', async () => {
    let running = 0, peak = 0;
    const fetchPoint = async (_lat: number, _lon: number, date: string) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
      return point(date, 0.1);
    };
    await smapMonthlyMeans(52.4, 16.9, { from: '2025-01', to: '2025-12' }, { fetchPoint, now, concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('SMAP dataset entry', () => {
  it('is listed as a NASA model estimate at 9 km', () => {
    expect(datasets.find((d) => d.id === SMAP_DATASET_ID)).toMatchObject({
      provider: 'NASA', nasa: true, resolution: '9 km', kind: 'model',
    });
  });
});
