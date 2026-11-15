import { describe, expect, it } from 'vitest';
import type { CropTraits, Field } from '../contracts';
import { sourced } from '../contracts/schemas';
import { demoFields } from '../fixtures/fields';
import moneyPl from '../../data/money/pl.json';
import { datasets } from './datasets';
import { createTableMoneyProvider, tableMoneyProvider, type MoneyTables } from './provider';
import usIa from '../../data/money/us-ia.json';

const ref = (locator: string, url: string) => ({ title: 'test source', url, locator });

const tables: MoneyTables = {
  US: {
    campaign: 'test campaign',
    currency: 'USD',
    economics: [
      {
        crop: 'maize', referenceYieldTPerHa: 13, pricePerT: 160, directCostsPerHa: 1200,
        yieldPeriod: '2021–2025 mean', pricePeriod: '2025 marketing year', costsPeriod: '2026 budget',
        sources: [
          ref('yield: county mean', 'https://quickstats.nass.usda.gov/results/A'),
          ref('price: marketing year', 'https://quickstats.nass.usda.gov/results/B'),
          ref('direct costs: page 3', 'https://www.extension.iastate.edu/agdm/crops/pdf/a1-20.pdf'),
        ],
      },
      {
        crop: 'cereal-rye', kind: 'cover', directCostsPerHa: 70, costsPeriod: '2026 survey',
        sources: [ref('direct costs: operations only', 'https://www.extension.iastate.edu/agdm/crops/pdf/a3-10.pdf')],
      },
    ],
    payments: [],
  },
  PL: { campaign: 'test', currency: 'PLN', economics: [], payments: [] },
};

const trait = (id: string, kind: CropTraits['kind']): CropTraits => ({
  id, family: 'Poaceae', legume: false, kind, sowMonth: 4, harvestMonth: 10, sensitive: [], forage: false,
  residueCover: 'high', sources: [{ title: 't', url: 'https://example.org', locator: 'p. 1' }],
});
const crops = {
  US: [trait('maize', 'cash'), trait('soybean', 'cash'), trait('cereal-rye', 'cover'), trait('red-clover', 'cover')],
  PL: [],
};
const provider = createTableMoneyProvider(tables, crops);
const iowa = demoFields.iowa;

describe('getEconomics', () => {
  it('returns ready with Sourced yield, price and costs when every crop has a row', async () => {
    const result = await provider.getEconomics(iowa, ['maize']);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const [maize] = result.data;
    expect(maize!.crop).toBe('maize');
    expect(maize!.referenceYieldTPerHa).toMatchObject({ value: 13, unit: 't/ha', datasetIds: ['usda-nass-quickstats-yields'] });
    expect(maize!.pricePerT).toMatchObject({ value: 160, unit: 'USD/t', datasetIds: ['usda-nass-quickstats-prices'], kind: 'observation' });
    expect(maize!.directCostsPerHa).toMatchObject({ value: 1200, unit: 'USD/ha', datasetIds: ['isu-agdm-a1-20'] });
    for (const value of [maize!.referenceYieldTPerHa, maize!.pricePerT, maize!.directCostsPerHa]) {
      expect(sourced.safeParse(value).success).toBe(true);
    }
  });

  it('returns no-data naming the crop without a row', async () => {
    const result = await provider.getEconomics(iowa, ['maize', 'soybean']);
    expect(result).toEqual({ status: 'no-data', reason: { code: 'money.no-economics', params: { crop: 'soybean' } } });
  });

  it('skips a cover crop without a row: it is not sold, and its cost becomes a gap in the engine (D34)', async () => {
    const result = await provider.getEconomics(iowa, ['maize', 'red-clover']);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.data.map((e) => e.crop)).toEqual(['maize']);
  });

  it('returns the sourced direct costs of a cover crop with a row, and no yield or price (D34, #98 item 5)', async () => {
    const result = await provider.getEconomics(iowa, ['maize', 'cereal-rye']);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.data.map((e) => e.crop)).toEqual(['maize', 'cereal-rye']);
    const rye = result.data.find((e) => e.crop === 'cereal-rye')!;
    const row = tables.US.economics.find((r) => r.crop === 'cereal-rye')!;
    expect(rye.directCostsPerHa).toMatchObject({ value: row.directCostsPerHa, unit: 'USD/ha', datasetIds: ['isu-agdm-a3-10'], kind: 'model' });
    for (const missing of [rye.referenceYieldTPerHa, rye.pricePerT]) {
      expect(missing).toMatchObject({ value: null, missingReason: 'cover crop, not sold (D34)' });
    }
    for (const value of [rye.referenceYieldTPerHa, rye.pricePerT, rye.directCostsPerHa]) {
      expect(sourced.safeParse(value).success).toBe(true);
    }
  });

  it('never lets a cover-crop row stand in for a sold crop', async () => {
    const asCash = createTableMoneyProvider(tables, { ...crops, US: [trait('cereal-rye', 'cash')] });
    const result = await asCash.getEconomics(iowa, ['cereal-rye']);
    expect(result).toEqual({ status: 'no-data', reason: { code: 'money.no-economics', params: { crop: 'cereal-rye' } } });
  });

  it('returns each crop once', async () => {
    const result = await provider.getEconomics(iowa, ['maize', 'maize']);
    if (result.status === 'ready') expect(result.data).toHaveLength(1);
  });

  it('returns no-data for a field outside the USA and Poland', async () => {
    const other: Field = { ...iowa, country: 'OTHER' };
    const result = await provider.getEconomics(other, ['maize']);
    expect(result).toEqual({ status: 'no-data', reason: { code: 'money.no-tables' } });
  });
});

describe('tableMoneyProvider on the shipped tables', () => {
  it('is ready for the Iowa crops with a yield, a price and costs: maize, soybean, oats and alfalfa', async () => {
    const result = await tableMoneyProvider.getEconomics(demoFields.iowa, ['maize', 'soybean', 'oats', 'alfalfa']);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      const oats = result.data.find((e) => e.crop === 'oats')!;
      const oatsRow = usIa.economics.find((e) => e.crop === 'oats')!;
      expect(oats.referenceYieldTPerHa.value).toBeCloseTo(oatsRow.referenceYieldTPerHa!, 3);
      expect(oats.pricePerT).toMatchObject({ unit: 'USD/t', datasetIds: ['usda-nass-quickstats-prices'] });
    }
  });

  it('returns the sourced operation costs of the Iowa cover crops, cereal rye and red clover', async () => {
    const covers = usIa.economics.filter((r) => 'kind' in r && r.kind === 'cover');
    expect(covers.map((r) => r.crop).sort()).toEqual(['cereal-rye', 'red-clover']);
    const result = await tableMoneyProvider.getEconomics(demoFields.iowa, ['maize', ...covers.map((r) => r.crop)]);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    for (const row of covers) {
      const e = result.data.find((x) => x.crop === row.crop)!;
      expect(e.directCostsPerHa).toMatchObject({ value: row.directCostsPerHa, unit: 'USD/ha', datasetIds: ['isu-agdm-a3-10'] });
      expect(e.referenceYieldTPerHa.value).toBeNull();
      expect(e.pricePerT.value).toBeNull();
    }
  });

  it('skips the Poznań cover crops, which have no sourced cost', async () => {
    const result = await tableMoneyProvider.getEconomics(demoFields.poznan, ['winter-wheat', 'white-mustard', 'phacelia']);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.data.map((e) => e.crop)).toEqual(['winter-wheat']);
  });

  it('names a crop with no Iowa row as missing', async () => {
    const result = await tableMoneyProvider.getEconomics(demoFields.iowa, ['maize', 'potato']);
    expect(result).toEqual({ status: 'no-data', reason: { code: 'money.no-economics', params: { crop: 'potato' } } });
  });

  // Step 6 plan, B1: the Iowa demo rotations with alfalfa and winter wheat need a winter wheat row.
  it('is ready for winter wheat in Iowa, with its price from the US Crop Values report', async () => {
    const result = await tableMoneyProvider.getEconomics(demoFields.iowa, ['maize', 'winter-wheat']);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      const wheat = result.data.find((e) => e.crop === 'winter-wheat')!;
      expect(wheat.pricePerT.datasetIds).toEqual(['usda-nass-crop-values-2025']);
    }
  });

  it('is ready for every Poznań crop that R8 sourced', async () => {
    const crops = ['winter-wheat', 'maize', 'winter-rapeseed', 'spring-barley', 'rye', 'field-pea', 'sugar-beet', 'potato'];
    const result = await tableMoneyProvider.getEconomics(demoFields.poznan, crops);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.data.map((e) => e.crop)).toEqual(crops);
      for (const e of result.data) {
        expect(e.pricePerT.unit).toBe('PLN/t');
        expect(e.referenceYieldTPerHa.datasetIds).toEqual(['gus-produkcja-upraw']);
      }
    }
  });

  it('names oats as missing in Poland', async () => {
    const result = await tableMoneyProvider.getEconomics(demoFields.poznan, ['winter-wheat', 'oats']);
    expect(result).toEqual({ status: 'no-data', reason: { code: 'money.no-economics', params: { crop: 'oats' } } });
  });
});

describe('the period of each money value', () => {
  // The source chip shows a value's period through its dataset (SourcedNumber prints dataset.period), so each value
  // must point at a dataset whose period names the period of that value in data/money (issue #79 item 4).
  const cases = [
    { field: demoFields.iowa, file: usIa },
    { field: demoFields.poznan, file: moneyPl },
  ];
  it.each(cases)('reaches the source chip for every crop of $field.name', async ({ field, file }) => {
    const result = await tableMoneyProvider.getEconomics(field, file.economics.map((r) => r.crop));
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    for (const e of result.data) {
      const row = file.economics.find((r) => r.crop === e.crop) as Record<string, unknown>;
      const pairs = [
        [e.referenceYieldTPerHa, row.yieldPeriod],
        [e.pricePerT, row.pricePeriod],
        [e.directCostsPerHa, row.costsPeriod],
      ] as const;
      for (const [value, period] of pairs) {
        if (value.value === null) continue; // a cover crop has no yield or price (D34)
        expect(typeof period, `${e.crop}: period missing`).toBe('string');
        expect(value.datasetIds, e.crop).toHaveLength(1);
        const dataset = datasets.find((d) => d.id === value.datasetIds[0]);
        expect(dataset?.period, `${e.crop} ${value.datasetIds[0]}`).toContain(period as string);
      }
    }
  });
});
