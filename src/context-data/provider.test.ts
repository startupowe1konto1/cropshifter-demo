import { describe, expect, it } from 'vitest';
import type { CropTraits, Field } from '../contracts';
import { createPrecomputedContextProvider, type PrecomputedFiles } from './provider';

const meta = { retrievedAt: '2026-11-14', script: 'scripts/test.py', sourceUrl: 'https://example.org/source' };
const iowaCentroid = { lat: 42.03, lon: -93.63 };
const poznanCentroid = { lat: 52.45, lon: 17.1 };

const files: PrecomputedFiles = {
  cropscape: {
    meta,
    datasetId: 'usda-cropscape',
    fields: {
      'demo-iowa': {
        centroid: iowaCentroid,
        years: [
          { year: 2024, crop: 'maize', cdlCode: 1, cdlName: 'Corn' },
          { year: 2025, crop: 'soybean', cdlCode: 5, cdlName: 'Soybeans' },
          { year: 2023, crop: null, cdlCode: 176, cdlName: 'Grassland/Pasture' },
        ],
      },
    },
  },
  soil: {
    meta,
    fields: {
      'demo-iowa': {
        centroid: iowaCentroid,
        datasetId: 'usda-ssurgo',
        depthCm: '0-30',
        sandPct: { value: 30.5, low: 25, high: 36 },
        clayPct: { value: 27 },
        organicCarbonPct: { value: null, missingReason: 'no organic carbon in the map unit' },
        ph: { value: 6.3 },
      },
      'demo-poznan': {
        centroid: poznanCentroid,
        datasetId: 'isric-soilgrids',
        depthCm: '0-30',
        sandPct: { value: 74 },
        clayPct: { value: 9 },
        organicCarbonPct: { value: 1.1 },
        ph: { value: 6.1 },
      },
    },
  },
  gaez: {
    meta,
    datasetId: 'fao-gaez-v4',
    fields: {
      'demo-poznan': {
        centroid: poznanCentroid,
        crops: {
          'winter-wheat': { suitabilityIndex: 58, suitabilityClass: 'Good', classCode: 3, attainableYieldKgHa: 4260, period: '1981-2010' },
          rye: { suitabilityIndex: null, suitabilityClass: 'Good', classCode: 3, attainableYieldKgHa: 3394, period: '1981-2010' },
          potato: { suitabilityIndex: null, suitabilityClass: null, classCode: null, attainableYieldKgHa: null, period: '1981-2010' },
        },
      },
    },
  },
  slope: {
    meta,
    datasetId: 'nasadem',
    fields: {
      'demo-iowa': { centroid: iowaCentroid, meanSlopePct: 2.4 },
      'demo-poznan': { centroid: poznanCentroid, meanSlopePct: null, missingReason: 'tile not read' },
    },
  },
  crops: {
    US: [{ id: 'maize' } as CropTraits],
    PL: [{ id: 'rye' } as CropTraits],
  },
};

const polygon = { type: 'Polygon' as const, coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] };
const field = (id: string, centroid: { lat: number; lon: number }, country: Field['country']): Field => ({
  id, name: id, country, polygon, centroid, areaHa: 10,
});
const iowa = field('demo-iowa', iowaCentroid, 'US');
const nearIowa = field('user-1', { lat: 42.035, lon: -93.62 }, 'US'); // about 1 km away
const farFromIowa = field('user-2', { lat: 41.6, lon: -93.6 }, 'US'); // about 48 km away
const poznan = field('demo-poznan', poznanCentroid, 'PL');

const provider = createPrecomputedContextProvider(files);

describe('precomputedContextProvider', () => {
  it('returns the precomputed crop history for the Iowa demo field, years in order, unmapped years left out', async () => {
    const history = await provider.getCropHistory(iowa);
    expect(history).toEqual({
      status: 'ready',
      data: [
        { year: 2024, crop: 'maize', source: 'cropscape' },
        { year: 2025, crop: 'soybean', source: 'cropscape' },
      ],
    });
  });

  it('gives no crop history for a field away from the demo fields', async () => {
    expect(await provider.getCropHistory(farFromIowa)).toEqual({ status: 'no-data', reason: { code: 'context.no-crop-history' } });
    expect(await provider.getCropHistory(poznan)).toEqual({ status: 'no-data', reason: { code: 'context.no-crop-history' } });
  });

  it('returns sourced soil values with the date of the precompute run for a field within 2 km of a demo field', async () => {
    const soil = await provider.getSoil(nearIowa);
    expect(soil.sandPct).toMatchObject({ value: 30.5, unit: '%', datasetIds: ['usda-ssurgo'], retrievedAt: '2026-11-14' });
    expect(soil.sandPct.range).toEqual({ low: 25, high: 36, basis: expect.stringContaining('0–30 cm') });
    expect(soil.organicCarbon).toMatchObject({ value: null, missingReason: 'no organic carbon in the map unit' });
    expect(soil.ph.value).toBe(6.3);
  });

  it('labels SoilGrids as a model and SSURGO as an observation', async () => {
    expect((await provider.getSoil(poznan)).sandPct.kind).toBe('model');
    expect((await provider.getSoil(iowa)).sandPct.kind).toBe('observation');
  });

  it('returns null soil, slope and suitability with a reason for a field elsewhere', async () => {
    const soil = await provider.getSoil(farFromIowa);
    expect(soil.clayPct.value).toBeNull();
    expect(soil.clayPct.missingReason).toMatch(/precomputed/);
    const slope = await provider.getSlope(farFromIowa);
    expect(slope).toMatchObject({ value: null, datasetIds: ['nasadem'] });
    expect(slope.missingReason).toBeTruthy();
    const suitability = await provider.getSuitability(farFromIowa, ['maize']);
    expect(suitability.maize).toMatchObject({ value: null, datasetIds: ['fao-gaez-v4'] });
  });

  it('returns the slope with its source and keeps a missing slope as null with the reason from the file', async () => {
    expect(await provider.getSlope(iowa)).toMatchObject({ value: 2.4, unit: '%', datasetIds: ['nasadem'], kind: 'derived' });
    expect(await provider.getSlope(poznan)).toMatchObject({ value: null, missingReason: 'tile not read' });
  });

  it('returns the GAEZ suitability index, falls back to the class midpoint with its range, and names missing crops', async () => {
    const s = await provider.getSuitability(poznan, ['winter-wheat', 'rye', 'potato', 'sugar-beet']);
    expect(s['winter-wheat']).toMatchObject({ value: 58, unit: 'suitability index, 0–100', kind: 'model', retrievedAt: '2026-11-14' });
    expect(s.rye?.value).toBe(56.5);
    expect(s.rye?.range).toEqual({ low: 50, high: 63, basis: expect.stringContaining('Good') });
    expect(s.potato).toMatchObject({ value: null });
    expect(s.potato?.missingReason).toBeTruthy();
    expect(s['sugar-beet']?.value).toBeNull();
  });

  it('reads crop traits per country and returns none for other countries', async () => {
    expect((await provider.getCrops('US')).map((c) => c.id)).toEqual(['maize']);
    expect((await provider.getCrops('PL')).map((c) => c.id)).toEqual(['rye']);
    expect(await provider.getCrops('OTHER')).toEqual([]);
  });
});

describe('precomputedContextProvider on the shipped files', () => {
  it('runs on real soil, slope, suitability and crop history for both demo fields', async () => {
    const { precomputedContextProvider: real } = await import('./provider');
    const { demoFields } = await import('../fixtures/fields');
    const iowaHistory = await real.getCropHistory(demoFields.iowa);
    expect(iowaHistory.status).toBe('ready');
    for (const f of [demoFields.iowa, demoFields.poznan]) {
      const soil = await real.getSoil(f);
      expect(soil.sandPct.value).not.toBeNull();
      expect((await real.getSlope(f)).value).not.toBeNull();
    }
    const s = await real.getSuitability(demoFields.poznan, ['winter-wheat']);
    expect(s['winter-wheat']?.value).not.toBeNull();
    expect((await real.getCrops('US')).length).toBeGreaterThan(0);
    expect((await real.getCrops('PL')).length).toBeGreaterThan(0);
  });
});
