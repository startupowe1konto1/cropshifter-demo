// Climate resilience score and calendar exposure (SPEC section 7 "Climate resilience", section 8 "Calendar strip").
// Both use the same per-crop hazard checks from `yearlyHits`, so the calendar marks and the score always agree.
//
// Hazard checks, per record year and per (hazard, month) the crop is sensitive to:
// - drought (D42, replaces D30): the month's root-zone wetness is strictly below `droughtLimit`, the drought
//   percentile (rule `hazards.drought.percentile` in data/rules/hazards.json, passed in by the caller) of the SAME
//   calendar month over the field's record (July against every July), missing years left out. This is how drought
//   indices compare a month (WMO SPI User Guide, U.S. Drought Monitor percentiles), and it lets a dry spring count:
//   pooling all months (D30) meant a spring month could almost never be a drought. By construction a month is a
//   drought in about that percentile's share of years at every field; crops differ by how many months they need.
//   The crop's own `threshold` is not used for drought. Percentiles use linear interpolation between closest ranks
//   (h = (n − 1) · p). "Strictly below" (D26) means a month exactly at the limit is not a drought.
//   Every drought row also carries `shortfallVsMedian` for income (SPEC section 7): the shortfall of the month's
//   wetness against the median of the same calendar month over the record, as a share of that median, in every
//   year below it, hit or not; 0 at or above the median.
// - heat (D43): at least `heatMinDays` days of the month have a daily maximum (NASA POWER daily T2M_MAX,
//   `tMaxDailyC`) above the crop's `threshold`. A month without daily values in the record (`tMaxDailyC` absent:
//   fixtures and profiles built before D43) falls back to the monthly maximum `tMaxC` above `threshold`, which is
//   the same check with one day. A month whose daily list has no value is missing.
// - frost: the month's frost days are above `threshold`.
// A check reads the record month of the same calendar year as the record year (a climatological frequency: for a
// winter crop the autumn months come from the same record year, not the previous one).
import type { CalendarMonth, ClimateProfile, CropId, CropTraits, Hazard, Message, RotationOption, Score } from '../contracts';

/** Every Message code this module emits. The English text for each lives in src/engine/messages/en.json (task O3-B6). */
export const RESILIENCE_MESSAGE_CODES = [
  // "Share of crop-years at this field with no drought, heat or frost in the crop's sensitive months, {years} years ({from}–{to}). The range runs from the 10th to the 90th percentile year."
  'resilience.basis.years',
  // "Share of crop-years at this field with no drought, heat or frost in the crop's sensitive months, {years} years ({from}–{to}). {count} of the {needed} months the crops need are missing ..."
  'resilience.basis.missing-months',
] as const;

type Row = ClimateProfile['monthly'][number];

export interface HazardHit {
  year: number;
  month: number;
  hazard: Hazard;
  hit: boolean;
  /**
   * Drought rows: (median − wetness) / median for the same calendar month, in every year below that median, hit or
   * not; 0 at or above it. Heat and frost rows: null (no wetness is checked).
   */
  shortfallVsMedian: number | null;
}
export interface MissingCheck { year: number; month: number; hazard: Hazard }

const VARIABLE: Record<Hazard, 'rootWetness' | 'tMaxC' | 'frostDays'> = {
  drought: 'rootWetness',
  heat: 'tMaxC',
  frost: 'frostDays',
};

/** Percentile p (0–100) of the values by linear interpolation between closest ranks. Needs at least one value. */
export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const h = (sorted.length - 1) * (p / 100);
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (h - lo) * (b - a);
}

function checkPercentile(p: number): void {
  if (!Number.isFinite(p) || p < 0 || p > 100) {
    throw new Error(`resilience: drought percentile must be a number in 0..100, got ${p}`);
  }
}

/**
 * The drought limit of one calendar month (D42): percentile `droughtPercentile` of that month's root-zone wetness over
 * every year of the record, missing years left out. Null when the month has no wetness value in the record.
 */
export function droughtLimit(climate: ClimateProfile, month: number, droughtPercentile: number): number | null {
  checkPercentile(droughtPercentile);
  const values = climate.monthly
    .filter((r) => r.month === month)
    .map((r) => r.rootWetness)
    .filter((v): v is number => v !== null);
  return values.length > 0 ? percentile(values, droughtPercentile) : null;
}

function checkMinDays(d: number): void {
  if (!Number.isInteger(d) || d < 1) throw new Error(`resilience: heat minimum days must be a whole number ≥ 1, got ${d}`);
}

/** Heat check of one month: true/false, or null when the month has no temperature in the record. */
function heatHit(row: Row | undefined, threshold: number, heatMinDays: number): boolean | null {
  if (!row) return null;
  if (row.tMaxDailyC !== undefined) {
    const days = row.tMaxDailyC.filter((v): v is number => v !== null);
    if (days.length === 0) return null;
    return days.filter((v) => v > threshold).length >= heatMinDays;
  }
  return row.tMaxC === null ? null : row.tMaxC > threshold;
}

const round = (x: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

/** The years the record spans, first to last, including years with no rows. */
export function recordYears(climate: ClimateProfile): number[] {
  if (climate.monthly.length === 0) return [];
  const ys = climate.monthly.map((r) => r.year);
  const from = Math.min(...ys);
  const to = Math.max(...ys);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

const rowIndex = (climate: ClimateProfile) => {
  const index = new Map<string, Row>();
  for (const row of climate.monthly) index.set(`${row.year}-${row.month}`, row);
  return (year: number, month: number) => index.get(`${year}-${month}`);
};

/**
 * Hazard checks of one crop over the record, plus the checks that could not be made because the input month is
 * missing (no row, or the needed value is null). Missing checks get no row in `rows`.
 */
export function yearlyHitsDetailed(
  crop: CropTraits,
  climate: ClimateProfile,
  droughtPercentile: number,
  heatMinDays = 1,
): { rows: HazardHit[]; missing: MissingCheck[] } {
  checkPercentile(droughtPercentile);
  checkMinDays(heatMinDays);
  const years = recordYears(climate);
  const get = rowIndex(climate);
  const rows: HazardHit[] = [];
  const missing: MissingCheck[] = [];

  for (const s of crop.sensitive) {
    const variable = VARIABLE[s.hazard];
    for (const month of s.months) {
      if (s.hazard === 'heat') {
        for (const year of years) {
          const hit = heatHit(get(year, month), s.threshold, heatMinDays);
          if (hit === null) missing.push({ year, month, hazard: s.hazard });
          else rows.push({ year, month, hazard: s.hazard, hit, shortfallVsMedian: null });
        }
        continue;
      }
      const values = years.map((year) => get(year, month)?.[variable] ?? null);
      const present = values.filter((v): v is number => v !== null);
      const drought = s.hazard === 'drought' && present.length > 0;
      const median = drought ? percentile(present, 50) : 0;
      const limit = drought ? percentile(present, droughtPercentile) : 0;

      years.forEach((year, i) => {
        const v = values[i] ?? null;
        if (v === null) {
          missing.push({ year, month, hazard: s.hazard });
          return;
        }
        if (s.hazard === 'drought') {
          const hit = v < limit;
          const shortfallVsMedian = median > 0 ? Math.max(0, (median - v) / median) : 0;
          rows.push({ year, month, hazard: s.hazard, hit, shortfallVsMedian });
        } else {
          rows.push({ year, month, hazard: s.hazard, hit: v > s.threshold, shortfallVsMedian: null });
        }
      });
    }
  }
  return { rows, missing };
}

/** One row per record year × each (hazard, month) the crop is sensitive to. Missing input months are omitted. */
export function yearlyHits(crop: CropTraits, climate: ClimateProfile, droughtPercentile: number, heatMinDays = 1): HazardHit[] {
  return yearlyHitsDetailed(crop, climate, droughtPercentile, heatMinDays).rows;
}

function cropById(crops: CropTraits[], id: CropId): CropTraits {
  const crop = crops.find((c) => c.id === id);
  if (!crop) throw new Error(`resilience: no crop traits for '${id}'`);
  return crop;
}

/**
 * Share of the needed input months (record year × sensitive month of the scored crops) that may be missing before
 * the score's confidence drops from 'moderate' to 'weak'. Our own cut-off, no published source: up to 10% missing
 * still leaves at least 40 of 45 years per month, so the score rests on most of the record.
 */
export const WEAK_CONFIDENCE_MISSING_SHARE = 0.1;

/** Dataset id of the NASA POWER daily record (src/profile/datasets.ts), read only by the heat check. */
const DAILY_DATASET_ID = 'nasa-power-daily';

/**
 * Climate resilience of a rotation: the share of crop-years (main crop × record year) without a hazard hit, × 100.
 * Cover crops are not scored. A crop-year is hit when any of its checks hit; a crop-year with no hit but a missing
 * check is unknown and left out (never counted as safe). low/high = 10th and 90th percentile of the per-year share
 * of the rotation's crops without a hit.
 */
export function resilienceScore(
  years: RotationOption['years'],
  crops: CropTraits[],
  climate: ClimateProfile,
  droughtPercentile: number,
  heatMinDays = 1,
): Score {
  checkPercentile(droughtPercentile);
  if (years.length === 0) throw new Error('resilience: empty rotation');
  const record = recordYears(climate);
  if (record.length === 0) throw new Error('resilience: empty climate record');
  const from = record[0] as number;
  const to = record[record.length - 1] as number;

  const mains = years.map((y) => cropById(crops, y.crop));
  const checks = new Map<CropId, { hit: Set<number>; missing: Set<number> }>();
  const neededMonths = new Set<string>();
  const missingMonths = new Set<string>();

  for (const crop of mains) {
    if (checks.has(crop.id)) continue;
    const { rows, missing } = yearlyHitsDetailed(crop, climate, droughtPercentile, heatMinDays);
    checks.set(crop.id, {
      hit: new Set(rows.filter((r) => r.hit).map((r) => r.year)),
      missing: new Set(missing.map((m) => m.year)),
    });
    for (const s of crop.sensitive) for (const m of s.months) for (const y of record) neededMonths.add(`${y}-${m}`);
    for (const m of missing) missingMonths.add(`${m.year}-${m.month}`);
  }

  let known = 0;
  let safe = 0;
  const perYear: number[] = [];
  for (const year of record) {
    let yearKnown = 0;
    let yearSafe = 0;
    for (const crop of mains) {
      const c = checks.get(crop.id)!;
      if (c.hit.has(year)) yearKnown++;
      else if (!c.missing.has(year)) {
        yearKnown++;
        yearSafe++;
      }
    }
    known += yearKnown;
    safe += yearSafe;
    if (yearKnown > 0) perYear.push(yearSafe / yearKnown);
  }
  if (known === 0) throw new Error('resilience: no crop-year could be checked against the climate record');

  const value = round((safe / known) * 100, 1);
  // The 10th–90th percentile years usually bracket the mean; clamp so the range always contains the value.
  const low = Math.min(value, round(percentile(perYear, 10) * 100, 1));
  const high = Math.max(value, round(percentile(perYear, 90) * 100, 1));

  const count = missingMonths.size;
  const needed = neededMonths.size;
  const yearsParams = { years: record.length, from, to };
  let confidence: Score['confidence'] = 'strong';
  let basis: Message = { code: 'resilience.basis.years', params: yearsParams };
  if (count > 0) {
    confidence = count / needed > WEAK_CONFIDENCE_MISSING_SHARE ? 'weak' : 'moderate';
    basis = { code: 'resilience.basis.missing-months', params: { count, needed, ...yearsParams } };
  }
  return { value, low, high, confidence, basis };
}

/**
 * Adds hazard marks to calendar cells. A cell with a crop or cover crop in the ground gets one entry per hazard the
 * crop is sensitive to that month, with the share of record years with a hit (from `yearlyHits`):
 * - heat and frost: when that share is above `markShare` (rule `hazards.calendar.markShare` in data/rules/hazards.json);
 * - drought: whenever any year is a drought. Drought is measured against the same calendar month (D42), so its share
 *   is about the drought percentile in every month and would sit at `markShare` itself; the mark shows the months in
 *   which the crop is sensitive to a dry spell, with that share.
 * Other cells get no entries. `droughtPercentile` and `heatMinDays` are the values the caller passes to `resilienceScore`.
 *
 * Cover crops are marked here but not scored by `resilienceScore`. The marks and the score agree only while cover
 * crops have no sensitive months; a cover crop with one (e.g. red clover, drought in August) gets a mark that the
 * score does not count.
 */
export function withExposure(
  months: Omit<CalendarMonth, 'exposure'>[],
  crops: CropTraits[],
  climate: ClimateProfile,
  markShare: number,
  droughtPercentile: number,
  heatMinDays = 1,
): CalendarMonth[] {
  checkPercentile(droughtPercentile);
  const cache = new Map<CropId, HazardHit[]>();
  // Only heat reads the daily record (D43); drought and frost marks cite the monthly series alone.
  const idsFor = (hazard: Hazard) =>
    hazard === 'heat' ? climate.source.datasetIds : climate.source.datasetIds.filter((id) => id !== DAILY_DATASET_ID);
  const hitsOf = (crop: CropTraits) => {
    let rows = cache.get(crop.id);
    if (!rows) {
      rows = yearlyHits(crop, climate, droughtPercentile, heatMinDays);
      cache.set(crop.id, rows);
    }
    return rows;
  };

  return months.map((cell) => {
    if ((cell.cover !== 'crop' && cell.cover !== 'cover-crop') || !cell.crop) return { ...cell, exposure: [] };
    const crop = cropById(crops, cell.crop);
    const exposure: CalendarMonth['exposure'] = [];
    for (const s of crop.sensitive) {
      if (!s.months.includes(cell.month)) continue;
      const rows = hitsOf(crop).filter((r) => r.month === cell.month && r.hazard === s.hazard);
      if (rows.length === 0) continue; // the whole record is missing for this month: no mark, nothing invented
      const share = rows.filter((r) => r.hit).length / rows.length;
      if (s.hazard === 'drought' ? share === 0 : share <= markShare) continue;
      exposure.push({
        hazard: s.hazard,
        probability: {
          value: round(share, 3),
          unit: 'share of years',
          datasetIds: idsFor(s.hazard),
          kind: 'derived',
          retrievedAt: climate.source.retrievedAt,
        },
      });
    }
    return { ...cell, exposure };
  });
}
