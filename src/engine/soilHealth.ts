// Soil health: four indicators (nitrogen, organic matter, erosion, pest-cycle break) and their weighted total.
// SPEC section 7. The rule rows come in as an argument; O3-B6 loads them from data/rules/*.json.
//
// Rule rows each indicator reads (ids are exact; <cropId> is a key of data/crops, <family> is CropTraits.family):
//
// nitrogen (data/rules/nitrogen.json)
//   nitrogen.credit.<cropId>     number or {low,mid,high}  kg N/ha credited for one year of this legume, as main
//                                                          crop or as cover crop. Only legumes are looked up.
//   nitrogen.leachingRainMm      number                    mean rain per rotation year falling in bare months at
//                                                          which the leaching loss reaches its maximum
//   nitrogen.leachingMaxLoss     number, share 0–1         largest share of the credit lost to leaching
//   nitrogen.leachingBySand      {"<sand % lower bound>": factor}  e.g. {"0":0.8,"50":1.2}; multiplies the loss
//   Score = 100 × min(1, mean credit per rotation year / largest credit in the table) × (1 − leaching loss).
//   A legume in the rotation without a credit row, or no credit rows at all → indicator left out.
//
// humus (data/rules/humus.json)
//   humus.coef.<cropId>          number or {low,mid,high}  humus balance units per year (negative = degrades);
//                                                          read for every main crop and every cover crop
//   humus.climateLimits          {"meanTMaxC": n, "annualRainMm": n}  at or above → warm / wet
//   humus.climateFactor          {"cool-dry","cool-wet","warm-dry","warm-wet": factor}  multiplies the negative
//                                                          (degrading) coefficients: warm and wet break down faster
//   humus.textureBySand          {"<sand % lower bound>": factor}  multiplies the negative coefficients too
//   Score = balance per year scaled between the worst case (lowest coefficient every year at the largest
//   factors) = 0 and the best case (the two largest positive coefficients, a main crop plus a cover) = 100.
//   A crop in the rotation without a coefficient, or no coefficient rows at all → indicator left out.
//
// erosion (data/rules/erosion.json)
//   erosion.cFactor.<coverState> number or {low,mid,high}  RUSLE cover-management factor per calendar cover state:
//                                                          crop, cover-crop, residue, bare
//   erosion.slopeFactor          {"<slope % lower bound>": factor}
//   erosion.zeroScoreIndex       number                    index (C × monthly rain mm per rotation year × slope
//                                                          factor) at which the score reaches 0
//   Score = 100 × (1 − index / zeroScoreIndex). A cover state without a C factor, or no zeroScoreIndex → left out.
//
// pest break (data/rules/pest-break.json)
//   pestBreak.minReturn.<family> number or {low,mid,high}  minimum years before the family returns on the field
//   For each main crop of the cycle, the years until its family comes back (the cycle wraps; a family grown once
//   comes back after the whole cycle). Each return earlier than the minimum is one violation.
//   Score = 100 × (years − violations) / years. A family without a row is not checked (confidence drops one level);
//   no family checked → left out.
//
// Numbers in {low,mid,high} form (mid optional: (low + high) / 2 when absent) give the range of the score (low and high rule values). A plain number has no range:
// the score gets ±15% and the basis "rule of thumb". Factor rows (leaching, climate, texture, slope, limits) are read
// at their plain value or mid. A row's appliesTo is not filtered here: the caller passes the rows for the country.
//
// Confidence (SPEC 7): start at strong; one level down when a rule used has no range; one level down per input
// that is missing (sand share, slope, rain record, a factor row). The total takes the weakest indicator and drops one
// more level when an indicator is missing.
import type { CoverState, CropTraits, Evidence, FieldProfile, IndicatorId, Message, Priorities, RotationOption, Score, Sourced } from '../contracts';
import type { z } from 'zod';
import type { ruleRow } from '../contracts/schemas';
import { buildCalendar, cropById } from './calendar';

/** One row of data/rules/*.json, as the contract schema parses it. */
export type RuleRow = z.infer<typeof ruleRow>;
export interface SoilRules { nitrogen: RuleRow[]; humus: RuleRow[]; erosion: RuleRow[]; pestBreak: RuleRow[] }

/** Every message code this module emits, with the intended English text (task O3-B6 writes messages/en.json). */
export const SOIL_MESSAGE_CODES = [
  'soil.basis.rule-range', //       "Range from the low and high values given in the source rules."
  'soil.basis.rule-of-thumb', //    "Range of ±15%, a rule of thumb: the source gives a single value."
  'soil.basis.total', //            "Weighted mean of {indicators} soil health indicators. Not scored: {missing}."
  'soil.basis.no-indicators', //    "No soil health indicator could be scored: the rule tables are missing."
  'soil.evidence.nitrogen', //      "{legumeYears} of {years} years carry a legume, about {creditKgPerHa} kg N/ha a year; leaching in bare months takes about {leachingLossPct}%."
  'soil.evidence.organic-matter', // "Humus balance of {balancePerYear} units a year on this field ({climateClass} climate)."
  'soil.evidence.erosion', //       "{exposedMonths} bare months per cycle catch about {bareRainMm} mm of rain a year."
  'soil.evidence.pest-break', //    "{violations} of {years} crops return before their family's minimum break."
] as const;
export type SoilMessageCode = (typeof SOIL_MESSAGE_CODES)[number];

type Years = RotationOption['years'];
type Mode = 'mid' | 'low' | 'high';
const INDICATORS: IndicatorId[] = ['nitrogen', 'organicMatter', 'erosion', 'pestBreak'];
const LEVELS: Score['confidence'][] = ['strong', 'moderate', 'weak'];
const RULE_OF_THUMB = 0.15;

// ---------- rule reading ----------

/** Tracks which rows an indicator used and whether all primary rows had a range. */
class Reader {
  readonly ids = new Set<string>();
  ranged = true;
  constructor(private readonly rows: RuleRow[], private readonly mode: Mode) {}

  private find(id: string): RuleRow | undefined {
    return this.rows.find((r) => r.id === id);
  }

  /** A primary number: plain, or {low,mid,high} read at the current mode. */
  primary(id: string): number | undefined {
    const row = this.find(id);
    if (!row) return undefined;
    const v = rangedValue(row, this.mode);
    if (v === undefined) return undefined;
    this.ids.add(id);
    if (typeof row.value === 'number') this.ranged = false;
    return v;
  }

  /** A factor: plain number or the mid of a range. */
  factor(id: string): number | undefined {
    const row = this.find(id);
    if (!row) return undefined;
    const v = rangedValue(row, 'mid');
    if (v !== undefined) this.ids.add(id);
    return v;
  }

  record(id: string): Record<string, number> | undefined {
    const row = this.find(id);
    if (!row || typeof row.value !== 'object') return undefined;
    this.ids.add(id);
    return row.value;
  }
}

/** Plain number, or a {low, high} range with optional mid; a missing mid is (low + high) / 2. */
function rangedValue(row: RuleRow, mode: Mode): number | undefined {
  if (typeof row.value === 'number') return row.value;
  if (typeof row.value !== 'object') return undefined;
  const { low, high } = row.value;
  const mid = typeof row.value.mid === 'number' ? row.value.mid : typeof low === 'number' && typeof high === 'number' ? (low + high) / 2 : undefined;
  if (mid === undefined) return undefined;
  const v = mode === 'mid' ? mid : row.value[mode];
  return typeof v === 'number' ? v : mid;
}

/** Mid values of every row whose id starts with `prefix`. */
function midValues(rows: RuleRow[], prefix: string): number[] {
  return rows.filter((r) => r.id.startsWith(prefix)).map((r) => rangedValue(r, 'mid')).filter((v): v is number => v !== undefined);
}

/** Step lookup: the value under the largest numeric key that is ≤ x. */
function step(table: Record<string, number> | undefined, x: number | null): number | undefined {
  if (!table || x === null) return undefined;
  let best: { key: number; value: number } | undefined;
  for (const [k, value] of Object.entries(table)) {
    const key = Number(k);
    if (Number.isFinite(key) && key <= x && (!best || key > best.key)) best = { key, value };
  }
  return best?.value;
}

// ---------- climate helpers (NASA POWER monthly record) ----------

const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
const round = (x: number, digits = 1) => Math.round(x * 10 ** digits) / 10 ** digits;
const clamp = (x: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));

/** Mean rain per calendar month (index 0 = January) over the record; null when the month has no value at all. */
export function meanMonthlyRain(profile: Pick<FieldProfile, 'monthly'>): (number | null)[] {
  return Array.from({ length: 12 }, (_, i) =>
    mean(profile.monthly.filter((m) => m.month === i + 1 && m.rainMm !== null).map((m) => m.rainMm as number)),
  );
}

function derived(profile: FieldProfile, value: number | null, unit: string, missingReason: string): Sourced {
  const base = { unit, datasetIds: [...profile.source.datasetIds], kind: 'derived' as const, retrievedAt: profile.source.retrievedAt };
  return value === null ? { ...base, value: null, missingReason } : { ...base, value: round(value) };
}

// ---------- indicator calculations ----------

interface Calc { score: number; missingInputs: number; ranged: boolean; ruleIds: string[]; values: Sourced[]; message: Message }
interface Context { years: Years; crops: CropTraits[]; profile: FieldProfile; rain: (number | null)[]; cells: ReturnType<typeof buildCalendar>['months'] }

function nitrogen(ctx: Context, rows: RuleRow[], mode: Mode): Calc | null {
  const maxCredit = Math.max(...midValues(rows, 'nitrogen.credit.'));
  if (!Number.isFinite(maxCredit) || maxCredit <= 0) return null;
  const r = new Reader(rows, mode);
  const n = ctx.years.length;
  let total = 0;
  let legumeYears = 0;
  // A perennial legume (alfalfa) leaves its credit once per stand, to the crop after it: a year that continues a
  // stand of the same perennial adds no second credit. A rotation that is the perennial in every year keeps them all.
  const allSame = ctx.years.every((y) => y.crop === ctx.years[0]?.crop);
  const continuesStand = (i: number) =>
    !allSame && cropById(ctx.crops, ctx.years[i]!.crop).kind === 'perennial' && ctx.years[(i - 1 + n) % n]!.crop === ctx.years[i]!.crop;
  for (const [i, y] of ctx.years.entries()) {
    let yearHasLegume = false;
    for (const id of [y.crop, y.coverCrop]) {
      if (!id || !cropById(ctx.crops, id).legume) continue;
      const credit = r.primary(`nitrogen.credit.${id}`);
      if (credit === undefined) return null;
      yearHasLegume = true;
      if (id === y.crop && continuesStand(i)) continue;
      total += credit;
    }
    if (yearHasLegume) legumeYears++;
  }

  let missingInputs = 0;
  const bare = ctx.cells.filter((c) => c.cover === 'bare').map((c) => ctx.rain[c.month - 1]);
  const bareRain = bare.some((v) => v === null || v === undefined) ? null : bare.reduce<number>((a, b) => a + (b ?? 0), 0) / n;
  const rainLimit = r.factor('nitrogen.leachingRainMm');
  const maxLoss = r.factor('nitrogen.leachingMaxLoss');
  let loss = 0;
  if (bareRain === null || rainLimit === undefined || maxLoss === undefined || rainLimit <= 0) {
    missingInputs++; // leaching left out
  } else {
    loss = maxLoss * Math.min(1, bareRain / rainLimit);
    const sandFactor = step(r.record('nitrogen.leachingBySand'), ctx.profile.soil.sandPct.value);
    if (sandFactor === undefined) missingInputs++;
    else loss *= sandFactor;
    loss = clamp(loss, 0, 1);
  }

  const creditPerYear = total / n;
  return {
    score: 100 * Math.min(1, creditPerYear / maxCredit) * (1 - loss),
    missingInputs,
    ranged: r.ranged,
    ruleIds: [...r.ids],
    values: [derived(ctx.profile, bareRain, 'mm per year in bare months', 'no rain record for one or more bare months'), ctx.profile.soil.sandPct],
    message: {
      code: 'soil.evidence.nitrogen',
      params: { legumeYears, years: n, creditKgPerHa: round(creditPerYear), leachingLossPct: round(loss * 100) },
    },
  };
}

/** Sum of the humus coefficients of every main and cover crop over one rotation cycle, before any adjustment. */
export function humusBalanceRaw(years: Years, humusRows: RuleRow[], mode: Mode = 'mid'): number | null {
  const r = new Reader(humusRows, mode);
  let sum = 0;
  for (const y of years) {
    for (const id of [y.crop, y.coverCrop]) {
      if (!id) continue;
      const coef = r.primary(`humus.coef.${id}`);
      if (coef === undefined) return null;
      sum += coef;
    }
  }
  return sum;
}

function organicMatter(ctx: Context, rows: RuleRow[], mode: Mode): Calc | null {
  const coefs = midValues(rows, 'humus.coef.');
  if (coefs.length === 0) return null;
  const r = new Reader(rows, mode);
  let positive = 0;
  let negative = 0;
  for (const y of ctx.years) {
    for (const id of [y.crop, y.coverCrop]) {
      if (!id) continue;
      const coef = r.primary(`humus.coef.${id}`);
      if (coef === undefined) return null;
      if (coef >= 0) positive += coef;
      else negative += coef;
    }
  }
  const n = ctx.years.length;
  let missingInputs = 0;

  const tMax = mean(ctx.profile.monthly.map((m) => m.tMaxC).filter((v): v is number => v !== null));
  const annualRain = ctx.rain.some((v) => v === null) ? null : ctx.rain.reduce<number>((a, b) => a + (b ?? 0), 0);
  const limits = r.record('humus.climateLimits');
  const climateFactors = r.record('humus.climateFactor');
  let climateClass: string | null = null;
  let climateFactor = 1;
  if (limits?.meanTMaxC !== undefined && limits.annualRainMm !== undefined && tMax !== null && annualRain !== null) {
    climateClass = `${tMax >= limits.meanTMaxC ? 'warm' : 'cool'}-${annualRain >= limits.annualRainMm ? 'wet' : 'dry'}`;
  }
  const cf = climateClass === null ? undefined : climateFactors?.[climateClass];
  if (cf === undefined) missingInputs++;
  else climateFactor = cf;

  const textureTable = r.record('humus.textureBySand');
  const tf = step(textureTable, ctx.profile.soil.sandPct.value);
  if (tf === undefined) missingInputs++;
  const textureFactor = tf ?? 1;

  const perYear = (positive + negative * climateFactor * textureFactor) / n;

  const maxOf = (t: Record<string, number> | undefined) => Math.max(1, ...Object.values(t ?? {}));
  const low = Math.min(0, Math.min(...coefs) * maxOf(climateFactors) * maxOf(textureTable));
  const best = coefs.filter((c) => c > 0).sort((a, b) => b - a);
  const high = (best[0] ?? 0) + (best[1] ?? 0);
  const score = high > low ? (100 * (perYear - low)) / (high - low) : 0;

  return {
    score,
    missingInputs,
    ranged: r.ranged,
    ruleIds: [...r.ids],
    values: [
      derived(ctx.profile, tMax, '°C, mean monthly maximum', 'no temperature record'),
      derived(ctx.profile, annualRain, 'mm per year', 'no rain record for one or more months'),
      ctx.profile.soil.sandPct,
    ],
    message: { code: 'soil.evidence.organic-matter', params: { balancePerYear: round(perYear, 2), climateClass: climateClass ?? 'unknown' } },
  };
}

function erosion(ctx: Context, rows: RuleRow[], mode: Mode): Calc | null {
  const r = new Reader(rows, mode);
  const zero = r.factor('erosion.zeroScoreIndex');
  if (zero === undefined || zero <= 0) return null;
  const c: Partial<Record<CoverState, number>> = {};
  for (const state of new Set(ctx.cells.map((cell) => cell.cover))) {
    const v = r.primary(`erosion.cFactor.${state}`);
    if (v === undefined) return null;
    c[state] = v;
  }
  const n = ctx.years.length;
  let missingInputs = 0;
  let rainGap = false;
  let index = 0;
  let bareRain = 0;
  for (const cell of ctx.cells) {
    const rain = ctx.rain[cell.month - 1];
    if (rain === null || rain === undefined) {
      rainGap = true;
      continue;
    }
    index += (c[cell.cover] ?? 0) * rain;
    if (cell.cover === 'bare') bareRain += rain;
  }
  if (rainGap) missingInputs++;
  const slopeFactor = step(r.record('erosion.slopeFactor'), ctx.profile.slopePct.value);
  if (slopeFactor === undefined) missingInputs++; // slope left out of the index
  index = (index / n) * (slopeFactor ?? 1);

  return {
    score: 100 * (1 - index / zero),
    missingInputs,
    ranged: r.ranged,
    ruleIds: [...r.ids],
    values: [derived(ctx.profile, rainGap ? null : bareRain / n, 'mm per year in bare months', 'no rain record for one or more months'), ctx.profile.slopePct],
    message: {
      code: 'soil.evidence.erosion',
      params: { exposedMonths: ctx.cells.filter((cell) => cell.cover === 'bare').length, bareRainMm: round(bareRain / n) },
    },
  };
}

function pestBreak(ctx: Context, rows: RuleRow[], mode: Mode): Calc | null {
  const r = new Reader(rows, mode);
  const families = ctx.years.map((y) => cropById(ctx.crops, y.crop).family);
  const n = families.length;
  let violations = 0;
  let checked = 0;
  let unchecked = false;
  families.forEach((family, i) => {
    const minReturn = r.primary(`pestBreak.minReturn.${family}`);
    if (minReturn === undefined) {
      unchecked = true;
      return;
    }
    checked++;
    let gap = n;
    for (let k = 1; k < n; k++) {
      if (families[(i + k) % n] === family) {
        gap = k;
        break;
      }
    }
    if (gap < minReturn) violations++;
  });
  if (checked === 0) return null;
  return {
    score: (100 * (n - violations)) / n,
    missingInputs: unchecked ? 1 : 0,
    ranged: r.ranged,
    ruleIds: [...r.ids],
    values: [],
    message: { code: 'soil.evidence.pest-break', params: { violations, years: n } },
  };
}

const CALCS: Record<IndicatorId, (ctx: Context, rows: RuleRow[], mode: Mode) => Calc | null> = {
  nitrogen, organicMatter, erosion, pestBreak,
};
const ROWS: Record<IndicatorId, keyof SoilRules> = { nitrogen: 'nitrogen', organicMatter: 'humus', erosion: 'erosion', pestBreak: 'pestBreak' };
const PRIORITY_OF: Partial<Record<IndicatorId, Priorities['on'][number]>> = { nitrogen: 'nitrogen', organicMatter: 'organicMatter', erosion: 'erosion' };

function toScore(mid: Calc, low: Calc | null, high: Calc | null): { score: Score; level: number } {
  const value = round(clamp(mid.score));
  const level = Math.min(2, (mid.ranged ? 0 : 1) + mid.missingInputs);
  let lo: number;
  let hi: number;
  let basis: Message;
  if (mid.ranged) {
    const all = [mid, low ?? mid, high ?? mid].map((c) => round(clamp(c.score)));
    lo = Math.min(...all);
    hi = Math.max(...all);
    basis = { code: 'soil.basis.rule-range' };
  } else {
    lo = round(clamp(value * (1 - RULE_OF_THUMB)));
    hi = round(clamp(value * (1 + RULE_OF_THUMB)));
    basis = { code: 'soil.basis.rule-of-thumb' };
  }
  return { score: { value, low: lo, high: hi, confidence: LEVELS[level] ?? 'weak', basis }, level };
}

/**
 * Soil health of a rotation on one field. `priorityFactor` multiplies the weight of the nitrogen, erosion and
 * organic matter indicators when the farmer switched that priority on (SPEC 7 says "doubles"; O3-B6 may pass the
 * value of rule `goals.priorityDoubling.factor`).
 */
export function soilHealth(
  years: Years,
  crops: CropTraits[],
  profile: FieldProfile,
  rules: SoilRules,
  priorities: Priorities,
  priorityFactor = 2,
): { total: Score; indicators: Partial<Record<IndicatorId, Score>>; evidence: Evidence[]; missing: IndicatorId[] } {
  const ctx: Context = { years, crops, profile, rain: meanMonthlyRain(profile), cells: buildCalendar(years, crops).months };
  const indicators: Partial<Record<IndicatorId, Score>> = {};
  const evidence: Evidence[] = [];
  const missing: IndicatorId[] = [];
  let weightSum = 0;
  let sum = 0;
  let lowSum = 0;
  let highSum = 0;
  let worst = 0;

  for (const id of INDICATORS) {
    const rows = rules[ROWS[id]];
    const mid = CALCS[id](ctx, rows, 'mid');
    if (!mid) {
      missing.push(id);
      continue;
    }
    const { score, level } = toScore(mid, CALCS[id](ctx, rows, 'low'), CALCS[id](ctx, rows, 'high'));
    indicators[id] = score;
    evidence.push({ message: mid.message, values: mid.values, ruleIds: mid.ruleIds });
    const priority = PRIORITY_OF[id];
    const weight = priority && priorities.on.includes(priority) ? priorityFactor : 1;
    weightSum += weight;
    sum += weight * score.value;
    lowSum += weight * score.low;
    highSum += weight * score.high;
    worst = Math.max(worst, level);
  }

  if (weightSum === 0) {
    // Nothing could be scored. The value 0 is a placeholder the ranking must not use: confidence is weak and the
    // basis says why.
    return { total: { value: 0, low: 0, high: 0, confidence: 'weak', basis: { code: 'soil.basis.no-indicators' } }, indicators, evidence, missing };
  }
  const level = Math.min(2, worst + (missing.length > 0 ? 1 : 0));
  const total: Score = {
    value: round(sum / weightSum),
    low: round(lowSum / weightSum),
    high: round(highSum / weightSum),
    confidence: LEVELS[level] ?? 'weak',
    basis: { code: 'soil.basis.total', params: { indicators: INDICATORS.length - missing.length, missing: missing.join(', ') } },
  };
  return { total, indicators, evidence, missing };
}
