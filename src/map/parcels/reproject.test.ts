// @vitest-environment node
// The service returned the same parcel in EPSG:2180 and in WGS84, so its vertices are known coordinate pairs.
import { readFileSync } from 'node:fs';
import { fromWgs84, toWgs84 } from './reproject';

const SAMPLES = 'data/samples/uldk';

/** Vertices of the single POLYGON in a saved ULDK answer, as [x, y] pairs. Test helper, independent of the parser. */
function vertices(file: string): [number, number][] {
  const body = readFileSync(`${SAMPLES}/${file}`, 'utf8');
  const inner = /POLYGON\(\(([^)]+)\)\)/.exec(body)?.[1];
  if (!inner) throw new Error(`no polygon in ${file}`);
  return inner.split(',').map((pair) => {
    const [x, y] = pair.trim().split(/\s+/).map(Number);
    return [x!, y!];
  });
}

const puwg = vertices('parcel-by-id-428-1-srid2180.txt');
const wgs = vertices('parcel-by-id-428-1-srid4326.txt');

describe('reproject', () => {
  it('has the same number of vertices in both samples', () => {
    expect(puwg.length).toBeGreaterThan(3);
    expect(wgs.length).toBe(puwg.length);
  });

  it('turns EPSG:2180 into WGS84 within 1e-5 degrees of what ULDK sends', () => {
    puwg.forEach((point, i) => {
      const [lon, lat] = toWgs84(point);
      expect(Math.abs(lon - wgs[i]![0])).toBeLessThan(1e-5);
      expect(Math.abs(lat - wgs[i]![1])).toBeLessThan(1e-5);
    });
  });

  it('turns WGS84 into EPSG:2180 within 1 m of what ULDK sends', () => {
    wgs.forEach((point, i) => {
      const [x, y] = fromWgs84(point);
      expect(Math.abs(x - puwg[i]![0])).toBeLessThan(1);
      expect(Math.abs(y - puwg[i]![1])).toBeLessThan(1);
    });
  });
});
