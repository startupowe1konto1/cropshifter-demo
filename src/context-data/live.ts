// Live ContextProvider (task O4-A5). A field within MAX_DISTANCE_KM of a demo field (or with a demo field's id) gets
// the precomputed values of O4-A3; any other field is fetched live:
//   soil         USA: SSURGO through Soil Data Access; elsewhere, or where SSURGO has no map unit: SoilGrids
//   suitability  FAO GAEZ v4 identify, one call per crop
//   crop history USA only, CropScape through our proxy api/cropscape.ts when a proxy URL is configured
//   slope        precomputed only (NASADEM slope needs a raster read; not live yet)
// getCropHistory also starts the soil and suitability requests in the background (the crops step asks for the history
// a few steps before the analysis needs the rest). Failures: getSoil and getSuitability throw a SourceError naming the source (the engine shows it as that source's
// error); getCropHistory answers { status: 'error' }. Answers are cached in memory per rounded point; a failed request
// is not cached, so a retry asks again.
import type { AsyncResult, ContextProvider, CropId, CropYear, Field, Soil, Sourced } from '../contracts';
import { SourceError } from '../contracts';
import cropscapeFile from '../../data/precomputed/cropscape.json';
import gaezFile from '../../data/precomputed/gaez.json';
import slopeFile from '../../data/precomputed/slope.json';
import soilFile from '../../data/precomputed/soil.json';
import { CDL_TO_CROP, CROPSCAPE_SOURCE, CROPSCAPE_YEARS, cropscapeProxyRequest, parseCdlValue } from './cropscape';
import { GAEZ_SOURCE, GAEZ_SX_1981_2010, SUITABILITY_UNIT, gaezIdentifyUrl, gaezMissingCrop, parseGaezIdentify } from './gaez';
import { MAX_DISTANCE_KM, precomputedContextProvider } from './provider';
import { SOILGRIDS_SOURCE, parseSoilgrids, soilgridsUrl } from './soilgrids';
import { SDA_URL, SSURGO_SOURCE, parseSda, sdaRequestBody } from './ssurgo';

interface LatLon { lat: number; lon: number }
export interface DemoPoint { id: string; centroid: LatLon }

export interface LiveContextOptions {
  precomputed: ContextProvider;
  /** Fields served by `precomputed`. Default: every field of the precomputed files. */
  demoPoints?: DemoPoint[];
  fetchImpl?: typeof fetch;
  /** Per request, for SSURGO, GAEZ and CropScape. Default 20 s. */
  timeoutMs?: number;
  /** Per request, for SoilGrids. It took 13–102 s per point on 2026-11-14, so the default is 120 s (#122). */
  soilgridsTimeoutMs?: number;
  /** Our CropScape proxy, e.g. '/api/cropscape'. Without it a live field has no crop history (no-data). */
  cropscapeProxyUrl?: string;
  /** Start soil and suitability requests when the crop history is asked for. Default true. */
  prefetch?: boolean;
  /** ISO date stamped on live values as retrievedAt. Default: today, UTC. */
  today?: () => string;
}

function distanceKm(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Every field id and centroid in the shipped precomputed files. */
export function precomputedDemoPoints(): DemoPoint[] {
  const files = [cropscapeFile, gaezFile, slopeFile, soilFile] as unknown as { fields: Record<string, { centroid: LatLon }> }[];
  return files.flatMap((f) => Object.entries(f.fields).map(([id, e]) => ({ id, centroid: e.centroid })));
}

class Timeout extends Error {}

export function createLiveContextProvider(options: LiveContextOptions): ContextProvider {
  const { precomputed, cropscapeProxyUrl, prefetch = true } = options;
  const demoPoints = options.demoPoints ?? precomputedDemoPoints();
  const doFetch: typeof fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 20_000;
  // SoilGrids answered in 13–102 s in our tests (#88), so its limit is 120 s; it starts in the background on the crop step.
  const soilgridsTimeoutMs = options.soilgridsTimeoutMs ?? 120_000;
  const today = options.today ?? (() => new Date().toISOString().slice(0, 10));
  const cache = new Map<string, Promise<unknown>>();

  const isDemo = (field: Field) =>
    demoPoints.some((p) => p.id === field.id || distanceKm(p.centroid, field.centroid) <= MAX_DISTANCE_KM);
  // 4 decimals is about 10 m: the same click twice is one request, two fields never share an answer.
  const pointKey = (field: Field) => `${field.centroid.lat.toFixed(4)},${field.centroid.lon.toFixed(4)}`;

  function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key) as Promise<T> | undefined;
    if (hit) return hit;
    const promise = load();
    cache.set(key, promise);
    promise.catch(() => cache.delete(key));
    return promise;
  }

  /** One request with a timeout. Resolves with the body text; throws SourceError on timeout, network or HTTP error. */
  async function request(source: string, url: string, init: RequestInit, ms: number): Promise<string> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Timeout()); // before abort, so the race settles on the timeout and not on the fetch's AbortError
        controller.abort();
      }, ms);
    });
    try {
      const response = await Promise.race([doFetch(url, { ...init, signal: controller.signal }), timeout]);
      if (!response.ok) throw new SourceError(source, `${source} answered HTTP ${response.status}`);
      return await Promise.race([response.text(), timeout]);
    } catch (e) {
      if (e instanceof SourceError) throw e;
      if (e instanceof Timeout) throw new SourceError(source, `${source} gave no answer within ${Math.round(ms / 1000)} s`);
      throw new SourceError(source, `${source} could not be reached (${e instanceof Error ? e.message : String(e)})`);
    } finally {
      clearTimeout(timer);
    }
  }

  async function requestJson(source: string, url: string, init: RequestInit, ms: number): Promise<unknown> {
    const text = await request(source, url, init, ms);
    if (text.trim() === '') return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new SourceError(source, `${source} sent an answer that is not JSON`);
    }
  }

  function parsed<T>(source: string, parse: () => T): T {
    try {
      return parse();
    } catch (e) {
      throw new SourceError(source, `${source} sent an answer we could not read (${e instanceof Error ? e.message : String(e)})`);
    }
  }

  function ssurgoSoil(field: Field): Promise<Soil | null> {
    const { lat, lon } = field.centroid;
    return cached(`ssurgo:${pointKey(field)}`, async () => {
      const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: sdaRequestBody(lat, lon) };
      const body = await requestJson(SSURGO_SOURCE, SDA_URL, init, timeoutMs);
      return parsed(SSURGO_SOURCE, () => parseSda(body, today()));
    });
  }

  function soilgridsSoil(field: Field): Promise<Soil> {
    const { lat, lon } = field.centroid;
    return cached(`soilgrids:${pointKey(field)}`, async () => {
      const body = await requestJson(SOILGRIDS_SOURCE, soilgridsUrl(lat, lon), { method: 'GET' }, soilgridsTimeoutMs);
      return parsed(SOILGRIDS_SOURCE, () => parseSoilgrids(body, today()));
    });
  }

  function gaezValue(field: Field, cropId: CropId, objectId: number): Promise<Sourced> {
    const { lat, lon } = field.centroid;
    return cached(`gaez:${objectId}:${pointKey(field)}`, async () => {
      const body = await requestJson(GAEZ_SOURCE, gaezIdentifyUrl(lat, lon, objectId), { method: 'GET' }, timeoutMs);
      return parsed(GAEZ_SOURCE, () => parseGaezIdentify(body, cropId, today()));
    });
  }

  async function cropscapeHistory(field: Field, proxyUrl: string): Promise<AsyncResult<CropYear[]>> {
    const { lat, lon } = field.centroid;
    try {
      const years = await cached(`cropscape:${pointKey(field)}`, async () => {
        const out: CropYear[] = [];
        for (const year of CROPSCAPE_YEARS) {
          const text = await request(CROPSCAPE_SOURCE, cropscapeProxyRequest(proxyUrl, year, lat, lon), { method: 'GET' }, timeoutMs);
          const { code } = parsed(CROPSCAPE_SOURCE, () => parseCdlValue(text));
          const crop = CDL_TO_CROP[code];
          if (crop) out.push({ year, crop, source: 'cropscape' });
        }
        return out;
      });
      if (years.length === 0) return { status: 'no-data', reason: { code: 'context.no-crop-history' } };
      return { status: 'ready', data: years };
    } catch {
      return { status: 'error', source: CROPSCAPE_SOURCE, reason: { code: 'context.crop-history-error' } };
    }
  }

  /**
   * Start the soil and suitability requests in the background, so their answers are cached by the time the engine
   * asks (SoilGrids can take up to two minutes). Errors are dropped here: they are not cached and the engine's own call retries.
   */
  function warm(field: Field): void {
    void (async () => {
      const crops = await precomputed.getCrops(field.country);
      await Promise.allSettled([api.getSoil(field), api.getSuitability(field, crops.map((c) => c.id))]);
    })().catch(() => undefined);
  }

  const api: ContextProvider = {
    getCrops: (country) => precomputed.getCrops(country),
    getSlope: (field) => precomputed.getSlope(field),

    async getSoil(field) {
      if (isDemo(field)) return precomputed.getSoil(field);
      if (field.country === 'US') {
        const soil = await ssurgoSoil(field);
        if (soil) return soil;
        // no SSURGO map unit under the point: SoilGrids covers the whole land surface
      }
      return soilgridsSoil(field);
    },

    async getSuitability(field, cropIds) {
      if (isDemo(field)) return precomputed.getSuitability(field, cropIds);
      const base = { unit: SUITABILITY_UNIT, datasetIds: ['fao-gaez-v4'], kind: 'model' as const, retrievedAt: today() };
      const asked = cropIds.filter((id) => GAEZ_SX_1981_2010[id]);
      const settled = await Promise.allSettled(
        asked.map((id) => gaezValue(field, id, (GAEZ_SX_1981_2010[id] as { objectId: number }).objectId)),
      );
      const failures = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');
      if (asked.length > 0 && failures.length === asked.length) {
        const first = failures[0]?.reason;
        throw first instanceof SourceError ? first : new SourceError(GAEZ_SOURCE);
      }
      const byCrop = new Map(asked.map((id, i) => [id, settled[i]]));
      return Object.fromEntries(
        cropIds.map((id): [CropId, Sourced] => {
          const reason = gaezMissingCrop(id);
          if (reason) return [id, { ...base, value: null, missingReason: reason }];
          const s = byCrop.get(id);
          if (s?.status === 'fulfilled') return [id, s.value];
          const why = s?.reason instanceof Error ? s.reason.message : `${GAEZ_SOURCE} did not answer`;
          return [id, { ...base, value: null, missingReason: why }];
        }),
      );
    },

    async getCropHistory(field) {
      if (isDemo(field)) return precomputed.getCropHistory(field);
      // the crops step asks for the history first, a few steps before the analysis needs soil and suitability
      if (prefetch) warm(field);
      if (field.country !== 'US') return { status: 'no-data', reason: { code: 'context.no-crop-history' } };
      if (!cropscapeProxyUrl) return { status: 'no-data', reason: { code: 'context.crop-history-demo-only' } };
      return cropscapeHistory(field, cropscapeProxyUrl);
    },
  };
  return api;
}

// ---------- the provider the app uses ----------
/**
 * Precomputed values for the demo fields, live SSURGO, SoilGrids and GAEZ everywhere else. Crop history for a live
 * field goes through the CropScape proxy only in a production build (the Vite dev server has no /api routes).
 */
export const liveContextProvider: ContextProvider = createLiveContextProvider({
  precomputed: precomputedContextProvider,
  cropscapeProxyUrl: import.meta.env?.PROD ? '/api/cropscape' : undefined,
});
