// The real analyzeField (task O3-B6): profile → GAEZ gate → candidates → scores → ranking by goal → card texts.
// Only the climate record is required: when it fails, analyzeField rejects with the SourceError (DECISIONS D20 c).
// Every other provider failure turns into a missing value or an error result for that part. A money provider that
// throws gives each card a money and income error naming the source (O3-B7); the analysis still returns its cards.
import {
  SourceError,
  type AnalyzeField,
  type AnalyzeInput,
  type IndicatorId,
  type Message,
  type Analysis,
  type AsyncResult,
  type CalendarMonth,
  type CropId,
  type CropTraits,
  type Dataset,
  type Field,
  type FieldProfile,
  type GoalId,
  type PriorityId,
  type Providers,
  type RotationOption,
  type Score,
  type Soil,
  type Sourced,
  type TwinEvidence,
  type MoneyEstimate,
} from '../contracts';
import moneyPl from '../../data/money/pl.json';
import moneyUs from '../../data/money/us-ia.json';
import { datasets as datasetRegistry } from '../app/datasets';
import { buildCalendar } from './calendar';
import { currentRotation, generateCandidates } from './candidates';
import { CROP_CALENDARS_ID } from './datasets';
import { INDICATOR_LABEL, cardMessages, cropLabel, type SoilOutcome, type WaterEvidenceInput } from './messages';
import { INCOME_MESSAGE_CODES, incomeEstimate, incomeScores, incomeTotal, type IncomeResult, type IncomeTotal } from './income';
import { forageScore, waterScore } from './priorityScores';
import { GOALS, INCOME_NOT_WIRED, changedYears, rankByGoal, rankSoil, type Scored } from './ranking';
import { resilienceScore, withExposure } from './resilience';
import { engineRules, shippedRules, toSoilRules, type EngineRules, type LoadedRules } from './rules';
import { soilHealth, type SoilRules } from './soilHealth';

type Years = RotationOption['years'];

/** Source named in the error state when the money provider throws something other than a SourceError. */
export const MONEY_SOURCE = 'Money tables';
type NotReady<T> = Exclude<AsyncResult<T>, { status: 'ready' }>;

/**
 * Currency and campaign label for the field's country, from the money tables in data/money. The MoneyProvider
 * contract returns neither, so the engine reads the same tables the provider is built on.
 */
const MONEY_LABELS: Record<'US' | 'PL', { currency: MoneyEstimate['currency']; campaign: string }> = {
  US: { currency: moneyUs.currency as MoneyEstimate['currency'], campaign: moneyUs.campaign },
  PL: { currency: moneyPl.currency as MoneyEstimate['currency'], campaign: moneyPl.campaign },
};

const INCOME_CODES = new Set<string>(INCOME_MESSAGE_CODES);
/** An income message as the card shows it: the crop id in an income text becomes its plain label. */
export const incomeMessage = (msg: Message): Message =>
  INCOME_CODES.has(msg.code) && typeof msg.params?.crop === 'string' ? { ...msg, params: { ...msg.params, crop: cropLabel(msg.params.crop) } } : msg;

/** What the money step gives one rotation: the card's money, the income result or why there is none, and its gaps. */
interface MoneyOutcome {
  money: AsyncResult<MoneyEstimate>;
  result?: IncomeResult;
  status?: NotReady<Score>;
  gaps: Message[];
}

const sourceOf = (e: unknown) => (e instanceof SourceError ? e.source : MONEY_SOURCE);
const RULE_OF_THUMB = 0.15;
const round1 = (x: number) => Math.round(x * 10) / 10;
const today = () => new Date().toISOString().slice(0, 10);

/** Rotation id from its years: 'maize+cereal-rye/soybean'. */
export const rotationId = (years: Years) => years.map((y) => (y.coverCrop ? `${y.crop}+${y.coverCrop}` : y.crop)).join('/');

function missing(datasetId: string, source: string, error: unknown, unit?: string): Sourced {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    value: null,
    ...(unit ? { unit } : {}),
    datasetIds: [datasetId],
    // the kind of the source this value stands for (#105: SoilGrids is a model, SSURGO and NASADEM are not)
    kind: datasetRegistry.find((d) => d.id === datasetId)?.kind ?? 'observation',
    retrievedAt: today(),
    missingReason: `${source} did not answer: ${detail}`,
  };
}

/** Dataset ids of the soil sources a SourceError can name (src/context-data: SOILGRIDS_SOURCE, SSURGO_SOURCE). */
const SOIL_DATASETS: Record<string, string> = { SoilGrids: 'isric-soilgrids', 'USDA soil survey (SSURGO)': 'usda-ssurgo' };

async function loadSoil(field: Field, providers: Providers): Promise<Soil> {
  try {
    return await providers.context.getSoil(field);
  } catch (e) {
    // The live provider falls back from SSURGO to SoilGrids for a US point without a map unit, so a SourceError names
    // the source that failed; the country only decides when the error does not say (#98 item 13).
    const fallback: [string, string] = field.country === 'US' ? ['usda-ssurgo', 'USDA soil survey'] : ['isric-soilgrids', 'SoilGrids'];
    const named = e instanceof SourceError ? SOIL_DATASETS[e.source] : undefined;
    const [id, source] = named && e instanceof SourceError ? [named, e.source] : fallback;
    return {
      sandPct: missing(id, source, e, '%'),
      clayPct: missing(id, source, e, '%'),
      organicCarbon: missing(id, source, e, '% by weight'),
      ph: missing(id, source, e, 'pH'),
    };
  }
}

async function loadSlope(field: Field, providers: Providers): Promise<Sourced> {
  try {
    return await providers.context.getSlope(field);
  } catch (e) {
    return missing('nasadem', 'NASADEM slope', e, '%');
  }
}

/** Soil cover share of the cycle: the stand-in for soil health while no indicator has a sourced rule. */
export function coverOnlyScore(totalMonths: number, bareMonths: number): Score {
  const value = round1(((totalMonths - bareMonths) / totalMonths) * 100);
  return {
    value,
    low: round1(Math.max(0, value * (1 - RULE_OF_THUMB))),
    high: round1(Math.min(100, value * (1 + RULE_OF_THUMB))),
    confidence: 'weak',
    basis: { code: 'soil.basis.cover-only' },
  };
}

/**
 * The soil step, behind one function: O3-B5's soil health when at least one indicator has rules, else the
 * cover-only stand-in. B5's placeholder total (no indicator scored) is never ranked on.
 */
export function soilStep(
  years: Years,
  crops: CropTraits[],
  profile: FieldProfile,
  rules: SoilRules,
  on: PriorityId[],
  doublingFactor: number,
  bareMonths: number,
): SoilOutcome & { indicators: RotationOption['indicators'] } {
  const result = soilHealth(years, crops, profile, rules, { goal: 'keepSoil', on, excludedCrops: [] }, doublingFactor);
  if (result.total.basis.code === 'soil.basis.no-indicators' || Object.keys(result.indicators).length === 0) {
    return {
      score: coverOnlyScore(years.length * 12, bareMonths),
      coverOnly: true,
      evidence: [],
      missing: result.missing,
      indicators: {},
    };
  }
  // plain labels in the basis, and a separate code when every indicator was scored
  const basis: Message =
    result.missing.length === 0
      ? { code: 'soil.basis.total-complete', params: { indicators: Object.keys(result.indicators).length } }
      : { code: 'soil.basis.total', params: { indicators: Object.keys(result.indicators).length, missing: result.missing.map((id) => INDICATOR_LABEL[id]).join(', ') } };
  const score = result.total.basis.code === 'soil.basis.total' ? { ...result.total, basis } : result.total;
  return { score, coverOnly: false, evidence: result.evidence, missing: result.missing, indicators: result.indicators };
}

/**
 * soilHealth scores nitrogen without leaching, and organic matter without the climate or texture factor, when those
 * rule rows are missing; its evidence would then print a leaching loss of 0% or an "unknown" climate as if measured.
 * Swap those texts for ones that say the adjustment is not counted, and record it for the card's gaps.
 */
export function markNotAdjusted(out: SoilOutcome, rules: SoilRules): void {
  const has = (group: keyof SoilRules, id: string) => rules[group].some((r) => r.id === id);
  const leaching = !(has('nitrogen', 'nitrogen.leachingRainMm') && has('nitrogen', 'nitrogen.leachingMaxLoss'));
  const humus = [
    ...(has('humus', 'humus.climateLimits') && has('humus', 'humus.climateFactor') ? [] : ['climate']),
    ...(has('humus', 'humus.textureBySand') ? [] : ['soil texture']),
  ];
  out.notAdjusted = { leaching, humus };
  out.evidence = out.evidence.map((e) => {
    const p = e.message.params ?? {};
    if (e.message.code === 'soil.evidence.nitrogen' && leaching) {
      return { ...e, message: { code: 'soil.evidence.nitrogen-no-leaching', params: { legumeYears: p.legumeYears!, years: p.years!, creditKgPerHa: p.creditKgPerHa! } } };
    }
    if (e.message.code === 'soil.evidence.organic-matter' && humus.length > 0) {
      return { ...e, message: { code: 'soil.evidence.organic-matter-unadjusted', params: { balancePerYear: p.balancePerYear!, adjustments: humus.join(' and ') } } };
    }
    return e;
  });
}

interface Candidate extends Scored {
  months: ReturnType<typeof buildCalendar>['months'];
  bareMonths: number;
  soil: SoilOutcome & { indicators: RotationOption['indicators'] };
  /** Means behind the water score, for the card's evidence; absent when water was not scored. */
  water?: WaterEvidenceInput;
}

const SOIL_INPUT_LABEL: Record<keyof Soil, string> = { sandPct: 'sand', clayPct: 'clay', organicCarbon: 'organic carbon', ph: 'pH' };

/** Dataset entries for every datasetId used anywhere in the analysis, NASA first. */
function datasetsUsed(value: unknown, registry: Dataset[]): Dataset[] {
  const ids = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as { datasetIds?: unknown };
      if (Array.isArray(o.datasetIds)) o.datasetIds.forEach((id) => typeof id === 'string' && ids.add(id));
      Object.values(v).forEach(walk);
    }
  };
  walk(value);
  return registry.filter((d) => ids.has(d.id));
}

export interface AnalyzeOptions {
  rules?: LoadedRules;
  registry?: Dataset[];
}

export function createAnalyzeField(options: AnalyzeOptions = {}): AnalyzeField {
  const loaded = options.rules ?? shippedRules;
  // A row the engine needs is missing from data/rules: no cards, a reason, never invented numbers.
  let engine: EngineRules | null;
  try {
    engine = engineRules(loaded);
  } catch {
    engine = null;
  }
  const registry = options.registry ?? datasetRegistry;

  return async (input, providers) => {
    const { field, cropHistory, priorities } = input;
    // 1. climate: required; a rejection propagates
    const climate = await providers.profile.getClimate(field);
    // 2. soil and slope: missing values with a reason when they fail
    const [soil, slopePct] = await Promise.all([loadSoil(field, providers), loadSlope(field, providers)]);
    const profile: FieldProfile = { ...climate, soil, slopePct };
    const generatedAt = new Date().toISOString();
    const empty = (reason: Message): Analysis => {
      const a: Analysis = { field, profile, rotations: [], shownByGoal: {}, datasets: datasetsUsed(profile, registry), generatedAt };
      emptyReasons.set(a, reason);
      return a;
    };

    // 3. outside the USA and Poland: profile only
    if (field.country === 'OTHER') return empty({ code: 'empty.outside-coverage' });
    if (!engine) return empty({ code: 'empty.rules-missing' });
    const rules = engine;
    const country = field.country;

    // 4. crops and the GAEZ gate
    let crops: CropTraits[];
    try {
      crops = await providers.context.getCrops(field.country);
    } catch {
      return empty({ code: 'empty.crops-error' });
    }
    let suitability: Record<CropId, Sourced> = {};
    let suitabilityError = false;
    try {
      suitability = await providers.context.getSuitability(field, crops.map((c) => c.id));
    } catch {
      suitabilityError = true;
    }
    const removedCrops: { crop: CropId; index: number }[] = [];
    const unknownSuitability = new Set<CropId>();
    for (const c of crops) {
      const v = suitability[c.id]?.value;
      if (typeof v === 'number' && v <= rules.notSuitableBelowSI) removedCrops.push({ crop: c.id, index: v });
      else if (!suitabilityError && (v === null || v === undefined)) unknownSuitability.add(c.id);
    }
    const removed = new Set(removedCrops.map((r) => r.crop));

    // 5. current rotation and candidates. The contract needs exactly one current rotation per analysis, so
    // without a crop history there are no cards (the crops step asks for the last years first).
    // Without a history from the farmer, try the provider's (CropScape for Iowa). A failure there is not fatal.
    let history = cropHistory;
    let historySource: 'farmer' | 'provider' = 'farmer';
    if (history.length === 0) {
      try {
        const fromProvider = await providers.context.getCropHistory(field);
        if (fromProvider.status === 'ready' && fromProvider.data.length > 0) {
          history = fromProvider.data;
          historySource = 'provider';
        }
      } catch {
        // no history: handled below
      }
    }
    // A history crop outside the crop list (e.g. sorghum from CropScape) cannot be scored: its year is dropped and the
    // crop is named in the gaps, as long as two known years remain. An unknown cover crop is dropped from its year.
    const known = new Set(crops.map((c) => c.id));
    const unknownCrops = [...new Set(history.flatMap((h) => [h.crop, ...(h.coverCrop ? [h.coverCrop] : [])]).filter((id) => !known.has(id)))];
    if (unknownCrops.length > 0) {
      const knownYears = history
        .filter((h) => known.has(h.crop))
        .map((h) => (h.coverCrop && !known.has(h.coverCrop) ? { year: h.year, crop: h.crop, source: h.source } : h));
      if (knownYears.length < 2) return empty({ code: 'empty.unknown-crops', params: { crops: unknownCrops.map(cropLabel).join(', ') } });
      history = knownYears;
    }
    const current = currentRotation(history);
    if (current.length === 0) return empty({ code: 'empty.no-history' });
    const usesRemoved = (years: Years) => years.some((y) => removed.has(y.crop) || (y.coverCrop !== undefined && removed.has(y.coverCrop)));
    const list = generateCandidates(current, crops, priorities).filter((years, i) => i === 0 || !usesRemoved(years));

    // 6. scores per candidate
    const on = priorities.on;
    const candidates: Candidate[] = [];
    list.forEach((years, i) => {
      const isCurrent = i === 0;
      try {
        const { months, bareMonths } = buildCalendar(years, crops);
        const climateResilience = resilienceScore(years, crops, climate, rules.droughtPercentile, rules.heatMinDays);
        const soilRules = toSoilRules(loaded, country, crops, years, profile);
        const soilOut = soilStep(years, crops, profile, soilRules.rules, on, rules.doublingFactor, bareMonths);
        // name the rows in data/rules that each derived rule came from
        soilOut.evidence = soilOut.evidence.map((e) => ({
          ...e,
          ruleIds: [...new Set(e.ruleIds.flatMap((id) => soilRules.sourceIds[id] ?? [id]))],
        }));
        markNotAdjusted(soilOut, soilRules.rules);
        soilOut.erosionNoRow = soilRules.erosionNoRow;
        soilOut.erosionAnnual = soilRules.erosionAnnual;
        const priorityScores: Scored['priorityScores'] = {};
        if (on.includes('forage')) priorityScores.forage = forageScore(years, crops);
        // water needs the sourced need rows; without them, or without data, it stays unscored and the card names it
        let water: WaterEvidenceInput | undefined;
        if (on.includes('water') && rules.waterNeedMm && rules.ids.waterNeed) {
          const w = waterScore(years, crops, climate, rules.waterNeedMm, rules.waterNeedByCropMm);
          if (w.status === 'scored') {
            priorityScores.water = w.score;
            water = { meanRainMm: w.meanRainMm, meanEtMm: w.meanEtMm, ruleIds: w.needKeys.map((k) => `water.needMm.${k}`) };
          }
        }
        candidates.push({
          id: rotationId(years),
          isCurrent,
          years,
          months,
          bareMonths,
          soilHealth: soilOut.score,
          climateResilience,
          priorityScores,
          soil: soilOut,
          ...(water ? { water } : {}),
        });
      } catch (e) {
        if (isCurrent) return; // reported below: no current card means no cards
        void e; // a candidate that cannot be scored is skipped; the generator only builds from known crops
      }
    });
    const currentCandidate = candidates.find((c) => c.isCurrent);
    if (!currentCandidate) return empty({ code: 'empty.current-not-scored' });

    // soil for ranking: compared with the current rotation over the indicators both have (rankSoil)
    const PRIORITY_INDICATOR: Partial<Record<IndicatorId, PriorityId>> = { nitrogen: 'nitrogen', erosion: 'erosion', organicMatter: 'organicMatter' };
    const weightOf = (id: IndicatorId) => (PRIORITY_INDICATOR[id] && on.includes(PRIORITY_INDICATOR[id]!) ? rules.doublingFactor : 1);
    const currentSoil = { isCurrent: true, coverOnly: currentCandidate.soil.coverOnly, soilHealth: currentCandidate.soilHealth, indicators: currentCandidate.soil.indicators };
    const sharedOf = new Map<string, IndicatorId[]>();
    for (const c of candidates) {
      const r = rankSoil({ isCurrent: c.isCurrent, coverOnly: c.soil.coverOnly, soilHealth: c.soilHealth, indicators: c.soil.indicators }, currentSoil, weightOf);
      c.rankSoil = r.score;
      if (r.partial) sharedOf.set(c.id, r.shared);
    }

    // 7. money and income for every candidate: the income score is scaled across all of them (SPEC section 7)
    const labels = MONEY_LABELS[country];
    const economicsCache = new Map<string, ReturnType<Providers['money']['getEconomics']>>();
    const economicsFor = (ids: CropId[]) => {
      const key = [...ids].sort().join(',');
      if (!economicsCache.has(key)) economicsCache.set(key, providers.money.getEconomics(field, ids));
      return economicsCache.get(key)!;
    };
    const moneyStep = async (years: Years): Promise<MoneyOutcome> => {
      const ids = [...new Set(years.flatMap((y) => [y.crop, ...(y.coverCrop ? [y.coverCrop] : [])]))];
      let economics: Awaited<ReturnType<Providers['money']['getEconomics']>>;
      try {
        economics = await economicsFor(ids);
      } catch (e) {
        const source = sourceOf(e);
        const failed = { status: 'error', source, reason: { code: 'income.error', params: { source } } } as const;
        return { money: failed, status: failed, gaps: [failed.reason] };
      }
      if (economics.status === 'not-loaded') {
        return { money: economics, status: INCOME_NOT_WIRED as NotReady<Score>, gaps: [{ code: 'gap.income-not-wired' }] };
      }
      if (economics.status !== 'ready') return { money: economics, status: economics, gaps: [incomeMessage(economics.reason)] };

      const paymentGaps: Message[] = [];
      let payments: MoneyEstimate['payments'] = [];
      try {
        const p = await providers.money.getPayments(field, years);
        if (p.status === 'ready') payments = p.data;
        else if (p.status === 'error') paymentGaps.push({ code: 'gap.payments-error', params: { source: p.source } });
        else if (p.status === 'no-data') paymentGaps.push(p.reason);
        else paymentGaps.push({ code: 'gap.payments-not-loaded' });
      } catch (e) {
        paymentGaps.push({ code: 'gap.payments-error', params: { source: sourceOf(e) } });
      }
      const income = incomeEstimate(years, crops, climate, economics.data, payments, labels.currency, labels.campaign, rules.droughtPercentile, rules.heatMinDays);
      if (income.status !== 'ready') {
        const status = income.status === 'not-loaded' ? (INCOME_NOT_WIRED as NotReady<Score>) : income.status === 'no-data' ? { ...income, reason: incomeMessage(income.reason) } : income;
        return { money: status, status, gaps: [...('reason' in status ? [status.reason] : []), ...paymentGaps] };
      }
      return {
        money: { status: 'ready', data: income.data.estimate },
        result: income.data,
        gaps: [...income.data.gaps.map(incomeMessage), ...paymentGaps],
      };
    };
    const moneyOf = new Map<string, MoneyOutcome>(
      await Promise.all(candidates.map(async (c) => [c.id, await moneyStep(c.years)] as const)),
    );
    const totals: Record<string, IncomeTotal> = {};
    for (const [id, out] of moneyOf) if (out.result) totals[id] = incomeTotal(out.result);
    const scores = incomeScores(totals);
    for (const c of candidates) {
      if (scores[c.id]) c.income = scores[c.id];
      else c.incomeStatus = moneyOf.get(c.id)!.status ?? (INCOME_NOT_WIRED as NotReady<Score>);
    }

    // 8. ranking
    const ranked = rankByGoal(candidates, rules, on);
    const shownIds = new Set(Object.values(ranked.shownByGoal).flat());
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const shown = ranked.items.filter((r) => shownIds.has(r.id));

    // 9. card texts and twins
    const soilInputsMissing = (Object.keys(SOIL_INPUT_LABEL) as (keyof Soil)[])
      .filter((k) => soil[k].value === null)
      .map((k) => SOIL_INPUT_LABEL[k]);
    // per card: a priority switched on but not scored for this rotation is named in its gaps
    const prioritiesNotScored = (c: Candidate) => (['water', 'forage'] as const).filter((p) => on.includes(p) && !c.priorityScores[p]);
    const retrievedAt = today();

    const rotations: RotationOption[] = await Promise.all(
      shown.map(async (r) => {
        const c = byId.get(r.id)!;
        const calendar: CalendarMonth[] = withExposure(c.months, crops, climate, rules.markShare, rules.droughtPercentile, rules.heatMinDays);
        const shownGoals = GOALS.filter((g: GoalId) => ranked.shownByGoal[g]?.includes(r.id));
        const texts = cardMessages({
          years: r.years,
          isCurrent: r.isCurrent,
          current: currentCandidate.years,
          crops,
          climate,
          calendar,
          bareMonths: c.bareMonths,
          currentBareMonths: currentCandidate.bareMonths,
          resilience: r.climateResilience,
          currentResilience: currentCandidate.climateResilience.value,
          soil: c.soil,
          changedYears: changedYears(r.years, currentCandidate.years),
          rankByGoal: r.rankByGoal,
          shownGoals,
          candidateCount: candidates.length,
          removedCrops,
          unknownSuitability: [...new Set(r.years.flatMap((y) => [y.crop, ...(y.coverCrop ? [y.coverCrop] : [])]))].filter((id) =>
            unknownSuitability.has(id),
          ),
          suitabilityError,
          soilInputsMissing,
          slopeMissing: slopePct.value === null,
          prioritiesNotScored: prioritiesNotScored(c),
          water: c.water,
          ruleIds: { drought: rules.ids.drought, markShare: rules.ids.markShare, heatMinDays: rules.ids.heatMinDays },
          calendarDatasetId: CROP_CALENDARS_ID,
          retrievedAt,
          unknownCrops,
          soilComparedOn: sharedOf.get(r.id),
          history: r.isCurrent ? { source: historySource, years: history.map((h) => h.year), cropscape: history.some((h) => h.source === 'cropscape') } : undefined,
          incomeGaps: moneyOf.get(r.id)!.gaps,
        });
        let twins: AsyncResult<TwinEvidence>;
        try {
          twins = await providers.twins.getTwins(field, profile, r.years);
        } catch {
          twins = { status: 'error', source: 'Field twins', reason: { code: 'twins.error' } };
        }
        return {
          id: r.id,
          isCurrent: r.isCurrent,
          years: r.years,
          totals: r.totals,
          rankByGoal: r.rankByGoal,
          belowSoilFloor: r.belowSoilFloor,
          // #124 review: the card shows the soil total the goals ranked on. Where this rotation's indicators differ from the
          // current one's, that is the current total plus the weighted difference on the shared ones (rankSoil), and the
          // gap 'gap.soil-compared-shared' says how to rebuild it.
          soilHealth: sharedOf.has(r.id) ? (r.rankSoil ?? r.soilHealth) : r.soilHealth,
          indicators: c.soil.indicators,
          climateResilience: r.climateResilience,
          priorityScores: r.priorityScores,
          income: c.income ? { status: 'ready', data: c.income } : (c.incomeStatus ?? INCOME_NOT_WIRED),
          ...texts,
          calendar,
          bareMonths: c.bareMonths,
          twins,
          money: moneyOf.get(r.id)!.money,
        };
      }),
    );

    const analysis: Analysis = { field, profile, rotations, shownByGoal: ranked.shownByGoal, datasets: [], generatedAt };
    analysis.datasets = datasetsUsed(analysis, registry);
    return analysis;
  };
}

export const analyzeField: AnalyzeField = createAnalyzeField();

/** Why an analysis has no rotation cards, as set by analyzeField; read with emptyReason. */
const emptyReasons = new WeakMap<Analysis, Message>();

/**
 * Why the analysis has no rotation cards, for the UI's "no data" state; null when it has cards. The contract has no
 * field for it yet, so analyzeField records it next to the returned object; for an analysis it did not produce
 * (e.g. restored from a link), the reason is worked out from the input.
 */
export function emptyReason(analysis: Analysis, input: Pick<AnalyzeInput, 'field' | 'cropHistory'>): Message | null {
  if (analysis.rotations.length > 0) return null;
  const recorded = emptyReasons.get(analysis);
  if (recorded) return recorded;
  return input.field.country === 'OTHER' ? { code: 'empty.outside-coverage' } : { code: 'empty.no-history' };
}
