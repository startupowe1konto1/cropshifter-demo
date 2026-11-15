import { describe, expect, it } from 'vitest';
import type { Field, FieldProfile } from '../contracts';
import { createTwinsProvider, type CasesFile } from './provider';

const feats = (gsRainMm: number, gsRootZoneWetness: number, frostDaysPerYear: number, yearlyMaxTempC: number) => ({
  gsMeanTempC: 18, gsRainMm, gsRootZoneWetness, frostDaysPerYear, yearlyMaxTempC,
});
/** Outcome rows: crop → [share %, yield t/ha | null]. */
const crops = (
  entries: Record<string, [number, number | null]>,
  source = 'usda-nass-quickstats',
  kind: 'observation' | 'derived' = 'observation',
) => ({
  years: '2019–2023',
  source,
  kind,
  areaHa: 1000,
  crops: Object.fromEntries(
    Object.entries(entries).map(([id, [share, yieldTPerHa]]) => [id, { sharePct: share, yieldTPerHa, nYears: 5, nAreaYears: 5 }]),
  ),
});

const iowaFeatures = feats(600, 0.5, 140, 35);
const cases: CasesFile = {
  meta: { retrievedAt: '2026-11-14', script: 'scripts/twins_outcomes.py', sourceUrl: 'https://quickstats.nass.usda.gov/' },
  regions: [
    // the county the field sits in: never its own twin
    { id: 'US-0', name: 'Own County, IA', country: 'US', centroid: { lat: 42.03, lon: -93.5 }, features: iowaFeatures, outcome: crops({ maize: [60, 12], soybean: [40, 3.5] }) },
    // two counties in one NASA POWER cell: identical features, one case
    { id: 'US-1', name: 'Near County, IA', country: 'US', centroid: { lat: 42.4, lon: -94.2 }, features: feats(601, 0.5, 140, 35), outcome: crops({ maize: [55, 11], soybean: [40, 3.4] }) },
    { id: 'US-5', name: 'Cell Mate County, IA', country: 'US', centroid: { lat: 42.45, lon: -94.25 }, features: feats(601, 0.5, 140, 35), outcome: crops({ maize: [50, 13], soybean: [45, 3.6] }) },
    { id: 'US-2', name: 'Far County, NE', country: 'US', centroid: { lat: 41, lon: -100 }, features: feats(300, 0.3, 170, 38), outcome: crops({ maize: [70, 9] }) },
    { id: 'US-3', name: 'Wheat County, MN', country: 'US', centroid: { lat: 45, lon: -95 }, features: feats(590, 0.5, 141, 35), outcome: crops({ 'winter-wheat': [30, 4] }) },
    { id: 'US-4', name: 'No Data County, IN', country: 'US', centroid: { lat: 40, lon: -86 }, features: feats(600, 0.5, 140, 35), outcome: null },
    { id: 'US-6', name: 'Soy Only County, IA', country: 'US', centroid: { lat: 41.5, lon: -92 }, features: feats(610, 0.52, 139, 35.2), outcome: crops({ soybean: [80, 3.3] }) },
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `PL-${i}`, name: `Region ${i}`, country: 'PL' as const, centroid: { lat: 50 + i * 0.1, lon: 20 },
      features: feats(330 + i, 0.36, 105, 33),
      outcome: crops({ 'winter-wheat': [25, 5.5], maize: [10, 7], rapeseed: [9, 3.2] }, 'eurostat-apro-cpnhr', 'derived'),
    })),
    {
      id: 'DE11', name: 'Stuttgart', country: 'OTHER', centroid: { lat: 48.8, lon: 9.2 }, features: feats(400, 0.45, 100, 32),
      outcome: {
        ...crops({ rapeseed: [12, 3.9], 'sugar-beet': [5, null] }, 'eurostat-apro-cpnhr', 'derived'),
        outcomeRegion: { code: 'DE1', name: 'Baden-Württemberg', level: 'nuts1', note: 'by Land only' },
      },
    },
    {
      // another NUTS 2 region of the same Land: Eurostat has the Land's figures only, so it is not a second case
      id: 'DE12', name: 'Karlsruhe', country: 'OTHER', centroid: { lat: 49.0, lon: 8.4 }, features: feats(420, 0.46, 98, 32),
      outcome: {
        ...crops({ rapeseed: [12, 3.9], 'sugar-beet': [5, null] }, 'eurostat-apro-cpnhr', 'derived'),
        outcomeRegion: { code: 'DE1', name: 'Baden-Württemberg', level: 'nuts1', note: 'by Land only' },
      },
    },
  ],
};

const field: Field = {
  id: 'demo-iowa', name: 'Iowa demo field', country: 'US', areaHa: 24, centroid: { lat: 42.03, lon: -93.5 },
  polygon: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
};
const profile = (rainPerSeasonMonth: number): FieldProfile => {
  const monthly = [2001, 2002].flatMap((year) =>
    Array.from({ length: 12 }, (_, i) => ({
      year, month: i + 1,
      rainMm: i + 1 >= 4 && i + 1 <= 9 ? rainPerSeasonMonth : 20,
      rootWetness: 0.5, tMaxC: i === 6 ? 35 : 10, frostDays: i < 3 || i > 9 ? 28 : 0, evapotranspirationMm: null,
    })),
  );
  return { monthly } as unknown as FieldProfile;
};

const provider = createTwinsProvider(async () => cases);

async function ready(rotation: Parameters<typeof provider.getTwins>[2], rain = 100) {
  const result = await provider.getTwins(field, profile(rain), rotation);
  if (result.status !== 'ready') throw new Error(`expected ready, got ${result.status}`);
  return result.data;
}

describe('TwinsProvider', () => {
  it('leaves out the region the field sits in', async () => {
    const { cases: found } = await ready([{ crop: 'maize' }, { crop: 'soybean' }]);
    expect(found.map((c) => c.regionName).join('|')).not.toContain('Own County');
  });

  it('counts regions with identical NASA POWER features once, naming the others', async () => {
    const { cases: found, caseCount } = await ready([{ crop: 'maize' }, { crop: 'soybean' }]);
    const cell = found.filter((c) => c.regionName.includes('Near County') || c.regionName.includes('Cell Mate County'));
    expect(cell).toHaveLength(1);
    expect(cell[0]!.regionName).toMatch(/\+1 more in the same NASA POWER grid cell/);
    expect(caseCount).toBe(found.length);
  });

  it('shows the yield of the first rotation crop grown there, averaged over a shared grid cell', async () => {
    const { cases: found } = await ready([{ crop: 'maize' }, { crop: 'soybean' }]);
    const cell = found.find((c) => c.regionName.includes('Near County'))!;
    expect(cell.crops).toEqual(['maize', 'soybean']);
    // area-weighted: 550 ha of maize at 11 t/ha and 500 ha at 13 t/ha
    expect(cell.outcome).toMatchObject({ value: 11.95, unit: 't/ha, maize, mean 2019–2023', kind: 'observation', retrievedAt: '2026-11-14' });
    expect(cell.outcome.datasetIds).toEqual(['usda-nass-county-crops', 'nasa-power-climatology', 'nasa-power-monthly']);
    const soyOnly = found.find((c) => c.regionName.includes('Soy Only'))!;
    expect(soyOnly).toMatchObject({ crops: ['soybean'], outcome: { value: 3.3, unit: 't/ha, soybean, mean 2019–2023' } });
  });

  it('keeps the ranking, the 10-case limit and the mean similarity of the shown cases', async () => {
    const { cases: found, caseCount, meanSimilarity } = await ready([{ crop: 'maize' }, { crop: 'winter-rapeseed' }]);
    expect(found.length).toBeLessThanOrEqual(10);
    expect(caseCount).toBe(found.length);
    expect(meanSimilarity).toBeCloseTo(found.reduce((s, c) => s + c.similarity, 0) / found.length, 5);
    for (let i = 1; i < found.length; i++) expect(found[i - 1]!.similarity).toBeGreaterThanOrEqual(found[i]!.similarity);
    expect(found.map((c) => c.regionName)).not.toContain('Wheat County, MN'); // grows none of the rotation's crops
    expect(found.map((c) => c.regionName)).not.toContain('No Data County, IN'); // no outcome
  });

  it('is no-data with twins.no-cases when no region grows a crop of the rotation', async () => {
    const result = await provider.getTwins(field, profile(100), [{ crop: 'phacelia' }]);
    expect(result).toEqual({ status: 'no-data', reason: { code: 'twins.no-cases' } });
  });

  it('maps our crop ids to the case-base names, keeps Eurostat yields as our calculation and names the Land for German cases', async () => {
    const { cases: found } = await ready([{ crop: 'winter-rapeseed' }], 30);
    const pl = found.find((c) => c.regionName.startsWith('Region'))!;
    expect(pl).toMatchObject({ crops: ['winter-rapeseed'], country: 'PL' });
    expect(pl.outcome).toMatchObject({ value: 3.2, kind: 'derived', datasetIds: ['eurostat-apro-cpnhr', 'nasa-power-climatology', 'nasa-power-monthly'] });
  });

  it('counts the NUTS 2 regions of one German Land as one case and gives a null yield with a reason when there is none', async () => {
    const { cases: found, caseCount } = await ready([{ crop: 'sugar-beet' }], 30);
    expect(caseCount).toBe(1);
    expect(found[0]!.regionName).toBe('Baden-Württemberg (2 NUTS 2 regions; Eurostat figures for the Land)');
    expect(found[0]!.outcome).toMatchObject({ value: null, missingReason: expect.stringContaining('sugar-beet') });
  });

  it('counts a cover crop of the rotation too', async () => {
    const result = await provider.getTwins(field, profile(100), [{ crop: 'oats', coverCrop: 'winter-wheat' }]);
    expect(result.status).toBe('ready');
  });
});

describe('loading the case base', () => {
  it('tries again after a failed load instead of keeping the failure', async () => {
    let calls = 0;
    const flaky = createTwinsProvider(async () => {
      calls += 1;
      if (calls === 1) throw new Error('network');
      return cases;
    });
    await expect(flaky.getTwins(field, profile(100), [{ crop: 'maize' }])).rejects.toThrow('network');
    const second = await flaky.getTwins(field, profile(100), [{ crop: 'maize' }]);
    expect(second.status).toBe('ready');
    expect(calls).toBe(2);
  });
});

describe('caseBaseTwinsProvider on the shipped case base', () => {
  it('loads the case base on first use and answers for the Iowa demo field', async () => {
    const { caseBaseTwinsProvider } = await import('./provider');
    const result = await caseBaseTwinsProvider.getTwins(field, profile(100), [{ crop: 'maize' }, { crop: 'soybean' }]);
    expect(['ready', 'no-data']).toContain(result.status);
  });
});
