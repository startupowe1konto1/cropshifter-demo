import { describe, expect, it } from 'vitest';
import { fieldFeatures, similarity, zStats } from './similarity';

describe('similarity', () => {
  const stats = zStats([
    { a: 0, b: 10 },
    { a: 2, b: 30 },
  ]); // a: mean 1, sd 1; b: mean 20, sd 10

  it('gives 100 for identical features', () => {
    expect(similarity({ a: 1.5, b: 22 }, { a: 1.5, b: 22 }, stats)).toBe(100);
  });

  it('matches a hand calculation of the z-scored Euclidean distance', () => {
    // dz_a = (2 - 0) / 1 = 2, dz_b = (30 - 10) / 10 = 2, d = sqrt(8) = 2.828
    // with 2 features the distance at which similarity reaches 0 is 2 * sqrt(2) * 2 = 5.657 (two SD in every feature, both ways)
    // similarity = 100 * (1 - 2.828 / 5.657) = 50
    expect(similarity({ a: 0, b: 10 }, { a: 2, b: 30 }, stats)).toBeCloseTo(50, 5);
  });

  it('never goes below 0', () => {
    expect(similarity({ a: 0, b: 0 }, { a: 100, b: 1000 }, stats)).toBe(0);
  });

  it('uses only features both sides have', () => {
    expect(similarity({ a: 1 }, { a: 1, b: 99 }, stats)).toBe(100);
  });
});

describe('fieldFeatures', () => {
  const month = (year: number, m: number, v: Partial<{ rainMm: number; rootWetness: number; tMaxC: number; frostDays: number }>) => ({
    year, month: m, rootWetness: v.rootWetness ?? null, rainMm: v.rainMm ?? null, tMaxC: v.tMaxC ?? null, frostDays: v.frostDays ?? null,
    evapotranspirationMm: null,
  });

  it('builds the case-base features from the field record, 2001 onward, the way the case base is built', () => {
    const monthly = [
      month(2000, 7, { rainMm: 999, tMaxC: 50 }), // before 2001: ignored
      ...[2001, 2002].flatMap((y) => [
        month(y, 1, { frostDays: 20, tMaxC: 0 }),
        month(y, 4, { rainMm: 50, rootWetness: 0.6, tMaxC: 20 }),
        month(y, 7, { rainMm: 100, rootWetness: 0.4, tMaxC: y === 2001 ? 34 : 36, frostDays: 0 }),
        month(y, 12, { frostDays: 10, tMaxC: 5 }),
      ]),
    ];
    expect(fieldFeatures(monthly)).toEqual({
      gsRainMm: 150, // Apr + Jul per year, mean over years
      gsRootZoneWetness: 0.5,
      frostDaysPerYear: 30,
      yearlyMaxTempC: 35,
    });
  });
});
