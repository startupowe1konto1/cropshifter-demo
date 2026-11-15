// Similarity between a field and the regions of the case base (SPEC section 9): Euclidean distance on z-scored features,
// shown as 0–100. 100 = identical; 0 = as far apart as two standard deviations in every feature, in opposite directions.
import type { ClimateProfile } from '../contracts';

export type Features = Record<string, number>;
export type ZStats = Record<string, { mean: number; sd: number }>;

/** Mean and standard deviation (population) of each feature over the case base. Features with no spread are dropped. */
export function zStats(rows: Features[]): ZStats {
  const out: ZStats = {};
  const keys = new Set(rows.flatMap((r) => Object.keys(r)));
  for (const key of keys) {
    const values = rows.map((r) => r[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (values.length < 2) continue;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    if (sd > 0) out[key] = { mean, sd };
  }
  return out;
}

/** 0–100 from the z-scored Euclidean distance over the features both sides have. */
export function similarity(a: Features, b: Features, stats: ZStats): number {
  const keys = Object.keys(stats).filter((k) => typeof a[k] === 'number' && typeof b[k] === 'number');
  if (keys.length === 0) return 0;
  const distance = Math.sqrt(keys.reduce((sum, k) => sum + ((a[k]! - b[k]!) / stats[k]!.sd) ** 2, 0));
  const zeroAt = 4 * Math.sqrt(keys.length); // 2 SD either side in every feature
  return 100 * Math.max(0, 1 - distance / zeroAt);
}

const GROWING_SEASON = new Set([4, 5, 6, 7, 8, 9]);
const FIRST_YEAR = 2001; // the case base uses the NASA POWER climatology of 2001–2025

const mean = (xs: number[]) => (xs.length === 0 ? undefined : xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * The case-base features computed from the field's own NASA POWER monthly record, 2001 onward, built the same way as
 * scripts/twins_features.py. gsMeanTempC is left out: the field profile has no monthly mean temperature.
 */
export function fieldFeatures(monthly: ClimateProfile['monthly']): Features {
  const rows = monthly.filter((r) => r.year >= FIRST_YEAR);
  const years = [...new Set(rows.map((r) => r.year))].sort();
  const perYear = (pick: (yearRows: typeof rows) => number | undefined) =>
    mean(years.map((y) => pick(rows.filter((r) => r.year === y))).filter((v): v is number => v !== undefined));
  const sum = (xs: (number | null)[]) => {
    const values = xs.filter((v): v is number => v !== null);
    return values.length === 0 ? undefined : values.reduce((a, b) => a + b, 0);
  };
  const season = (yr: typeof rows) => yr.filter((r) => GROWING_SEASON.has(r.month));

  const features: Record<string, number | undefined> = {
    gsRainMm: perYear((yr) => sum(season(yr).map((r) => r.rainMm))),
    gsRootZoneWetness: mean(season(rows).map((r) => r.rootWetness).filter((v): v is number => v !== null)),
    frostDaysPerYear: perYear((yr) => sum(yr.map((r) => r.frostDays))),
    yearlyMaxTempC: perYear((yr) => {
      const t = yr.map((r) => r.tMaxC).filter((v): v is number => v !== null);
      return t.length === 0 ? undefined : Math.max(...t);
    }),
  };
  return Object.fromEntries(Object.entries(features).filter((e): e is [string, number] => e[1] !== undefined));
}
