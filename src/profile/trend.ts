// Mann-Kendall trend test with the Sen slope.
// Ported from data/samples/power/trend-spike.html, with two additions:
// - the variance carries the usual correction for tied values (Hirsch & Slack 1984), so a
//   series of rounded values is not over-confident and a constant series gives z = 0, p = 1;
// - optional time steps, so the Sen slope stays per year when some years are missing.
import type { ClimateProfile, Sourced } from '../contracts';

export interface MannKendallResult {
  z: number;
  p: number;      // two-sided
  sen: number;    // median pairwise slope, per time step
  direction: 'up' | 'down' | 'none';
  significant: boolean; // p < 0.05
}

const ALPHA = 0.05;

/** Complementary error function. Numerical Recipes approximation, |error| < 1.2e-7. */
export function erfc(x: number): number {
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.5 * ax);
  const r =
    t *
    Math.exp(
      -ax * ax -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

function median(sorted: number[]): number {
  const m = sorted.length;
  if (m === 0) return 0;
  return m % 2 ? sorted[(m - 1) / 2]! : (sorted[m / 2 - 1]! + sorted[m / 2]!) / 2;
}

/**
 * @param series values in time order
 * @param times  time of each value (e.g. the year); defaults to 0, 1, 2, ...
 */
export function mannKendall(series: number[], times?: number[]): MannKendallResult {
  const n = series.length;
  const t = times ?? series.map((_, i) => i);
  if (n < 3) return { z: 0, p: 1, sen: 0, direction: 'none', significant: false };

  let s = 0;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = series[j]! - series[i]!;
      s += Math.sign(dx);
      slopes.push(dx / (t[j]! - t[i]!));
    }
  }

  const ties = new Map<number, number>();
  for (const v of series) ties.set(v, (ties.get(v) ?? 0) + 1);
  let tieTerm = 0;
  for (const c of ties.values()) if (c > 1) tieTerm += c * (c - 1) * (2 * c + 5);
  const v = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;

  const z = v <= 0 ? 0 : s > 0 ? (s - 1) / Math.sqrt(v) : s < 0 ? (s + 1) / Math.sqrt(v) : 0;
  const p = Math.min(1, erfc(Math.abs(z) / Math.SQRT2));
  slopes.sort((a, b) => a - b);
  const sen = median(slopes);
  const significant = p < ALPHA;
  const direction = !significant || sen === 0 ? 'none' : sen > 0 ? 'up' : 'down';
  return { z, p, sen, direction, significant };
}

type Yearly = ClimateProfile['yearly'][number];
type Trend = ClimateProfile['trends'][number];
const VARIABLES: { variable: 'growingSeasonWetness' | 'maxTempC' | 'rainMm' | 'frostDays'; unit: string }[] = [
  { variable: 'growingSeasonWetness', unit: 'share of saturation per decade' },
  { variable: 'maxTempC', unit: '°C per decade' },
  { variable: 'rainMm', unit: 'mm per decade' },
  { variable: 'frostDays', unit: 'days per decade' },
];
const MIN_YEARS = 3;
const DATASET_IDS = ['nasa-power-monthly'];

/** Mann-Kendall trend per yearly variable; perDecade = Sen slope x 10. Years with a null value are skipped. */
export function trends(yearly: Yearly[], source: { retrievedAt: string }): Trend[] {
  return VARIABLES.map(({ variable, unit }) => {
    const points = yearly.flatMap((y) => {
      const value = y[variable].value;
      return typeof value === 'number' ? [{ year: y.year, value }] : [];
    });
    const base = { unit, datasetIds: DATASET_IDS, kind: 'derived' as const, retrievedAt: source.retrievedAt };
    if (points.length < MIN_YEARS) {
      const perDecade: Sourced = { ...base, value: null, missingReason: `fewer than ${MIN_YEARS} years with data` };
      return { variable, direction: 'none', perDecade, significant: false };
    }
    const r = mannKendall(
      points.map((p) => p.value),
      points.map((p) => p.year),
    );
    return { variable, direction: r.direction, perDecade: { ...base, value: r.sen * 10 }, significant: r.significant };
  });
}
