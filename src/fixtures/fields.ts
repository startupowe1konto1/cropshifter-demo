// Two demo fields. Stand-ins until the map module returns real polygons.
import type { Polygon } from 'geojson';
import type { Field } from '../contracts';
import { areaHa } from '../map/area';

const METRES_PER_DEGREE = 111_320;

/** Axis-aligned rectangle around a centre point. GeoJSON, WGS84, [lon, lat], closed ring, counterclockwise. */
function rectangle(lat: number, lon: number, widthM: number, heightM: number): Polygon {
  const halfLat = heightM / 2 / METRES_PER_DEGREE;
  const halfLon = widthM / 2 / (METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180));
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const west = round(lon - halfLon);
  const east = round(lon + halfLon);
  const south = round(lat - halfLat);
  const north = round(lat + halfLat);
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

const IOWA_RING: [number, number][] = [
  [-93.50187, 42.03463],
  [-93.49331, 42.03459],
  [-93.49322, 42.027625],
  [-93.50187, 42.028035],
  [-93.50187, 42.03463],
];
const IOWA_POLYGON: Polygon = { type: 'Polygon', coordinates: [IOWA_RING] };

/** Mean of the ring's corners (the closing point counted once): close enough to the centre for a convex field. */
function ringCentroid(ring: [number, number][]): { lat: number; lon: number } {
  const corners = ring.slice(0, -1);
  const round = (n: number) => Math.round(n * 1e5) / 1e5;
  return {
    lat: round(corners.reduce((sum, [, lat]) => sum + lat, 0) / corners.length),
    lon: round(corners.reduce((sum, [lon]) => sum + lon, 0) / corners.length),
  };
}

export const demoFields: { iowa: Field; poznan: Field } = {
  iowa: {
    id: 'demo-iowa',
    name: 'Iowa demo field',
    country: 'US',
    // Story County, Iowa, between Ames and Nevada: the whole field bounded by 220th Street (north), 600th Avenue (west)
    // and the Union Pacific railway (south), traced on the OpenStreetMap base map at the presentation's demo spot.
    // CropScape CDL at the old centroid (42.0305, -93.497), inside this field: corn in even years and soybeans in odd
    // years, 2008-2025 (task O4-A1). The precomputed files are keyed by this id.
    polygon: IOWA_POLYGON,
    centroid: ringCentroid(IOWA_RING),
    areaHa: Math.round(areaHa(IOWA_POLYGON)),
  },
  poznan: {
    id: 'demo-poznan',
    name: 'Poznań demo field',
    country: 'PL',
    polygon: rectangle(52.45, 17.1, 400, 200), // 400 m x 200 m = 8 ha
    centroid: { lat: 52.45, lon: 17.1 },
    areaHa: 8,
    parcelIds: ['302116_5.0008.428/1'],
  },
};
