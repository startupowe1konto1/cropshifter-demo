import { mannKendall, trends } from './trend';
import type { ClimateProfile, Sourced } from '../contracts';

describe('mannKendall', () => {
  it('finds a significant upward trend in a strictly rising series', () => {
    const r = mannKendall(Array.from({ length: 20 }, (_, i) => i * 0.5));
    expect(r.direction).toBe('up');
    expect(r.significant).toBe(true);
    expect(r.p).toBeLessThan(0.05);
    expect(r.sen).toBeCloseTo(0.5, 10);
    expect(r.z).toBeGreaterThan(0);
  });

  it('finds a significant downward trend in a strictly falling series', () => {
    const r = mannKendall(Array.from({ length: 20 }, (_, i) => 10 - i));
    expect(r.direction).toBe('down');
    expect(r.significant).toBe(true);
    expect(r.sen).toBeCloseTo(-1, 10);
  });

  it("returns 'none' for a constant series", () => {
    const r = mannKendall(Array(30).fill(3));
    expect(r.direction).toBe('none');
    expect(r.significant).toBe(false);
    expect(r.sen).toBe(0);
    expect(r.z).toBe(0);
    expect(r.p).toBe(1);
  });

  it("returns 'none' for an alternating series with no trend", () => {
    const r = mannKendall(Array.from({ length: 30 }, (_, i) => (i % 2 ? 1 : 0)));
    expect(r.direction).toBe('none');
    expect(r.significant).toBe(false);
  });

  it('matches the S statistic and p of the trend spike for a small series', () => {
    // x = [1, 3, 2, 4, 5]: S = 8, Var = 5*4*15/18 = 16.667, z = 7/4.0825 = 1.7146, p = 0.0864
    const r = mannKendall([1, 3, 2, 4, 5]);
    expect(r.z).toBeCloseTo(1.7146, 3);
    expect(r.p).toBeCloseTo(0.0864, 3);
    expect(r.significant).toBe(false);
    expect(r.direction).toBe('none');
  });

  it('uses the given time steps for the Sen slope when years are missing', () => {
    // y = 2 * year, with 1983 missing
    const r = mannKendall([2, 4, 8, 10, 12, 14, 16, 18, 20, 22], [1, 2, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(r.sen).toBeCloseTo(2, 10);
  });

  it('is not significant with fewer than three points', () => {
    expect(mannKendall([1, 2]).significant).toBe(false);
    expect(mannKendall([]).direction).toBe('none');
  });
});

const D = (value: number | null): Sourced =>
  value === null
    ? { value, datasetIds: ['nasa-power-monthly'], kind: 'derived', retrievedAt: '2026-11-14', missingReason: 'gap' }
    : { value, datasetIds: ['nasa-power-monthly'], kind: 'derived', retrievedAt: '2026-11-14' };

describe('trends', () => {
  const yearly: ClimateProfile['yearly'] = Array.from({ length: 45 }, (_, i) => ({
    year: 1981 + i,
    growingSeasonWetness: D(i === 10 ? null : 0.6 - i * 0.002),
    maxTempC: D(30 + i * 0.03),
    frostDays: D(100),
    rainMm: D(800 + (i % 2 ? 50 : -50)),
  }));
  const source = { retrievedAt: '2026-11-14' };

  it('returns one trend per variable with a per-decade Sen slope', () => {
    const t = trends(yearly, source);
    expect(t.map((x) => x.variable)).toEqual(['growingSeasonWetness', 'maxTempC', 'rainMm', 'frostDays']);
    const temp = t.find((x) => x.variable === 'maxTempC')!;
    expect(temp.direction).toBe('up');
    expect(temp.significant).toBe(true);
    expect(temp.perDecade.value).toBeCloseTo(0.3, 6);
    expect(temp.perDecade).toMatchObject({ kind: 'derived', datasetIds: ['nasa-power-monthly'], unit: '°C per decade' });
  });

  it('skips null years and still finds the trend', () => {
    const wet = trends(yearly, source).find((x) => x.variable === 'growingSeasonWetness')!;
    expect(wet.direction).toBe('down');
    expect(wet.perDecade.value).toBeCloseTo(-0.02, 6);
  });

  it("reports 'none' for a flat variable", () => {
    const frost = trends(yearly, source).find((x) => x.variable === 'frostDays')!;
    expect(frost.direction).toBe('none');
    expect(frost.significant).toBe(false);
    expect(frost.perDecade.value).toBe(0);
  });

  it('gives a null perDecade with a reason when too few years have data', () => {
    const sparse = yearly.map((y, i) => ({ ...y, rainMm: D(i < 2 ? 800 : null) }));
    const rain = trends(sparse, source).find((x) => x.variable === 'rainMm')!;
    expect(rain.perDecade.value).toBeNull();
    expect(rain.perDecade.missingReason).toMatch(/years/);
    expect(rain.direction).toBe('none');
    expect(rain.significant).toBe(false);
  });
});
