// Live FAO GAEZ v4 crop suitability index (task O4-A5): one `identify` per crop on the res05 ImageServer (5 arc-minutes,
// about 9 km), locked to the crop's raster `sxHr_<code>`: rain-fed, high input, 1981–2010 (CRU TS 3.2 climate),
// all land in the grid cell, index 0–10000. Same variant as scripts/gaez_suitability.py.
// The browser may call it directly: the server echoes the page origin in `Access-Control-Allow-Origin` and answers
// a browser User-Agent (it refuses Python's default one only). Checked 2026-11-14.
import type { CropId, Sourced } from '../contracts';

export const GAEZ_URL = 'https://gaez-services.fao.org/server/rest/services/res05/ImageServer';
export const GAEZ_SOURCE = 'FAO GAEZ';

/**
 * Crop id -> GAEZ crop and the object id of its `sxHr` 1981–2010 CRUTS32 raster. Ids copied from the service's own
 * catalogue, data/samples/gaez/res05-suitability-rainfed-high-1981-2010.json (maize checked against
 * res05-query-maize-hr-1981-2070.json). GAEZ has one wheat, one barley and one rye: not split by season.
 */
export const GAEZ_SX_1981_2010: Record<CropId, { gaezCrop: string; objectId: number }> = {
  maize: { gaezCrop: 'Maize', objectId: 257854 },
  soybean: { gaezCrop: 'Soybean', objectId: 257871 },
  oats: { gaezCrop: 'Oat', objectId: 257856 },
  'winter-wheat': { gaezCrop: 'Wheat', objectId: 257880 },
  alfalfa: { gaezCrop: 'Alfalfa', objectId: 257833 },
  'cereal-rye': { gaezCrop: 'Rye', objectId: 257869 },
  rye: { gaezCrop: 'Rye', objectId: 257869 },
  'winter-rapeseed': { gaezCrop: 'Rapeseed', objectId: 257867 },
  'spring-barley': { gaezCrop: 'Barley', objectId: 257836 },
  'field-pea': { gaezCrop: 'Dry pea', objectId: 257860 },
  'sugar-beet': { gaezCrop: 'Sugarbeet', objectId: 257874 },
  potato: { gaezCrop: 'White potato', objectId: 257881 },
};

/** Crops of our lists that GAEZ v4 does not model (cover crops). */
const NO_GAEZ: Record<CropId, string> = { 'red-clover': 'red clover', 'white-mustard': 'white mustard', phacelia: 'phacelia' };

export const SUITABILITY_UNIT = 'suitability index, 0–100';

/** identify URL for one raster at one WGS84 point. */
export function gaezIdentifyUrl(lat: number, lon: number, objectId: number): string {
  const q = new URLSearchParams({
    f: 'json',
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint',
    mosaicRule: JSON.stringify({ mosaicMethod: 'esriMosaicLockRaster', lockRasterIds: [objectId] }),
    returnGeometry: 'false',
    returnCatalogItems: 'false',
  });
  return `${GAEZ_URL}/identify?${q.toString()}`;
}

/** Why a crop has no GAEZ value at all, or undefined when it has a raster. */
export function gaezMissingCrop(cropId: CropId): string | undefined {
  if (GAEZ_SX_1981_2010[cropId]) return undefined;
  const name = NO_GAEZ[cropId];
  return name ? `FAO GAEZ v4 has no crop for ${name}` : `FAO GAEZ v4 has no crop matched to ${cropId}`;
}

/**
 * identify response (data/samples/gaez/res05-identify-sxHr_mze-demo-iowa.json) -> the suitability index as a
 * Sourced value, 0–100 (the raster's 0–10000 divided by 100, one decimal, as in the precompute script).
 */
export function parseGaezIdentify(body: unknown, cropId: CropId, retrievedAt: string): Sourced {
  const base = { unit: SUITABILITY_UNIT, datasetIds: ['fao-gaez-v4'], kind: 'model' as const, retrievedAt };
  const b = body as { value?: unknown; error?: { message?: string } } | null;
  if (b?.error) throw new Error(`GAEZ error: ${b.error.message ?? 'unknown'}`);
  const raw = b?.value;
  const n = raw === null || raw === undefined || raw === '' || raw === 'NoData' ? NaN : Number(raw);
  if (!Number.isFinite(n)) {
    return { ...base, value: null, missingReason: `FAO GAEZ has no suitability for ${cropId} at this grid cell (water or no data)` };
  }
  return { ...base, value: Math.round(n / 10) / 10 };
}
