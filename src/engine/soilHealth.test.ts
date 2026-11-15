import { describe, expect, it } from 'vitest';
import type { FieldProfile, Priorities, RotationOption, Score, Sourced } from '../contracts';
import { iowaClimate, iowaSlope, iowaSoil } from '../fixtures/analysis.iowa';
import { fixtureCrops } from '../fixtures/crops';
import { buildCalendar } from './calendar';
import { SOIL_MESSAGE_CODES, humusBalanceRaw, soilHealth, type RuleRow, type SoilRules } from './soilHealth';

const us = fixtureCrops.US;
type Years = RotationOption['years'];

// ---------- in-test rule rows: made-up values, not agronomy ----------
const row = (id: string, value: RuleRow['value'], unit = 'test unit'): RuleRow => ({
  id,
  value,
  unit,
  appliesTo: 'test',
  sourceTitle: 'In-test row, made-up value',
  sourceUrl: 'https://example.org/test',
  sourceLocator: 'soilHealth.test.ts',
});
/** A row whose source gives a range. */
const ranged = (id: string, mid: number, spread = 0.1): RuleRow => row(id, { low: mid * (1 - spread), mid, high: mid * (1 + spread) });

const HUMUS_COEF: Record<string, number> = {
  maize: -0.56, soybean: -0.28, oats: -0.42, 'winter-wheat': -0.42, alfalfa: 1.4, 'cereal-rye': 0.31, 'red-clover': 0.62,
};

function makeRules(primary: (id: string, value: number) => RuleRow = (id, v) => row(id, v)): SoilRules {
  return {
    nitrogen: [
      primary('nitrogen.credit.soybean', 40),
      primary('nitrogen.credit.alfalfa', 100),
      primary('nitrogen.credit.red-clover', 60),
      row('nitrogen.leachingRainMm', 300, 'mm per year'),
      row('nitrogen.leachingMaxLoss', 0.5, 'share'),
      row('nitrogen.leachingBySand', { '0': 0.8, '50': 1.2 }, 'factor by sand % lower bound'),
    ],
    humus: [
      ...Object.entries(HUMUS_COEF).map(([crop, v]) => primary(`humus.coef.${crop}`, v)),
      row('humus.climateLimits', { meanTMaxC: 20, annualRainMm: 800 }),
      row('humus.climateFactor', { 'cool-dry': 0.8, 'cool-wet': 1.0, 'warm-dry': 1.1, 'warm-wet': 1.3 }),
      row('humus.textureBySand', { '0': 0.9, '50': 1.2 }),
    ],
    erosion: [
      primary('erosion.cFactor.crop', 0.2),
      primary('erosion.cFactor.cover-crop', 0.1),
      primary('erosion.cFactor.residue', 0.15),
      primary('erosion.cFactor.bare', 1),
      row('erosion.slopeFactor', { '0': 0.5, '4': 1, '8': 2 }),
      row('erosion.zeroScoreIndex', 400, 'C-weighted mm per year'),
    ],
    pestBreak: [primary('pestBreak.minReturn.Poaceae', 2), primary('pestBreak.minReturn.Fabaceae', 2)],
  };
}
const rules = makeRules();
const rangedRules = makeRules((id, v) => ranged(id, v));

const noPriorities: Priorities = { goal: 'keepSoil', on: [], excludedCrops: [] };
const withPriority = (...on: Priorities['on']): Priorities => ({ ...noPriorities, on });

const iowa: FieldProfile = { ...iowaClimate, soil: iowaSoil, slopePct: iowaSlope };

// ---------- synthetic profiles ----------
const sourced = (value: number | null, unit = '%'): Sourced =>
  value === null
    ? { value, unit, datasetIds: ['test'], kind: 'observation', retrievedAt: '2026-11-14', missingReason: 'not in the test field' }
    : { value, unit, datasetIds: ['test'], kind: 'observation', retrievedAt: '2026-11-14' };

const FLAT_RAIN = [40, 40, 50, 80, 110, 120, 110, 100, 80, 60, 50, 40];
const MILD_TMAX = [5, 7, 12, 17, 22, 26, 28, 27, 23, 17, 10, 6];

function makeProfile(opts: { rain?: number[]; tMax?: number[]; sand?: number | null; slope?: number | null } = {}): FieldProfile {
  const rain = opts.rain ?? FLAT_RAIN;
  const tMax = opts.tMax ?? MILD_TMAX;
  const monthly: FieldProfile['monthly'] = [];
  for (let year = 2020; year <= 2022; year++) {
    for (let month = 1; month <= 12; month++) {
      monthly.push({
        year, month, rootWetness: 0.5, rainMm: rain[month - 1] ?? null, tMaxC: tMax[month - 1] ?? null, frostDays: 0, evapotranspirationMm: 50,
      });
    }
  }
  return {
    source: { datasetIds: ['nasa-power-monthly'], kind: 'model', retrievedAt: '2026-11-14' },
    monthly,
    monthlyRisk: [],
    yearly: [],
    droughtYears: [],
    trends: [],
    soil: { sandPct: sourced(opts.sand === undefined ? 30 : opts.sand), clayPct: sourced(25), organicCarbon: sourced(2), ph: sourced(6.5, 'pH') },
    slopePct: sourced(opts.slope === undefined ? 2 : opts.slope),
  };
}

const LEVELS: Score['confidence'][] = ['strong', 'moderate', 'weak'];
const level = (s: Score | undefined) => LEVELS.indexOf(s?.confidence ?? 'weak');

const run = (years: Years, profile: FieldProfile = makeProfile(), r: SoilRules = rules, p: Priorities = noPriorities) =>
  soilHealth(years, us, profile, r, p);

const maizeSoy: Years = [{ crop: 'maize' }, { crop: 'soybean' }];
const maizeMaize: Years = [{ crop: 'maize' }, { crop: 'maize' }];

// ---------- nitrogen ----------
describe('soilHealth: nitrogen', () => {
  it('one legume year in two scores higher than no legume', () => {
    const legume = run(maizeSoy).indicators.nitrogen;
    const none = run(maizeMaize).indicators.nitrogen;
    expect(legume?.value).toBeGreaterThan(none?.value ?? Infinity);
    expect(none?.value).toBe(0);
  });

  it('a legume cover crop adds to the credit', () => {
    const cover = run([{ crop: 'maize', coverCrop: 'red-clover' }, { crop: 'soybean' }]).indicators.nitrogen;
    expect(cover?.value).toBeGreaterThan(run(maizeSoy).indicators.nitrogen?.value ?? Infinity);
  });

  it('the same rotation on a field with more rain in its bare months scores lower', () => {
    // maize-soybean is bare from November to April after soybean
    const wetWinter = FLAT_RAIN.map((mm, i) => (i <= 3 || i >= 10 ? mm + 60 : mm));
    const dry = run(maizeSoy, makeProfile()).indicators.nitrogen;
    const wet = run(maizeSoy, makeProfile({ rain: wetWinter })).indicators.nitrogen;
    expect(wet?.value).toBeLessThan(dry?.value ?? -Infinity);
  });

  it('credits a perennial legume once per stand, not once per year', () => {
    const two = run([{ crop: 'alfalfa' }, { crop: 'alfalfa' }, { crop: 'maize' }]).indicators.nitrogen;
    const three = run([{ crop: 'alfalfa' }, { crop: 'alfalfa' }, { crop: 'alfalfa' }, { crop: 'maize' }]).indicators.nitrogen;
    // per rotation year, a longer stand must not look better on nitrogen than a shorter one
    expect(three?.value).toBeLessThanOrEqual(two?.value ?? -Infinity);
    // a rotation that is the perennial in every year still gets its credit
    expect(run([{ crop: 'alfalfa' }]).indicators.nitrogen?.value).toBeGreaterThan(0);
  });

  it('a sandier soil leaches more and scores lower', () => {
    const loam = run(maizeSoy, makeProfile({ sand: 30 })).indicators.nitrogen;
    const sand = run(maizeSoy, makeProfile({ sand: 80 })).indicators.nitrogen;
    expect(sand?.value).toBeLessThan(loam?.value ?? -Infinity);
  });

  it('a missing sand share skips the texture factor and lowers confidence one level', () => {
    const known = run(maizeSoy, makeProfile({ sand: 30 })).indicators.nitrogen;
    const unknown = run(maizeSoy, makeProfile({ sand: null })).indicators.nitrogen;
    expect(unknown).toBeDefined();
    expect(level(unknown)).toBe(level(known) + 1);
  });

  it('returns evidence with the rule ids and the inputs used', () => {
    const { evidence } = run(maizeSoy);
    const n = evidence.find((e) => e.message.code === 'soil.evidence.nitrogen');
    expect(n?.ruleIds).toEqual(expect.arrayContaining(['nitrogen.credit.soybean', 'nitrogen.leachingRainMm', 'nitrogen.leachingMaxLoss', 'nitrogen.leachingBySand']));
    expect(n?.values.some((v) => v.unit === '%' && v.value === 30)).toBe(true); // sand share
    expect(n?.values.some((v) => v.datasetIds.includes('nasa-power-monthly'))).toBe(true); // rain in bare months
  });
});

// ---------- organic matter ----------
describe('soilHealth: organic matter', () => {
  it('raw humus balance is the sum of main and cover crop coefficients over the cycle', () => {
    const years: Years = [{ crop: 'maize', coverCrop: 'cereal-rye' }, { crop: 'soybean' }, { crop: 'winter-wheat', coverCrop: 'red-clover' }];
    // -0.56 + 0.31 - 0.28 - 0.42 + 0.62 = -0.33
    expect(humusBalanceRaw(years, rules.humus)).toBeCloseTo(-0.33, 2);
  });

  it('raw humus balance is null when a crop has no coefficient', () => {
    expect(humusBalanceRaw([{ crop: 'maize' }, { crop: 'unknown-crop' }], rules.humus)).toBeNull();
  });

  it('a warmer, wetter field lowers the score', () => {
    const coolDry = makeProfile({ rain: FLAT_RAIN.map(() => 40), tMax: MILD_TMAX.map((t) => t - 5) });
    const warmWet = makeProfile({ rain: FLAT_RAIN.map(() => 90), tMax: MILD_TMAX.map((t) => t + 8) });
    const cool = run(maizeSoy, coolDry).indicators.organicMatter;
    const warm = run(maizeSoy, warmWet).indicators.organicMatter;
    expect(warm?.value).toBeLessThan(cool?.value ?? -Infinity);
  });

  it('a perennial legume builds organic matter and beats maize-soybean', () => {
    const alfalfa = run([{ crop: 'alfalfa' }, { crop: 'alfalfa' }, { crop: 'maize' }]).indicators.organicMatter;
    expect(alfalfa?.value).toBeGreaterThan(run(maizeSoy).indicators.organicMatter?.value ?? Infinity);
  });
});

// ---------- erosion ----------
describe('soilHealth: erosion', () => {
  it('more bare months lower the score', () => {
    const soySoy: Years = [{ crop: 'soybean' }, { crop: 'soybean' }];
    expect(buildCalendar(soySoy, us).bareMonths).toBeGreaterThan(buildCalendar(maizeSoy, us).bareMonths);
    expect(run(soySoy).indicators.erosion?.value).toBeLessThan(run(maizeSoy).indicators.erosion?.value ?? -Infinity);
  });

  it('a steeper slope class lowers the score', () => {
    const flat = run(maizeSoy, makeProfile({ slope: 1 })).indicators.erosion;
    const steep = run(maizeSoy, makeProfile({ slope: 10 })).indicators.erosion;
    expect(steep?.value).toBeLessThan(flat?.value ?? -Infinity);
  });

  it('more rain in the bare months lowers the score', () => {
    const wetWinter = FLAT_RAIN.map((mm, i) => (i <= 3 || i >= 10 ? mm + 60 : mm));
    const dry = run(maizeSoy, makeProfile()).indicators.erosion;
    const wet = run(maizeSoy, makeProfile({ rain: wetWinter })).indicators.erosion;
    expect(wet?.value).toBeLessThan(dry?.value ?? -Infinity);
  });

  it('with no slope value the score is still computed and confidence drops one level', () => {
    const known = run(maizeSoy, makeProfile({ slope: 2 })).indicators.erosion;
    const unknown = run(maizeSoy, makeProfile({ slope: null })).indicators.erosion;
    expect(unknown).toBeDefined();
    expect(typeof unknown?.value).toBe('number');
    expect(level(unknown)).toBe(level(known) + 1);
    const ev = run(maizeSoy, makeProfile({ slope: null })).evidence.find((e) => e.message.code === 'soil.evidence.erosion');
    expect(ev?.values.some((v) => v.value === null && v.missingReason)).toBe(true);
  });
});

// ---------- pest break ----------
describe('soilHealth: pest break', () => {
  it('loses points per violation of the minimum return interval', () => {
    const none = run(maizeSoy).indicators.pestBreak;
    const one = run([{ crop: 'maize' }, { crop: 'maize' }, { crop: 'soybean' }]).indicators.pestBreak;
    const two = run([{ crop: 'maize' }, { crop: 'maize' }, { crop: 'maize' }, { crop: 'soybean' }]).indicators.pestBreak;
    expect(none?.value).toBe(100);
    expect(one?.value).toBeCloseTo(66.7, 1); // 1 violation in 3 years
    expect(two?.value).toBeCloseTo(50, 1); // 2 violations in 4 years
  });

  it('a continuous crop fails every year', () => {
    expect(run([{ crop: 'maize' }]).indicators.pestBreak?.value).toBe(0);
  });

  it('names the violations and the family rows in evidence', () => {
    const ev = run([{ crop: 'maize' }, { crop: 'maize' }, { crop: 'soybean' }]).evidence.find((e) => e.message.code === 'soil.evidence.pest-break');
    expect(ev?.message.params?.violations).toBe(1);
    expect(ev?.ruleIds).toEqual(expect.arrayContaining(['pestBreak.minReturn.Poaceae', 'pestBreak.minReturn.Fabaceae']));
  });
});

// ---------- total, weights, missing rules, ranges ----------
describe('soilHealth: total', () => {
  it('equal weights: the total is the mean of the four indicators', () => {
    const r = run(maizeSoy, iowa);
    const ind = r.indicators;
    const mean = ((ind.nitrogen?.value ?? 0) + (ind.organicMatter?.value ?? 0) + (ind.erosion?.value ?? 0) + (ind.pestBreak?.value ?? 0)) / 4;
    expect(r.total.value).toBeCloseTo(mean, 0);
    expect(r.missing).toEqual([]);
  });

  it('with the erosion priority on, erosion counts double', () => {
    const r = run(maizeSoy, iowa, rules, withPriority('erosion'));
    const ind = r.indicators;
    const weighted = ((ind.nitrogen?.value ?? 0) + (ind.organicMatter?.value ?? 0) + 2 * (ind.erosion?.value ?? 0) + (ind.pestBreak?.value ?? 0)) / 5;
    expect(r.total.value).toBeCloseTo(weighted, 0);
    expect(r.total.value).not.toBeCloseTo(run(maizeSoy, iowa).total.value, 1);
  });

  it('the doubling factor is a parameter', () => {
    const r = soilHealth(maizeSoy, us, iowa, rules, withPriority('nitrogen'), 3);
    const ind = r.indicators;
    const weighted = (3 * (ind.nitrogen?.value ?? 0) + (ind.organicMatter?.value ?? 0) + (ind.erosion?.value ?? 0) + (ind.pestBreak?.value ?? 0)) / 6;
    expect(r.total.value).toBeCloseTo(weighted, 0);
  });

  it('with no humus rows organic matter is absent, named missing, and the total lowers confidence one level', () => {
    const full = run(maizeSoy, iowa, rangedRules);
    expect(full.total.confidence).toBe('strong');
    const r = run(maizeSoy, iowa, { ...rangedRules, humus: [] });
    expect(r.indicators.organicMatter).toBeUndefined();
    expect(r.missing).toContain('organicMatter');
    const ind = r.indicators;
    expect(r.total.value).toBeCloseTo(((ind.nitrogen?.value ?? 0) + (ind.erosion?.value ?? 0) + (ind.pestBreak?.value ?? 0)) / 3, 0);
    expect(r.total.confidence).toBe('moderate');
    expect(r.evidence.some((e) => e.message.code === 'soil.evidence.organic-matter')).toBe(false);
  });

  it('a rule without a range gives ±15% and the rule-of-thumb basis', () => {
    const e = run(maizeSoy, iowa).indicators.erosion as Score;
    expect(e.basis.code).toBe('soil.basis.rule-of-thumb');
    expect(e.low).toBeCloseTo(e.value * 0.85, 0);
    expect(e.high).toBeCloseTo(Math.min(100, e.value * 1.15), 0);
  });

  it('rules with ranges give the range from the low and high rule values and strong confidence', () => {
    const n = run(maizeSoy, iowa, rangedRules).indicators.nitrogen as Score;
    expect(n.basis.code).toBe('soil.basis.rule-range');
    expect(n.confidence).toBe('strong');
    expect(n.low).toBeLessThan(n.value);
    expect(n.high).toBeGreaterThan(n.value);
  });

  it('a range given as {low, high} without mid is read at (low + high) / 2', () => {
    const lowHigh = makeRules((id, v) => row(id, { low: v * 0.9, high: v * 1.1 }));
    const withMid = run(maizeSoy, iowa, rangedRules);
    const noMid = run(maizeSoy, iowa, lowHigh);
    for (const id of ['nitrogen', 'organicMatter', 'erosion', 'pestBreak'] as const) {
      const a = withMid.indicators[id] as Score;
      const b = noMid.indicators[id] as Score;
      expect(b).toBeDefined();
      expect(b.value).toBeCloseTo(a.value, 6);
      expect(b.low).toBeCloseTo(a.low, 6);
      expect(b.high).toBeCloseTo(a.high, 6);
      expect(b.basis.code).toBe('soil.basis.rule-range');
    }
  });

  it('a factor row given as {low, high} is read at its midpoint', () => {
    const swap = (rs: RuleRow[], id: string, value: RuleRow['value']) => rs.map((r) => (r.id === id ? row(id, value) : r));
    const plain = run(maizeSoy, iowa);
    const lowHigh = run(maizeSoy, iowa, { ...rules, erosion: swap(rules.erosion, 'erosion.zeroScoreIndex', { low: 300, high: 500 }) });
    expect((lowHigh.indicators.erosion as Score).value).toBeCloseTo((plain.indicators.erosion as Score).value, 6);
  });

  it('every indicator returns evidence with at least one rule id, and every code is listed', () => {
    const r = run(maizeSoy, iowa);
    expect(r.evidence).toHaveLength(4);
    for (const e of r.evidence) {
      expect(e.ruleIds.length).toBeGreaterThan(0);
      expect(SOIL_MESSAGE_CODES).toContain(e.message.code);
    }
    for (const s of [r.total, ...Object.values(r.indicators)]) expect(SOIL_MESSAGE_CODES).toContain(s?.basis.code);
  });

  it('with no rules at all every indicator is missing and confidence is weak', () => {
    const r = run(maizeSoy, iowa, { nitrogen: [], humus: [], erosion: [], pestBreak: [] });
    expect(r.missing).toEqual(['nitrogen', 'organicMatter', 'erosion', 'pestBreak']);
    expect(r.total.confidence).toBe('weak');
    expect(r.total.basis.code).toBe('soil.basis.no-indicators');
  });

  it('is deterministic', () => {
    expect(run(maizeSoy, iowa)).toEqual(run(maizeSoy, iowa));
  });
});
