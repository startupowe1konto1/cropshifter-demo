// Builders for the fixture analyses. Everything here is deterministic: same seed, same output.
// The numbers are plausible stand-ins, not data. Every value carries the 'fixture' dataset id.
import type {
  Analysis,
  CalendarMonth,
  ClimateProfile,
  CoverState,
  CropId,
  CropTraits,
  Evidence,
  Field,
  FieldProfile,
  GoalId,
  Hazard,
  IndicatorId,
  Message,
  MonthlyRisk,
  RotationOption,
  Score,
  Sourced,
  ValueKind,
} from '../contracts';
import { fixtureDatasets } from './datasets';

export const FIXTURE_DATE = '2026-11-14';
export const FIRST_YEAR = 1981;
export const LAST_YEAR = 2025;
const YEAR_COUNT = LAST_YEAR - FIRST_YEAR + 1;
const HAZARDS: Hazard[] = ['drought', 'heat', 'frost'];

// ---------- small helpers ----------

/** Deterministic pseudo-random generator (mulberry32). Returns numbers in [0, 1). */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
const isNumber = (v: number | null): v is number => v !== null;

function pick<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`fixture: no item at index ${index}`);
  return item;
}

export const msg = (code: string, params?: Message['params']): Message => (params ? { code, params } : { code });

interface SourcedOptions {
  unit?: string;
  datasetIds?: readonly string[];
  kind?: ValueKind;
  range?: Sourced['range'];
  missingReason?: string;
}

/** A `Sourced` number for fixtures: dated 2026-11-14, always lists the 'fixture' dataset, null needs a reason. */
export function fixtureValue(value: number | null, options: SourcedOptions = {}): Sourced {
  if (value === null && !options.missingReason) throw new Error('fixture: a missing value needs a missingReason');
  const datasetIds = [...(options.datasetIds ?? []).filter((id) => id !== 'fixture'), 'fixture'];
  return {
    value,
    ...(options.unit ? { unit: options.unit } : {}),
    datasetIds,
    kind: options.kind ?? 'derived',
    retrievedAt: FIXTURE_DATE,
    ...(options.range ? { range: options.range } : {}),
    ...(options.missingReason ? { missingReason: options.missingReason } : {}),
  };
}

// ---------- climate ----------

/** Typical values per calendar month (index 0 = January) around which the fixture series is generated. */
export interface ClimateNormals {
  rootWetness: number[]; // 0–1
  rainMm: number[];
  tMaxC: number[]; // hottest day of the month
  frostDays: number[];
  evapotranspirationMm: number[];
  heatThresholdC: number; // a month counts as a heat month at or above this
}

export const IOWA_NORMALS: ClimateNormals = {
  rootWetness: [0.62, 0.63, 0.66, 0.68, 0.66, 0.6, 0.52, 0.48, 0.5, 0.54, 0.58, 0.61],
  rainMm: [22, 28, 55, 95, 125, 130, 115, 115, 85, 65, 45, 32],
  tMaxC: [8, 11, 20, 27, 30, 32, 33.5, 33, 31, 27, 19, 10],
  frostDays: [29, 25, 20, 7, 1, 0, 0, 0, 0, 5, 18, 27],
  evapotranspirationMm: [8, 12, 30, 65, 105, 135, 150, 125, 85, 45, 18, 8],
  heatThresholdC: 35,
};

export const POZNAN_NORMALS: ClimateNormals = {
  rootWetness: [0.6, 0.61, 0.6, 0.55, 0.5, 0.45, 0.42, 0.4, 0.43, 0.48, 0.54, 0.58],
  rainMm: [32, 28, 36, 30, 52, 60, 80, 58, 44, 36, 36, 38],
  tMaxC: [8, 10, 16, 23, 27, 29, 30.5, 30, 26, 21, 13, 9],
  frostDays: [20, 18, 13, 5, 1, 0, 0, 0, 0, 3, 9, 17],
  evapotranspirationMm: [8, 14, 32, 60, 95, 110, 115, 95, 55, 28, 12, 7],
  heatThresholdC: 32,
};

const POWER_IDS = ['nasa-power-monthly'];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const FROST_MONTH_DAYS = 3; // a month counts as a frost month from this many frost days
const DROUGHT_PERCENTILE = 0.2; // of all growing-season months in the record
const GROWING_SEASON = [4, 5, 6, 7, 8, 9];

function percentile(values: number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return pick(sorted, clamp(Math.floor(share * sorted.length), 0, sorted.length - 1));
}

/** Least-squares slope per step of x, with its standard error. */
function linearTrend(points: { x: number; y: number }[]): { slope: number; standardError: number } {
  const xMean = mean(points.map((p) => p.x));
  const yMean = mean(points.map((p) => p.y));
  const sxx = points.reduce((sum, p) => sum + (p.x - xMean) ** 2, 0);
  const slope = points.reduce((sum, p) => sum + (p.x - xMean) * (p.y - yMean), 0) / sxx;
  const residual = points.reduce((sum, p) => sum + (p.y - yMean - slope * (p.x - xMean)) ** 2, 0);
  return { slope, standardError: Math.sqrt(residual / (points.length - 2) / sxx) };
}

function trend(variable: string, unit: string, points: { x: number; y: number }[]): ClimateProfile['trends'][number] {
  const { slope, standardError } = linearTrend(points);
  const significant = Math.abs(slope) > 2 * standardError;
  return {
    variable,
    direction: significant ? (slope > 0 ? 'up' : 'down') : 'none',
    perDecade: fixtureValue(round(slope * 10, 2), {
      unit,
      datasetIds: POWER_IDS,
      range: {
        low: round((slope - 1.96 * standardError) * 10, 2),
        high: round((slope + 1.96 * standardError) * 10, 2),
        basis: `95% interval of a straight-line trend, ${FIRST_YEAR}–${LAST_YEAR}`,
      },
    }),
    significant,
  };
}

/**
 * A 45-year monthly climate record (1981–2025) with the risk, yearly and trend summaries derived from it.
 * December 2025 is left missing on purpose, so the null paths have something to show.
 */
export function buildClimate(seed: number, normals: ClimateNormals = IOWA_NORMALS): ClimateProfile {
  const random = createRandom(seed);
  const noise = (spread: number) => (random() * 2 - 1) * spread;
  const monthly: ClimateProfile['monthly'] = [];

  for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
    const dryness = (random() + random() + random() - 1.5) * 2; // about -3..3, most years near 0; positive = dry and hot
    for (let month = 1; month <= 12; month++) {
      if (year === LAST_YEAR && month === 12) {
        monthly.push({ year, month, rootWetness: null, rainMm: null, tMaxC: null, frostDays: null, evapotranspirationMm: null });
        continue;
      }
      const i = month - 1;
      const season = GROWING_SEASON.includes(month) ? 1 : 0.4;
      const normalTMax = pick(normals.tMaxC, i);
      const normalFrost = pick(normals.frostDays, i);
      const tMaxC = round(normalTMax + 0.045 * (year - FIRST_YEAR) + 0.9 * dryness * season + noise(2));
      const frostDays =
        normalFrost === 0
          ? 0
          : clamp(Math.round(normalFrost - 0.4 * (tMaxC - normalTMax) + noise(3)), 0, pick(DAYS_IN_MONTH, i));
      monthly.push({
        year,
        month,
        rootWetness: round(clamp(pick(normals.rootWetness, i) - 0.05 * dryness * season + noise(0.04), 0.05, 0.95), 2),
        rainMm: round(Math.max(0, pick(normals.rainMm, i) * (1 - 0.13 * dryness * season + noise(0.45)))),
        tMaxC,
        frostDays,
        evapotranspirationMm: round(pick(normals.evapotranspirationMm, i) * (1 + 0.06 * dryness * season + noise(0.1))),
      });
    }
  }

  const droughtLimit = percentile(
    monthly.filter((row) => GROWING_SEASON.includes(row.month)).map((row) => row.rootWetness).filter(isNumber),
    DROUGHT_PERCENTILE,
  );
  const hit: Record<Hazard, (row: ClimateProfile['monthly'][number]) => boolean | null> = {
    drought: (row) => (row.rootWetness === null ? null : row.rootWetness < droughtLimit),
    heat: (row) => (row.tMaxC === null ? null : row.tMaxC >= normals.heatThresholdC),
    frost: (row) => (row.frostDays === null ? null : row.frostDays >= FROST_MONTH_DAYS),
  };

  const monthlyRisk: MonthlyRisk[] = [];
  for (let month = 1; month <= 12; month++) {
    for (const hazard of HAZARDS) {
      const outcomes = monthly.filter((row) => row.month === month).map(hit[hazard]).filter((o): o is boolean => o !== null);
      monthlyRisk.push({
        month,
        hazard,
        probability: fixtureValue(round(outcomes.filter(Boolean).length / outcomes.length, 2), {
          unit: 'share of years',
          datasetIds: POWER_IDS,
        }),
      });
    }
  }

  const missing = `December ${LAST_YEAR} is not in the record yet`;
  const yearly: ClimateProfile['yearly'] = [];
  for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
    const rows = monthly.filter((row) => row.year === year);
    const complete = rows.every((row) => row.rainMm !== null && row.frostDays !== null);
    const sum = (values: (number | null)[]) => values.filter(isNumber).reduce((total, v) => total + v, 0);
    const wetness = rows.filter((row) => GROWING_SEASON.includes(row.month)).map((row) => row.rootWetness).filter(isNumber);
    const maxTemps = rows.map((row) => row.tMaxC).filter(isNumber);
    yearly.push({
      year,
      growingSeasonWetness: fixtureValue(round(mean(wetness), 2), { unit: 'share of saturation, April to September', datasetIds: POWER_IDS }),
      maxTempC: fixtureValue(maxTemps.length > 0 ? round(Math.max(...maxTemps), 1) : null, {
        unit: '°C',
        datasetIds: POWER_IDS,
        ...(maxTemps.length > 0 ? {} : { missingReason: 'no temperature record for this year' }),
      }),
      frostDays: complete
        ? fixtureValue(sum(rows.map((row) => row.frostDays)), { unit: 'days', datasetIds: POWER_IDS })
        : fixtureValue(null, { unit: 'days', datasetIds: POWER_IDS, missingReason: missing }),
      rainMm: complete
        ? fixtureValue(round(sum(rows.map((row) => row.rainMm))), { unit: 'mm', datasetIds: POWER_IDS })
        : fixtureValue(null, { unit: 'mm', datasetIds: POWER_IDS, missingReason: missing }),
    });
  }

  // The five driest growing seasons of the record (about the driest tenth).
  const droughtYears = [...yearly]
    .sort((a, b) => (a.growingSeasonWetness.value ?? 1) - (b.growingSeasonWetness.value ?? 1) || a.year - b.year)
    .slice(0, 5)
    .map((row) => row.year)
    .sort((a, b) => a - b);

  const summerTMax = Array.from({ length: YEAR_COUNT }, (_, index) => {
    const year = FIRST_YEAR + index;
    const values = monthly.filter((row) => row.year === year && [6, 7, 8].includes(row.month)).map((row) => row.tMaxC);
    return { x: year, y: mean(values.filter(isNumber)) };
  });
  const yearlyRain = yearly.flatMap((row) => (row.rainMm.value === null ? [] : [{ x: row.year, y: row.rainMm.value }]));

  return {
    source: { datasetIds: [...POWER_IDS, 'fixture'], kind: 'model', retrievedAt: FIXTURE_DATE },
    monthly,
    monthlyRisk,
    yearly,
    droughtYears,
    trends: [trend('tMaxC', '°C per decade', summerTMax), trend('rainMm', 'mm per decade', yearlyRain)],
  };
}

// ---------- calendar ----------

type RotationYears = RotationOption['years'];

/** Months after a harvest in which crop residue still counts as cover. A fixture rule, not a sourced one. */
const RESIDUE_MONTHS: Record<CropTraits['residueCover'], number> = { high: 6, medium: 3, low: 0 };

function traitsOf(crops: CropTraits[], id: CropId): CropTraits {
  const traits = crops.find((c) => c.id === id);
  if (!traits) throw new Error(`fixture: crop '${id}' is not in the crop list`);
  return traits;
}

/**
 * Month-by-month cover for a rotation, 12 entries per rotation year. The rotation is a cycle, so a winter crop of
 * year 1 is sown in the last year. `years[i].crop` is the crop harvested in year i; its cover crop is sown that year.
 * Exposure lists only the hazards the crop in the ground is sensitive to in that month, taken from `monthlyRisk`.
 */
export function buildCalendar(years: RotationYears, crops: CropTraits[], monthlyRisk: MonthlyRisk[]): CalendarMonth[] {
  const total = years.length * 12;
  const wrap = (index: number) => ((index % total) + total) % total;
  interface Cell { crop: CropId; cover: 'crop' | 'cover-crop'; age: number }
  const cells: (Cell | undefined)[] = Array.from({ length: total }, () => undefined);

  // Cash crops and perennials. Where two overlap in one month, the one that has been in the ground longer keeps it.
  years.forEach((entry, i) => {
    const traits = traitsOf(crops, entry.crop);
    let start = i * 12 + traits.sowMonth - 1;
    let end = i * 12 + traits.harvestMonth - 1;
    if (traits.kind === 'perennial') {
      const before = pick(years, wrap(i * 12 - 12) / 12);
      const after = pick(years, wrap(i * 12 + 12) / 12);
      if (before.crop === entry.crop) start = i * 12;
      else {
        // Seeded in late summer when the crop before it is off the field by August, otherwise in its own sowing month.
        const harvestBefore = traitsOf(crops, before.crop).harvestMonth;
        if (harvestBefore <= 8) start = (i - 1) * 12 + harvestBefore;
      }
      if (after.crop === entry.crop) end = i * 12 + 11;
    } else if (traits.harvestMonth < traits.sowMonth) {
      start -= 12; // winter crop: sown the year before
    }
    for (let index = start; index <= end; index++) {
      const key = wrap(index);
      const age = index - start;
      const taken = cells[key];
      if (!taken || age > taken.age) cells[key] = { crop: entry.crop, cover: 'crop', age };
    }
  });

  // Cover crops take the free months after the main crop is off, until the next crop or their own end month.
  years.forEach((entry, i) => {
    if (!entry.coverCrop) return;
    const traits = traitsOf(crops, entry.coverCrop);
    const start = i * 12 + traits.sowMonth - 1;
    const end = (traits.harvestMonth < traits.sowMonth ? i + 1 : i) * 12 + traits.harvestMonth - 1;
    let sown = false;
    for (let index = start; index <= end; index++) {
      const key = wrap(index);
      if (cells[key]) {
        if (sown) break;
        continue;
      }
      cells[key] = { crop: entry.coverCrop, cover: 'cover-crop', age: index - start };
      sown = true;
    }
  });

  // Free months: residue for a while after the last crop, then bare.
  const states: CoverState[] = Array.from({ length: total }, () => 'bare');
  const first = cells.findIndex((cell) => cell !== undefined);
  let last: Cell | undefined;
  let since = 0;
  for (let step = 0; step < total && first >= 0; step++) {
    const key = wrap(first + step);
    const cell = cells[key];
    if (cell) {
      last = cell;
      since = 0;
      states[key] = cell.cover;
    } else if (last) {
      since += 1;
      states[key] = since <= RESIDUE_MONTHS[traitsOf(crops, last.crop).residueCover] ? 'residue' : 'bare';
    }
  }

  return states.map((cover, index) => {
    const month = (index % 12) + 1;
    const cell = cells[index];
    const exposure: CalendarMonth['exposure'] = [];
    if (cell) {
      for (const sensitivity of traitsOf(crops, cell.crop).sensitive) {
        if (!sensitivity.months.includes(month)) continue;
        const risk = monthlyRisk.find((r) => r.month === month && r.hazard === sensitivity.hazard);
        if (risk) exposure.push({ hazard: sensitivity.hazard, probability: risk.probability });
      }
    }
    return { yearIndex: Math.floor(index / 12), month, ...(cell ? { crop: cell.crop } : {}), cover, exposure };
  });
}

// ---------- scores and rotations ----------

type Confidence = Score['confidence'];
const CONFIDENCE_ORDER: Confidence[] = ['strong', 'moderate', 'weak'];
const weakest = (list: Confidence[]): Confidence => pick(CONFIDENCE_ORDER, Math.max(...list.map((c) => CONFIDENCE_ORDER.indexOf(c))));

/** Half-width of the range around a score when the spec gives none, as a share of the value. */
const RANGE_SHARE: Record<Confidence, number> = { strong: 0.08, moderate: 0.15, weak: 0.25 };

export function makeScore(value: number, low: number, high: number, confidence: Confidence, basis: Message): Score {
  const v = round(clamp(value, 0, 100));
  return { value: v, low: Math.min(v, round(clamp(low, 0, 100))), high: Math.max(v, round(clamp(high, 0, 100))), confidence, basis };
}

export interface ScoreInput { value: number; confidence: Confidence; low?: number; high?: number }

function scoreFrom(input: ScoreInput, basis: Message): Score {
  const share = RANGE_SHARE[input.confidence];
  return makeScore(input.value, input.low ?? input.value * (1 - share), input.high ?? input.value * (1 + share), input.confidence, basis);
}

/** Goal weights from SPEC section 7. Income is left out: the fixtures have no money tables. */
export const GOAL_WEIGHTS: Record<Exclude<GoalId, 'income'>, { soil: number; climate: number; priorities: number }> = {
  keepSoil: { soil: 0.4, climate: 0.45, priorities: 0.15 },
  improveSoil: { soil: 0.6, climate: 0.25, priorities: 0.15 },
};
const SOIL_GOALS = ['keepSoil', 'improveSoil'] as const;
const SOIL_FLOOR_POINTS = 5;
const INDICATORS: IndicatorId[] = ['nitrogen', 'organicMatter', 'erosion', 'pestBreak'];

export const INCOME_NOT_LOADED = { status: 'no-data', reason: { code: 'fx.income.not-loaded' } } as const;
export const TWINS_NOT_LOADED = { status: 'no-data', reason: { code: 'fx.twins.not-loaded' } } as const;
export const MONEY_NOT_LOADED = { status: 'not-loaded' } as const;

export interface RotationSpec {
  id: string;
  isCurrent: boolean;
  years: RotationYears;
  indicators: Record<IndicatorId, ScoreInput>;
  climateResilience: ScoreInput; // give low and high: the 10th and 90th percentile year
  water: ScoreInput;
  forage: ScoreInput;
  why: Message[];
  benefits: Message[];
  gaps: Message[];
  localReviewRisks: Message[];
}

export interface RotationContext { crops: CropTraits[]; monthlyRisk: MonthlyRisk[] }

function buildEvidence(years: RotationYears, crops: CropTraits[], calendar: CalendarMonth[]): Evidence[] {
  const isLegume = (id: CropId | undefined) => id !== undefined && traitsOf(crops, id).legume;
  const legumeYears = years.filter((y) => isLegume(y.crop) || isLegume(y.coverCrop)).length;
  const bare = calendar.filter((m) => m.cover === 'bare').length;
  const living = calendar.filter((m) => m.cover === 'crop' || m.cover === 'cover-crop').length;
  return [
    {
      message: msg('fx.evidence.legume-years', { legumeYears, years: years.length }),
      values: [fixtureValue(round(legumeYears / years.length, 2), { unit: 'share of rotation years' })],
      ruleIds: ['fixture.rule.nitrogen'],
    },
    {
      message: msg('fx.evidence.cover-months', { bare, living, total: calendar.length }),
      values: [
        fixtureValue(bare, { unit: 'bare months per cycle' }),
        fixtureValue(living, { unit: 'months with a living crop per cycle' }),
      ],
      ruleIds: ['fixture.rule.erosion', 'fixture.rule.organic-matter'],
    },
  ];
}

/** A complete rotation card. Ranks and the soil floor depend on the other rotations: see `rankRotations`. */
export function buildRotation(spec: RotationSpec, context: RotationContext): RotationOption {
  const calendar = buildCalendar(spec.years, context.crops, context.monthlyRisk);
  const indicator = (id: IndicatorId) => scoreFrom(spec.indicators[id], msg(`fx.basis.indicator.${spec.indicators[id].confidence}`));
  const indicators: Record<IndicatorId, Score> = {
    nitrogen: indicator('nitrogen'),
    organicMatter: indicator('organicMatter'),
    erosion: indicator('erosion'),
    pestBreak: indicator('pestBreak'),
  };
  const parts = INDICATORS.map((id) => indicators[id]);
  const soilHealth = makeScore(
    mean(parts.map((s) => s.value)),
    mean(parts.map((s) => s.low)),
    mean(parts.map((s) => s.high)),
    weakest(parts.map((s) => s.confidence)),
    msg('fx.basis.soil-health'),
  );
  const climateResilience = scoreFrom(
    spec.climateResilience,
    msg(spec.climateResilience.confidence === 'weak' ? 'fx.basis.climate.weak' : 'fx.basis.climate', { years: YEAR_COUNT }),
  );
  const water = scoreFrom(spec.water, msg('fx.basis.water', { years: YEAR_COUNT }));
  const forage = scoreFrom(spec.forage, msg('fx.basis.forage'));

  const total = (goal: (typeof SOIL_GOALS)[number]): Score => {
    const w = GOAL_WEIGHTS[goal];
    const combine = (key: 'value' | 'low' | 'high') =>
      w.soil * soilHealth[key] + w.climate * climateResilience[key] + (w.priorities * (water[key] + forage[key])) / 2;
    return makeScore(
      combine('value'),
      combine('low'),
      combine('high'),
      weakest([soilHealth.confidence, climateResilience.confidence, water.confidence, forage.confidence]),
      msg('fx.basis.total', { soil: Math.round(w.soil * 100), climate: Math.round(w.climate * 100), priorities: Math.round(w.priorities * 100) }),
    );
  };

  return {
    id: spec.id,
    isCurrent: spec.isCurrent,
    years: spec.years,
    totals: {
      keepSoil: { status: 'ready', data: total('keepSoil') },
      improveSoil: { status: 'ready', data: total('improveSoil') },
      income: INCOME_NOT_LOADED,
    },
    rankByGoal: {},
    belowSoilFloor: false,
    soilHealth,
    indicators,
    climateResilience,
    priorityScores: { water, forage },
    income: INCOME_NOT_LOADED,
    why: spec.why,
    evidence: buildEvidence(spec.years, context.crops, calendar),
    benefits: spec.benefits,
    gaps: spec.gaps,
    localReviewRisks: spec.localReviewRisks,
    calendar,
    bareMonths: calendar.filter((m) => m.cover === 'bare').length,
    twins: TWINS_NOT_LOADED,
    money: MONEY_NOT_LOADED,
  };
}

function totalValue(rotation: RotationOption, goal: GoalId): number {
  const result = rotation.totals[goal];
  if (result.status !== 'ready') throw new Error(`fixture: rotation '${rotation.id}' has no ${goal} total`);
  return result.data.value;
}

/** Fills `rankByGoal` (1 = best, the current rotation ranked with the others) and `belowSoilFloor`. */
export function rankRotations(rotations: RotationOption[]): RotationOption[] {
  const current = rotations.find((r) => r.isCurrent);
  if (!current) throw new Error('fixture: no current rotation');
  const rank = (goal: GoalId) => {
    const order = [...rotations].sort((a, b) => totalValue(b, goal) - totalValue(a, goal));
    return new Map(order.map((r, index) => [r.id, index + 1]));
  };
  const keepSoil = rank('keepSoil');
  const improveSoil = rank('improveSoil');
  return rotations.map((r) => ({
    ...r,
    rankByGoal: { keepSoil: keepSoil.get(r.id) ?? rotations.length, improveSoil: improveSoil.get(r.id) ?? rotations.length },
    belowSoilFloor: !r.isCurrent && r.soilHealth.value < current.soilHealth.value - SOIL_FLOOR_POINTS,
  }));
}

/** The three best alternatives per goal plus the current rotation, best first. The soil floor applies to keepSoil only. */
export function pickShown(rotations: RotationOption[]): Analysis['shownByGoal'] {
  const shown = (goal: (typeof SOIL_GOALS)[number]) => {
    const byRank = (a: RotationOption, b: RotationOption) => (a.rankByGoal[goal] ?? Infinity) - (b.rankByGoal[goal] ?? Infinity);
    const alternatives = rotations
      .filter((r) => !r.isCurrent && !(goal === 'keepSoil' && r.belowSoilFloor))
      .sort(byRank)
      .slice(0, 3);
    return [...alternatives, ...rotations.filter((r) => r.isCurrent)].sort(byRank).map((r) => r.id);
  };
  return { keepSoil: shown('keepSoil'), improveSoil: shown('improveSoil') };
}

export function buildAnalysis(input: { field: Field; profile: FieldProfile; crops: CropTraits[]; rotations: RotationSpec[] }): Analysis {
  const context: RotationContext = { crops: input.crops, monthlyRisk: input.profile.monthlyRisk };
  const rotations = rankRotations(input.rotations.map((spec) => buildRotation(spec, context)));
  return {
    field: input.field,
    profile: input.profile,
    rotations,
    shownByGoal: pickShown(rotations),
    datasets: fixtureDatasets,
    generatedAt: FIXTURE_DATE,
  };
}
