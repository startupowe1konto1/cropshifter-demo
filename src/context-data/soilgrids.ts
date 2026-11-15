// Live topsoil from ISRIC SoilGrids 2.0 (task O4-A5). Port of scripts/soil_point.py (parse_soilgrids): mean, Q0.05
// and Q0.95 of the 0–5, 5–15 and 15–30 cm layers, weighted by layer thickness. SoilGrids is a model and slow
// (3–15 s per point); fair use means one request per field, so the live provider caches by rounded point.
// The browser may call it directly: it answers CORS with `Access-Control-Allow-Origin: *` (checked 2026-11-14).
import type { Soil, Sourced } from '../contracts';

export const SOILGRIDS_URL = 'https://rest.isric.org/soilgrids/v2.0/properties/query';
export const SOILGRIDS_SOURCE = 'SoilGrids';
const TOP = 0;
const BOTTOM = 30;

/** The query URL the precompute script uses, for one WGS84 point. */
export function soilgridsUrl(lat: number, lon: number): string {
  const q = new URLSearchParams();
  q.append('lon', String(lon));
  q.append('lat', String(lat));
  for (const p of ['sand', 'clay', 'soc', 'phh2o']) q.append('property', p);
  for (const d of ['0-5cm', '5-15cm', '15-30cm']) q.append('depth', d);
  for (const v of ['mean', 'Q0.05', 'Q0.95']) q.append('value', v);
  return `${SOILGRIDS_URL}?${q.toString()}`;
}

interface Layer {
  name: string;
  depths: { range: { top_depth: number; bottom_depth: number }; values: Record<string, number | null | undefined> }[];
}

// mapped units -> target units: sand, clay g/kg -> % (/10); soc dg/kg -> % (/100); phh2o pH*10 -> pH (/10)
const TO_TARGET: Record<string, number> = { sand: 10, clay: 10, soc: 100, phh2o: 10 };
const overlap = (top: number, bottom: number) => Math.max(0, Math.min(bottom, BOTTOM) - Math.max(top, TOP));
const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits;

/** SoilGrids properties/query response (data/samples/soilgrids/properties_query_17.10_52.45_0-30cm.json) -> Soil. */
export function parseSoilgrids(body: unknown, retrievedAt: string): Soil {
  const list = (body as { properties?: { layers?: Layer[] } } | null)?.properties?.layers;
  if (!Array.isArray(list)) throw new Error('SoilGrids answer has no properties.layers');
  const layers = new Map(list.map((l) => [l.name, l]));

  const weighted = (name: string, stat: string): number | null => {
    const layer = layers.get(name);
    if (!layer) return null;
    let n = 0;
    let d = 0;
    for (const depth of layer.depths) {
      const v = depth.values[stat];
      const w = overlap(depth.range.top_depth, depth.range.bottom_depth);
      if (v === null || v === undefined || w === 0) continue;
      n += v * w;
      d += w;
    }
    return d > 0 ? n / d / (TO_TARGET[name] ?? 1) : null;
  };

  const value = (name: string, unit: string, digits: number): Sourced => {
    const base = { unit, datasetIds: ['isric-soilgrids'], kind: 'model' as const, retrievedAt };
    const mean = weighted(name, 'mean');
    if (mean === null) {
      return { ...base, value: null, missingReason: 'SoilGrids has no value at this point (it masks water and built-up land)' };
    }
    const low = weighted(name, 'Q0.05');
    const high = weighted(name, 'Q0.95');
    const range = low !== null && high !== null
      ? { range: { low: round(low, digits), high: round(high, digits), basis: 'SoilGrids 5% and 95% quantiles, 0–30 cm, weighted like the mean' } }
      : {};
    return { ...base, value: round(mean, digits), ...range };
  };

  return {
    sandPct: value('sand', '%', 1),
    clayPct: value('clay', '%', 1),
    organicCarbon: value('soc', '% by weight', 2),
    ph: value('phh2o', 'pH', 1),
  };
}
