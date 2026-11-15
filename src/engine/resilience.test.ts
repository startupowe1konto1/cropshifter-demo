import { describe, expect, it } from 'vitest';
import type { CalendarMonth, ClimateProfile, CropTraits } from '../contracts';
import { iowaClimate } from '../fixtures/analysis.iowa';
import { fixtureCrops } from '../fixtures/crops';
import { buildCalendar } from './calendar';
import {
  RESILIENCE_MESSAGE_CODES,
  WEAK_CONFIDENCE_MISSING_SHARE,
  droughtLimit,
  resilienceScore,
  withExposure,
  yearlyHits,
} from './resilience';

type Row = ClimateProfile['monthly'][number];
type Cell = Omit<CalendarMonth, 'exposure'>;

const FIRST = 1981;
const LAST = 2025;
const YEARS = Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i);

/** July wetness of a year: 45 distinct values 0.01..0.45, scrambled so they do not follow the year order. */
const julyWetness = (year: number) => (((year - FIRST) * 17) % 45) + 1;
const julyOf = (year: number) => julyWetness(year) / 100;

/** The drought percentile of data/rules/hazards.json `hazards.drought.percentile` (D42). */
const P20 = 20;

// Iowa maize–soybean, computed once with the D42 rule and locked in.
const IOWA_VALUE = 57.8;
const IOWA_LOW = 0;
const IOWA_HIGH = 100;
// 7 Julys (tied wetness values sit at the limit, which is not below it) and 9 Augusts of 45
const IOWA_DROUGHT_JULY = 7;
const IOWA_DROUGHT_AUGUST = 9;
const IOWA_DROUGHT_MARKS: unknown[] = [
  ['maize', 7, 0.156],
  ['maize', 8, 0.2],
  ['soybean', 8, 0.2],
];
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * A hand-made 45-year record with a dry summer. June and August wetness is 0.005 every year, July wetness is
 * distinct per year (0.01..0.45), every other month 0.5. tMax 20 °C and no frost days, unless `edit` changes them.
 *
 * Per calendar month (D42), July's 20th percentile lies between its 9th and 10th lowest values (0.09 and 0.10), at
 * 0.098, so 9 Julys are droughts. June and August are 0.005 every year, so their limit is 0.005 and none is.
 */
function makeClimate(edit: (row: Row) => Row = (row) => row): ClimateProfile {
  const monthly: Row[] = [];
  for (const year of YEARS) {
    for (let month = 1; month <= 12; month++) {
      const base: Row = {
        year,
        month,
        rootWetness: month === 7 ? julyOf(year) : month === 6 || month === 8 ? 0.005 : 0.5,
        rainMm: 50,
        tMaxC: 20,
        frostDays: 0,
        evapotranspirationMm: 60,
      };
      monthly.push(edit(base));
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

// A: drought in July, 20th percentile. B: heat in August above 30 °C. N: no sensitive months.
const cropA = testCrop({ id: 'a', sensitive: [{ hazard: 'drought', months: [7], threshold: 20, lossShare: 0.3 }] });
const cropB = testCrop({ id: 'b', sensitive: [{ hazard: 'heat', months: [8], threshold: 30, lossShare: 0.2 }] });
const cropN = testCrop({ id: 'n' });
const coverC = testCrop({
  id: 'c',
  kind: 'cover',
  sowMonth: 8,
  harvestMonth: 4,
  sensitive: [{ hazard: 'drought', months: [7, 9], threshold: 20, lossShare: 0.3 }],
});
const crops = [cropA, cropB, cropN, coverC];

const dryJulyYears = YEARS.filter((y) => julyWetness(y) <= 9); // the 9 driest Julys, below 0.098

/** Independent check of D42: linear-interpolation percentile of one calendar month's wetness over the record. */
function monthLimit(climate: ClimateProfile, month: number, p: number): number {
  const sorted = climate.monthly
    .filter((r) => r.month === month)
    .map((r) => r.rootWetness)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const h = (sorted.length - 1) * (p / 100);
  const lo = Math.floor(h);
  return sorted[lo]! + (h - lo) * (sorted[Math.ceil(h)]! - sorted[lo]!);
}
const hotAugustYears = YEARS.filter((y) => !dryJulyYears.includes(y)).slice(0, 10); // 10 other years

/** The climate used by the score tests: dry Julys as above, hot Augusts in 10 years that are not dry. */
const scoreClimate = (edit: (row: Row) => Row = (row) => row) =>
  makeClimate((row) => edit(row.month === 8 && hotAugustYears.includes(row.year) ? { ...row, tMaxC: 31 } : row));

describe('RESILIENCE_MESSAGE_CODES', () => {
  it('lists the basis codes', () => {
    expect(RESILIENCE_MESSAGE_CODES).toContain('resilience.basis.years');
    expect(RESILIENCE_MESSAGE_CODES).toContain('resilience.basis.missing-months');
  });
});

describe('droughtLimit', () => {
  it('is the percentile of the same calendar month over every year of the record (D42)', () => {
    const climate = makeClimate();
    expect(droughtLimit(climate, 7, P20)).toBeCloseTo(0.098, 9);
    expect(droughtLimit(climate, 7, P20)).toBeCloseTo(monthLimit(climate, 7, P20), 12);
    expect(droughtLimit(climate, 6, P20)).toBe(0.005);
    expect(droughtLimit(climate, 1, P20)).toBe(0.5);
  });

  it('leaves missing years out and is null when the month has no wetness in the record', () => {
    const climate = makeClimate((row) => (row.month === 7 && row.year < 1991 ? { ...row, rootWetness: null } : row));
    expect(droughtLimit(climate, 7, P20)).toBeCloseTo(monthLimit(climate, 7, P20), 12);
    expect(droughtLimit(makeClimate((row) => (row.month === 7 ? { ...row, rootWetness: null } : row)), 7, P20)).toBeNull();
  });

  it('throws on a percentile outside 0..100 instead of falling back to a default', () => {
    for (const p of [Number.NaN, -1, 101]) expect(() => droughtLimit(makeClimate(), 7, p)).toThrow(/percentile/);
  });
});

describe('yearlyHits', () => {
  it('drought in July hits exactly the years below the 20th percentile of all Julys (D42)', () => {
    const climate = makeClimate();
    const rows = yearlyHits(cropA, climate, P20);
    expect(rows).toHaveLength(45);
    expect(rows.every((r) => r.month === 7 && r.hazard === 'drought')).toBe(true);

    const limit = monthLimit(climate, 7, P20);
    const expected = YEARS.filter((y) => julyOf(y) < limit);
    expect(expected).toHaveLength(9);

    const hitYears = rows.filter((r) => r.hit).map((r) => r.year).sort((a, b) => a - b);
    expect(hitYears).toEqual(expected);
    expect(hitYears).toEqual(dryJulyYears);
  });

  it('the percentile comes from the argument, not from the crop threshold', () => {
    // 17th percentile of the 45 Julys: h = 7.48, between the 8th and 9th lowest (0.08 and 0.09) → 8 years
    const rows = yearlyHits(cropA, makeClimate(), 17);
    expect(rows.filter((r) => r.hit).map((r) => julyWetness(r.year)).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('shortfallVsMedian is the shortfall against the July median in every year below it, hit or not', () => {
    const rows = yearlyHits(cropA, makeClimate(), P20);
    const median = 0.23; // the 23rd of 45 distinct July values 0.01..0.45
    const byWetness = (w: number) => rows.find((r) => julyWetness(r.year) === w)!;
    expect(byWetness(1).hit).toBe(true);
    expect(byWetness(1).shortfallVsMedian).toBeCloseTo((median - 0.01) / median, 9);
    // 0.20 is above the drought limit 0.098 but below the median: no hit, still a shortfall
    expect(byWetness(20).hit).toBe(false);
    expect(byWetness(20).shortfallVsMedian).toBeCloseTo((median - 0.2) / median, 9);
    for (const r of rows.filter((x) => julyOf(x.year) >= median)) expect(r.shortfallVsMedian).toBe(0);
    expect(rows.filter((r) => (r.shortfallVsMedian ?? 0) > 0)).toHaveLength(22);
  });

  it('without daily values, heat hits when the monthly tMax is above the threshold; frost when frost days are above it', () => {
    const climate = makeClimate((row) => {
      if (row.month === 8 && row.year === 1990) return { ...row, tMaxC: 30.5 };
      if (row.month === 8 && row.year === 1991) return { ...row, tMaxC: 30 }; // equal: no hit
      if (row.month === 5 && row.year === 2000) return { ...row, frostDays: 3 };
      if (row.month === 5 && row.year === 2001) return { ...row, frostDays: 2 }; // equal: no hit
      return row;
    });
    const heat = yearlyHits(cropB, climate, P20);
    expect(heat.filter((r) => r.hit).map((r) => r.year)).toEqual([1990]);
    expect(heat.every((r) => r.shortfallVsMedian === null)).toBe(true);

    const frosty = testCrop({ id: 'f', sensitive: [{ hazard: 'frost', months: [5], threshold: 2, lossShare: 0.1 }] });
    const frost = yearlyHits(frosty, climate, P20);
    expect(frost.filter((r) => r.hit).map((r) => r.year)).toEqual([2000]);
    expect(frost.every((r) => r.shortfallVsMedian === null)).toBe(true);
  });

  it('one row per year and sensitive month; a crop without sensitive months has no rows', () => {
    const two = testCrop({ id: 't', sensitive: [{ hazard: 'drought', months: [6, 7], threshold: 20, lossShare: 0.3 }] });
    expect(yearlyHits(two, makeClimate(), P20)).toHaveLength(90);
    expect(yearlyHits(cropN, makeClimate(), P20)).toEqual([]);
  });

  it('a month exactly at the limit is not a drought (strictly below the percentile, D26)', () => {
    // every June is 0.5, so June's 20th percentile is exactly 0.5
    const climate = makeClimate((row) => (row.month === 6 ? { ...row, rootWetness: 0.5 } : row));
    expect(droughtLimit(climate, 6, P20)).toBe(0.5);
    const june = testCrop({ id: 'j', sensitive: [{ hazard: 'drought', months: [6], threshold: 20, lossShare: 0.3 }] });
    expect(yearlyHits(june, climate, P20).some((r) => r.hit)).toBe(false);
  });

  it('omits rows for missing input months and leaves them out of the percentile', () => {
    const missing = [1981, 1982];
    const climate = makeClimate((row) =>
      row.month === 7 && missing.includes(row.year) ? { ...row, rootWetness: null } : row,
    );
    const rows = yearlyHits(cropA, climate, P20);
    expect(rows).toHaveLength(43);
    expect(rows.some((r) => missing.includes(r.year))).toBe(false);
    const limit = monthLimit(climate, 7, P20);
    expect(rows.filter((r) => r.hit).map((r) => r.year)).toEqual(
      YEARS.filter((y) => !missing.includes(y) && julyOf(y) < limit),
    );
  });

  it('fixture Iowa maize: drought in IOWA_DROUGHT_JULY of 45 Julys and IOWA_DROUGHT_AUGUST of 45 Augusts (D42)', () => {
    const rows = yearlyHits(fixtureCrops.US.find((c) => c.id === 'maize')!, iowaClimate, P20);
    const drought = (month: number) => rows.filter((r) => r.hazard === 'drought' && r.month === month);
    expect(drought(7)).toHaveLength(45);
    expect(drought(7).filter((r) => r.hit)).toHaveLength(IOWA_DROUGHT_JULY);
    expect(drought(8).filter((r) => r.hit)).toHaveLength(IOWA_DROUGHT_AUGUST);
  });

  it('a spring month can be a drought: dry Mays count against other Mays, not against the whole year (D42)', () => {
    // every May is wetter than any other month, yet its driest years are droughts
    const climate = makeClimate((row) => (row.month === 5 ? { ...row, rootWetness: 0.6 + julyOf(row.year) / 10 } : row));
    const may = testCrop({ id: 'm', sensitive: [{ hazard: 'drought', months: [5], threshold: 20, lossShare: 0.3 }] });
    expect(yearlyHits(may, climate, P20).filter((r) => r.hit)).toHaveLength(9);
  });
});

describe('heat from daily maxima (D43)', () => {
  /** August daily maxima: `hot` days at `t` °C, the rest of the 31 days at 25 °C. */
  const august = (hot: number, t: number) => [...Array<number>(hot).fill(t), ...Array<number>(31 - hot).fill(25)];
  const daily = (edit: (row: Row) => (number | null)[] | undefined) =>
    makeClimate((row) => {
      const d = edit(row);
      return d === undefined ? row : { ...row, tMaxDailyC: d };
    });

  it('a month is hit when at least heatMinDays days are above the threshold', () => {
    const climate = daily((row) => {
      if (row.month !== 8) return undefined;
      if (row.year === 1990) return august(3, 31); // 3 days above 30: hit
      if (row.year === 1991) return august(2, 33); // only 2 days: no hit
      if (row.year === 1992) return august(5, 30); // at the threshold, not above: no hit
      return august(0, 25);
    });
    const hits = yearlyHits(cropB, climate, P20, 3);
    expect(hits).toHaveLength(45);
    expect(hits.filter((r) => r.hit).map((r) => r.year)).toEqual([1990]);
    expect(yearlyHits(cropB, climate, P20, 2).filter((r) => r.hit).map((r) => r.year)).toEqual([1990, 1991]);
  });

  it('daily values win over the monthly maximum when both are there', () => {
    const climate = daily((row) => (row.month === 8 ? august(1, 34) : undefined));
    for (const row of climate.monthly) if (row.month === 8) row.tMaxC = 34;
    expect(yearlyHits(cropB, climate, P20, 3).some((r) => r.hit)).toBe(false);
    expect(yearlyHits(cropB, climate, P20, 1).every((r) => r.hit)).toBe(true);
  });

  it('a month whose daily list holds no value is missing, never safe', () => {
    const climate = daily((row) => (row.month === 8 ? (row.year === 2000 ? [null, null] : august(0, 25)) : undefined));
    const score = resilienceScore([{ crop: 'b' }], crops, climate, P20, 3);
    expect(score.basis.params).toMatchObject({ count: 1, needed: 45 });
    expect(yearlyHits(cropB, climate, P20, 3)).toHaveLength(44);
  });

  it('a daily list with some missing days counts the days it has', () => {
    const climate = daily((row) => (row.month === 8 ? [31, 31, null, 31, ...Array<number | null>(27).fill(null)] : undefined));
    expect(yearlyHits(cropB, climate, P20, 3).every((r) => r.hit)).toBe(true);
    expect(yearlyHits(cropB, climate, P20, 4).some((r) => r.hit)).toBe(false);
  });

  it('heat marks cite the daily dataset; drought marks cite only the monthly one', () => {
    const climate = daily((row) => (row.month === 8 ? august(4, 31) : undefined));
    climate.source.datasetIds = ['nasa-power-monthly', 'nasa-power-daily'];
    const cells: Cell[] = [
      { yearIndex: 0, month: 7, crop: 'a', cover: 'crop' },
      { yearIndex: 0, month: 8, crop: 'b', cover: 'crop' },
    ];
    const [july, aug] = withExposure(cells, crops, climate, 0.2, P20, 3);
    expect(july!.exposure[0]!.probability.datasetIds).toEqual(['nasa-power-monthly']);
    expect(aug!.exposure[0]!.probability.datasetIds).toEqual(['nasa-power-monthly', 'nasa-power-daily']);
  });

  it('throws on a minimum that is not a whole number of at least 1', () => {
    for (const d of [0, 1.5, Number.NaN]) expect(() => yearlyHits(cropB, makeClimate(), P20, d)).toThrow(/minimum days/);
  });

  it('the calendar uses the same check, so marks and score agree', () => {
    const hot = YEARS.slice(0, 12);
    const climate = daily((row) => (row.month === 8 ? august(hot.includes(row.year) ? 4 : 1, 31) : undefined));
    const cell: Cell = { yearIndex: 0, month: 8, crop: 'b', cover: 'crop' };
    const [out] = withExposure([cell], crops, climate, 0.2, P20, 3);
    expect(out!.exposure).toEqual([expect.objectContaining({ hazard: 'heat', probability: expect.objectContaining({ value: round3(12 / 45) }) })]);
    expect(resilienceScore([{ crop: 'b' }], crops, climate, P20, 3).value).toBeCloseTo((33 / 45) * 100, 1);
  });
});

describe('resilienceScore', () => {
  it('value is the share of crop-years without a hit; low and high are the 10th and 90th percentile years', () => {
    const score = resilienceScore([{ crop: 'a' }, { crop: 'b' }], crops, scoreClimate(), P20);
    // 90 crop-years, 9 drought hits for A and 10 heat hits for B, never in the same year: 71 / 90
    expect(score.value).toBe(78.9);
    // per-year shares: 19 years at 0.5, 26 years at 1.0 -> 10th pct 0.5, 90th pct 1.0
    expect(score.low).toBe(50);
    expect(score.high).toBe(100);
    expect(score.confidence).toBe('strong');
    expect(score.basis).toEqual({ code: 'resilience.basis.years', params: { years: 45, from: 1981, to: 2025 } });
  });

  it('ignores cover crops and counts a crop without sensitive months as never hit', () => {
    const score = resilienceScore([{ crop: 'n', coverCrop: 'c' }], crops, scoreClimate(), P20);
    expect(score.value).toBe(100);
    expect(score.low).toBe(100);
    expect(score.high).toBe(100);
    expect(score.confidence).toBe('strong');
  });

  it('a crop-year is hit once even when several of its checks hit', () => {
    const both = testCrop({
      id: 'ab',
      sensitive: [
        { hazard: 'drought', months: [7], threshold: 20, lossShare: 0.3 },
        { hazard: 'heat', months: [8], threshold: 30, lossShare: 0.2 },
      ],
    });
    const score = resilienceScore([{ crop: 'ab' }], [both], scoreClimate(), P20);
    expect(score.value).toBe(57.8); // 26 of 45 years without drought or heat
    expect(score.low).toBe(0);
    expect(score.high).toBe(100);
  });

  it('missing months lower confidence to moderate and name the gap in basis', () => {
    const climate = scoreClimate((row) =>
      row.month === 8 && [2024, 2025].includes(row.year) ? { ...row, tMaxC: null } : row,
    );
    const score = resilienceScore([{ crop: 'a' }, { crop: 'b' }], crops, climate, P20);
    expect(score.confidence).toBe('moderate');
    expect(score.basis.code).toBe('resilience.basis.missing-months');
    expect(score.basis.params).toMatchObject({ count: 2, needed: 90, years: 45, from: 1981, to: 2025 });
  });

  it('more than 10% of the needed months missing gives weak confidence', () => {
    expect(WEAK_CONFIDENCE_MISSING_SHARE).toBe(0.1);
    const gone = YEARS.slice(0, 10);
    const climate = scoreClimate((row) =>
      row.month === 8 && gone.includes(row.year) ? { ...row, tMaxC: null } : row,
    );
    const score = resilienceScore([{ crop: 'a' }, { crop: 'b' }], crops, climate, P20);
    expect(score.confidence).toBe('weak');
    expect(score.basis).toMatchObject({ code: 'resilience.basis.missing-months', params: { count: 10, needed: 90 } });
  });

  it('a month row absent from the record counts as missing', () => {
    const climate = scoreClimate();
    climate.monthly = climate.monthly.filter((row) => !(row.year === 2000 && row.month === 7));
    const score = resilienceScore([{ crop: 'a' }], crops, climate, P20);
    expect(score.confidence).toBe('moderate');
    expect(score.basis.params).toMatchObject({ count: 1, needed: 45 });
  });

  it('throws on an unknown crop id', () => {
    expect(() => resilienceScore([{ crop: 'nope' }], crops, scoreClimate(), P20)).toThrow(/nope/);
  });

  it('fixture Iowa maize–soybean gives a fixed value inside its range', () => {
    const score = resilienceScore([{ crop: 'maize' }, { crop: 'soybean' }], fixtureCrops.US, iowaClimate, P20);
    expect(score).toEqual({
      value: IOWA_VALUE,
      low: IOWA_LOW,
      high: IOWA_HIGH,
      confidence: 'strong',
      basis: { code: 'resilience.basis.years', params: { years: 45, from: 1981, to: 2025 } },
    });
  });

  it('throws on a drought percentile outside 0..100', () => {
    expect(() => resilienceScore([{ crop: 'a' }], crops, scoreClimate(), Number.NaN)).toThrow(/percentile/);
  });
});

describe('withExposure', () => {
  const cells = (): Cell[] => {
    const out: Cell[] = [];
    for (let month = 1; month <= 12; month++) {
      if (month >= 5 && month <= 10) out.push({ yearIndex: 0, month, crop: 'a', cover: 'crop' });
      else if (month === 11) out.push({ yearIndex: 0, month, cover: 'residue' });
      else out.push({ yearIndex: 0, month, cover: 'bare' });
    }
    return out;
  };

  it('marks only the months where the crop in the ground is sensitive, with the yearlyHits share', () => {
    const climate = scoreClimate();
    const out = withExposure(cells(), crops, climate, 0.1, P20);
    expect(out).toHaveLength(12);
    const marked = out.filter((m) => m.exposure.length > 0);
    expect(marked.map((m) => m.month)).toEqual([7]);

    const rows = yearlyHits(cropA, climate, P20).filter((r) => r.month === 7 && r.hazard === 'drought');
    const share = rows.filter((r) => r.hit).length / rows.length;
    expect(share).toBeCloseTo(0.2, 6);
    expect(marked[0]!.exposure).toEqual([
      {
        hazard: 'drought',
        probability: {
          value: 0.2,
          unit: 'share of years',
          datasetIds: ['nasa-power-monthly'],
          kind: 'derived',
          retrievedAt: '2026-11-14',
        },
      },
    ]);
    // the cell keeps its position and cover
    expect(marked[0]).toMatchObject({ yearIndex: 0, month: 7, crop: 'a', cover: 'crop' });
  });

  it('agrees with the score: one crop with one check scores (1 − share) × 100', () => {
    const climate = scoreClimate();
    const share = withExposure(cells(), crops, climate, 0.1, P20).find((m) => m.month === 7)!.exposure[0]!.probability.value!;
    expect(resilienceScore([{ crop: 'a' }], crops, climate, P20).value).toBeCloseTo((1 - share) * 100, 6);
  });

  it('drought marks do not depend on markShare; a month with no drought year gets none (D42)', () => {
    const winter = testCrop({
      id: 'w',
      sowMonth: 10,
      harvestMonth: 7,
      sensitive: [{ hazard: 'drought', months: [1, 2], threshold: 20, lossShare: 0.3 }],
    });
    const input: Cell[] = [
      { yearIndex: 0, month: 1, crop: 'w', cover: 'crop' },
      { yearIndex: 0, month: 2, crop: 'w', cover: 'crop' },
      { yearIndex: 1, month: 7, crop: 'a', cover: 'crop' },
    ];
    // January and February are 0.5 in every year: at the limit, so never a drought
    const out = withExposure(input, [...crops, winter], scoreClimate(), 0.2, P20);
    expect(out[0]!.exposure).toEqual([]);
    expect(out[1]!.exposure).toEqual([]);
    expect(out[2]!.exposure.map((e) => [e.hazard, e.probability.value])).toEqual([['drought', 0.2]]);
    expect(withExposure(input, [...crops, winter], scoreClimate(), 0.9, P20)[2]!.exposure).toHaveLength(1);
  });

  it('no heat or frost mark when the share equals markShare (strictly above)', () => {
    const cell: Cell = { yearIndex: 0, month: 8, crop: 'b', cover: 'crop' };
    expect(withExposure([cell], crops, scoreClimate(), 10 / 45, P20)[0]!.exposure).toEqual([]);
    expect(withExposure([cell], crops, scoreClimate(), 9 / 45, P20)[0]!.exposure).toHaveLength(1);
  });

  it('marks a cover crop in a sensitive month; residue, bare and insensitive cells get none', () => {
    // September as dry as July: its own limit falls between 0.09 and 0.10, 9 of 45 years
    const climate = makeClimate((row) => (row.month === 9 ? { ...row, rootWetness: julyOf(row.year) } : row));
    const input: Cell[] = [
      { yearIndex: 0, month: 9, crop: 'c', cover: 'cover-crop' },
      { yearIndex: 0, month: 10, crop: 'c', cover: 'cover-crop' },
      { yearIndex: 0, month: 7, cover: 'bare' },
      { yearIndex: 0, month: 7, cover: 'residue' },
      { yearIndex: 0, month: 8, crop: 'b', cover: 'crop' },
    ];
    const out = withExposure(input, crops, climate, 0.1, P20);
    expect(out[0]!.exposure.map((e) => e.hazard)).toEqual(['drought']);
    expect(out[0]!.exposure[0]!.probability.value).toBe(0.2);
    expect(out.slice(1).every((m) => m.exposure.length === 0)).toBe(true);
  });

  it('works on a real calendar with fixture crops and the Iowa climate', () => {
    // drought is marked wherever a sensitive month has a drought year (D42); heat and frost above markShare
    const { months } = buildCalendar([{ crop: 'maize' }, { crop: 'soybean', coverCrop: 'cereal-rye' }], fixtureCrops.US);
    const out = withExposure(months, fixtureCrops.US, iowaClimate, 0.2, P20);
    expect(out).toHaveLength(24);
    for (const m of out) {
      for (const e of m.exposure) {
        expect(m.crop).toBeDefined();
        expect(e.probability.value!).toBeGreaterThan(e.hazard === 'drought' ? 0 : 0.2);
        const crop = fixtureCrops.US.find((c) => c.id === m.crop)!;
        expect(crop.sensitive.some((s) => s.hazard === e.hazard && s.months.includes(m.month))).toBe(true);
      }
    }
    const droughtMarks = out
      .filter((m) => m.exposure.some((e) => e.hazard === 'drought'))
      .map((m) => [m.crop, m.month, m.exposure.find((e) => e.hazard === 'drought')!.probability.value]);
    expect(droughtMarks).toEqual(IOWA_DROUGHT_MARKS);
  });
});
