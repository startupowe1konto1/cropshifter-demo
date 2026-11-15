// Field area on the sphere, so a field reads the same size in Iowa and in Poland.
import type { Polygon, Position } from 'geojson';

// WGS84 equatorial radius. Same value as turf's area and as the 111 320 m per degree used by the fixtures.
const EARTH_RADIUS_M = 6_378_137;
const M2_PER_HA = 10_000;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Absolute area of one ring in m² (Chamberlain and Duquette, "Some algorithms for polygons on a sphere", 2007). */
function ringAreaM2(ring: Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1 = 0, lat1 = 0] = ring[i]!;
    const [lon2 = 0, lat2 = 0] = ring[i + 1]!;
    sum += rad(lon2 - lon1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((sum * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

/** Area in hectares: the outer ring minus the holes. Rings must be closed ([lon, lat], first point repeated last). */
export function areaHa(polygon: Polygon): number {
  const [outer, ...holes] = polygon.coordinates;
  if (!outer) return 0;
  const m2 = holes.reduce((total, hole) => total - ringAreaM2(hole), ringAreaM2(outer));
  return Math.max(0, m2) / M2_PER_HA;
}
