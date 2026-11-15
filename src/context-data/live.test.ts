// Live ContextProvider (task O4-A5) with a fake fetch that answers with the saved samples.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { ContextProvider, Field } from '../contracts';
import { SourceError } from '../contracts';
import { createLiveContextProvider, type DemoPoint } from './live';
import { precomputedContextProvider } from './provider';

const sample = (path: string) => readFileSync(`data/samples/${path}`, 'utf-8');
const day = '2026-11-14';

function field(id: string, country: Field['country'], lat: number, lon: number): Field {
  return {
    id, name: id, country, areaHa: 5, centroid: { lat, lon },
    polygon: { type: 'Polygon', coordinates: [[[lon, lat], [lon + 0.001, lat], [lon + 0.001, lat + 0.001], [lon, lat]]] },
  };
}
const iowaElsewhere = field('f-us', 'US', 41.5, -94.2);
const polandElsewhere = field('f-pl', 'PL', 51.1, 20.3);
const demo: DemoPoint[] = [{ id: 'demo-iowa', centroid: { lat: 42.0305, lon: -93.497 } }];

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
function fakeFetch(handler: Handler) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}
const ok = (body: string) => new Response(body, { status: 200 });

function samplesFetch(): Handler {
  return (url) => {
    if (url.startsWith('https://sdmdataaccess')) return ok(sample('ssurgo/sda_point_demo-iowa.json'));
    if (url.startsWith('https://rest.isric.org')) return ok(sample('soilgrids/properties_query_17.10_52.45_0-30cm.json'));
    if (url.includes('gaez-services.fao.org')) return ok(sample('gaez/res05-identify-sxHr_mze-demo-iowa.json'));
    if (url.startsWith('/api/cropscape')) return ok(sample('cropscape/getcdlvalue_2025_demo-iowa.xml'));
    return new Response('not found', { status: 404 });
  };
}

function live(handler: Handler, extra: Partial<Parameters<typeof createLiveContextProvider>[0]> = {}) {
  const fetchImpl = fakeFetch(handler);
  const provider = createLiveContextProvider({ precomputed: precomputedContextProvider, demoPoints: demo, fetchImpl, today: () => day, prefetch: false, ...extra });
  return { provider, fetchImpl };
}

describe('live context provider', () => {
  it('a field near a demo field gets the precomputed values without a request', async () => {
    const precomputed: ContextProvider = {
      ...precomputedContextProvider,
      getSoil: vi.fn(precomputedContextProvider.getSoil),
    };
    const fetchImpl = fakeFetch(samplesFetch());
    const provider = createLiveContextProvider({ precomputed, demoPoints: demo, fetchImpl });
    const near = field('drawn', 'US', 42.035, -93.5); // about 0.6 km from the Iowa demo centroid
    const soil = await provider.getSoil(near);
    expect(precomputed.getSoil).toHaveBeenCalledWith(near);
    expect(soil.sandPct.value).not.toBeNull();
    await provider.getSuitability(near, ['maize']);
    await provider.getCropHistory(near);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a US field elsewhere gets SSURGO soil by a POST to Soil Data Access, cached per point', async () => {
    const { provider, fetchImpl } = live(samplesFetch());
    const soil = await provider.getSoil(iowaElsewhere);
    expect(soil.sandPct).toMatchObject({ value: 27, datasetIds: ['usda-ssurgo'], kind: 'observation', retrievedAt: day });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest');
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('point(-94.2 41.5)');
    await provider.getSoil({ ...iowaElsewhere, id: 'same-point' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('a US point without a SSURGO map unit falls back to SoilGrids', async () => {
    const { provider } = live((url, init) => (url.startsWith('https://sdmdataaccess') ? ok('{}') : samplesFetch()(url, init)));
    const soil = await provider.getSoil(iowaElsewhere);
    expect(soil.sandPct).toMatchObject({ value: 71.4, datasetIds: ['isric-soilgrids'], kind: 'model' });
  });

  it('a Polish field elsewhere gets SoilGrids soil with its quantile range', async () => {
    const { provider, fetchImpl } = live(samplesFetch());
    const soil = await provider.getSoil(polandElsewhere);
    expect(soil.organicCarbon).toMatchObject({ value: 2.67, unit: '% by weight', range: { low: 0.38, high: 7.95 } });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('lat=51.1');
  });

  it('suitability: one GAEZ identify per crop; cover crops are null with a reason', async () => {
    const { provider, fetchImpl } = live(samplesFetch());
    const s = await provider.getSuitability(polandElsewhere, ['winter-wheat', 'maize', 'phacelia']);
    expect(s['winter-wheat']).toMatchObject({ value: 100, datasetIds: ['fao-gaez-v4'], kind: 'model', retrievedAt: day });
    expect(s.phacelia).toMatchObject({ value: null, missingReason: 'FAO GAEZ v4 has no crop for phacelia' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('suitability: one crop failing is null with the source named; all failing throws a SourceError', async () => {
    const { provider } = live((url, init) =>
      url.includes('257854') ? new Response('', { status: 503 }) : samplesFetch()(url, init),
    );
    const s = await provider.getSuitability(polandElsewhere, ['winter-wheat', 'maize']);
    expect(s['winter-wheat']?.value).toBe(100);
    expect(s.maize).toMatchObject({ value: null, missingReason: 'FAO GAEZ answered HTTP 503' });

    const down = live(() => new Response('', { status: 500 })).provider;
    await expect(down.getSuitability(polandElsewhere, ['maize'])).rejects.toMatchObject({ name: 'SourceError', source: 'FAO GAEZ' });
  });

  it('a source that does not answer in time is a SourceError, and the failure is not cached', async () => {
    vi.useFakeTimers();
    try {
      const hang: Handler = (_url, init) =>
        new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      const { provider, fetchImpl } = live(hang, { soilgridsTimeoutMs: 30_000 });
      const pending = provider.getSoil(polandElsewhere);
      const check = expect(pending).rejects.toSatisfy(
        (e: unknown) => e instanceof SourceError && e.source === 'SoilGrids' && /within 30 s/.test(e.message),
      );
      await vi.advanceTimersByTimeAsync(30_000);
      await check;
      fetchImpl.mockImplementation(async (input: RequestInfo | URL) => samplesFetch()(String(input)));
      await expect(provider.getSoil(polandElsewhere)).resolves.toMatchObject({ sandPct: { value: 71.4 } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('SoilGrids gets 120 s by default: a slow answer at 100 s is used, no answer by 120 s is a SourceError', async () => {
    vi.useFakeTimers();
    try {
      const slow: Handler = (url) =>
        new Promise((resolve) => setTimeout(() => resolve(samplesFetch()(url) as Response), 100_000));
      const slowProvider = live(slow).provider; // no soilgridsTimeoutMs: the default applies
      const answered = slowProvider.getSoil(polandElsewhere);
      await vi.advanceTimersByTimeAsync(100_000);
      await expect(answered).resolves.toMatchObject({ sandPct: { kind: 'model' } });

      const hang: Handler = (_url, init) =>
        new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      const hangProvider = live(hang).provider;
      let settled = false;
      const pending = hangProvider.getSoil(polandElsewhere).finally(() => { settled = true; });
      const check = expect(pending).rejects.toSatisfy(
        (e: unknown) => e instanceof SourceError && e.source === 'SoilGrids' && /within 120 s/.test(e.message),
      );
      await vi.advanceTimersByTimeAsync(119_000);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1_000);
      await check;
    } finally {
      vi.useRealTimers();
    }
  });

  it('a SoilGrids HTTP error is a SourceError naming SoilGrids', async () => {
    const { provider } = live(() => new Response('busy', { status: 503 }));
    await expect(provider.getSoil(polandElsewhere)).rejects.toMatchObject({ source: 'SoilGrids' });
  });

  it('crop history: outside the USA no-data; without the CropScape proxy no-data with its own code', async () => {
    const { provider, fetchImpl } = live(samplesFetch());
    expect(await provider.getCropHistory(polandElsewhere)).toEqual({ status: 'no-data', reason: { code: 'context.no-crop-history' } });
    expect(await provider.getCropHistory(iowaElsewhere)).toEqual({ status: 'no-data', reason: { code: 'context.crop-history-demo-only' } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('crop history through the proxy: one call per year, CDL classes mapped to crops', async () => {
    const { provider, fetchImpl } = live(samplesFetch(), { cropscapeProxyUrl: '/api/cropscape' });
    const h = await provider.getCropHistory(iowaElsewhere);
    expect(h.status).toBe('ready');
    if (h.status === 'ready') expect(h.data[0]).toEqual({ year: 2020, crop: 'soybean', source: 'cropscape' });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it('crop history: a failing proxy is an error result, never a rejection', async () => {
    const { provider } = live(() => new Response('', { status: 502 }), { cropscapeProxyUrl: '/api/cropscape' });
    expect(await provider.getCropHistory(iowaElsewhere)).toEqual({
      status: 'error', source: 'USDA CropScape', reason: { code: 'context.crop-history-error' },
    });
  });

  it('asking for the crop history starts the soil and suitability requests, and the engine then reads them from the cache', async () => {
    const { provider, fetchImpl } = live(samplesFetch(), { prefetch: true });
    await provider.getCropHistory(polandElsewhere);
    await vi.waitFor(() => expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(5)); // SoilGrids + 4 GAEZ crops of pl.json
    const before = fetchImpl.mock.calls.length;
    await provider.getSoil(polandElsewhere);
    await provider.getSuitability(polandElsewhere, ['winter-wheat', 'maize']);
    expect(fetchImpl).toHaveBeenCalledTimes(before);
  });

  it('slope stays precomputed: null with a reason away from the demo fields', async () => {
    const { provider } = live(samplesFetch());
    const slope = await provider.getSlope(iowaElsewhere);
    expect(slope.value).toBeNull();
    expect(slope.missingReason).toBeTruthy();
  });
});
