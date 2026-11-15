// Live crop history from USDA CropScape (Cropland Data Layer), task O4-A5. Port of scripts/cropscape_history.py:
// one GetCDLValue call per year at the field centroid, x/y in EPSG:5070. The browser calls it only through our
// serverless proxy api/cropscape.ts (D10): the CropScape server sends no CORS header we could rely on and its
// certificate chain ends at a root some clients do not trust.
import type { CropId } from '../contracts';

export const CROPSCAPE_SOURCE = 'USDA CropScape';
/** Years asked for a live field: the last six CDL years, one call each, one at a time (parallel calls hung on this server). */
export const CROPSCAPE_YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

/**
 * CDL class code -> crop id of data/crops/us-ia.json. Codes from the CDL legend, copied from the precompute script
 * (https://www.nass.usda.gov/Research_and_Science/Cropland/metadata/metadata_ia25.htm, "Attribute Accuracy" table).
 */
export const CDL_TO_CROP: Record<number, CropId> = { 1: 'maize', 5: 'soybean', 24: 'winter-wheat', 28: 'oats', 36: 'alfalfa' };

/** WGS84 degrees -> EPSG:5070 metres (Albers, lat0 23, lat1 29.5, lat2 45.5, lon0 -96, GRS80; Snyder 1987 eq. 14-3 to 14-6). */
export function toEpsg5070(lat: number, lon: number): { x: number; y: number } {
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const e2 = 2 * f - f * f;
  const e = Math.sqrt(e2);
  const rad = Math.PI / 180;
  const [lat0, lat1, lat2, lon0] = [23.0, 29.5, 45.5, -96.0].map((v) => v * rad) as [number, number, number, number];
  const q = (phi: number) => {
    const s = Math.sin(phi);
    return (1 - e2) * (s / (1 - e2 * s * s) - (1 / (2 * e)) * Math.log((1 - e * s) / (1 + e * s)));
  };
  const m = (phi: number) => {
    const s = Math.sin(phi);
    return Math.cos(phi) / Math.sqrt(1 - e2 * s * s);
  };
  const n = (m(lat1) ** 2 - m(lat2) ** 2) / (q(lat2) - q(lat1));
  const c = m(lat1) ** 2 + n * q(lat1);
  const rho0 = (a * Math.sqrt(c - n * q(lat0))) / n;
  const rho = (a * Math.sqrt(c - n * q(lat * rad))) / n;
  const theta = n * (lon * rad - lon0);
  return { x: rho * Math.sin(theta), y: rho0 - rho * Math.cos(theta) };
}

/** GetCDLValue XML body (data/samples/cropscape/getcdlvalue_2025_demo-iowa.xml) -> CDL class code and name. */
export function parseCdlValue(text: string): { code: number; name: string } {
  const match = /value:\s*(\d+),\s*category:\s*"([^"]*)"/.exec(text);
  if (!match) throw new Error(`no CDL value in the answer: ${text.slice(0, 120)}`);
  return { code: Number(match[1]), name: match[2] ?? '' };
}

/** URL of our proxy for one year at one point. */
export function cropscapeProxyRequest(proxyUrl: string, year: number, lat: number, lon: number): string {
  const { x, y } = toEpsg5070(lat, lon);
  return `${proxyUrl}?year=${year}&x=${x.toFixed(1)}&y=${y.toFixed(1)}`;
}
