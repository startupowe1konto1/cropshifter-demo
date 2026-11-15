import { describe, expect, it } from 'vitest';
import type { ClimateProfile, CropEconomics, CropTraits, MoneyEstimate, Sourced } from '../contracts';
import {
  CALIBRATION_GAP_FACTOR,
  INCOME_MESSAGE_CODES,
  TotalLossError,
  incomeEstimate,
  incomeScores,
  incomeTotal,
  yearlyYield,
} from './income';
import { demoFields, fixtureProviders } from '../fixtures';
import { tableMoneyProvider } from '../money/provider';
import { engineRules, shippedRules } from './rules';

type Row = ClimateProfile['monthly'][number];

/** hazards.drought.percentile (D30): pooled over every month of the record. */
const DROUGHT_P = 20;
/** hazards.heat.minDays (D43), read from the shipped rules. */
const HEAT_MIN = engineRules(shippedRules).heatMinDays;
const FIRST = 1981;
const LAST = 2025;
const YEARS = Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i);

/**
 * A hand-made 45-year record: every month has wetness 0.5, tMax 20 °C and no frost days, unless `edit` changes it.
 * With 0.5 in at least 37 of 45 Julys, the 20th percentile and the median are both 0.5, so a July at 0.25 is a
 * July shortfall of exactly 0.5 against the median.
 */
function makeClimate(edit: (row: Row) => Row = (row) => row): ClimateProfile {
  const monthly: Row[] = [];
  for (const year of YEARS) {
    for (let month = 1; month <= 12; month++) {
      monthly.push(
        edit({ year, month, rootWetness: 0.5, rainMm: 50, tMaxC: 20, frostDays: 0, evapotranspirationMm: 60 }),
      );
    }
  }
  return {
    source: { datasetIds: ['nasa-power-monthly'], kind: 'model', retrievedAt: '2026-11-14' },
    monthly,
    monthlyRisk: [],
    yearly: [],
    droughtYears: [],
    trends: [],
  };
}

const testCrop = (row: Partial<CropTraits> & Pick<CropTraits, 'id'>): CropTraits => ({
  family: 'Testaceae',
  legume: false,
  kind: 'cash',
  sowMonth: 5,
  harvestMonth: 10,
  sensitive: [],
  waterNeed: 'medium',
  yieldResponseFactor: 1,
  forage: false,
  residueCover: 'low',
  sources: [{ title: 'test', url: 'https://example.org', locator: 'test' }],
  ...row,
});

// A: drought in July (Ky 1.2), heat in July above 35 °C (lossShare 0.2), frost in May above 2 days (lossShare 0.15).
const cropA = testCrop({
  id: 'a',
  yieldResponseFactor: 1.2,
  sensitive: [
    { hazard: 'drought', months: [7], threshold: 20, lossShare: 0.35 },
    { hazard: 'heat', months: [7], threshold: 35, lossShare: 0.2 },
    { hazard: 'frost', months: [5], threshold: 2, lossShare: 0.15 },
  ],
});
// N: no sensitive months.
const cropN = testCrop({ id: 'n' });
// Cover crop with no yield response factor (allowed for cover crops once contract PR #44 lands).
const coverC = { ...testCrop({ id: 'c', kind: 'cover' }), yieldResponseFactor: undefined } as unknown as CropTraits;
const crops = [cropA, cropN, coverC];

const DRY = [1985, 1990, 1995, 2000, 2005]; // five Julys at 0.25
const dryClimate = makeClimate((r) => (r.month === 7 && DRY.includes(r.year) ? { ...r, rootWetness: 0.25 } : r));
/**
 * Calibration of crop A on dryClimate: 40 years at relative yield 1 and 5 at 0.4 (loss 0.6) average 42/45, so every
 * year is scaled by 45/42 and the mean replayed yield is the reference yield.
 */
const K_A = 45 / 42;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const yieldOf = (rows: ReturnType<typeof yearlyYield>, year: number) => rows.find((r) => r.year === year);

describe('yearlyYield', () => {
  it('equals the reference yield in every year without a hazard hit', () => {
    const rows = yearlyYield(cropA, makeClimate(), 10, DROUGHT_P, HEAT_MIN);
    expect(rows).toHaveLength(45);
    for (const r of rows) {
      expect(r.loss).toBe(0);
      expect(r.yieldTPerHa).toBe(10);
    }
  });

  it('turns a July shortfall of 0.5 against the median and yield response factor 1.2 into a loss of 0.6', () => {
    const rows = yearlyYield(cropA, dryClimate, 10, DROUGHT_P, HEAT_MIN);
    expect(yieldOf(rows, 1985)!.loss).toBeCloseTo(0.6, 10);
    expect(yieldOf(rows, 1985)!.yieldTPerHa).toBeCloseTo(10 * 0.4 * K_A, 10);
    expect(yieldOf(rows, 1986)!.loss).toBe(0);
  });

  // The reference yield is already a mean of actual yields (issue #98), so the replay scales the hazard pattern to it.
  it('scales the yields so the mean replayed yield equals the reference yield, keeping the year-to-year ratios', () => {
    const rows = yearlyYield(cropA, dryClimate, 10, DROUGHT_P, HEAT_MIN);
    expect(mean(rows.map((r) => r.yieldTPerHa))).toBeCloseTo(10, 10);
    expect(yieldOf(rows, 1985)!.yieldTPerHa / yieldOf(rows, 1986)!.yieldTPerHa).toBeCloseTo(0.4, 10);
    expect(yieldOf(rows, 1986)!.yieldTPerHa).toBeCloseTo(10 * K_A, 10);
  });

  it('calibrates over the replayed years only, leaving out a year with every check missing', () => {
    const climate = makeClimate((r) => {
      if (r.month === 7 && DRY.includes(r.year)) return { ...r, rootWetness: 0.25 };
      if (r.year === 2010 && (r.month === 5 || r.month === 7)) return { ...r, rootWetness: null, tMaxC: null, frostDays: null };
      return r;
    });
    const rows = yearlyYield(cropA, climate, 10, DROUGHT_P, HEAT_MIN);
    expect(rows).toHaveLength(44);
    expect(mean(rows.map((r) => r.yieldTPerHa))).toBeCloseTo(10, 10);
  });

  // D43 (#113): heat counts only when at least heatMinDays days are hot, the same rule as climate resilience.
  it('counts heat by the same minimum of hot days as climate resilience', () => {
    const july = (hot: number) => [...Array<number>(hot).fill(38), ...Array<number>(31 - hot).fill(25)];
    const climate = makeClimate((r) => (r.month === 7 ? { ...r, tMaxDailyC: july(r.year % 2 === 0 ? 2 : 0) } : r));
    const hot = (rows: ReturnType<typeof yearlyYield>) => rows.filter((r) => r.loss > 0).length;
    expect(hot(yearlyYield(cropA, climate, 10, DROUGHT_P, 1))).toBeGreaterThan(0);
    expect(hot(yearlyYield(cropA, climate, 10, DROUGHT_P, 3))).toBe(0);
    const r1 = incomeEstimate([{ crop: 'a' }], crops, climate, economics, [], 'USD', 'FY2026', DROUGHT_P, 1);
    const r3 = incomeEstimate([{ crop: 'a' }], crops, climate, economics, [], 'USD', 'FY2026', DROUGHT_P, 3);
    if (r1.status !== 'ready' || r3.status !== 'ready') throw new Error('expected ready');
    expect(r1.data.estimate.marginPerHa.range!.low).toBeLessThan(r3.data.estimate.marginPerHa.range!.low);
  });

  it('throws a total-loss error, never yields of 0, when every replayed year is a total loss', () => {
    const climate = makeClimate((r) => (r.month === 7 ? { ...r, rootWetness: r.year % 2 === 0 ? 0 : 0.5, tMaxC: 38 } : r));
    const harsh = { ...cropA, sensitive: [{ hazard: 'heat' as const, months: [7], threshold: 35, lossShare: 1 }] };
    expect(() => yearlyYield(harsh, climate, 10, DROUGHT_P, HEAT_MIN)).toThrow(TotalLossError);
  });

  it('counts the July shortfall against the median in a year below the median that is not a drought hit (SPEC 7)', () => {
    // Julys rise from 0.30 (1981) to 0.74 (2025), median 0.52; every other month is 0.1, so the pooled 20th
    // percentile is 0.1 and no July is a drought hit. 1981 still falls short of the median by (0.52-0.30)/0.52.
    const climate = makeClimate((r) => ({ ...r, rootWetness: r.month === 7 ? 0.3 + 0.01 * (r.year - FIRST) : 0.1 }));
    const rows = yearlyYield(cropA, climate, 10, DROUGHT_P, HEAT_MIN);
    expect(yieldOf(rows, 1981)!.loss).toBeCloseTo(((0.52 - 0.3) / 0.52) * 1.2, 6);
    expect(yieldOf(rows, 2003)!.loss).toBe(0); // July 0.52 = the median
    expect(yieldOf(rows, 2025)!.loss).toBe(0);
  });

  it('takes the largest drought loss over the sensitive months, not the sum', () => {
    const twoMonths = testCrop({
      id: 'd',
      yieldResponseFactor: 1,
      sensitive: [{ hazard: 'drought', months: [6, 7], threshold: 20, lossShare: 0.3 }],
    });
    const climate = makeClimate((r) => {
      if (r.year !== 1990) return r;
      if (r.month === 6) return { ...r, rootWetness: 0.4 }; // deficit 0.2
      if (r.month === 7) return { ...r, rootWetness: 0.25 }; // deficit 0.5
      return r;
    });
    expect(yieldOf(yearlyYield(twoMonths, climate, 10, DROUGHT_P, HEAT_MIN), 1990)!.loss).toBeCloseTo(0.5, 10);
  });

  it('applies lossShare for heat and for frost in a sensitive month', () => {
    const climate = makeClimate((r) => {
      if (r.year === 1990 && r.month === 7) return { ...r, tMaxC: 38 };
      if (r.year === 1991 && r.month === 5) return { ...r, frostDays: 4 };
      if (r.year === 1992 && r.month === 8) return { ...r, tMaxC: 40 }; // August is not a sensitive month of A
      return r;
    });
    const rows = yearlyYield(cropA, climate, 10, DROUGHT_P, HEAT_MIN);
    expect(yieldOf(rows, 1990)!.loss).toBeCloseTo(0.2, 10);
    expect(yieldOf(rows, 1991)!.loss).toBeCloseTo(0.15, 10);
    // relative yields: 43 years at 1, 0.8 and 0.85, mean (43 + 1.65) / 45
    expect(yieldOf(rows, 1991)!.yieldTPerHa).toBeCloseTo((10 * 0.85 * 45) / 44.65, 10);
    expect(yieldOf(rows, 1992)!.loss).toBe(0);
  });

  it('adds drought, heat and frost losses and caps the total at 1', () => {
    const climate = makeClimate((r) => {
      if (r.year !== 1990) return r;
      if (r.month === 7) return { ...r, rootWetness: 0.25, tMaxC: 38 }; // 0.6 + 0.2
      if (r.month === 5) return { ...r, frostDays: 4 }; // + 0.15
      return r;
    });
    const harsh = { ...cropA, yieldResponseFactor: 2 }; // drought alone gives 1.0
    expect(yieldOf(yearlyYield(cropA, climate, 10, DROUGHT_P, HEAT_MIN), 1990)!.loss).toBeCloseTo(0.95, 10);
    const capped = yieldOf(yearlyYield(harsh, climate, 10, DROUGHT_P, HEAT_MIN), 1990)!;
    expect(capped.loss).toBe(1);
    expect(capped.yieldTPerHa).toBeCloseTo(0, 10);
  });

  it('leaves out a year in which every check is missing, and never invents it', () => {
    const climate = makeClimate((r) =>
      r.year === 2000 && (r.month === 5 || r.month === 7) ? { ...r, rootWetness: null, tMaxC: null, frostDays: null } : r,
    );
    const rows = yearlyYield(cropA, climate, 10, DROUGHT_P, HEAT_MIN);
    expect(rows).toHaveLength(44);
    expect(yieldOf(rows, 2000)).toBeUndefined();
  });

  it('gives the reference yield every year for a crop without sensitive months', () => {
    const rows = yearlyYield(cropN, makeClimate(), 5, DROUGHT_P, HEAT_MIN);
    expect(rows).toHaveLength(45);
    expect(rows.every((r) => r.yieldTPerHa === 5)).toBe(true);
  });

  it('throws for a drought-sensitive crop without a yield response factor', () => {
    const noKy = { ...cropA, yieldResponseFactor: undefined } as unknown as CropTraits;
    expect(() => yearlyYield(noKy, dryClimate, 10, DROUGHT_P, HEAT_MIN)).toThrow(/yield response factor/);
  });
});

const src = (value: number | null, unit: string, datasetId: string, retrievedAt = '2026-11-10'): Sourced => ({
  value,
  unit,
  datasetIds: [datasetId],
  kind: 'observation',
  retrievedAt,
  ...(value === null ? { missingReason: 'not in the table' } : {}),
});

// A on dryClimate (calibrated, K_A): 10·K_A t/ha × 200 − 1000 in a normal year, 4·K_A t/ha × 200 − 1000 in a dry
// year; the mean over the 45 years is 10 × 200 − 1000 = 1000. N: 5 t/ha × 400 − 500 = 1500 every year.
const econA: CropEconomics = {
  crop: 'a',
  referenceYieldTPerHa: src(10, 't/ha', 'usda-quickstats'),
  pricePerT: src(200, 'USD/t', 'usda-quickstats'),
  directCostsPerHa: src(1000, 'USD/ha', 'isu-budgets', '2026-11-12'),
};
const econN: CropEconomics = {
  crop: 'n',
  referenceYieldTPerHa: src(5, 't/ha', 'usda-quickstats'),
  pricePerT: src(400, 'USD/t', 'usda-quickstats'),
  directCostsPerHa: src(500, 'USD/ha', 'usda-quickstats'),
};
const economics = [econA, econN];

const payment = (programme: string, amount: number | null, confirmed: boolean): MoneyEstimate['payments'][number] => ({
  programme,
  amountPerHa: src(amount, 'USD/ha', 'nrcs-payment-schedule'),
  condition: { code: 'payment.condition.test' },
  confirmed,
});

const rotation = [{ crop: 'a', coverCrop: 'c' }, { crop: 'n' }];
const A_NORMAL = 10 * K_A * 200 - 1000;
const A_DRY = 4 * K_A * 200 - 1000;
const NORMAL = (A_NORMAL + 1500) / 2; // rotation a, n in a normal year
const DRY_YEAR = (A_DRY + 1500) / 2;
const MEAN = (1000 + 1500) / 2; // calibrated: the mean margin is the margin at the reference yield
const near = (xs: number[], x: number) => xs.filter((m) => Math.abs(m - x) < 1e-6);

describe('incomeEstimate', () => {
  it('returns no-data with a reason when every replayed year of a main crop is a total loss', () => {
    const climate = makeClimate((r) => (r.month === 7 ? { ...r, tMaxC: 38 } : r));
    const harsh = { ...cropA, sensitive: [{ hazard: 'heat' as const, months: [7], threshold: 35, lossShare: 1 }] };
    const r = incomeEstimate([{ crop: 'a' }, { crop: 'n' }], [harsh, cropN, coverC], climate, economics, [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    expect(r).toEqual({ status: 'no-data', reason: { code: 'income.total-loss-every-year', params: { crop: 'a' } } });
  });

  // #100 review: a calibration factor this large means the hazard checks see far more loss than the recent harvests
  // show, so the replayed good years sit well above the reference yield. Named on the card, never capped.
  it('names a large calibration factor as a gap with the crop and the factor', () => {
    const HOT = YEARS.filter((y) => y % 3 !== 0); // 30 of 45 Julys hot
    const climate = makeClimate((r) => (r.month === 7 && HOT.includes(r.year) ? { ...r, tMaxC: 38 } : r));
    const heatA = { ...cropA, sensitive: [{ hazard: 'heat' as const, months: [7], threshold: 35, lossShare: 0.5 }] };
    const r = incomeEstimate([{ crop: 'a' }, { crop: 'n' }], [heatA, cropN, coverC], climate, economics, [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (r.status !== 'ready') throw new Error('expected ready');
    const factor = 45 / (15 + 30 * 0.5);
    expect(factor).toBeGreaterThan(CALIBRATION_GAP_FACTOR);
    expect(r.data.gaps).toContainEqual({ code: 'gap.income-calibration-large', params: { crop: 'a', factor: 1.5 } });
  });

  // D53: oats, rye and spring barley borrow a wheat Ky; the card says so in its gaps.
  it('names a borrowed yield response factor in the gaps', () => {
    const borrowed: CropTraits = { ...cropA, yieldResponseFactorFrom: 'Spring wheat' };
    const r = incomeEstimate([{ crop: 'a' }, { crop: 'n' }], [borrowed, cropN, coverC], dryClimate, economics, [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (r.status !== 'ready') throw new Error('expected ready');
    expect(r.data.gaps).toContainEqual({ code: 'gap.income-ky-borrowed', params: { crop: 'a', from: 'Spring wheat' } });
  });

  it('adds no borrowed-Ky gap for a crop with its own Ky', () => {
    const r = incomeEstimate([{ crop: 'a' }, { crop: 'n' }], crops, dryClimate, economics, [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (r.status !== 'ready') throw new Error('expected ready');
    expect(r.data.gaps.some((g) => g.code === 'gap.income-ky-borrowed')).toBe(false);
  });

  it('adds no calibration gap when the factor is small', () => {
    const r = incomeEstimate([{ crop: 'a' }, { crop: 'n' }], crops, dryClimate, economics, [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (r.status !== 'ready') throw new Error('expected ready');
    expect(K_A).toBeLessThan(CALIBRATION_GAP_FACTOR);
    expect(r.data.gaps.some((g) => g.code === 'gap.income-calibration-large')).toBe(false);
  });

  // D34: a cover crop has no revenue; it pays back through the soil scores.
  it('never turns income into no-data for a cover crop without a price, and says the cover earns nothing directly', () => {
    const r = incomeEstimate(rotation, crops, dryClimate, economics, [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (r.status !== 'ready') throw new Error('expected ready');
    expect(r.data.gaps).toContainEqual({ code: 'income.cover-no-revenue', params: { crop: 'c' } });
    expect(r.data.gaps).toContainEqual({ code: 'gap.cover-cost-missing', params: { crop: 'c' } });
  });

  it('subtracts a cover crop cost only where it has a sourced row, spread over the rotation years', () => {
    const econC: CropEconomics = {
      crop: 'c',
      referenceYieldTPerHa: src(null, 't/ha', 'none'),
      pricePerT: src(null, 'USD/t', 'none'),
      directCostsPerHa: src(80, 'USD/ha', 'isu-budgets'),
    };
    const r = incomeEstimate(rotation, crops, dryClimate, [...economics, econC], [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (r.status !== 'ready') throw new Error('expected ready');
    // one cover in a 2-year rotation: 80 / 2 = 40 per ha per year off every replayed year
    expect(near(r.data.perYearMargins, NORMAL - 40)).toHaveLength(40);
    expect(near(r.data.perYearMargins, DRY_YEAR - 40)).toHaveLength(5);
    expect(r.data.gaps).not.toContainEqual({ code: 'gap.cover-cost-missing', params: { crop: 'c' } });
    expect(r.data.gaps).toContainEqual({ code: 'income.cover-no-revenue', params: { crop: 'c' } });
  });

  it('weights a main crop by the number of rotation years it fills', () => {
    const r = incomeEstimate([{ crop: 'a' }, { crop: 'a' }, { crop: 'n' }], crops, dryClimate, economics, [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (r.status !== 'ready') throw new Error('expected ready');
    // normal year: (A + A + N) / 3
    expect(near(r.data.perYearMargins, (2 * A_NORMAL + 1500) / 3)).toHaveLength(40);
  });

  it('averages yield × price − direct costs over the main crops and the record years', () => {
    const r = incomeEstimate(rotation, crops, dryClimate, economics, [], 'USD', 'FY2026, check NRCS', DROUGHT_P, HEAT_MIN);
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    const { estimate, perYearMargins } = r.data;
    expect(perYearMargins).toHaveLength(45);
    expect(near(perYearMargins, DRY_YEAR)).toHaveLength(5);
    expect(near(perYearMargins, NORMAL)).toHaveLength(40);
    expect(estimate.marginPerHa.value).toBeCloseTo(MEAN, 2);
    expect(estimate.marginPerHa.unit).toBe('USD/ha');
    expect(estimate.marginPerHa.kind).toBe('derived');
    expect(estimate.currency).toBe('USD');
    expect(estimate.campaign).toBe('FY2026, check NRCS');
  });

  it('gives the 10th and 90th percentile year as the range, at today’s prices', () => {
    const r = incomeEstimate(rotation, crops, dryClimate, economics, [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (r.status !== 'ready') throw new Error('expected ready');
    const range = r.data.estimate.marginPerHa.range!;
    // sorted: 5 dry years, then 40 normal ones; p10 at h = 4.4 → dry + 0.4 × (normal − dry); p90 = normal
    expect(range.low).toBeCloseTo(DRY_YEAR + 0.4 * (NORMAL - DRY_YEAR), 2);
    expect(range.high).toBeCloseTo(NORMAL, 2);
    expect(range.basis).toBe('10th–90th percentile year of the record, at today’s prices');
  });

  it('lists every dataset the margin depends on and the latest retrieval date', () => {
    const r = incomeEstimate(rotation, crops, dryClimate, economics, [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (r.status !== 'ready') throw new Error('expected ready');
    const m = r.data.estimate.marginPerHa;
    expect([...m.datasetIds].sort()).toEqual(['isu-budgets', 'nasa-power-monthly', 'usda-quickstats']);
    expect(m.retrievedAt).toBe('2026-11-14');
  });

  it('adds only confirmed payments and names unconfirmed ones in the gaps', () => {
    const payments = [payment('NRCS 340 Cover crop', 50, true), payment('CSP bundle', 100, false)];
    const r = incomeEstimate(rotation, crops, dryClimate, economics, payments, 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (r.status !== 'ready') throw new Error('expected ready');
    expect(r.data.confirmedPaymentsPerHa).toBe(50);
    expect(r.data.estimate.payments).toHaveLength(2); // listed, even when left out of the sum
    expect(r.data.gaps.filter((g) => g.code.startsWith('gap.payment'))).toEqual([
      { code: 'gap.payment-unconfirmed', params: { programme: 'CSP bundle' } },
    ]);
    // marginPerHa is the margin alone; payments are their own line
    expect(r.data.estimate.marginPerHa.value).toBeCloseTo(MEAN, 2);
  });

  it('leaves a confirmed payment without a rate out of the sum and names it', () => {
    const r = incomeEstimate(rotation, crops, dryClimate, economics, [payment('NRCS 328', null, true)], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (r.status !== 'ready') throw new Error('expected ready');
    expect(r.data.confirmedPaymentsPerHa).toBe(0);
    expect(r.data.gaps.filter((g) => g.code.startsWith('gap.payment'))).toEqual([
      { code: 'gap.payment-no-rate', params: { programme: 'NRCS 328' } },
    ]);
  });

  it('returns no-data when a main crop has no sourced price, and estimates nothing', () => {
    const noPrice = { ...econN, pricePerT: src(null, 'USD/t', 'usda-quickstats') };
    const r = incomeEstimate(rotation, crops, dryClimate, [econA, noPrice], [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    expect(r).toEqual({ status: 'no-data', reason: { code: 'income.no-price', params: { crop: 'n' } } });
  });

  it('returns no-data when a main crop has no economics row, or no sourced yield or cost', () => {
    expect(incomeEstimate(rotation, crops, dryClimate, [econA], [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN)).toEqual({
      status: 'no-data',
      reason: { code: 'income.no-price', params: { crop: 'n' } },
    });
    const noCost = { ...econA, directCostsPerHa: src(null, 'USD/ha', 'isu-budgets') };
    expect(incomeEstimate(rotation, crops, dryClimate, [noCost, econN], [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN)).toEqual({
      status: 'no-data',
      reason: { code: 'income.no-price', params: { crop: 'a' } },
    });
  });

  it('ignores cover crops, which have no economics row and no yield response factor', () => {
    const r = incomeEstimate(rotation, crops, dryClimate, economics, [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    expect(r.status).toBe('ready');
  });

  it('returns no-data when a main crop has no yield response factor', () => {
    const noKy = { ...cropA, yieldResponseFactor: undefined } as unknown as CropTraits;
    const r = incomeEstimate(rotation, [noKy, cropN, coverC], dryClimate, economics, [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    expect(r).toEqual({ status: 'no-data', reason: { code: 'income.no-yield-response', params: { crop: 'a' } } });
  });

  it('keeps only record years in which every main crop has a yield, and says so', () => {
    const climate = makeClimate((r) =>
      r.year === 2000 && (r.month === 5 || r.month === 7) ? { ...r, rootWetness: null, tMaxC: null, frostDays: null } : r,
    );
    const r = incomeEstimate(rotation, crops, climate, economics, [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (r.status !== 'ready') throw new Error('expected ready');
    expect(r.data.perYearMargins).toHaveLength(44);
    expect(r.data.years).toBe(44);
    expect(r.data.complete).toBe(false);
    expect(r.data.gaps).toContainEqual({ code: 'gap.income-years-left-out', params: { count: 1, years: 45 } });
  });

  // Issue #98: the money tables price a crop after a different crop only, so maize after maize is a named gap.
  it('names a main crop that follows itself, wrapping round the rotation, once per crop', () => {
    const r = incomeEstimate([{ crop: 'a' }, { crop: 'a' }, { crop: 'n' }, { crop: 'n' }], crops, dryClimate, economics, [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (r.status !== 'ready') throw new Error('expected ready');
    expect(r.data.gaps.filter((g) => g.code === 'gap.crop-after-itself-not-priced')).toEqual([
      { code: 'gap.crop-after-itself-not-priced', params: { crop: 'a' } },
      { code: 'gap.crop-after-itself-not-priced', params: { crop: 'n' } },
    ]);
    const wrap = incomeEstimate([{ crop: 'a' }, { crop: 'n' }, { crop: 'a' }], crops, dryClimate, economics, [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (wrap.status !== 'ready') throw new Error('expected ready');
    expect(wrap.data.gaps).toContainEqual({ code: 'gap.crop-after-itself-not-priced', params: { crop: 'a' } });
    expect(wrap.data.gaps).not.toContainEqual({ code: 'gap.crop-after-itself-not-priced', params: { crop: 'n' } });
  });

  it('does not name a crop that never follows itself, or a perennial kept for several years', () => {
    const r = incomeEstimate(rotation, crops, dryClimate, economics, [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (r.status !== 'ready') throw new Error('expected ready');
    expect(r.data.gaps.map((g) => g.code)).not.toContain('gap.crop-after-itself-not-priced');
    const perennial = testCrop({ id: 'p', kind: 'perennial' });
    const econP = { ...econN, crop: 'p' };
    const p = incomeEstimate([{ crop: 'p' }, { crop: 'p' }, { crop: 'n' }], [...crops, perennial], dryClimate, [...economics, econP], [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (p.status !== 'ready') throw new Error('expected ready');
    expect(p.data.gaps.map((g) => g.code)).not.toContain('gap.crop-after-itself-not-priced');
  });

  it('returns no-data when no record year can be replayed', () => {
    const r = incomeEstimate(rotation, crops, { ...makeClimate(), monthly: [] }, economics, [], 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    expect(r).toEqual({ status: 'no-data', reason: { code: 'income.no-climate-years' } });
  });
});

describe('incomeTotal', () => {
  it('adds confirmed payments to the mean and to the bad-year and good-year margins', () => {
    const payments = [payment('NRCS 340', 50, true), payment('CSP', 100, false)];
    const r = incomeEstimate(rotation, crops, dryClimate, economics, payments, 'USD', 'FY2026', DROUGHT_P, HEAT_MIN);
    if (r.status !== 'ready') throw new Error('expected ready');
    const t = incomeTotal(r.data);
    expect(t.meanPerHa).toBeCloseTo(MEAN + 50, 2);
    expect(t.lowPerHa).toBeCloseTo(DRY_YEAR + 0.4 * (NORMAL - DRY_YEAR) + 50, 2);
    expect(t.highPerHa).toBeCloseTo(NORMAL + 50, 2);
    expect(t.years).toBe(45);
    expect(t.complete).toBe(true);
  });
});

const round1 = (x: number) => Math.round(x * 10) / 10;
const total = (meanPerHa: number, lowPerHa: number, highPerHa: number, complete = true) => ({
  meanPerHa,
  lowPerHa,
  highPerHa,
  years: 45,
  complete,
});

describe('incomeScores', () => {
  it('ranks margin plus confirmed payments in the same order as the money', () => {
    const s = incomeScores({ r1: total(100, 100, 100), r2: total(200, 200, 200), r3: total(300, 300, 300) });
    expect(s.r1!.value).toBe(0);
    expect(s.r2!.value).toBe(50);
    expect(s.r3!.value).toBe(100);
  });

  // D44 (SPEC §7): the means are scaled 0-100 across the candidates. The bad-year and good-year range stays in money
  // (incomeTotal / the estimate's range), never clamped onto the score scale, so the score range is the value itself.
  it('scales the means 0-100 across the candidates', () => {
    const s = incomeScores({ r1: total(100, 80, 120), r2: total(200, 180, 220), r3: total(300, 280, 320) });
    expect(s.r1).toMatchObject({ value: 0, low: 0, high: 0 });
    expect(s.r2).toMatchObject({ value: 50, low: 50, high: 50 });
    expect(s.r3).toMatchObject({ value: 100, low: 100, high: 100 });
  });

  it('does not let wide year-to-year spreads compress or clamp the means', () => {
    const s = incomeScores({ r1: total(626, 247, 912), r2: total(698, 364, 913), r3: total(662, 306, 913) });
    expect(s.r1!.value).toBe(0);
    expect(s.r2!.value).toBe(100);
    expect(s.r3!.value).toBe(round1(((662 - 626) / (698 - 626)) * 100));
    for (const x of Object.values(s)) expect([x.low, x.high]).toEqual([x.value, x.value]);
  });

  it('gives 50 to every candidate when the means are equal', () => {
    const s = incomeScores({ r1: total(100, 50, 150), r2: total(100, 100, 100) });
    expect(s.r1).toMatchObject({ value: 50, low: 50, high: 50 });
    expect(s.r2!.value).toBe(50);
    expect(incomeScores({ only: total(10, 5, 15) }).only).toMatchObject({ low: 50, value: 50, high: 50 });
  });

  it('is never strong: moderate with a full record, weak when a year was left out', () => {
    const s = incomeScores({ r1: total(100, 50, 150), r2: total(200, 150, 250, false) });
    expect(s.r1!.confidence).toBe('moderate');
    expect(s.r2!.confidence).toBe('weak');
  });

  it('says it is a replay of past years at today’s prices', () => {
    const s = incomeScores({ r1: total(100, 50, 150) });
    expect(s.r1!.basis).toEqual({ code: 'income.basis.replay', params: { years: 45 } });
  });

  it('returns an empty record for no candidates', () => {
    expect(incomeScores({})).toEqual({});
  });
});

describe('INCOME_MESSAGE_CODES', () => {
  it('lists every code the module emits', () => {
    expect([...INCOME_MESSAGE_CODES].sort()).toEqual(
      [
        'gap.cover-cost-missing',
        'gap.income-years-left-out',
        'income.cover-no-revenue',
        'gap.payment-no-rate',
        'gap.payment-unconfirmed',
        'income.basis.replay',
        'gap.crop-after-itself-not-priced',
        'income.no-climate-years',
        'income.no-price',
        'income.no-yield-response',
        'income.total-loss-every-year',
        'gap.income-calibration-large',
        'gap.income-ky-borrowed',
      ].sort(),
    );
  });
});

// Issue #98 with the shipped tables: the replay must average out at the reference yield the money tables give.
describe('yearlyYield on the Iowa demo field', () => {
  it('replays every priced main crop so its mean yield equals the reference yield from data/money', async () => {
    const field = demoFields.iowa;
    const climate = await fixtureProviders.profile.getClimate(field);
    const traits = await fixtureProviders.context.getCrops(field.country);
    const ids = traits.filter((c) => c.kind === 'cash' && c.yieldResponseFactor !== undefined).map((c) => c.id);
    const priced = [];
    for (const id of ids) {
      const econ = await tableMoneyProvider.getEconomics(field, [id]);
      if (econ.status === 'ready') priced.push(...econ.data);
    }
    expect(priced.length).toBeGreaterThan(1);
    for (const e of priced) {
      const crop = traits.find((c) => c.id === e.crop)!;
      const rows = yearlyYield(crop, climate, e.referenceYieldTPerHa.value!, engineRules(shippedRules).droughtPercentile, engineRules(shippedRules).heatMinDays);
      expect(rows.length).toBeGreaterThan(0);
      expect(mean(rows.map((r) => r.yieldTPerHa))).toBeCloseTo(e.referenceYieldTPerHa.value!, 6);
    }
  });
});
