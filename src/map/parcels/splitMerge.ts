// Cut a field in two along a line, or join two fields that share a border. Pure: no Leaflet, no store.
// Plain lon/lat geometry, which is exact enough at field size. Areas are measured afterwards on the sphere (`areaHa`).
// Geoman's own cut tool subtracts a drawn shape from a field, which is not a split, so the line is two taps of ours.
import type { Polygon, Position } from 'geojson';
import { t } from '../../app/i18n';
import type { Field } from '../../contracts';
import { reshapedField, uniqueFieldId } from '../draw/drawnField';

export type SplitFailure = 'no-crossing' | 'too-many-crossings' | 'has-holes';
export type SplitResult = { ok: true; parts: [Polygon, Polygon] } | { ok: false; reason: SplitFailure };
export type FieldSplitResult = { ok: true; fields: [Field, Field] } | { ok: false; reason: SplitFailure };

const x = (p: Position) => p[0] ?? 0;
const y = (p: Position) => p[1] ?? 0;
const samePosition = (a: Position, b: Position) => x(a) === x(b) && y(a) === y(b);

/** The ring without its repeated last point. */
function openRing(ring: Position[]): Position[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first && last && ring.length > 1 && samePosition(first, last) ? ring.slice(0, -1) : [...ring];
}

const signedArea = (ring: Position[]) =>
  ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length]!;
    return sum + (x(p) * y(q) - x(q) * y(p));
  }, 0) / 2;

/** Same points, closed, without two equal points in a row. */
function closedRing(points: Position[]): Position[] {
  const ring = points.filter((p, i) => i === 0 || !samePosition(p, points[i - 1]!));
  const first = ring[0]!;
  if (samePosition(first, ring[ring.length - 1]!)) ring.pop();
  return [...ring, first];
}

/**
 * Splits `polygon` along the straight line through the two points (the line goes on past them, so the farmer only has
 * to tap on either side of the field). Works when the line crosses the outline exactly twice; a bent outline that the
 * line crosses more often has no single obvious cut.
 */
export function splitPolygon(polygon: Polygon, line: [Position, Position]): SplitResult {
  if (polygon.coordinates.length > 1) return { ok: false, reason: 'has-holes' };
  const ring = openRing(polygon.coordinates[0] ?? []);
  const [p, q] = line;
  const dx = x(q) - x(p);
  const dy = y(q) - y(p);
  if (ring.length < 3 || (dx === 0 && dy === 0)) return { ok: false, reason: 'no-crossing' };

  // Which side of the line each corner lies on. A corner exactly on the line counts as the positive side.
  const side = ring.map((v) => dx * (y(v) - y(p)) - dy * (x(v) - x(p)));
  const crossings: { edge: number; point: Position }[] = [];
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    const s1 = side[i]!;
    const s2 = side[j]!;
    if (s1 >= 0 === s2 >= 0) continue;
    const u = s1 / (s1 - s2);
    const a = ring[i]!;
    const b = ring[j]!;
    crossings.push({ edge: i, point: [x(a) + u * (x(b) - x(a)), y(a) + u * (y(b) - y(a))] });
  }
  if (crossings.length < 2) return { ok: false, reason: 'no-crossing' };
  if (crossings.length > 2) return { ok: false, reason: 'too-many-crossings' };

  const [c1, c2] = crossings as [(typeof crossings)[number], (typeof crossings)[number]];
  const arc = (from: number, to: number) => {
    const points: Position[] = [];
    for (let k = from + 1; ; k++) {
      const index = k % ring.length;
      points.push(ring[index]!);
      if (index === to) break;
    }
    return points;
  };
  const partA = closedRing([c1.point, ...arc(c1.edge, c2.edge), c2.point]);
  const partB = closedRing([c2.point, ...arc(c2.edge, c1.edge), c1.point]);
  // A line that only grazes a corner leaves one part with no area.
  if (partA.length < 4 || partB.length < 4 || signedArea(partA.slice(0, -1)) === 0 || signedArea(partB.slice(0, -1)) === 0) {
    return { ok: false, reason: 'no-crossing' };
  }
  return {
    ok: true,
    parts: [
      { type: 'Polygon', coordinates: [partA] },
      { type: 'Polygon', coordinates: [partB] },
    ],
  };
}

// Corners closer than this (1e-7 degrees, about a centimetre) are the same corner.
const SNAP = 1e7;
const keyOf = (p: Position) => `${Math.round(x(p) * SNAP)},${Math.round(y(p) * SNAP)}`;

interface Edge {
  from: Position;
  to: Position;
}

/** Directed edges of the outer ring, running counter-clockwise. */
function counterClockwiseEdges(polygon: Polygon): Edge[] {
  let ring = openRing(polygon.coordinates[0] ?? []);
  if (signedArea(ring) < 0) ring = [...ring].reverse();
  return ring.map((from, i) => ({ from, to: ring[(i + 1) % ring.length]! }));
}

/**
 * Joins two polygons that share a border. Both outlines are turned the same way, the edges they have in common
 * (one runs a→b, the other b→a) are dropped, and what is left is stitched back into one ring. Returns null when they
 * share no edge, meet only at a corner, or the result would be more than one plain ring (a hole, two pieces).
 * Shared edges need matching corners, which neighbouring cadastral parcels have.
 */
export function mergePolygons(a: Polygon, b: Polygon): Polygon | null {
  if (a.coordinates.length > 1 || b.coordinates.length > 1) return null;
  const edgesA = counterClockwiseEdges(a);
  const edgesB = counterClockwiseEdges(b);
  // Keys of every edge written backwards: an edge of the other polygon matching one of these is a shared border.
  const reversedKeys = (edges: Edge[]) => new Set(edges.map((e) => `${keyOf(e.to)}>${keyOf(e.from)}`));
  const forwardKey = (e: Edge) => `${keyOf(e.from)}>${keyOf(e.to)}`;
  const reversedB = reversedKeys(edgesB);
  const reversedA = reversedKeys(edgesA);
  const keptA = edgesA.filter((e) => !reversedB.has(forwardKey(e)));
  const keptB = edgesB.filter((e) => !reversedA.has(forwardKey(e)));
  if (keptA.length === edgesA.length) return null; // no shared edge

  const remaining = [...keptA, ...keptB];
  const next = new Map<string, Edge>();
  for (const edge of remaining) {
    const key = keyOf(edge.from);
    if (next.has(key)) return null; // two edges leave one corner: the outlines touch at a point as well
    next.set(key, edge);
  }
  const start = remaining[0];
  if (!start) return null;
  const ring: Position[] = [];
  let edge: Edge | undefined = start;
  while (edge && ring.length <= remaining.length) {
    ring.push(edge.from);
    edge = next.get(keyOf(edge.to));
    if (edge === start) break;
  }
  if (ring.length !== remaining.length || edge !== start) return null; // more than one ring, or a loose end
  return { type: 'Polygon', coordinates: [closedRing(ring)] };
}

/** Cuts a field in two. The parts keep the parent's parcel numbers; ids are new, names are "<name> (1)" and "(2)". */
export function splitField(field: Field, line: [Position, Position], existing: Field[]): FieldSplitResult {
  const result = splitPolygon(field.polygon, line);
  if (!result.ok) return result;
  const taken = [...existing];
  const make = (polygon: Polygon, n: number): Field => {
    const id = uniqueFieldId(taken);
    const part = reshapedField({ ...field, id, name: t('split.field.name', { name: field.name, n }) }, polygon);
    taken.push(part);
    return part;
  };
  return { ok: true, fields: [make(result.parts[0], 1), make(result.parts[1], 2)] };
}

/** Joins two fields into a new one with every parcel number of both, or null when they share no border. */
export function mergeFields(a: Field, b: Field, existing: Field[]): Field | null {
  const polygon = mergePolygons(a.polygon, b.polygon);
  if (!polygon) return null;
  const parcelIds = [...new Set([...(a.parcelIds ?? []), ...(b.parcelIds ?? [])])];
  const base: Field = { ...a, id: uniqueFieldId(existing), name: t('merge.field.name', { a: a.name, b: b.name }) };
  const merged = reshapedField(base, polygon);
  if (parcelIds.length > 0) merged.parcelIds = parcelIds;
  else delete merged.parcelIds;
  return merged;
}
