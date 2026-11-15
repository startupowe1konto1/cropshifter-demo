// Card texts as message codes (why, evidence, benefits, gaps, local review risks). The English lives in
// messages/en.json. Pure: everything the card says comes in through `CardInput`.
import type {
  CalendarMonth,
  ClimateProfile,
  CropId,
  CropTraits,
  Evidence,
  GoalId,
  IndicatorId,
  Message,
  PriorityId,
  RotationOption,
  Score,
  Sourced,
} from '../contracts';
import { cropById } from './calendar';
import { recordYears } from './resilience';

type Years = RotationOption['years'];

/** Every code this module emits, besides the ones listed in resilience.ts, soilHealth.ts and priorityScores.ts. */
export const CARD_MESSAGE_CODES = [
  'why.rank.keepSoil',
  'why.rank.improveSoil',
  'why.rank.income',
  'why.current',
  'why.history.farmer',
  'why.history.cropscape',
  'evidence.history-cropscape',
  'why.cover-crop',
  'why.legume',
  'why.fewer-bare',
  'why.more-resilient',
  'why.small-change',
  'why.more-families',
  'benefit.living-cover',
  'benefit.legume-nitrogen',
  'benefit.fewer-hazard-years',
  'benefit.family-break',
  'evidence.resilience',
  'evidence.cover-months',
  'evidence.hazard-month',
  'evidence.water',
  'gap.weak.soil-cover-only',
  'gap.weak.soil',
  'gap.weak.climate-record',
  'gap.current-not-suitable',
  'gap.not-suitable',
  'gap.suitability-unknown',
  'gap.suitability-error',
  'gap.rule-missing',
  'gap.soil-compared-shared',
  'gap.soil-compared-none',
  'gap.humus-medium-class',
  'gap.erosion-rye-row',
  'gap.leaching-not-counted',
  'gap.erosion-no-row',
  'gap.erosion-annual-c',
  'gap.humus-not-adjusted',
  'soil.evidence.nitrogen-no-leaching',
  'soil.evidence.organic-matter-unadjusted',
  'gap.unknown-crop',
  'soil.basis.total-complete',
  'soil.basis.compared',
  'empty.outside-coverage',
  'empty.no-history',
  'empty.crops-error',
  'empty.unknown-crops',
  'empty.current-not-scored',
  'empty.rules-missing',
  'gap.soil-missing',
  'gap.slope-missing',
  'gap.priority-not-scored',
  'gap.income-not-wired',
  'gap.not-checked',
  'risk.local-pests',
  'risk.new-crop',
  'risk.herbicide-carryover',
  'risk.cover-termination',
  'risk.perennial-establishment',
  'risk.bare-months',
  'soil.basis.cover-only',
  'total.basis',
  'income.not-wired',
  'income.error',
  'income.current-missing',
  'gap.payments-error',
  'gap.payments-not-loaded',
  'twins.error',
] as const;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const INDICATOR_LABEL: Record<IndicatorId, string> = {
  nitrogen: 'nitrogen',
  organicMatter: 'organic matter',
  erosion: 'erosion',
  pestBreak: 'pest break',
};
const PRIORITY_LABEL: Record<PriorityId, string> = {
  water: 'water',
  forage: 'forage',
  nitrogen: 'nitrogen',
  erosion: 'erosion',
  organicMatter: 'organic matter',
};

/** Crop id as words for a message parameter: 'cereal-rye' → 'cereal rye'. */
export const cropLabel = (id: CropId) => id.replace(/-/g, ' ');
const m = (code: string, params?: Message['params']): Message => (params ? { code, params } : { code });

export interface SoilOutcome {
  score: Score;
  indicators?: Partial<Record<IndicatorId, Score>>;
  /** true while soil health is the cover-only stand-in (no indicator could be scored). */
  coverOnly: boolean;
  evidence: Evidence[];
  missing: IndicatorId[];
  /** Crops without a sourced C factor row; named in the gaps when erosion is left out. */
  erosionNoRow?: string[];
  /** Main crops whose erosion months use one annual C factor (D54); named in the gaps when erosion is scored. */
  erosionAnnual?: string[];
  /** Adjustments a scored indicator left out for want of a sourced rule row (named in the gaps). */
  notAdjusted?: { leaching: boolean; humus: string[] };
}

/** Growing-season means behind the water score (mm), and the need rows it used. */
export interface WaterEvidenceInput {
  meanRainMm: number;
  meanEtMm: number;
  ruleIds: string[];
}

export interface CardInput {
  years: Years;
  isCurrent: boolean;
  /** Years of the current rotation; empty when there is none. */
  current: Years;
  crops: CropTraits[];
  climate: ClimateProfile;
  calendar: CalendarMonth[];
  bareMonths: number;
  currentBareMonths: number | null;
  resilience: Score;
  currentResilience: number | null;
  soil: SoilOutcome;
  changedYears: number;
  rankByGoal: Partial<Record<GoalId, number>>;
  shownGoals: GoalId[];
  candidateCount: number;
  removedCrops: { crop: CropId; index: number }[];
  unknownSuitability: CropId[];
  suitabilityError: boolean;
  soilInputsMissing: string[];
  slopeMissing: boolean;
  prioritiesNotScored: PriorityId[];
  /** Set when the water priority was scored for this rotation. */
  water?: WaterEvidenceInput;
  ruleIds: { drought: string; markShare: string; heatMinDays: string };
  /** Dataset id for our crop calendars (bare months). */
  calendarDatasetId: string;
  retrievedAt: string;
  /** History crops outside the crop list, dropped from the current rotation. */
  unknownCrops?: CropId[];
  /** Set when soil was ranked over fewer indicators than this rotation or the current one has: the shared ones. */
  soilComparedOn?: IndicatorId[];
  /** For the current rotation: where its crop history came from. */
  history?: { source: 'farmer' | 'provider'; years: number[]; cropscape: boolean };
  /** What the money step left out of this rotation's income (O3-B7); absent = income not wired. */
  incomeGaps?: Message[];
}

export interface CardMessages {
  why: Message[];
  evidence: Evidence[];
  benefits: Message[];
  gaps: Message[];
  localReviewRisks: Message[];
}

const families = (years: Years, crops: CropTraits[]) => new Set(years.map((y) => cropById(crops, y.crop).family)).size;

export function cardMessages(c: CardInput): CardMessages {
  const why: Message[] = [];
  const benefits: Message[] = [];
  const gaps: Message[] = [];
  const risks: Message[] = [];
  const traits = (id: CropId) => cropById(c.crops, id);
  const currentCrops = new Set(c.current.map((y) => y.crop));
  const living = c.calendar.filter((x) => x.cover === 'crop' || x.cover === 'cover-crop').length;
  const record = recordYears(c.climate);
  const yearsParams = { years: record.length, from: record[0] ?? 0, to: record[record.length - 1] ?? 0 };

  // ---- why: the goal that ranked it first, then what the rotation does
  for (const goal of c.shownGoals) {
    const rank = c.rankByGoal[goal];
    if (rank !== undefined) why.push(m(`why.rank.${goal}`, { rank, count: c.candidateCount }));
  }
  if (c.isCurrent) why.push(m('why.current'));
  if (c.history && c.history.years.length > 0) {
    const span = { from: Math.min(...c.history.years), to: Math.max(...c.history.years) };
    why.push(m(c.history.cropscape ? 'why.history.cropscape' : 'why.history.farmer', span));
  }
  const covered = c.years.find((y) => y.coverCrop !== undefined && !c.current.some((z) => z.coverCrop === y.coverCrop));
  if (covered?.coverCrop) why.push(m('why.cover-crop', { cover: cropLabel(covered.coverCrop), crop: cropLabel(covered.crop) }));
  const legume = c.years.find((y) => traits(y.crop).legume);
  if (legume) why.push(m('why.legume', { crop: cropLabel(legume.crop) }));
  if (!c.isCurrent && c.currentBareMonths !== null) {
    const perYear = c.bareMonths / c.years.length;
    const currentPerYear = c.currentBareMonths / Math.max(1, c.current.length);
    if (perYear < currentPerYear) {
      why.push(m('why.fewer-bare', { bare: round1(perYear), currentBare: round1(currentPerYear) }));
    }
  }
  if (!c.isCurrent && c.currentResilience !== null && c.resilience.value > c.currentResilience) {
    why.push(m('why.more-resilient', { value: c.resilience.value, current: c.currentResilience }));
  }
  if (!c.isCurrent && c.changedYears === 1) why.push(m('why.small-change'));
  if (!c.isCurrent && c.current.length > 0 && families(c.years, c.crops) > families(c.current, c.crops)) {
    why.push(m('why.more-families', { families: families(c.years, c.crops), currentFamilies: families(c.current, c.crops) }));
  }

  // ---- benefits
  benefits.push(m('benefit.living-cover', { living, total: c.calendar.length }));
  if (c.years.some((y) => traits(y.crop).legume || (y.coverCrop !== undefined && traits(y.coverCrop).legume))) {
    benefits.push(m('benefit.legume-nitrogen'));
  }
  if (!c.isCurrent && c.currentResilience !== null && c.resilience.value > c.currentResilience) {
    benefits.push(m('benefit.fewer-hazard-years', { value: c.resilience.value, current: c.currentResilience, years: record.length }));
  }
  if (families(c.years, c.crops) >= 3) benefits.push(m('benefit.family-break', { families: families(c.years, c.crops) }));

  // ---- evidence
  const evidence: Evidence[] = [];
  const derived = (value: number, unit: string, datasetIds: string[], range?: Sourced['range']): Sourced => ({
    value,
    unit,
    datasetIds,
    kind: 'derived',
    retrievedAt: c.retrievedAt,
    ...(range ? { range } : {}),
  });
  evidence.push({
    message: m('evidence.resilience', { value: c.resilience.value, ...yearsParams }),
    values: [
      derived(c.resilience.value, '% of crop-years with no hazard in sensitive months', [...c.climate.source.datasetIds], {
        low: c.resilience.low,
        high: c.resilience.high,
        basis: '10th to 90th percentile year of the record',
      }),
    ],
    ruleIds: [c.ruleIds.drought, c.ruleIds.heatMinDays],
  });
  let top: { cell: CalendarMonth; e: CalendarMonth['exposure'][number] } | undefined;
  for (const cell of c.calendar) {
    for (const e of cell.exposure) {
      if (!top || (e.probability.value ?? 0) > (top.e.probability.value ?? 0)) top = { cell, e };
    }
  }
  if (top?.cell.crop && typeof top.e.probability.value === 'number') {
    evidence.push({
      message: m('evidence.hazard-month', {
        hazard: top.e.hazard,
        crop: cropLabel(top.cell.crop),
        month: MONTHS[top.cell.month - 1] ?? String(top.cell.month),
        hit: Math.round(top.e.probability.value * record.length),
        years: record.length,
      }),
      values: [top.e.probability],
      // drought marks do not use markShare (D42); heat marks also depend on the hot-day count (D43)
      ruleIds:
        top.e.hazard === 'drought'
          ? [c.ruleIds.drought]
          : top.e.hazard === 'heat'
            ? [c.ruleIds.markShare, c.ruleIds.heatMinDays]
            : [c.ruleIds.markShare],
    });
  }
  evidence.push({
    message: m('evidence.cover-months', { bare: c.bareMonths, living, total: c.calendar.length }),
    values: [derived(c.bareMonths, 'bare months per rotation cycle', [c.calendarDatasetId])],
    ruleIds: [],
  });
  evidence.push(...c.soil.evidence);
  if (c.water) {
    const power = (value: number, unit: string): Sourced => ({
      value,
      unit,
      datasetIds: [...c.climate.source.datasetIds],
      kind: c.climate.source.kind,
      retrievedAt: c.climate.source.retrievedAt,
    });
    evidence.push({
      message: m('evidence.water', { rain: c.water.meanRainMm, et: c.water.meanEtMm }),
      values: [
        power(c.water.meanRainMm, 'mm growing-season rain, mean of checked crop-years'),
        power(c.water.meanEtMm, 'mm growing-season evapotranspiration, mean of checked crop-years'),
      ],
      ruleIds: c.water.ruleIds,
    });
  }
  if (c.history?.cropscape) {
    evidence.push({
      message: m('evidence.history-cropscape', { count: c.history.years.length }),
      values: [
        { value: c.history.years.length, unit: 'years of crop history', datasetIds: ['usda-cropscape'], kind: 'model', retrievedAt: c.retrievedAt },
      ],
      ruleIds: [],
    });
  }

  // ---- gaps: weak confidence reasons first
  if (c.soil.coverOnly) gaps.push(m('gap.weak.soil-cover-only'));
  else if (c.soil.score.confidence === 'weak') gaps.push(m('gap.weak.soil'));
  if (c.resilience.confidence === 'weak') gaps.push(m('gap.weak.climate-record'));
  if (c.isCurrent) {
    for (const r of c.removedCrops) {
      if (c.years.some((y) => y.crop === r.crop || y.coverCrop === r.crop)) {
        gaps.push(m('gap.current-not-suitable', { crop: cropLabel(r.crop), index: r.index }));
      }
    }
  }
  for (const r of c.removedCrops) gaps.push(m('gap.not-suitable', { crop: r.crop, cropName: cropLabel(r.crop), index: r.index }));
  for (const crop of c.unknownSuitability) gaps.push(m('gap.suitability-unknown', { crop: cropLabel(crop) }));
  if (c.suitabilityError) gaps.push(m('gap.suitability-error'));
  for (const id of c.soil.missing) {
    const noRow = id === 'erosion' ? (c.soil.erosionNoRow ?? []) : [];
    if (noRow.length === 0) gaps.push(m('gap.rule-missing', { indicator: INDICATOR_LABEL[id] }));
    for (const crop of noRow) gaps.push(m('gap.erosion-no-row', { crop: cropLabel(crop) }));
  }
  // D54: only when erosion is scored; when it is left out, the missing row is the gap that matters
  if (!c.soil.missing.includes('erosion')) {
    for (const crop of c.soil.erosionAnnual ?? []) gaps.push(m('gap.erosion-annual-c', { crop: cropLabel(crop) }));
  }
  if (c.soilComparedOn) {
    gaps.push(
      c.soilComparedOn.length > 0
        ? m('gap.soil-compared-shared', { shared: c.soilComparedOn.map((id) => INDICATOR_LABEL[id]).join(', ') })
        : m('gap.soil-compared-none'),
    );
  }
  if (c.soil.indicators?.organicMatter && c.years.length > 0 && c.soil.evidence.some((e) => e.ruleIds.some((id) => id.startsWith('humus.coef.') && id.endsWith('.pl')))) {
    gaps.push(m('gap.humus-medium-class'));
  }
  if (c.soil.indicators?.nitrogen && c.soil.notAdjusted?.leaching) gaps.push(m('gap.leaching-not-counted'));
  if (c.soil.indicators?.organicMatter && c.soil.notAdjusted && c.soil.notAdjusted.humus.length > 0) {
    gaps.push(m('gap.humus-not-adjusted', { adjustments: c.soil.notAdjusted.humus.join(' and ') }));
  }
  if (c.soil.indicators?.erosion && c.years.some((y) => y.coverCrop === 'cereal-rye')) gaps.push(m('gap.erosion-rye-row'));
  for (const crop of c.unknownCrops ?? []) gaps.push(m('gap.unknown-crop', { crop: cropLabel(crop) }));
  if (c.soilInputsMissing.length > 0) gaps.push(m('gap.soil-missing', { inputs: c.soilInputsMissing.join(', ') }));
  if (c.slopeMissing) gaps.push(m('gap.slope-missing'));
  for (const p of c.prioritiesNotScored) gaps.push(m('gap.priority-not-scored', { priority: PRIORITY_LABEL[p] }));
  // income: what the money step left out (O3-B7), or that it is not wired
  gaps.push(...(c.incomeGaps ?? [m('gap.income-not-wired')]));
  gaps.push(m('gap.not-checked'));

  // ---- risks only the farm can check
  for (const crop of new Set(c.years.map((y) => y.crop))) {
    if (!currentCrops.has(crop)) risks.push(m('risk.new-crop', { crop: cropLabel(crop) }));
  }
  if (!c.isCurrent && c.years.some((y) => !currentCrops.has(y.crop))) risks.push(m('risk.herbicide-carryover'));
  for (const cover of new Set(c.years.map((y) => y.coverCrop).filter((x): x is CropId => x !== undefined))) {
    risks.push(m('risk.cover-termination', { cover: cropLabel(cover) }));
  }
  const perennial = c.years.find((y) => traits(y.crop).kind === 'perennial');
  if (perennial) risks.push(m('risk.perennial-establishment', { crop: cropLabel(perennial.crop) }));
  if (c.bareMonths > 0) risks.push(m('risk.bare-months', { bare: c.bareMonths, total: c.calendar.length }));
  risks.push(m('risk.local-pests'));

  return { why, evidence, benefits, gaps, localReviewRisks: risks };
}

const round1 = (x: number) => Math.round(x * 10) / 10;
