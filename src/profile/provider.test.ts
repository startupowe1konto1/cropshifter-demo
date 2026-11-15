import hazards from '../../data/rules/hazards.json';
import sample from '../../data/samples/power/point-monthly-1981-2025-ag.json';
import dailySample from '../../data/samples/power/point-daily-tmax-2023-2024-ag.json';
import { SourceError, type Field } from '../contracts';
import { climateProfile, fieldProfile } from '../contracts/schemas';
import { parsePowerDailyTMax, parsePowerMonthly } from './power';
import { DEFAULT_THRESHOLDS, buildClimateProfile, createPowerProfileProvider } from './provider';

const RETRIEVED = '2026-11-14';
const clone = (): any => JSON.parse(JSON.stringify(sample));

const field: Field = {
  id: 'f1',
  name: 'Test field',
  country: 'US',
  polygon: { type: 'Polygon', coordinates: [[[-93.6, 42], [-93.59, 42], [-93.59, 42.01], [-93.6, 42.01], [-93.6, 42]]] },
  centroid: { lat: 42, lon: -93.6 },
  areaHa: 50,
};

const okResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
/** A fetch that answers the monthly URL with `monthly` and the daily URL (D43) with the saved daily sample. */
const routed = (monthly: unknown) => async (url: string | URL | Request) =>
  okResponse(String(url).includes('/temporal/daily/') ? dailySample : monthly);

describe('createPowerProfileProvider thresholds', () => {
  it('passes thresholds through, so heat and frost come from hazards.json with one line', async () => {
    const fetchImpl = vi.fn(routed(sample));
    const provider = createPowerProfileProvider(fetchImpl as unknown as typeof fetch, { droughtPercentile: 20, heatC: 30, frostDays: 10, heatMinDays: 3 });
    const profile = await provider.getClimate(field);
    const julyHeat = profile.monthlyRisk.find((r) => r.month === 7 && r.hazard === 'heat')!;
    expect(julyHeat.probability.value).not.toBeNull();
  });
});

describe('buildClimateProfile from the saved sample', () => {
  const profile = buildClimateProfile(parsePowerMonthly(sample, RETRIEVED), DEFAULT_THRESHOLDS);

  it('has 540 monthly rows, 36 risk entries and 45 years', () => {
    expect(profile.monthly).toHaveLength(540);
    expect(profile.monthlyRisk).toHaveLength(36);
    expect(profile.yearly).toHaveLength(45);
  });

  it('marks the series as a NASA POWER model estimate', () => {
    expect(profile.source).toEqual({ datasetIds: ['nasa-power-monthly'], kind: 'model', retrievedAt: RETRIEVED });
  });

  it('parses with the ClimateProfile schema', () => {
    expect(() => climateProfile.parse(profile)).not.toThrow();
  });

  it('uses the 20th percentile from hazards.drought.percentile, so drought is 9 of 45 years', () => {
    const drought = profile.monthlyRisk.filter((r) => r.hazard === 'drought');
    expect(drought).toHaveLength(12);
    for (const r of drought) expect(r.probability.value).toBeCloseTo(9 / 45, 10);
    expect(profile.droughtYears.length).toBeGreaterThanOrEqual(9);
  });

  it('has heat and frost probabilities from the crop-independent thresholds in hazards.json', () => {
    const other = profile.monthlyRisk.filter((r) => r.hazard !== 'drought');
    expect(other).toHaveLength(24);
    // Every month gets a share between 0 and 1, and the Iowa record has frost in winter and none in summer.
    expect(other.every((r) => typeof r.probability.value === 'number' && r.probability.value >= 0 && r.probability.value <= 1)).toBe(true);
    const frost = (month: number) => other.find((r) => r.hazard === 'frost' && r.month === month)?.probability.value ?? NaN;
    expect(frost(1)).toBeGreaterThan(frost(7));
  });

  it('returns four trends', () => {
    expect(profile.trends.map((t) => t.variable)).toEqual(['growingSeasonWetness', 'maxTempC', 'rainMm', 'frostDays']);
  });
});

describe('powerProfileProvider', () => {
  it('fetches POWER for the field centroid and keeps a null month as null', async () => {
    const body = clone();
    body.properties.parameter.GWETROOT['202507'] = -999;
    const fetchImpl = vi.fn(routed(body));
    const provider = createPowerProfileProvider(fetchImpl as unknown as typeof fetch);
    const profile = await provider.getClimate(field);

    // one monthly and one daily request (D43), both for the centroid
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map((c) => String(c[0])).every((u) => u.includes('latitude=42'))).toBe(true);
    expect(profile.source.datasetIds).toEqual(['nasa-power-monthly', 'nasa-power-daily']);
    const july = profile.monthly.find((m) => m.year === 2025 && m.month === 7)!;
    expect(july.rootWetness).toBeNull();
    expect(july.tMaxC).not.toBeNull();
    const y2025 = profile.yearly.find((y) => y.year === 2025)!;
    expect(y2025.growingSeasonWetness.value).toBeNull();
    expect(y2025.growingSeasonWetness.missingReason).toMatch(/2025/);
    expect(profile.droughtYears).not.toContain(2025);

    const parsed = fieldProfile.safeParse({
      ...profile,
      soil: {
        sandPct: { value: null, datasetIds: ['test'], kind: 'observation', retrievedAt: RETRIEVED, missingReason: 'test' },
        clayPct: { value: null, datasetIds: ['test'], kind: 'observation', retrievedAt: RETRIEVED, missingReason: 'test' },
        organicCarbon: { value: null, datasetIds: ['test'], kind: 'observation', retrievedAt: RETRIEVED, missingReason: 'test' },
        ph: { value: null, datasetIds: ['test'], kind: 'observation', retrievedAt: RETRIEVED, missingReason: 'test' },
      },
      slopePct: { value: null, datasetIds: ['test'], kind: 'observation', retrievedAt: RETRIEVED, missingReason: 'test' },
    });
    expect(parsed.success).toBe(true);
  });

  it('caches by location and asks POWER once', async () => {
    const fetchImpl = vi.fn(routed(clone()));
    const provider = createPowerProfileProvider(fetchImpl as unknown as typeof fetch);
    const [a, b] = await Promise.all([provider.getClimate(field), provider.getClimate({ ...field, id: 'f2' })]);
    expect(a).toBe(b);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('passes a SourceError through and does not cache the failure', async () => {
    const ok = routed(clone());
    let first = true;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      // the first daily request fails; the monthly one succeeds, so a daily failure alone fails the profile
      if (first && String(url).includes('/temporal/daily/')) {
        first = false;
        return new Response('busy', { status: 503 });
      }
      return ok(url);
    });
    const provider = createPowerProfileProvider(fetchImpl as unknown as typeof fetch);
    const error = await provider.getClimate(field).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SourceError);
    expect((error as SourceError).source).toBe('NASA POWER');
    await expect(provider.getClimate(field)).resolves.toMatchObject({ yearly: expect.any(Array) });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('turns a network failure into a SourceError', async () => {
    const provider = createPowerProfileProvider((async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch);
    await expect(provider.getClimate(field)).rejects.toBeInstanceOf(SourceError);
  });
});

describe('DEFAULT_THRESHOLDS', () => {
  it('reads drought, heat and frost from data/rules/hazards.json, so the field summary follows the rule table', () => {
    const value = (id: string) => hazards.find((r) => r.id === id)?.value;
    expect(DEFAULT_THRESHOLDS.droughtPercentile).toBe(value('hazards.drought.percentile'));
    expect(DEFAULT_THRESHOLDS.heatC).toBe(value('hazards.heat.generalThresholdC'));
    expect(DEFAULT_THRESHOLDS.frostDays).toBe(value('hazards.frost.generalThresholdDays'));
    expect(DEFAULT_THRESHOLDS.heatMinDays).toBe(value('hazards.heat.minDays'));
    expect(DEFAULT_THRESHOLDS.heatC).not.toBeNull();
    expect(DEFAULT_THRESHOLDS.frostDays).not.toBeNull();
  });
});

describe('buildClimateProfile with the daily record (D43)', () => {
  const daily = parsePowerDailyTMax(dailySample);
  const profile = buildClimateProfile(parsePowerMonthly(sample, RETRIEVED), DEFAULT_THRESHOLDS, daily);

  it('carries the daily maxima on each month and names both POWER datasets', () => {
    expect(profile.source.datasetIds).toEqual(['nasa-power-monthly', 'nasa-power-daily']);
    expect(profile.monthly.find((m) => m.year === 2023 && m.month === 7)!.tMaxDailyC).toEqual(daily.get(202307));
    expect(profile.monthly.find((m) => m.year === 1990 && m.month === 7)!.tMaxDailyC).toEqual([]); // not in the 2-year sample
    expect(() => climateProfile.parse(profile)).not.toThrow();
  });

  it('counts heat months from hot days, so August 2023 (6 days above 35 °C) is a heat month and August 2024 (2) is not', () => {
    const augHeat = profile.monthlyRisk.find((r) => r.month === 8 && r.hazard === 'heat')!.probability;
    expect(augHeat.datasetIds).toEqual(['nasa-power-daily']);
    // only 2023 and 2024 have daily values in the sample; 1 of the 2 Augusts has 3 or more days above 35 °C
    expect(augHeat.value).toBe(0.5);
  });
});
