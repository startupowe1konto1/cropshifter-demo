import { describe, expect, it } from 'vitest';
import type { ClimateProfile, CropTraits } from '../contracts';
import { iowaClimate } from '../fixtures/analysis.iowa';
import { fixtureCrops } from '../fixtures/crops';
import { PRIORITY_MESSAGE_CODES, forageScore, waterScore, type WaterOutcome } from './priorityScores';

const us = fixtureCrops.US;
const NEED = { low: 200, medium: 400, high: 600 };

/** The same crop with no water need class (allowed on cover crops, #44). */
function withoutWaterNeed(c: CropTraits): CropTraits {
  const { waterNeed: _omit, ...rest } = c;
  return rest;
}

/** A record where every month gets `rain(year, month)` mm and `et(year, month)` mm of evapotranspiration (50 by default). */
function climate(
  rain: (year: number, month: number) => number | null,
  years = [2020, 2021, 2022, 2023],
  et: (year: number, month: number) => number | null = () => 50,
): ClimateProfile {
  return {
    source: { datasetIds: ['nasa-power-monthly'], kind: 'model', retrievedAt: '2026-11-14' },
    monthly: years.flatMap((year) =>
      Array.from({ length: 12 }, (_, i) => ({
        year, month: i + 1, rootWetness: 0.5, rainMm: rain(year, i + 1), tMaxC: 20, frostDays: 0, evapotranspirationMm: et(year, i + 1),
      })),
    ),
    monthlyRisk: [], yearly: [], droughtYears: [], trends: [],
  };
}

describe('forageScore', () => {
  it('is the share of years with a forage main crop or a forage cover crop', () => {
    expect(forageScore([{ crop: 'maize' }, { crop: 'soybean' }], us).value).toBe(0);
    expect(forageScore([{ crop: 'maize', coverCrop: 'cereal-rye' }, { crop: 'soybean' }], us).value).toBe(50);
    expect(forageScore([{ crop: 'oats' }, { crop: 'alfalfa' }, { crop: 'maize' }, { crop: 'soybean' }], us).value).toBe(50);
    expect(forageScore([{ crop: 'oats', coverCrop: 'red-clover' }, { crop: 'alfalfa' }], us).value).toBe(100);
  });

  it('carries a listed basis code', () => {
    expect(PRIORITY_MESSAGE_CODES).toContain(forageScore([{ crop: 'maize' }], us).basis.code);
  });
});

describe('waterScore', () => {
  /** The score of a scored outcome; fails the test when water was not scored. */
  const scored = (o: WaterOutcome) => {
    if (o.status !== 'scored') throw new Error(`expected a score, got ${o.reason}`);
    return o;
  };

  it('counts the crop-years where growing-season rain covers the need class', () => {
    // maize (high, May–Oct = 6 months) needs 600 mm; soybean (medium) needs 400 mm; ET is 300 mm, below both
    const wet = scored(waterScore([{ crop: 'maize' }, { crop: 'soybean' }], us, climate(() => 100), NEED));
    expect(wet.score.value).toBe(100);
    const mid = scored(waterScore([{ crop: 'maize' }, { crop: 'soybean' }], us, climate(() => 90), NEED));
    expect(mid.score.value).toBe(50); // 540 mm: soybean covered, maize not
    const dry = scored(waterScore([{ crop: 'maize' }, { crop: 'soybean' }], us, climate(() => 50), NEED));
    expect(dry.score.value).toBe(0);
  });

  // SPEC 7: the need is compared with rain and evapotranspiration. Rain must cover the larger of the class need and
  // the field's own growing-season evapotranspiration that year.
  it('a season whose evapotranspiration is above the class need needs rain to cover the evapotranspiration', () => {
    // soybean May–Sep needs 400 mm; rain 100 mm/month = 500 mm
    const et = (v: number) => climate(() => 100, undefined, () => v);
    expect(scored(waterScore([{ crop: 'soybean' }], us, et(50), NEED)).score.value).toBe(100); // ET 250 mm
    expect(scored(waterScore([{ crop: 'soybean' }], us, et(110), NEED)).score.value).toBe(0); // ET 550 mm > rain
  });

  it('reports the mean growing-season rain and evapotranspiration of the checked crop-years', () => {
    const o = scored(waterScore([{ crop: 'maize' }], us, climate(() => 100, undefined, () => 40), NEED));
    expect(o.meanRainMm).toBe(600);
    expect(o.meanEtMm).toBe(240);
  });

  it('gives the spread across years as the range', () => {
    // in 2021 the season is dry, so maize falls short that year only
    const c = climate((year) => (year === 2021 ? 60 : 110));
    const s = scored(waterScore([{ crop: 'maize' }], us, c, NEED)).score;
    expect(s.value).toBe(75);
    expect(s.low).toBe(0);
    expect(s.high).toBe(100);
  });

  // #119 review: the value is pooled over all crop-years, the range over per-year shares, so the range must still
  // contain the value (score schema: low <= value <= high).
  it('keeps the range around the value when few years are covered', () => {
    // 10 record years; maize covered only in 2020
    const years = Array.from({ length: 10 }, (_, i) => 2020 + i);
    const c = climate((year) => (year === 2020 ? 110 : 60), years);
    const s = scored(waterScore([{ crop: 'maize' }, { crop: 'soybean' }], us, c, NEED)).score;
    expect(s.value).toBeGreaterThan(0);
    expect(s.low).toBeLessThanOrEqual(s.value);
    expect(s.value).toBeLessThanOrEqual(s.high);
  });

  // #119 review: a crop's own need row (water.needMm.<crop>) wins over its class row.
  it("uses a crop's own need when there is one, else its class need, and says which it used", () => {
    // maize (high class 600 mm) has 500 mm of rain; with its own need of 450 mm it is covered
    const c = climate(() => 500 / 6);
    const byClass = scored(waterScore([{ crop: 'maize' }, { crop: 'soybean' }], us, c, NEED));
    expect(byClass.score.value).toBe(50); // soybean (400) covered, maize (600) not
    expect(byClass.needKeys).toEqual(['high', 'medium']);
    const byCrop = scored(waterScore([{ crop: 'maize' }, { crop: 'soybean' }], us, c, NEED, { maize: 450 }));
    expect(byCrop.score.value).toBe(100);
    expect(byCrop.needKeys).toEqual(['maize', 'medium']);
  });

  it('a winter crop counts rain from its autumn sowing in the previous calendar year', () => {
    // winter-wheat: sown October, harvested July = 10 months; needs 400 mm (medium); ET 500 mm would exceed rain,
    // so ET is set low here
    const c = climate((_, month) => (month >= 10 ? 100 : 20), undefined, () => 30); // rain Oct–Dec 300 + Jan–Jul 140 = 440
    const s = scored(waterScore([{ crop: 'winter-wheat' }], us, c, NEED)).score;
    expect(s.value).toBe(100);
    // the first record year has no previous autumn and is left out, not counted as dry
    expect(s.basis.params?.cropYears).toBe(3);
  });

  it('skips seasons with missing rain or evapotranspiration and lowers confidence to weak', () => {
    const noRain = climate((year, month) => (year === 2022 && month === 6 ? null : 100));
    const a = scored(waterScore([{ crop: 'maize' }], us, noRain, NEED)).score;
    expect([a.value, a.confidence, a.basis.params?.cropYears]).toEqual([100, 'weak', 3]);
    const noEt = climate(() => 100, undefined, (year, month) => (year === 2023 && month === 7 ? null : 50));
    const b = scored(waterScore([{ crop: 'maize' }], us, noEt, NEED)).score;
    expect([b.value, b.confidence, b.basis.params?.cropYears]).toEqual([100, 'weak', 3]);
  });

  it('with a complete record confidence is moderate, not strong: one need per class is a coarse check', () => {
    expect(scored(waterScore([{ crop: 'maize' }], us, climate(() => 100), NEED)).score.confidence).toBe('moderate');
  });

  it('skips a crop without a water need class and scores the others', () => {
    const noNeed = us.map((c) => (c.id === 'soybean' ? withoutWaterNeed(c) : c));
    const s = scored(waterScore([{ crop: 'maize' }, { crop: 'soybean' }], noNeed, climate(() => 100), NEED)).score;
    expect(s.value).toBe(100);
    expect(s.basis.params?.cropYears).toBe(4); // maize only, 4 record years
  });

  // Missing data is not a zero score (CLAUDE.md): the caller leaves the water score unset and the card names it.
  it('is not scored when no crop has a water need class', () => {
    const o = waterScore([{ crop: 'maize' }, { crop: 'soybean' }], us.map(withoutWaterNeed), climate(() => 100), NEED);
    expect(o).toEqual({ status: 'not-scored', reason: 'no-need-class' });
  });

  it('is not scored when no season is complete', () => {
    expect(waterScore([{ crop: 'maize' }], us, climate(() => null), NEED)).toEqual({ status: 'not-scored', reason: 'no-data' });
  });

  it('runs on the Iowa fixture record with a listed basis code', () => {
    const s = scored(waterScore([{ crop: 'maize' }, { crop: 'soybean' }], us, iowaClimate, NEED)).score;
    expect(s.value).toBeGreaterThanOrEqual(0);
    expect(s.value).toBeLessThanOrEqual(100);
    expect(PRIORITY_MESSAGE_CODES).toContain(s.basis.code);
  });
});
