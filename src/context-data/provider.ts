// ContextProvider on precomputed files (task O4-A3). The files come from scripts/*.py (task O4-A1) and data/crops (O4-A2).
// A value is used only for a field whose centroid is within MAX_DISTANCE_KM of the point the file was computed for;
// anywhere else the value is null with a reason, never borrowed from the nearest demo field.
import type { AsyncResult, ContextProvider, CropId, CropTraits, CropYear, Field, Soil, Sourced, ValueKind } from '../contracts';
import cropscapeFile from '../../data/precomputed/cropscape.json';
import gaezFile from '../../data/precomputed/gaez.json';
import slopeFile from '../../data/precomputed/slope.json';
import soilFile from '../../data/precomputed/soil.json';
import cropsPl from '../../data/crops/pl.json';
import cropsUs from '../../data/crops/us-ia.json';

export const MAX_DISTANCE_KM = 2;

interface Meta { retrievedAt: string; script: string; sourceUrl: string }
interface LatLon { lat: number; lon: number }
interface NumberWithRange { value: number | null; low?: number; high?: number; missingReason?: string }

export interface CropscapeFile {
  meta: Meta;
  datasetId: string;
  fields: Record<string, { centroid: LatLon; years: { year: number; crop: CropId | null; cdlCode?: number; cdlName?: string }[] }>;
}
export interface SoilFile {
  meta: Meta;
  fields: Record<string, {
    centroid: LatLon; datasetId: string; depthCm: string;
    sandPct: NumberWithRange; clayPct: NumberWithRange; organicCarbonPct: NumberWithRange; ph: NumberWithRange;
  }>;
}
export interface GaezCrop {
  suitabilityIndex: number | null; suitabilityClass: string | null; classCode: number | null;
  attainableYieldKgHa: number | null; period: string;
}
export interface GaezFile {
  meta: Meta;
  datasetId: string;
  fields: Record<string, { centroid: LatLon; crops: Record<CropId, GaezCrop>; future?: Record<string, Record<CropId, GaezCrop>> }>;
}
export interface SlopeFile {
  meta: Meta;
  datasetId: string;
  fields: Record<string, { centroid: LatLon; meanSlopePct: number | null; missingReason?: string }>;
}
export interface PrecomputedFiles {
  cropscape: CropscapeFile;
  soil: SoilFile;
  gaez: GaezFile;
  slope: SlopeFile;
  crops: { US: CropTraits[]; PL: CropTraits[] };
}

/** Lower and upper suitability index of each GAEZ v4 class (legend of the res05 ImageServer, data/rules/hazards.json). */
const GAEZ_CLASS_BOUNDS: Record<string, [number, number]> = {
  'Very high': [75, 100], High: [63, 75], Good: [50, 63], Medium: [35, 50], Moderate: [20, 35], Marginal: [10, 20],
  'Very marginal': [0, 10], 'Not suitable': [0, 0], 'No cultivation': [0, 0],
};

const DATASET_KIND: Record<string, ValueKind> = { 'usda-ssurgo': 'observation', 'isric-soilgrids': 'model' };

function distanceKm(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The precomputed entry for this field: same id, or a centroid within MAX_DISTANCE_KM. */
function entryFor<T extends { centroid: LatLon }>(entries: Record<string, T>, field: Field): T | undefined {
  if (entries[field.id]) return entries[field.id];
  return Object.values(entries).find((entry) => distanceKm(entry.centroid, field.centroid) <= MAX_DISTANCE_KM);
}

const notPrecomputed = (what: string) =>
  `${what} is precomputed only for the demo fields; this field is more than ${MAX_DISTANCE_KM} km from them`;

function missing(datasetId: string, kind: ValueKind, retrievedAt: string, unit: string, reason: string): Sourced {
  return { value: null, unit, datasetIds: [datasetId], kind, retrievedAt, missingReason: reason };
}

export function createPrecomputedContextProvider(files: PrecomputedFiles): ContextProvider {
  const { cropscape, soil, gaez, slope, crops } = files;

  function soilValue(entry: SoilFile['fields'][string], n: NumberWithRange, unit: string): Sourced {
    const kind = DATASET_KIND[entry.datasetId] ?? 'model';
    if (n.value === null) {
      return missing(entry.datasetId, kind, soil.meta.retrievedAt, unit, n.missingReason ?? 'no value in the source for this point');
    }
    const range = n.low !== undefined && n.high !== undefined
      ? { range: { low: n.low, high: n.high, basis: `spread given by the source, ${entry.depthCm.replace('-', '–')} cm` } }
      : {};
    return { value: n.value, unit, datasetIds: [entry.datasetId], kind, retrievedAt: soil.meta.retrievedAt, ...range };
  }

  function suitabilityValue(crop: GaezCrop | undefined, cropId: CropId): Sourced {
    const base = { unit: 'suitability index, 0–100', datasetIds: [gaez.datasetId], kind: 'model' as const, retrievedAt: gaez.meta.retrievedAt };
    if (!crop) return { ...base, value: null, missingReason: `FAO GAEZ has no value for ${cropId} in the precomputed file` };
    if (crop.suitabilityIndex !== null) return { ...base, value: crop.suitabilityIndex };
    const bounds = crop.suitabilityClass ? GAEZ_CLASS_BOUNDS[crop.suitabilityClass] : undefined;
    if (!bounds) return { ...base, value: null, missingReason: `FAO GAEZ gives no suitability for ${cropId} at this field` };
    const [low, high] = bounds;
    return {
      ...base,
      value: (low + high) / 2,
      range: { low, high, basis: `FAO GAEZ class '${crop.suitabilityClass}' (index ${low}–${high}); the value is the class midpoint` },
    };
  }

  return {
    async getCrops(country) {
      return country === 'OTHER' ? [] : crops[country];
    },

    async getCropHistory(field): Promise<AsyncResult<CropYear[]>> {
      const entry = entryFor(cropscape.fields, field);
      const years = (entry?.years ?? [])
        .filter((y): y is typeof y & { crop: CropId } => y.crop !== null)
        .sort((a, b) => a.year - b.year)
        .map((y) => ({ year: y.year, crop: y.crop, source: 'cropscape' as const }));
      if (years.length === 0) return { status: 'no-data', reason: { code: 'context.no-crop-history' } };
      return { status: 'ready', data: years };
    },

    async getSuitability(field, cropIds) {
      const entry = entryFor(gaez.fields, field);
      return Object.fromEntries(
        cropIds.map((id) => [
          id,
          entry
            ? suitabilityValue(entry.crops[id], id)
            : missing(gaez.datasetId, 'model', gaez.meta.retrievedAt, 'suitability index, 0–100', notPrecomputed('FAO GAEZ suitability')),
        ]),
      );
    },

    async getSoil(field): Promise<Soil> {
      const entry = entryFor(soil.fields, field);
      if (!entry) {
        const reason = notPrecomputed('Soil');
        const none = (unit: string) => missing('usda-ssurgo', 'observation', soil.meta.retrievedAt, unit, reason);
        const datasetId = field.country === 'US' ? 'usda-ssurgo' : 'isric-soilgrids';
        const kind = DATASET_KIND[datasetId] ?? 'model';
        const absent = (unit: string) => ({ ...none(unit), datasetIds: [datasetId], kind });
        return { sandPct: absent('%'), clayPct: absent('%'), organicCarbon: absent('% by weight'), ph: absent('pH') };
      }
      return {
        sandPct: soilValue(entry, entry.sandPct, '%'),
        clayPct: soilValue(entry, entry.clayPct, '%'),
        organicCarbon: soilValue(entry, entry.organicCarbonPct, '% by weight'),
        ph: soilValue(entry, entry.ph, 'pH'),
      };
    },

    async getSlope(field) {
      const entry = entryFor(slope.fields, field);
      const base = { unit: '%', datasetIds: [slope.datasetId], kind: 'derived' as const, retrievedAt: slope.meta.retrievedAt };
      if (!entry) return { ...base, value: null, missingReason: notPrecomputed('Slope') };
      if (entry.meanSlopePct === null) {
        return { ...base, value: null, missingReason: entry.missingReason ?? 'slope could not be computed for this field' };
      }
      return { ...base, value: entry.meanSlopePct };
    },
  };
}

// ---------- the shipped files ----------
/** The provider the app uses: precomputed soil, slope, GAEZ and crop history for the two demo fields, crop traits per country. */
export const precomputedContextProvider: ContextProvider = createPrecomputedContextProvider({
  cropscape: cropscapeFile as unknown as CropscapeFile,
  soil: soilFile as unknown as SoilFile,
  gaez: gaezFile as unknown as GaezFile,
  slope: slopeFile as unknown as SlopeFile,
  crops: { US: cropsUs as unknown as CropTraits[], PL: cropsPl as unknown as CropTraits[] },
});
