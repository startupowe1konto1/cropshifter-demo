import type { Polygon, Position } from 'geojson';
import { t } from '../../app/i18n';
import type { Field } from '../../contracts';
import { areaHa } from '../area';
import { drawnField } from '../draw/drawnField';
import { mergeFields, mergePolygons, splitField, splitPolygon } from './splitMerge';

// Poznań-sized squares, 0.002° on a side (about 140 m by 220 m). Geometry inputs, not fixture values.
const LON = 16.9;
const LAT = 52.4;
const S = 0.002;
const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
});
const reversed = (p: Polygon): Polygon => ({ type: 'Polygon', coordinates: [[...p.coordinates[0]!].reverse()] });
const square = rect(LON, LAT, LON + S, LAT + S);
const close = (a: number, b: number, relative: number) => Math.abs(a - b) <= relative * Math.abs(b);

describe('splitPolygon', () => {
  it('cuts a square through its middle into two halves whose areas add up to the original', () => {
    const result = splitPolygon(square, [[LON + S / 2, LAT - 1], [LON + S / 2, LAT + 1]]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [a, b] = result.parts.map(areaHa) as [number, number];
    expect(close(a + b, areaHa(square), 0.01)).toBe(true);
    expect(close(a, areaHa(square) / 2, 0.01)).toBe(true);
    for (const part of result.parts) {
      const ring = part.coordinates[0]!;
      expect(ring[0]).toEqual(ring[ring.length - 1]); // closed
    }
  });

  it('splits along a diagonal that passes through two corners', () => {
    const result = splitPolygon(square, [[LON, LAT], [LON + S, LAT + S]]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [a, b] = result.parts.map(areaHa) as [number, number];
    expect(close(a + b, areaHa(square), 0.01)).toBe(true);
    expect(close(a, b, 0.01)).toBe(true);
    for (const part of result.parts) expect(part.coordinates[0]).toHaveLength(4); // a triangle, closed
  });

  it('uses the whole straight line, not only the stretch between the two points', () => {
    // Both points lie left of the square; the line still crosses it.
    const result = splitPolygon(square, [[LON - 0.01, LAT + S / 2], [LON - 0.005, LAT + S / 2]]);
    expect(result.ok).toBe(true);
  });

  it('gives the same result for a clockwise outline', () => {
    const result = splitPolygon(reversed(square), [[LON + S / 2, LAT - 1], [LON + S / 2, LAT + 1]]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(close(result.parts.map(areaHa).reduce((s, v) => s + v, 0), areaHa(square), 0.01)).toBe(true);
  });

  it('says so when the line misses the field', () => {
    expect(splitPolygon(square, [[LON + 1, LAT], [LON + 1, LAT + 1]])).toEqual({ ok: false, reason: 'no-crossing' });
  });

  it('says so when the line only touches a corner', () => {
    // The line x + y = const through the lower-left corner touches the square at that one point.
    expect(splitPolygon(square, [[LON - 1, LAT + 1], [LON + 1, LAT - 1]])).toEqual({
      ok: false,
      reason: 'no-crossing',
    });
  });

  it('refuses a cut that crosses a bent outline more than twice', () => {
    // A "U" opening upwards: a horizontal line through both arms crosses four edges.
    const u: Polygon = {
      type: 'Polygon',
      coordinates: [[[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3], [0, 0]].map(([x, y]) => [LON + x! * S, LAT + y! * S])],
    };
    expect(splitPolygon(u, [[LON - 1, LAT + 2 * S], [LON + 1, LAT + 2 * S]])).toEqual({
      ok: false,
      reason: 'too-many-crossings',
    });
  });

  it('refuses an outline with a hole', () => {
    const outer = square.coordinates[0]!;
    const hole: Position[] = [[LON + S / 4, LAT + S / 4], [LON + S / 4, LAT + S / 2], [LON + S / 2, LAT + S / 2], [LON + S / 4, LAT + S / 4]];
    const withHole: Polygon = { type: 'Polygon', coordinates: [outer, hole] };
    expect(splitPolygon(withHole, [[LON + S / 2, LAT - 1], [LON + S / 2, LAT + 1]])).toEqual({ ok: false, reason: 'has-holes' });
  });

  it('refuses a line of zero length', () => {
    expect(splitPolygon(square, [[LON, LAT], [LON, LAT]])).toEqual({ ok: false, reason: 'no-crossing' });
  });
});

describe('mergePolygons', () => {
  const left = rect(LON, LAT, LON + S, LAT + S);
  const right = rect(LON + S, LAT, LON + 2 * S, LAT + S);

  it('joins two squares that share an edge into one polygon with the sum of the areas', () => {
    const merged = mergePolygons(left, right);
    expect(merged).not.toBeNull();
    expect(merged!.coordinates).toHaveLength(1);
    expect(close(areaHa(merged!), areaHa(left) + areaHa(right), 0.001)).toBe(true);
    const ring = merged!.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    // The shared edge is gone: no corner of the result lies inside it.
    const xs = new Set(ring.map((p) => p[0]));
    expect([...xs].every((x) => x === LON || x === LON + S || x === LON + 2 * S)).toBe(true);
  });

  it('does not care which polygon comes first or which way the outlines run', () => {
    const a = mergePolygons(right, reversed(left));
    expect(a).not.toBeNull();
    expect(close(areaHa(a!), areaHa(left) + areaHa(right), 0.001)).toBe(true);
  });

  it('returns null for fields that do not touch', () => {
    expect(mergePolygons(left, rect(LON + 5 * S, LAT, LON + 6 * S, LAT + S))).toBeNull();
  });

  it('returns null for fields that meet only at a corner', () => {
    expect(mergePolygons(left, rect(LON + S, LAT + S, LON + 2 * S, LAT + 2 * S))).toBeNull();
  });

  it('returns null when the union would enclose a hole', () => {
    // Three sides of a ring around an empty middle, then the fourth: the second merge would leave a hole.
    const c = rect(LON, LAT, LON + 3 * S, LAT + S);
    const d: Polygon = {
      type: 'Polygon',
      coordinates: [[[LON, LAT + S], [LON + S, LAT + S], [LON + S, LAT + 2 * S], [LON + 2 * S, LAT + 2 * S], [LON + 2 * S, LAT + S], [LON + 3 * S, LAT + S], [LON + 3 * S, LAT + 3 * S], [LON, LAT + 3 * S], [LON, LAT + S]]],
    };
    expect(mergePolygons(c, d)).toBeNull();
  });

  it('treats corners that differ by less than a centimetre as the same corner', () => {
    const nudged = rect(LON + S + 1e-9, LAT, LON + 2 * S, LAT + S);
    expect(mergePolygons(left, nudged)).not.toBeNull();
  });
});

describe('splitField and mergeFields', () => {
  const parent: Field = { ...drawnField(square, []), parcelIds: ['302116_5.0008.428/1'] };
  const neighbour: Field = {
    ...drawnField(rect(LON + S, LAT, LON + 2 * S, LAT + S), [parent]),
    parcelIds: ['302116_5.0008.429', '302116_5.0008.428/1'],
  };

  it('turns one field into two with the parent’s parcel numbers, new ids and area-matching sizes', () => {
    const result = splitField(parent, [[LON + S / 2, LAT - 1], [LON + S / 2, LAT + 1]], [parent, neighbour]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [a, b] = result.fields;
    expect(a.parcelIds).toEqual(parent.parcelIds);
    expect(b.parcelIds).toEqual(parent.parcelIds);
    expect(new Set([parent.id, neighbour.id, a.id, b.id]).size).toBe(4);
    expect(a.name).toBe(t('split.field.name', { name: parent.name, n: 1 }));
    expect(b.name).toBe(t('split.field.name', { name: parent.name, n: 2 }));
    expect(close(a.areaHa + b.areaHa, parent.areaHa, 0.01)).toBe(true);
    expect(a.country).toBe(parent.country);
    // One part on each side of the cut at LON + S / 2, whichever comes first.
    const cut = LON + S / 2;
    expect((a.centroid.lon - cut) * (b.centroid.lon - cut)).toBeLessThan(0);
  });

  it('passes the reason on when the cut fails', () => {
    const result = splitField(parent, [[LON + 1, LAT], [LON + 1, LAT + 1]], [parent]);
    expect(result).toEqual({ ok: false, reason: 'no-crossing' });
  });

  it('joins two fields into one that carries every parcel number once', () => {
    const merged = mergeFields(parent, neighbour, [parent, neighbour]);
    expect(merged).not.toBeNull();
    expect(merged!.parcelIds?.slice().sort()).toEqual(['302116_5.0008.428/1', '302116_5.0008.429']);
    expect(close(merged!.areaHa, parent.areaHa + neighbour.areaHa, 0.001)).toBe(true);
    expect(merged!.name).toBe(t('merge.field.name', { a: parent.name, b: neighbour.name }));
    expect([parent.id, neighbour.id]).not.toContain(merged!.id);
  });

  it('leaves out parcelIds when neither field has any', () => {
    const a = drawnField(square, []);
    const b = drawnField(rect(LON + S, LAT, LON + 2 * S, LAT + S), [a]);
    expect(mergeFields(a, b, [a, b])!.parcelIds).toBeUndefined();
  });

  it('returns null for fields that do not touch', () => {
    const far = drawnField(rect(LON + 9 * S, LAT, LON + 10 * S, LAT + S), [parent]);
    expect(mergeFields(parent, far, [parent, far])).toBeNull();
  });
});
