// The pitch field: the parcel the presentation shows in Uzarzewo near Poznań (pitch/deck/data/field.json in the team
// repo, exported 2026-11-15 from the app's providers). Outline: GUGiK ULDK land register parcel 302116_5.0015.28/1.
// Soil, slope and crop data are precomputed for points within 2 km of the Poznań demo point, and this centroid is 1.6 km away.
import type { Field } from '../../contracts';
import { areaHa } from '../area';

const RING: [number, number][] = [
  [17.112702, 52.460513],
  [17.116164, 52.458438],
  [17.119592, 52.456295],
  [17.119729, 52.456327],
  [17.119828, 52.45635],
  [17.121576, 52.456758],
  [17.121869, 52.456772],
  [17.122413, 52.456912],
  [17.120868, 52.461821],
  [17.120029, 52.461692],
  [17.118024, 52.46138],
  [17.11502, 52.460922],
  [17.114449, 52.460835],
  [17.114169, 52.460792],
  [17.113888, 52.460745],
  [17.113648, 52.460703],
  [17.113836, 52.460635],
  [17.113684, 52.460527],
  [17.113477, 52.460596],
  [17.113563, 52.460687],
  [17.113329, 52.460644],
  [17.113055, 52.46059],
  [17.112702, 52.460513],
];

const polygon = { type: 'Polygon' as const, coordinates: [RING] };

export const pitchPoznanField: Field = {
  id: 'pitch-poznan',
  name: 'Parcel 302116_5.0015.28/1',
  country: 'PL',
  polygon,
  centroid: { lat: 52.45925, lon: 17.11854 },
  areaHa: Math.round(areaHa(polygon) * 10) / 10,
  parcelIds: ['302116_5.0015.28/1'],
};

