// No allowed source gives US field boundaries (SPEC section 15). For the demo, a search or tap near the Iowa demo
// field takes its stored outline, so the field fits itself in the pitch animation (HANDOFF-frontend.md v2.1).
// Poland is not snapped: ULDK gives the real parcel there.
import type { Field } from '../contracts';
import { demoFields } from '../fixtures';

// 2 km: Nominatim puts "220th Street, Nevada, Iowa", the address the animation types, about 1.3 km from the centroid.
export const DEMO_SNAP_M = 2000;
const METRES_PER_DEGREE = 111_320;

/** The Iowa demo field when the point is within DEMO_SNAP_M of its centroid, else null. Flat-earth metres. */
export function demoFieldNear(lat: number, lon: number): Field | null {
  const field = demoFields.iowa;
  const dy = (lat - field.centroid.lat) * METRES_PER_DEGREE;
  const dx = (lon - field.centroid.lon) * METRES_PER_DEGREE * Math.cos((field.centroid.lat * Math.PI) / 180);
  return Math.hypot(dx, dy) <= DEMO_SNAP_M ? field : null;
}
