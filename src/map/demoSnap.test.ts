import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { demoFields } from '../fixtures';
import { DEMO_SNAP_M, demoFieldNear } from './demoSnap';
import { parseNominatim } from './search/nominatim';

const METRES_PER_DEGREE = 111_320;
const north = (lat: number, m: number) => lat + m / METRES_PER_DEGREE;
const { lat, lon } = demoFields.iowa.centroid;

describe('demoFieldNear (the Iowa demo field fits itself to a nearby search, HANDOFF-frontend.md v2.1)', () => {
  it('returns the Iowa demo field at its centroid', () => {
    expect(demoFieldNear(lat, lon)).toBe(demoFields.iowa);
  });

  it('returns it up to DEMO_SNAP_M away and not beyond', () => {
    expect(demoFieldNear(north(lat, DEMO_SNAP_M - 100), lon)).toBe(demoFields.iowa);
    expect(demoFieldNear(north(lat, DEMO_SNAP_M + 100), lon)).toBeNull();
  });

  it('snaps the address the pitch animation types (220th Street, Nevada, Iowa)', () => {
    const [place] = parseNominatim(readFileSync('data/samples/geocoders/nominatim-220th-street-nevada-iowa.json', 'utf8'));
    expect(demoFieldNear(place!.lat, place!.lon)).toBe(demoFields.iowa);
  });

  it('never snaps in Poland, where ULDK gives the real parcel', () => {
    expect(demoFieldNear(demoFields.poznan.centroid.lat, demoFields.poznan.centroid.lon)).toBeNull();
  });
});
