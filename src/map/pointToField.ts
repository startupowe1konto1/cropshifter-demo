// A tap on the map becomes a 4 ha square field until the farmer draws the real outline.
import type { Polygon } from 'geojson';
import { t } from '../app/i18n';
import type { Country, Field } from '../contracts';
import { areaHa } from './area';

const SIDE_M = 200; // 200 m x 200 m = 4 ha
const METRES_PER_DEGREE = 111_320;

interface Box { south: number; north: number; west: number; east: number }

// Rough bounding boxes, drawn wide enough to hold each country. They overlap neighbours near the borders, so this is a guess the farmer can correct later.
const BOXES: { country: Exclude<Country, 'OTHER'>; box: Box }[] = [
  { country: 'PL', box: { south: 49.0, north: 54.9, west: 14.1, east: 24.2 } },
  { country: 'US', box: { south: 24.4, north: 49.4, west: -124.9, east: -66.9 } }, // contiguous USA only
];

export function guessCountry(lat: number, lon: number): Country {
  const hit = BOXES.find(({ box }) => lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east);
  return hit?.country ?? 'OTHER';
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Square of `sideM` metres around the point. GeoJSON [lon, lat], closed ring, counterclockwise. */
function squareAround(lat: number, lon: number, sideM: number): Polygon {
  const halfLat = sideM / 2 / METRES_PER_DEGREE;
  const halfLon = sideM / 2 / (METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180));
  const west = round6(lon - halfLon);
  const east = round6(lon + halfLon);
  const south = round6(lat - halfLat);
  const north = round6(lat + halfLat);
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

export function pointToField(lat: number, lon: number): Field {
  const latText = lat.toFixed(4);
  const lonText = lon.toFixed(4);
  const polygon = squareAround(lat, lon, SIDE_M);
  return {
    id: `point-${latText}-${lonText}`,
    name: t('map.field.atPoint', { lat: latText, lon: lonText }),
    country: guessCountry(lat, lon),
    polygon,
    centroid: { lat, lon },
    areaHa: areaHa(polygon),
  };
}
