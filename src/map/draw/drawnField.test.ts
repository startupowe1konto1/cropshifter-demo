import type { Polygon, Position } from 'geojson';
import { demoFields } from '../../fixtures';
import { areaHa } from '../area';
import { drawnField, reshapedField } from './drawnField';

const METRES_PER_DEGREE = 111_320;

/** Open ring (first point not repeated) of a `sideM` square around the point, as a hand-drawn shape might arrive. */
function openSquare(lat: number, lon: number, sideM: number): Polygon {
  const dLat = sideM / 2 / METRES_PER_DEGREE;
  const dLon = sideM / 2 / (METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180));
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lon - dLon, lat - dLat],
        [lon + dLon, lat - dLat],
        [lon + dLon, lat + dLat],
        [lon - dLon, lat + dLat],
      ],
    ],
  };
}

const near = demoFields.poznan.centroid;
const nearIowa = demoFields.iowa.centroid;

describe('drawnField', () => {
  it('turns a polygon near Poznań into a Polish field with its own area and centroid', () => {
    const polygon = openSquare(near.lat + 0.01, near.lon + 0.01, 300);
    const field = drawnField(polygon, []);

    expect(field.country).toBe('PL');
    expect(field.areaHa).toBeCloseTo(areaHa(field.polygon), 9);
    expect(field.areaHa).toBeGreaterThan(0);
    expect(field.centroid.lat).toBeCloseTo(near.lat + 0.01, 5);
    expect(field.centroid.lon).toBeCloseTo(near.lon + 0.01, 5);
    expect(field.name.length).toBeGreaterThan(0);
  });

  it('closes the outer ring', () => {
    const field = drawnField(openSquare(near.lat, near.lon, 200), []);
    const ring = field.polygon.coordinates[0] as Position[];
    expect(ring).toHaveLength(5);
    expect(ring[ring.length - 1]).toEqual(ring[0]);
  });

  it('gives every drawn field a unique id and a name not already in use', () => {
    const first = drawnField(openSquare(near.lat, near.lon, 200), []);
    const second = drawnField(openSquare(near.lat, near.lon, 200), [first]);
    expect(second.id).not.toBe(first.id);
    expect(second.name).not.toBe(first.name);
  });

  it('guesses US in Iowa', () => {
    expect(drawnField(openSquare(nearIowa.lat, nearIowa.lon, 200), []).country).toBe('US');
  });
});

describe('reshapedField', () => {
  it('keeps id and name and takes the new outline, centroid and area', () => {
    const base = demoFields.poznan;
    const polygon = openSquare(base.centroid.lat, base.centroid.lon, 500);
    const field = reshapedField(base, polygon);

    expect(field.id).toBe(base.id);
    expect(field.name).toBe(base.name);
    expect(field.areaHa).toBeCloseTo(areaHa(field.polygon), 9);
    expect(field.areaHa).not.toBeCloseTo(base.areaHa, 1);
    expect(field.centroid.lat).toBeCloseTo(base.centroid.lat, 5);
    const ring = field.polygon.coordinates[0] as Position[];
    expect(ring[ring.length - 1]).toEqual(ring[0]);
  });
});
