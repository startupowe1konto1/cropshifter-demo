// Income score (SPEC section 7 "Income score"). A replay of the field's own climate record at today's prices: what
// the rotation would have earned here in each past year. It is not a forecast and it promises no yield.
//
// Per crop and record year the yield comes from the same hazard checks as climate resilience (`yearlyHitsDetailed`):
// - drought: the largest (shortfall × yield response factor) over the crop's drought-sensitive months, in every year
//   below the median, hit or not; the shortfall is (median − wetness) / median of root-zone wetness for that calendar
//   month on this field (`shortfallVsMedian`, SPEC 7). The drought limit (D30) only decides resilience hits;
// - heat and frost: each sensitive row (hazard + months) with a hit in any of its months adds its `lossShare`;
// - the total loss is capped at 1; the relative yield of the year is (1 − loss).
// The reference yield in data/money is already a mean of actual yields (recent county or state years), so it is not the
// yield of a year without any hazard (issue #98). The replay keeps the year-to-year pattern of the hazard checks and
// scales it to that mean: yield = reference × (1 − loss) / mean over the crop's replayed years of (1 − loss). The mean
// replayed yield is then the reference yield, and the mean margin is the margin at the reference yield.
// The money tables price each crop after a different crop (for example ISU's "Corn Following Soybeans" budget). A main
// crop that follows itself in the rotation (not a perennial kept in place) gets no yield or cost penalty here; that is
// named in the gaps until data/money has a sourced row for it.
// margin = yield × price − direct costs. The rotation's margin in a year is the mean over its rotation years (a crop
// grown in two of three years counts twice). A cover crop has no revenue; it is there for the soil (D34). Its seed and
// sowing cost is subtracted only where the money tables have a sourced direct-cost row for it, spread over the
// rotation years; otherwise the cost is left out and named in the gaps. A cover crop never makes income no-data.
import type {
  AsyncResult,
  ClimateProfile,
  CropEconomics,
  CropId,
  CropTraits,
  Message,
  MoneyEstimate,
  RotationOption,
  Score,
  Sourced,
} from '../contracts';
import { percentile, recordYears, yearlyHitsDetailed } from './resilience';

/** Every Message code this module emits. The English text for each belongs in src/engine/messages/en.json. */
export const INCOME_MESSAGE_CODES = [
  // "What this rotation would have earned ... over {years} past years at today's prices. ... the average year
  // matches the recent average harvest. Not a forecast."
  'income.basis.replay',
  // "No sourced price, yield or direct costs for {crop}, so income is not estimated for this rotation."
  'income.no-price',
  // "No yield response factor for {crop}, so its yield in dry years cannot be replayed."
  'income.no-yield-response',
  // "The climate record has no year in which every crop of this rotation could be checked, so income is not estimated."
  'income.no-climate-years',
  // "{programme}: the rate for this campaign could not be confirmed, so it is left out of the income."
  'gap.payment-unconfirmed',
  // "{programme}: no sourced rate per hectare, so it is left out of the income."
  'gap.payment-no-rate',
  // "{count} of {years} past years had missing climate data and were left out of the income replay."
  'gap.income-years-left-out',
  // "{crop} earns nothing directly. It pays back through the soil health scores."
  'income.cover-no-revenue',
  // "{crop} follows {crop} in this rotation. A crop after itself may yield less and cost more; not counted, no sourced row."
  'gap.crop-after-itself-not-priced',
  // "No sourced seed and sowing cost for {crop}, so its cost is left out of the income."
  'gap.cover-cost-missing',
  // "Every past year is a total loss for {crop} under its hazard checks, so its income cannot be replayed."
  'income.total-loss-every-year',
  // "{crop}: the hazard checks lose much more than the recent harvests show, so each replayed year is scaled up {factor}
  // times ..."
  'gap.income-calibration-large',
  // "{crop}: no source gives its own yield response to water, so the dry-year replay uses the {from} value (FAO Paper 66, Table 1; D53)."
  'gap.income-ky-borrowed',
] as const;

/**
 * Team guard (not a sourced value, #100 review): above this calibration factor (reference yield / mean relative
 * yield) the income names a gap for the crop. The yields are never capped.
 */
export const CALIBRATION_GAP_FACTOR = 1.25;

/** Thrown by `yearlyYield` when every replayed year is a total loss, so there is nothing to calibrate. */
export class TotalLossError extends Error {
  constructor(readonly crop: CropId) {
    super(`income: every replayed year is a total loss for '${crop}'`);
    this.name = 'TotalLossError';
  }
}

/** Mean relative yield (1 - loss) over the replayed years, before calibration. */
const meanRelativeYield = (rows: { loss: number }[]) => rows.reduce((a, r) => a + (1 - r.loss), 0) / rows.length;

const RANGE_BASIS = '10th–90th percentile year of the record, at today’s prices';

const round = (x: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

export interface YearYield {
  year: number;
  yieldTPerHa: number;
  /** Hazard loss of the year before calibration, 0–1. */
  loss: number;
}

/**
 * Yield of one crop in each record year, calibrated so the mean over the replayed years is the reference yield. A
 * year in which every check of the crop is missing is left out (never filled). A crop with no sensitive months gets
 * the reference yield in every record year. Throws a TotalLossError when every replayed year is a total loss, and when the
 * crop is drought-sensitive and has no yield response factor (cover crops may lack one; income uses main crops only).
 * `hits` is the crop's `yearlyHitsDetailed` result when the caller already has it.
 */
export function yearlyYield(
  crop: CropTraits,
  climate: ClimateProfile,
  referenceYieldTPerHa: number,
  droughtPercentile: number,
  heatMinDays: number,
  hits: ReturnType<typeof yearlyHitsDetailed> = yearlyHitsDetailed(crop, climate, droughtPercentile, heatMinDays),
): YearYield[] {
  const years = recordYears(climate);
  const ky = (crop as { yieldResponseFactor?: number }).yieldResponseFactor;
  const droughtSensitive = crop.sensitive.some((s) => s.hazard === 'drought' && s.months.length > 0);
  if (droughtSensitive && (ky === undefined || ky === null || !Number.isFinite(ky))) {
    throw new Error(`income: no yield response factor for '${crop.id}'`);
  }
  const hasChecks = crop.sensitive.some((s) => s.months.length > 0);
  const { rows } = hits;

  const out: YearYield[] = [];
  for (const year of years) {
    const yearRows = rows.filter((r) => r.year === year);
    if (hasChecks && yearRows.length === 0) continue; // every check missing: leave the year out

    let drought = 0;
    let other = 0;
    for (const s of crop.sensitive) {
      const inMonths = yearRows.filter((r) => r.hazard === s.hazard && s.months.includes(r.month));
      if (s.hazard === 'drought') {
        for (const r of inMonths) drought = Math.max(drought, (r.shortfallVsMedian ?? 0) * (ky as number));
      } else if (inMonths.some((r) => r.hit)) {
        other += s.lossShare;
      }
    }
    const loss = Math.min(1, drought + other);
    out.push({ year, yieldTPerHa: 1 - loss, loss }); // relative yield until calibrated below
  }
  if (out.length === 0) return out;
  const meanRelative = meanRelativeYield(out);
  if (meanRelative <= 0) throw new TotalLossError(crop.id);
  const scale = referenceYieldTPerHa / meanRelative;
  for (const r of out) r.yieldTPerHa *= scale;
  return out;
}

export interface IncomeResult {
  estimate: MoneyEstimate;
  /** Rotation margin per replayed record year (mean over its main crops), in record-year order. No payments. */
  perYearMargins: number[];
  /** Sum of payments with `confirmed: true` and a sourced rate, per ha. Added to the income, not to marginPerHa. */
  confirmedPaymentsPerHa: number;
  /** Payments left out of the sum and record years left out of the replay. */
  gaps: Message[];
  /** Number of record years replayed. */
  years: number;
  /** False when a record year was left out or a hazard check was missing for a main crop. */
  complete: boolean;
}

const isSourced = (s: Sourced | undefined): s is Sourced & { value: number } =>
  s !== undefined && s.value !== null && Number.isFinite(s.value);

/**
 * The rotation's margin replayed over the record at today's prices. Returns `no-data` (never an estimate) when a main
 * crop lacks a sourced yield, price or direct costs, or a yield response factor, or when no year can be replayed.
 */
export function incomeEstimate(
  years: RotationOption['years'],
  crops: CropTraits[],
  climate: ClimateProfile,
  economics: CropEconomics[],
  payments: MoneyEstimate['payments'],
  currency: MoneyEstimate['currency'],
  campaign: string,
  droughtPercentile: number,
  heatMinDays: number,
): AsyncResult<IncomeResult> {
  const mainIds: CropId[] = [...new Set(years.map((y) => y.crop))];

  const perCrop = new Map<CropId, Map<number, number>>(); // crop → year → margin
  const datasetIds = new Set<string>(climate.source.datasetIds);
  const dates: string[] = [climate.source.retrievedAt];
  let complete = true;
  const calibrationGaps: Message[] = [];
  const borrowedKyGaps: Message[] = [];

  for (const id of mainIds) {
    const econ = economics.find((e) => e.crop === id);
    if (!econ || !isSourced(econ.referenceYieldTPerHa) || !isSourced(econ.pricePerT) || !isSourced(econ.directCostsPerHa)) {
      return { status: 'no-data', reason: { code: 'income.no-price', params: { crop: id } } };
    }
    const crop = crops.find((c) => c.id === id);
    if (!crop) throw new Error(`income: no crop traits for '${id}'`);

    const hits = yearlyHitsDetailed(crop, climate, droughtPercentile, heatMinDays);
    let rows: YearYield[];
    try {
      rows = yearlyYield(crop, climate, econ.referenceYieldTPerHa.value, droughtPercentile, heatMinDays, hits);
    } catch (e) {
      if (e instanceof TotalLossError) return { status: 'no-data', reason: { code: 'income.total-loss-every-year', params: { crop: id } } };
      return { status: 'no-data', reason: { code: 'income.no-yield-response', params: { crop: id } } };
    }
    if (rows.length > 0) {
      const factor = 1 / meanRelativeYield(rows);
      if (factor > CALIBRATION_GAP_FACTOR) calibrationGaps.push({ code: 'gap.income-calibration-large', params: { crop: id, factor: round(factor, 2) } });
    }
    if (hits.missing.length > 0) complete = false;
    // D53: a Ky borrowed from another crop is a weaker basis for the dry-year replay, so the card names it
    if (crop.yieldResponseFactorFrom) borrowedKyGaps.push({ code: 'gap.income-ky-borrowed', params: { crop: id, from: crop.yieldResponseFactorFrom } });

    const price = econ.pricePerT.value;
    const cost = econ.directCostsPerHa.value;
    perCrop.set(id, new Map(rows.map((r) => [r.year, r.yieldTPerHa * price - cost])));
    for (const s of [econ.referenceYieldTPerHa, econ.pricePerT, econ.directCostsPerHa]) {
      s.datasetIds.forEach((d) => datasetIds.add(d));
      dates.push(s.retrievedAt);
    }
  }

  // Rotation margin per year: only years in which every main crop could be replayed.
  const record = recordYears(climate);
  const perYearMargins: number[] = [];
  // Cover crops (D34): no revenue; a sourced direct cost is spread over the rotation years, a missing one is a gap.
  const coverGaps: Message[] = [];
  let coverCostPerYear = 0;
  for (const coverId of [...new Set(years.flatMap((y) => (y.coverCrop === undefined ? [] : [y.coverCrop])))]) {
    coverGaps.push({ code: 'income.cover-no-revenue', params: { crop: coverId } });
    const cost = economics.find((e) => e.crop === coverId)?.directCostsPerHa;
    if (!isSourced(cost)) {
      coverGaps.push({ code: 'gap.cover-cost-missing', params: { crop: coverId } });
      continue;
    }
    const uses = years.filter((y) => y.coverCrop === coverId).length;
    coverCostPerYear += (cost.value * uses) / years.length;
    cost.datasetIds.forEach((d) => datasetIds.add(d));
    dates.push(cost.retrievedAt);
  }

  for (const year of record) {
    const margins = years.map((y) => perCrop.get(y.crop)!.get(year));
    if (margins.some((m) => m === undefined)) continue;
    perYearMargins.push((margins as number[]).reduce((a, b) => a + b, 0) / margins.length - coverCostPerYear);
  }
  if (perYearMargins.length === 0) return { status: 'no-data', reason: { code: 'income.no-climate-years' } };

  const gaps: Message[] = [...coverGaps, ...calibrationGaps, ...borrowedKyGaps];
  // A main crop right after itself, wrapping round the rotation (issue #98): priced as if it followed another crop.
  const afterItself = new Set<CropId>();
  years.forEach((y, i) => {
    const previous = years[(i + years.length - 1) % years.length]!;
    if (previous.crop === y.crop && crops.find((c) => c.id === y.crop)?.kind !== 'perennial') afterItself.add(y.crop);
  });
  for (const crop of afterItself) gaps.push({ code: 'gap.crop-after-itself-not-priced', params: { crop } });
  const leftOut = record.length - perYearMargins.length;
  if (leftOut > 0) {
    complete = false;
    gaps.push({ code: 'gap.income-years-left-out', params: { count: leftOut, years: record.length } });
  }

  let confirmedPaymentsPerHa = 0;
  for (const p of payments) {
    if (!p.confirmed) gaps.push({ code: 'gap.payment-unconfirmed', params: { programme: p.programme } });
    else if (!isSourced(p.amountPerHa)) gaps.push({ code: 'gap.payment-no-rate', params: { programme: p.programme } });
    else confirmedPaymentsPerHa += p.amountPerHa.value;
  }

  const mean = perYearMargins.reduce((a, b) => a + b, 0) / perYearMargins.length;
  const marginPerHa: Sourced = {
    value: round(mean, 2),
    unit: `${currency}/ha`,
    datasetIds: [...datasetIds],
    kind: 'derived',
    retrievedAt: dates.reduce((a, b) => (b > a ? b : a)),
    range: {
      low: round(percentile(perYearMargins, 10), 2),
      high: round(percentile(perYearMargins, 90), 2),
      basis: RANGE_BASIS,
    },
  };

  return {
    status: 'ready',
    data: {
      estimate: { marginPerHa, currency, payments, campaign },
      perYearMargins,
      confirmedPaymentsPerHa,
      gaps,
      years: perYearMargins.length,
      complete,
    },
  };
}

/** What `incomeScores` compares: margin plus confirmed payments, per ha, mean and bad/good year. */
export interface IncomeTotal {
  meanPerHa: number;
  lowPerHa: number; // 10th percentile year + confirmed payments
  highPerHa: number; // 90th percentile year + confirmed payments
  years: number;
  complete: boolean;
}

export function incomeTotal(r: IncomeResult): IncomeTotal {
  const m = r.estimate.marginPerHa;
  const pay = r.confirmedPaymentsPerHa;
  return {
    meanPerHa: (m.value as number) + pay,
    lowPerHa: m.range!.low + pay,
    highPerHa: m.range!.high + pay,
    years: r.years,
    complete: r.complete,
  };
}

/**
 * Income scores of the candidates of one field (SPEC §7, D44). The mean (margin plus confirmed payments) is scaled
 * 0-100 across the candidates: the lowest mean gets 0, the highest 100, and all equal means get 50. The bad-year and
 * good-year range is not put on this scale (clamping it would hide how wide it is); it stays in money in
 * `incomeTotal` and the estimate's `marginPerHa.range`, so the score's own low and high equal its value.
 * Confidence is never strong: 'moderate', or 'weak' when climate data was missing.
 */
export function incomeScores(totals: Record<string, IncomeTotal>): Record<string, Score> {
  const ids = Object.keys(totals);
  if (ids.length === 0) return {};
  const means = ids.map((id) => totals[id]!.meanPerHa);
  const min = Math.min(...means);
  const span = Math.max(...means) - min;
  const scale = (x: number) => (span === 0 ? 50 : round(((x - min) / span) * 100, 1));

  const out: Record<string, Score> = {};
  for (const id of ids) {
    const t = totals[id]!;
    const value = scale(t.meanPerHa);
    out[id] = {
      value,
      low: value,
      high: value,
      confidence: t.complete ? 'moderate' : 'weak',
      basis: { code: 'income.basis.replay', params: { years: t.years } },
    };
  }
  return out;
}
