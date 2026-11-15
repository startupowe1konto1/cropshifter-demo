// ProfileProvider on NASA POWER monthly data.
import hazards from '../../data/rules/hazards.json';
import { SourceError, type ClimateProfile, type Field, type ProfileProvider } from '../contracts';
import { droughtYears, monthlyRisk, toMonthly, yearly, type Thresholds } from './climate';
import { fetchPowerDailyTMax, fetchPowerMonthly, type PowerDailyTMax, type PowerMonthly } from './power';
import { trends } from './trend';

/** A numeric rule value from data/rules/hazards.json, or null when the row is missing, so the summary names the gap. */
function hazardValue(id: string): number | null {
  const row = hazards.find((r) => r.id === id);
  return row && typeof row.value === 'number' ? row.value : null;
}

/** A rule the profile cannot work without (D43): a missing row is an error, not a default. */
function requiredHazardValue(id: string): number {
  const v = hazardValue(id);
  if (v === null) throw new Error(`profile: data/rules/hazards.json has no numeric '${id}'`);
  return v;
}

/** Crop-independent thresholds for the field summary, read from the rule table (D26). Crops keep their own in data/crops. */
export const DEFAULT_THRESHOLDS: Thresholds = {
  droughtPercentile: hazardValue('hazards.drought.percentile') ?? 20,
  heatC: hazardValue('hazards.heat.generalThresholdC'),
  frostDays: hazardValue('hazards.frost.generalThresholdDays'),
  heatMinDays: requiredHazardValue('hazards.heat.minDays'),
};

/** The profile from POWER monthly, plus the daily maxima for heat (D43) when `daily` is given. */
export function buildClimateProfile(power: PowerMonthly, thresholds: Thresholds, daily?: PowerDailyTMax): ClimateProfile {
  const datasetIds = daily ? ['nasa-power-monthly', 'nasa-power-daily'] : ['nasa-power-monthly'];
  const source = { datasetIds, kind: 'model' as const, retrievedAt: power.retrievedAt };
  const monthly = toMonthly(power, daily);
  const years = yearly(monthly, source);
  return {
    source,
    monthly,
    monthlyRisk: monthlyRisk(monthly, thresholds, source),
    yearly: years,
    droughtYears: droughtYears(monthly, thresholds.droughtPercentile),
    trends: trends(years, source),
  };
}

/** Same rounding as the POWER request URL, so two fields that ask for the same point share one request. */
const cacheKey = (lat: number, lon: number) => `${lat.toFixed(4)},${lon.toFixed(4)}`;

export function createPowerProfileProvider(fetchImpl?: typeof fetch, thresholds: Thresholds = DEFAULT_THRESHOLDS): ProfileProvider {
  const cache = new Map<string, Promise<ClimateProfile>>();
  return {
    getClimate(field: Field): Promise<ClimateProfile> {
      const { lat, lon } = field.centroid;
      const key = cacheKey(lat, lon);
      const hit = cache.get(key);
      if (hit) return hit;
      // Monthly and daily come from the same POWER service: if one fails, the profile fails with a source error.
      const pending = Promise.all([fetchPowerMonthly(lat, lon, fetchImpl), fetchPowerDailyTMax(lat, lon, fetchImpl)])
        .then(([p, daily]) => buildClimateProfile(p, thresholds, daily))
        .catch((e: unknown) => {
          cache.delete(key);
          throw e instanceof SourceError
            ? e
            : new SourceError('NASA POWER', `NASA POWER data could not be read: ${e instanceof Error ? e.message : String(e)}`);
        });
      cache.set(key, pending);
      return pending;
    },
  };
}

export const powerProfileProvider: ProfileProvider = createPowerProfileProvider();
