import { describe, expect, it } from 'vitest';
import type { CropTraits } from '../contracts';
import { fixtureCrops } from '../fixtures/crops';
import { buildCalendar, canFollow, cropById } from './calendar';

const us = fixtureCrops.US;
const pl = fixtureCrops.PL;
const get = (list: CropTraits[], id: string) => cropById(list, id);

const testCrop = (row: Partial<CropTraits> & Pick<CropTraits, 'id' | 'sowMonth' | 'harvestMonth'>): CropTraits => ({
  family: 'Testaceae',
  legume: false,
  kind: 'cash',
  sensitive: [],
  waterNeed: 'medium',
  yieldResponseFactor: 1,
  forage: false,
  residueCover: 'low',
  sources: [{ title: 'test', url: 'https://example.org', locator: 'test' }],
  ...row,
});

describe('buildCalendar', () => {
  it('maize then soybean: crop in months 5-10, residue after maize, bare after soybean', () => {
    const { months, bareMonths } = buildCalendar([{ crop: 'maize' }, { crop: 'soybean' }], us);
    expect(months).toHaveLength(24);
    for (const yearIndex of [0, 1]) {
      for (let month = 5; month <= 10; month++) {
        const cell = months.find((m) => m.yearIndex === yearIndex && m.month === month);
        expect(cell?.cover).toBe('crop');
        expect(cell?.crop).toBe(yearIndex === 0 ? 'maize' : 'soybean');
      }
    }
    // after maize (high residue): Nov-Dec of year 0 and Jan-Apr of year 1
    const afterMaize = months.filter((m) => (m.yearIndex === 0 && m.month >= 11) || (m.yearIndex === 1 && m.month <= 4));
    expect(afterMaize.every((m) => m.cover === 'residue')).toBe(true);
    // after soybean (low residue): Nov-Dec of year 1 and Jan-Apr of year 0 (the cycle wraps)
    const afterSoy = months.filter((m) => (m.yearIndex === 1 && m.month >= 11) || (m.yearIndex === 0 && m.month <= 4));
    expect(afterSoy.every((m) => m.cover === 'bare')).toBe(true);
    expect(bareMonths).toBe(6);
  });

  it('a winter crop spans the year boundary', () => {
    const winter = testCrop({ id: 'winter-x', sowMonth: 9, harvestMonth: 7, residueCover: 'medium' });
    const summer = testCrop({ id: 'summer-y', sowMonth: 5, harvestMonth: 8 });
    const { months } = buildCalendar([{ crop: 'summer-y' }, { crop: 'winter-x' }], [winter, summer]);
    const at = (y: number, m: number) => months.find((c) => c.yearIndex === y && c.month === m);
    // winter-x belongs to year 1 (harvest year): sown Sep of year 0, harvested Jul of year 1
    expect(at(0, 9)?.crop).toBe('winter-x');
    expect(at(0, 12)?.crop).toBe('winter-x');
    expect(at(1, 1)?.crop).toBe('winter-x');
    expect(at(1, 7)?.crop).toBe('winter-x');
    expect(at(1, 8)?.cover).toBe('residue');
    expect(at(0, 8)?.crop).toBe('summer-y');
  });

  it('a cover crop after harvest turns the gap months into cover-crop', () => {
    const { months, bareMonths } = buildCalendar(
      [{ crop: 'maize' }, { crop: 'soybean', coverCrop: 'cereal-rye' }],
      us,
    );
    const afterSoy = months.filter((m) => (m.yearIndex === 1 && m.month >= 11) || (m.yearIndex === 0 && m.month <= 4));
    expect(afterSoy.every((m) => m.cover === 'cover-crop' && m.crop === 'cereal-rye')).toBe(true);
    expect(bareMonths).toBe(0);
  });

  it('months between harvest and a later cover sowing stay bare or residue', () => {
    // mustard is sown in 8 after barley harvested in 7, ends in 11 and leaves residue until barley is sown in 3
    const { months } = buildCalendar([{ crop: 'spring-barley', coverCrop: 'white-mustard' }], pl);
    const at = (m: number) => months.find((c) => c.month === m);
    expect(at(7)?.cover).toBe('crop');
    expect(at(8)?.cover).toBe('cover-crop');
    expect(at(11)?.cover).toBe('cover-crop');
    expect(at(12)?.cover).toBe('residue');
    expect(at(2)?.cover).toBe('residue');
    expect(at(3)?.cover).toBe('crop');
  });

  it('the newly sown crop takes a shared month, wherever the cycle starts', () => {
    // winter wheat (sown 10) follows maize (harvested 10)
    const a = buildCalendar([{ crop: 'maize' }, { crop: 'winter-wheat' }], us).months;
    const b = buildCalendar([{ crop: 'winter-wheat' }, { crop: 'maize' }], us).months;
    const at = (months: typeof a, y: number, m: number) => months.find((c) => c.yearIndex === y && c.month === m);
    expect(at(a, 0, 10)?.crop).toBe('winter-wheat');
    expect(at(a, 0, 9)?.crop).toBe('maize');
    // listed first, wheat wraps: sown in month 10 of the last year, harvested in 7 of the first
    expect(at(b, 1, 10)?.crop).toBe('winter-wheat');
    expect(at(b, 1, 11)?.crop).toBe('winter-wheat');
    expect(at(b, 0, 1)?.crop).toBe('winter-wheat');
    expect(at(b, 0, 7)?.crop).toBe('winter-wheat');
    expect(at(b, 1, 9)?.crop).toBe('maize');
    const count = (months: typeof a, id: string) => months.filter((c) => c.crop === id).length;
    expect(count(a, 'winter-wheat')).toBe(count(b, 'winter-wheat'));
    expect(count(a, 'maize')).toBe(count(b, 'maize'));
  });

  it('[maize, winter-wheat] and [winter-wheat, maize] give the same calendar rotated by one year (D27)', () => {
    const a = buildCalendar([{ crop: 'maize' }, { crop: 'winter-wheat' }], us);
    const b = buildCalendar([{ crop: 'winter-wheat' }, { crop: 'maize' }], us);
    const key = (c: (typeof a.months)[number]) => `${c.crop ?? ''}:${c.cover}`;
    const rotatedB = [...b.months.slice(12), ...b.months.slice(0, 12)].map(key);
    expect(a.months.map(key)).toEqual(rotatedB);
    expect(a.bareMonths).toBe(b.bareMonths);
  });

  it('in an impossible sequence the crop already in the ground keeps its months', () => {
    // winter rapeseed sown in 8 cannot follow maize harvested in 10
    const { months } = buildCalendar([{ crop: 'maize' }, { crop: 'winter-rapeseed' }], pl);
    const at = (y: number, m: number) => months.find((c) => c.yearIndex === y && c.month === m);
    expect(at(0, 8)?.crop).toBe('maize');
    expect(at(0, 10)?.crop).toBe('maize');
    expect(at(0, 11)?.crop).toBe('winter-rapeseed');
  });

  it('a perennial followed by itself stays in the ground over winter', () => {
    const { months, bareMonths } = buildCalendar([{ crop: 'alfalfa' }, { crop: 'alfalfa' }, { crop: 'maize' }], us);
    const at = (y: number, m: number) => months.find((c) => c.yearIndex === y && c.month === m);
    expect(at(0, 12)?.cover).toBe('crop');
    expect(at(1, 2)?.crop).toBe('alfalfa');
    expect(at(1, 12)?.cover).toBe('residue');
    expect(bareMonths).toBe(0);
  });

  it('a cover sown under the standing crop covers from harvest; one that cannot be sown is left out', () => {
    const clover = buildCalendar([{ crop: 'maize', coverCrop: 'red-clover' }], us);
    expect(clover.months.find((c) => c.month === 11)?.cover).toBe('cover-crop');
    // cereal rye is sown in 10, but winter wheat goes in then: the gap after oats is only months 8-9
    const none = buildCalendar([{ crop: 'oats', coverCrop: 'cereal-rye' }, { crop: 'winter-wheat' }], us);
    expect(none.months.some((c) => c.cover === 'cover-crop')).toBe(false);
  });

  it('a cover sown under the crop that ends by its harvest never covers the soil after it', () => {
    const main = testCrop({ id: 'main', sowMonth: 5, harvestMonth: 10 });
    const early = testCrop({ id: 'early-cover', kind: 'cover', sowMonth: 8, harvestMonth: 10 });
    const { months } = buildCalendar([{ crop: 'main', coverCrop: 'early-cover' }], [main, early]);
    expect(months.some((c) => c.cover === 'cover-crop')).toBe(false);
  });

  it('an empty rotation gives an empty calendar', () => {
    expect(buildCalendar([], us)).toEqual({ months: [], bareMonths: 0 });
  });

  it('throws on an unknown crop id', () => {
    expect(() => buildCalendar([{ crop: 'banana' }], us)).toThrow(/banana/);
  });
});

describe('canFollow', () => {
  it('maize harvested in 10 cannot be followed by winter rapeseed sown in 8', () => {
    expect(canFollow(get(pl, 'maize'), get(pl, 'winter-rapeseed'))).toBe(false);
  });
  it('winter wheat harvested in 7 can be followed by rapeseed sown in 8', () => {
    const wheat = testCrop({ id: 'ww', sowMonth: 10, harvestMonth: 7 });
    expect(canFollow(wheat, get(pl, 'winter-rapeseed'))).toBe(true);
  });
  it('winter wheat may be sown in the month maize is harvested', () => {
    expect(canFollow(get(us, 'maize'), get(us, 'winter-wheat'))).toBe(true);
  });
  it('a spring crop can always follow, it is sown the next calendar year', () => {
    expect(canFollow(get(us, 'maize'), get(us, 'soybean'))).toBe(true);
    expect(canFollow(get(us, 'winter-wheat'), get(us, 'maize'))).toBe(true);
  });
});
