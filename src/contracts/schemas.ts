// zod schemas for the contracts in ./index.ts. Used by tests, fixtures and scripts/validate_data.ts.
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'ISO date expected');
export const valueKind = z.enum(['observation', 'model', 'derived']);

export const sourced = z
  .object({
    value: z.union([z.number(), z.string(), z.boolean(), z.null()]),
    unit: z.string().optional(),
    datasetIds: z.array(z.string().min(1)).min(1),
    kind: valueKind,
    retrievedAt: isoDate,
    range: z.object({ low: z.number(), high: z.number(), basis: z.string().min(1) }).optional(),
    missingReason: z.string().min(1).optional(),
  })
  .refine((v) => v.value !== null || !!v.missingReason, { message: 'missingReason is required when value is null' });

export const dataset = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  url: z.string().url(),
  nasa: z.boolean(),
  resolution: z.string().min(1),
  period: z.string().min(1),
  kind: valueKind,
});

export const message = z.object({
  code: z.string().min(1),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});
export const hazard = z.enum(['drought', 'heat', 'frost']);
export const goalId = z.enum(['keepSoil', 'improveSoil', 'income']);
export const country = z.enum(['US', 'PL', 'OTHER']);
const month = z.number().int().min(1).max(12);

export const score = z
  .object({
    value: z.number().min(0).max(100),
    low: z.number().min(0).max(100),
    high: z.number().min(0).max(100),
    confidence: z.enum(['strong', 'moderate', 'weak']),
    basis: message,
  })
  .refine((s) => s.low <= s.value && s.value <= s.high, { message: 'low <= value <= high expected' });

export const sourceRef = z.object({ title: z.string().min(1), url: z.string().url(), locator: z.string().min(1) });

export const cropTraits = z.object({
  id: z.string().min(1),
  family: z.string().min(1),
  legume: z.boolean(),
  kind: z.enum(['cash', 'cover', 'perennial']),
  sowMonth: month,
  harvestMonth: month,
  sensitive: z.array(
    z.object({ hazard, months: z.array(month).min(1), threshold: z.number(), lossShare: z.number().min(0).max(1) }),
  ),
  waterNeed: z.enum(['low', 'medium', 'high']).optional(),
  yieldResponseFactor: z.number().positive().optional(),
  yieldResponseFactorFrom: z.string().min(1).optional(), // D53: Ky borrowed from this crop
  forage: z.boolean(),
  residueCover: z.enum(['low', 'medium', 'high']),
  sources: z.array(sourceRef).min(1),
}).refine((c) => c.kind === 'cover' || c.waterNeed !== undefined, {
  // yieldResponseFactor is optional for every kind (D29): a missing Ky gives no-data income
  message: 'waterNeed is required unless kind is cover',
}).refine((c) => c.yieldResponseFactorFrom === undefined || c.yieldResponseFactor !== undefined, {
  message: 'yieldResponseFactorFrom needs the borrowed yieldResponseFactor itself (D53)',
});

/** One row of data/rules/*.json. */
export const ruleRow = z.object({
  id: z.string().min(1),
  value: z.union([z.number(), z.string(), z.record(z.string(), z.number())]),
  unit: z.string(),
  appliesTo: z.string().min(1),
  sourceTitle: z.string().min(1),
  sourceUrl: z.string().min(1),
  sourceLocator: z.string().min(1),
  checkedBy: z.string().optional(),
});

/** data/money/<country>.json. Plain numbers with their sources; src/money turns them into Sourced values. */
export const moneyFile = z.object({
  campaign: z.string().min(1), // e.g. 'campaign 2026, check ARiMR'
  currency: z.enum(['USD', 'PLN']),
  economics: z.array(
    z.object({
      crop: z.string().min(1),
      // 'cover': a cover crop is not sold, so its row carries direct costs only (D34, issue #98 item 5)
      kind: z.literal('cover').optional(),
      referenceYieldTPerHa: z.number().positive().nullable().optional(),
      pricePerT: z.number().positive().nullable().optional(),
      directCostsPerHa: z.number().min(0),
      // Each value has its own period (issue #79 item 4): yields are a mean over past years, prices a marketing year
      // or a week, costs a budget year. The old single `year` per row could not say which value it dated, so it is gone.
      // A cover crop is not sold, so it has no yield or price period (D34).
      yieldPeriod: z.string().min(1).optional(), // e.g. '2021–2025 mean'; required unless kind is cover
      pricePeriod: z.string().min(1).optional(), // e.g. '2025 marketing year', '2–8 Nov 2026'; required unless kind is cover
      costsPeriod: z.string().min(1), // e.g. '2026 budget'
      sources: z.array(sourceRef).min(1),
    })
      .refine((r) => r.kind === 'cover' || (typeof r.referenceYieldTPerHa === 'number' && typeof r.pricePerT === 'number'), {
        message: 'referenceYieldTPerHa and pricePerT are required unless kind is cover',
      })
      .refine((r) => r.kind === 'cover' || (r.yieldPeriod !== undefined && r.pricePeriod !== undefined), {
        message: 'yieldPeriod and pricePeriod are required unless kind is cover',
      }),
  ),
  payments: z.array(
    z.object({
      id: z.string().min(1),
      programme: z.string().min(1),
      amountPerHa: z.number().min(0),
      condition: z.string().min(1),
      confirmed: z.boolean(), // false = rate not found in an official document for this campaign; left out of sums
      sources: z.array(sourceRef).min(1),
    }),
  ),
});

/** `meta` block of files in data/precomputed and data/twins. */
export const meta = z.object({ retrievedAt: isoDate, script: z.string().min(1), sourceUrl: z.string().url() });

const asyncResult = <T extends z.ZodTypeAny>(data: T) =>
  z.discriminatedUnion('status', [
    z.object({ status: z.literal('ready'), data }),
    z.object({ status: z.literal('no-data'), reason: message }),
    z.object({ status: z.literal('error'), source: z.string().min(1), reason: message }),
    z.object({ status: z.literal('not-loaded') }),
  ]);

const polygon = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.array(z.number()).min(2)).min(4)).min(1),
});
export const field = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  country,
  polygon,
  centroid: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
  areaHa: z.number().positive(),
  parcelIds: z.array(z.string()).optional(),
});

const rotationYear = z.object({ crop: z.string().min(1), coverCrop: z.string().min(1).optional() });
const nullableNumber = z.number().nullable();

export const climateProfile = z.object({
  source: z.object({ datasetIds: z.array(z.string().min(1)).min(1), kind: valueKind, retrievedAt: isoDate }),
  monthly: z.array(
    z.object({
      year: z.number().int(),
      month,
      rootWetness: nullableNumber,
      rainMm: nullableNumber,
      tMaxC: nullableNumber,
      frostDays: nullableNumber,
      evapotranspirationMm: nullableNumber,
      tMaxDailyC: z.array(nullableNumber).optional(),
    }),
  ),
  monthlyRisk: z.array(z.object({ month, hazard, probability: sourced })),
  yearly: z.array(
    z.object({ year: z.number().int(), growingSeasonWetness: sourced, maxTempC: sourced, frostDays: sourced, rainMm: sourced }),
  ),
  droughtYears: z.array(z.number().int()),
  trends: z.array(
    z.object({ variable: z.string(), direction: z.enum(['up', 'down', 'none']), perDecade: sourced, significant: z.boolean() }),
  ),
});
export const soil = z.object({ sandPct: sourced, clayPct: sourced, organicCarbon: sourced, ph: sourced });
export const fieldProfile = climateProfile.extend({ soil, slopePct: sourced });

export const calendarMonth = z.object({
  yearIndex: z.number().int().min(0),
  month,
  crop: z.string().optional(),
  cover: z.enum(['crop', 'cover-crop', 'residue', 'bare']),
  exposure: z.array(z.object({ hazard, probability: sourced })),
});

export const twinEvidence = z.object({
  cases: z.array(
    z.object({
      regionName: z.string(),
      country,
      similarity: z.number().min(0).max(100),
      crops: z.array(z.string()),
      outcome: sourced,
      years: z.string(),
    }),
  ),
  caseCount: z.number().int().min(0),
  meanSimilarity: z.number().min(0).max(100),
});
export const moneyEstimate = z.object({
  marginPerHa: sourced,
  currency: z.enum(['USD', 'PLN']),
  payments: z.array(z.object({ programme: z.string(), amountPerHa: sourced, condition: message, confirmed: z.boolean() })),
  campaign: z.string().min(1),
});

export const rotationOption = z.object({
  id: z.string().min(1),
  isCurrent: z.boolean(),
  years: z.array(rotationYear).min(1),
  totals: z.object({ keepSoil: asyncResult(score), improveSoil: asyncResult(score), income: asyncResult(score) }),
  rankByGoal: z
    .object({ keepSoil: z.number().int().min(1), improveSoil: z.number().int().min(1), income: z.number().int().min(1) })
    .partial(),
  belowSoilFloor: z.boolean(),
  soilHealth: score,
  indicators: z.object({ nitrogen: score, organicMatter: score, erosion: score, pestBreak: score }).partial(),
  climateResilience: score,
  priorityScores: z.object({ water: score, forage: score, nitrogen: score, erosion: score, organicMatter: score }).partial(),
  income: asyncResult(score),
  why: z.array(message).min(1),
  evidence: z.array(z.object({ message, values: z.array(sourced), ruleIds: z.array(z.string()) })).min(1),
  benefits: z.array(message),
  gaps: z.array(message).min(1),
  localReviewRisks: z.array(message).min(1),
  calendar: z.array(calendarMonth).min(12),
  bareMonths: z.number().min(0),
  twins: asyncResult(twinEvidence),
  money: asyncResult(moneyEstimate),
});

export const analysis = z
  .object({
    field,
    profile: fieldProfile,
    rotations: z.array(rotationOption),
    shownByGoal: z
      .object({ keepSoil: z.array(z.string()), improveSoil: z.array(z.string()), income: z.array(z.string()) })
      .partial(),
    datasets: z.array(dataset).min(1),
    generatedAt: isoDate,
  })
  .refine((a) => a.rotations.length === 0 || a.rotations.filter((r) => r.isCurrent).length === 1, {
    message: 'exactly one rotation must be the current one',
  })
  .refine(
    (a) => Object.values(a.shownByGoal).every((ids) => (ids ?? []).every((id) => a.rotations.some((r) => r.id === id))),
    { message: 'shownByGoal refers to a rotation id that is not in rotations' },
  );
