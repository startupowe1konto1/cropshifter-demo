// An outline drawn or reshaped on the map becomes a Field. Pure: no Leaflet, no store.
import type { Polygon, Position } from 'geojson';
import { t } from '../../app/i18n';
import type { Field } from '../../contracts';
import { areaHa } from '../area';
import { guessCountry } from '../pointToField';

const samePoint = (a: Position | undefined, b: Position | undefined) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

/** Every ring closed (first point repeated last), as GeoJSON and `areaHa` expect. */
function closeRings(polygon: Polygon): Polygon {
  return {
    type: 'Polygon',
    coordinates: polygon.coordinates.map((ring) =>
      ring.length > 0 && !samePoint(ring[0], ring[ring.length - 1]) ? [...ring, ring[0]!] : ring,
    ),
  };
}

/** Area-weighted centroid of the outer ring in plain lon/lat. Fine at field size; falls back to the vertex mean for a degenerate ring. */
export function centroidOf(polygon: Polygon): { lat: number; lon: number } {
  const ring = polygon.coordinates[0] ?? [];
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
  if (Math.abs(twiceArea) > 1e-14) return { lon: cx / (3 * twiceArea), lat: cy / (3 * twiceArea) };
  const points = ring.slice(0, Math.max(1, ring.length - 1));
  const mean = (k: 0 | 1) => points.reduce((sum, p) => sum + (p[k] ?? 0), 0) / Math.max(1, points.length);
  return { lon: mean(0), lat: mean(1) };
}

let counter = 0;
const newId = () => `drawn-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** "Drawn field 1", "Drawn field 2", ...: the lowest number whose name is not taken yet. */
function defaultName(existing: Field[]): string {
  const taken = new Set(existing.map((f) => f.name));
  for (let n = 1; ; n++) {
    const name = t('draw.field.defaultName', { n });
    if (!taken.has(name)) return name;
  }
}

/** Geometry-derived parts of a field: closed outline, centroid, country guess and area. */
function shape(polygon: Polygon): Pick<Field, 'polygon' | 'centroid' | 'country' | 'areaHa'> {
  const closed = closeRings(polygon);
  const centroid = centroidOf(closed);
  return { polygon: closed, centroid, country: guessCountry(centroid.lat, centroid.lon), areaHa: areaHa(closed) };
}

/** An id no field in `existing` has. */
export function uniqueFieldId(existing: Field[]): string {
  let id = newId();
  while (existing.some((f) => f.id === id)) id = newId();
  return id;
}

/** A new field from a freshly drawn outline. `existing` keeps the default name unique. */
export function drawnField(polygon: Polygon, existing: Field[]): Field {
  return { id: uniqueFieldId(existing), name: defaultName(existing), ...shape(polygon) };
}

/** The same field (id, name, parcels) with a reshaped outline. */
export function reshapedField(field: Field, polygon: Polygon): Field {
  return { ...field, ...shape(polygon) };
}
