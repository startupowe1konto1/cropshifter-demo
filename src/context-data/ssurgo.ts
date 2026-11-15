// Live topsoil from USDA NRCS SSURGO through Soil Data Access (task O4-A5). Port of scripts/soil_point.py (parse_sda):
// the map unit under the point, its components and horizons; each column is depth-weighted over 0–30 cm per
// component, then components are weighted by their share of the map unit (comppct_r). low/high come from the
// _l and _h columns aggregated the same way. Organic carbon = organic matter / 1.724 (van Bemmelen factor).
// The browser may call SDA directly: it answers CORS with `Access-Control-Allow-Origin: *` (checked 2026-11-14).
import type { Soil, Sourced } from '../contracts';

export const SDA_URL = 'https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest';
export const SSURGO_SOURCE = 'USDA soil survey (SSURGO)';
const TOP = 0;
const BOTTOM = 30;
const OM_TO_OC = 1.724;

/** The SQL the precompute script sends, for one WGS84 point. */
export function sdaQuery(lat: number, lon: number): string {
  return `SELECT mu.mukey, mu.muname, c.cokey, c.compname, c.comppct_r, c.majcompflag, h.hzname, h.hzdept_r,
 h.hzdepb_r, h.sandtotal_l, h.sandtotal_r, h.sandtotal_h, h.claytotal_l, h.claytotal_r, h.claytotal_h,
 h.om_l, h.om_r, h.om_h, h.ph1to1h2o_l, h.ph1to1h2o_r, h.ph1to1h2o_h
FROM mapunit mu INNER JOIN component c ON c.mukey = mu.mukey INNER JOIN chorizon h ON h.cokey = c.cokey
WHERE mu.mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${lon} ${lat})'))
 AND h.hzdept_r < ${BOTTOM} ORDER BY c.comppct_r DESC, h.hzdept_r`;
}

/** Body of the POST to SDA_URL. */
export function sdaRequestBody(lat: number, lon: number): string {
  return JSON.stringify({ format: 'JSON+COLUMNNAME', query: sdaQuery(lat, lon) });
}

function num(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const overlap = (top: number, bottom: number) => Math.max(0, Math.min(bottom, BOTTOM) - Math.max(top, TOP));
const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits;

type Column = 'sand' | 'clay' | 'om' | 'ph';
type Suffix = '_l' | '_r' | '_h';
const COLUMNS: Record<Column, string> = { sand: 'sandtotal', clay: 'claytotal', om: 'om', ph: 'ph1to1h2o' };
const SUFFIXES: Suffix[] = ['_l', '_r', '_h'];

/**
 * SDA JSON+COLUMNNAME response (data/samples/ssurgo/sda_point_demo-iowa.json) -> Soil, or null when SDA has no
 * horizon for the point (no map unit there, or a map unit without data in 0–30 cm).
 */
export function parseSda(body: unknown, retrievedAt: string): Soil | null {
  const table = (body as { Table?: unknown[][] } | null)?.Table;
  if (!Array.isArray(table) || table.length < 2) return null;
  const header = table[0] as string[];
  const rows = table.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])) as Record<string, unknown>);

  const components = new Map<string, { pct: number; sums: Map<string, [number, number]> }>();
  for (const r of rows) {
    const key = String(r.cokey);
    let comp = components.get(key);
    if (!comp) {
      comp = { pct: num(r.comppct_r) ?? 0, sums: new Map() };
      components.set(key, comp);
    }
    const top = num(r.hzdept_r);
    const bottom = num(r.hzdepb_r);
    if (top === null || bottom === null) continue;
    const w = overlap(top, bottom);
    if (w === 0) continue;
    for (const [col, name] of Object.entries(COLUMNS)) {
      for (const suffix of SUFFIXES) {
        const v = num(r[name + suffix]);
        if (v === null) continue;
        const s = comp.sums.get(col + suffix) ?? [0, 0];
        s[0] += v * w;
        s[1] += w;
        comp.sums.set(col + suffix, s);
      }
    }
  }

  const aggregate = (col: Column, suffix: Suffix): number | null => {
    let n = 0;
    let d = 0;
    for (const comp of components.values()) {
      const s = comp.sums.get(col + suffix);
      if (s && s[1] > 0 && comp.pct > 0) {
        n += (s[0] / s[1]) * comp.pct;
        d += comp.pct;
      }
    }
    return d > 0 ? n / d : null;
  };

  const value = (col: Column, unit: string, digits: number, factor = 1): Sourced => {
    const base = { unit, datasetIds: ['usda-ssurgo'], kind: 'observation' as const, retrievedAt };
    const [low, mid, high] = SUFFIXES.map((s) => {
      const v = aggregate(col, s);
      return v === null ? null : round(v / factor, digits);
    });
    if (mid === null || mid === undefined) {
      return { ...base, value: null, missingReason: 'SSURGO has no horizon data in 0–30 cm for this map unit' };
    }
    const range = low !== null && low !== undefined && high !== null && high !== undefined
      ? { range: { low, high, basis: 'SSURGO low and high columns, 0–30 cm, weighted like the representative value' } }
      : {};
    return { ...base, value: mid, ...range };
  };

  return {
    sandPct: value('sand', '%', 1),
    clayPct: value('clay', '%', 1),
    organicCarbon: value('om', '% by weight', 2, OM_TO_OC),
    ph: value('ph', 'pH', 1),
  };
}
