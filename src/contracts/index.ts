// Shared contracts. Source: docs/SPEC.md section 6. Change only through a [contract] PR.
import type { Polygon } from 'geojson';

// ---------- provenance (HANDOFF "Data transparency") ----------
export type ValueKind = 'observation' | 'model' | 'derived'; // derived = our own calculation

export interface Dataset {
  id: string;            // e.g. 'nasa-power-monthly'
  name: string;          // 'NASA POWER monthly agroclimatology'
  provider: string;      // 'NASA LaRC'
  url: string;
  nasa: boolean;         // true for NASA data, false for partners and others
  resolution: string;    // native, as text: 'about 50 km', '9 km', '30 m'
  period: string;        // '1981–2025'
  kind: ValueKind;
}

export interface Sourced<T = number> {
  value: T | null;                 // null = missing; never a filled-in guess
  unit?: string;
  datasetIds: string[];            // every dataset the value depends on
  kind: ValueKind;
  retrievedAt: string;             // ISO date of the request or of the precompute run
  range?: { low: number; high: number; basis: string }; // e.g. '10th–90th percentile of 1981–2025'
  missingReason?: string;          // required when value is null
}

// ---------- field and farmer input ----------
export type Country = 'US' | 'PL' | 'OTHER';
export interface Field {
  id: string;
  name: string;
  country: Country;
  polygon: Polygon;        // WGS84
  centroid: { lat: number; lon: number };
  areaHa: number;
  parcelIds?: string[];            // Polish cadastral IDs, when the field came from ULDK
}

export type CropId = string;       // key of data/crops/<country>.json, e.g. 'maize', 'soybean', 'winter-wheat'
export interface CropYear { year: number; crop: CropId; coverCrop?: CropId; source: 'farmer' | 'cropscape' }

export type GoalId = 'keepSoil' | 'improveSoil' | 'income'; // one main goal, default 'keepSoil'
export type PriorityId = 'water' | 'forage' | 'nitrogen' | 'erosion' | 'organicMatter';
export interface Priorities { goal: GoalId; on: PriorityId[]; excludedCrops: CropId[] }

// ---------- field profile (NASA data) ----------
export type Hazard = 'drought' | 'heat' | 'frost';
export interface MonthlyRisk { month: number; hazard: Hazard; probability: Sourced } // share of the 45 years, 0–1
export interface ClimateProfile {                    // what the ProfileProvider returns (NASA POWER, later SMAP)
  source: { datasetIds: string[]; kind: ValueKind; retrievedAt: string };   // applies to every value in monthly
  monthly: { year: number; month: number; rootWetness: number | null; rainMm: number | null; tMaxC: number | null; frostDays: number | null; evapotranspirationMm: number | null; tMaxDailyC?: (number | null)[] }[]; // raw series for the engine; null = missing. tMaxDailyC: the month's daily maxima, °C (D43); absent = no daily record
  monthlyRisk: MonthlyRisk[];                       // 12 months x 3 hazards
  yearly: { year: number; growingSeasonWetness: Sourced; maxTempC: Sourced; frostDays: Sourced; rainMm: Sourced }[];
  droughtYears: number[];
  trends: { variable: string; direction: 'up' | 'down' | 'none'; perDecade: Sourced; significant: boolean }[];
}
export interface Soil { sandPct: Sourced; clayPct: Sourced; organicCarbon: Sourced; ph: Sourced }
export interface FieldProfile extends ClimateProfile { soil: Soil; slopePct: Sourced } // joined by the engine

// ---------- crop traits (data/crops/<country>.json, owner O4) ----------
export interface SourceRef { title: string; url: string; locator: string }       // locator = page, table or section
/** FAO water need class of a crop (SPEC section 6). */
export type WaterNeed = 'low' | 'medium' | 'high';
export interface CropTraits {
  id: CropId; family: string; legume: boolean;
  kind: 'cash' | 'cover' | 'perennial';
  sowMonth: number; harvestMonth: number;          // harvestMonth < sowMonth means harvest in the next calendar year
  sensitive: { hazard: Hazard; months: number[]; threshold: number; lossShare: number }[]; // lossShare 0-1 when the hazard hits
  waterNeed?: WaterNeed;                           // required unless kind is 'cover' (schema enforces it)
  yieldResponseFactor?: number;                    // FAO Ky; optional for every crop kind (D29): a missing Ky gives no-data income
  yieldResponseFactorFrom?: string;                // D53: the Ky is borrowed from this crop (as FAO-66 Table 1 names it); the card says so in its gaps
  forage: boolean;
  residueCover: 'low' | 'medium' | 'high';
  sources: SourceRef[];                            // min 1
}

// ---------- rotations ----------
export interface Score {
  value: number;                   // 0–100
  low: number; high: number;       // range across the 45 years or across rule uncertainty
  confidence: 'strong' | 'moderate' | 'weak';
  basis: Message;                  // one sentence: what the range and confidence rest on
}
export interface Message { code: string; params?: Record<string, string | number> } // text comes from i18n files
export interface Evidence { message: Message; values: Sourced[]; ruleIds: string[] }

export type CoverState = 'crop' | 'cover-crop' | 'residue' | 'bare';
export interface CalendarMonth {
  yearIndex: number; month: number;  // position in the rotation
  crop?: CropId; cover: CoverState;
  exposure: { hazard: Hazard; probability: Sourced }[]; // only hazards the crop is sensitive to that month
}

export type IndicatorId = 'nitrogen' | 'organicMatter' | 'erosion' | 'pestBreak';
export interface RotationOption {
  id: string;
  isCurrent: boolean;
  years: { crop: CropId; coverCrop?: CropId }[];
  totals: Record<GoalId, AsyncResult<Score>>;   // one total per goal; 'no-data' for income without money tables
  rankByGoal: Partial<Record<GoalId, number>>;  // 1 = best; the current rotation is ranked with the others
  belowSoilFloor: boolean;                      // soil health more than 5 points under the current rotation's
  soilHealth: Score;
  indicators: Partial<Record<IndicatorId, Score>>; // an indicator without a sourced rule is absent and named in gaps
  climateResilience: Score;
  priorityScores: Partial<Record<PriorityId, Score>>;
  income: AsyncResult<Score>;                   // 'no-data' until the money tables cover every crop of the rotation
  why: Message[];                               // min 1
  evidence: Evidence[];                         // min 1
  benefits: Message[];
  gaps: Message[];                              // min 1; 'none found' is not allowed, name what was not checked
  localReviewRisks: Message[];                  // min 1
  calendar: CalendarMonth[];
  bareMonths: number;                           // per rotation cycle
  twins: AsyncResult<TwinEvidence>;
  money: AsyncResult<MoneyEstimate>;
}

export interface TwinEvidence {
  cases: { regionName: string; country: Country; similarity: number; crops: CropId[]; outcome: Sourced; years: string }[];
  caseCount: number;
  meanSimilarity: number;                       // 0–100
}
export interface MoneyEstimate {
  marginPerHa: Sourced;                         // mean over the 45 years; range = 10th and 90th percentile year
  currency: 'USD' | 'PLN';
  payments: { programme: string; amountPerHa: Sourced; condition: Message; confirmed: boolean }[];
  campaign: string;                             // 'campaign 2026, check ARiMR' / 'FY2026, check NRCS'
}

export interface Analysis {
  field: Field; profile: FieldProfile;
  rotations: RotationOption[];                  // every rotation shown under any goal; empty for a field outside the USA and Poland
  shownByGoal: Partial<Record<GoalId, string[]>>; // rotation ids per goal that has data: the current rotation plus the three best others, best first
  datasets: Dataset[];                          // everything used, for the sources panel and References
  generatedAt: string;
}

// ---------- async and errors ----------
export type AsyncResult<T> =
  | { status: 'ready'; data: T }
  | { status: 'no-data'; reason: Message }             // the module is wired and has nothing for this field or rotation
  | { status: 'error'; source: string; reason: Message }
  | { status: 'not-loaded' };                           // the module is not wired yet, or was not asked

// ---------- providers (implemented by lanes, wired in src/app/providers.ts) ----------
export interface AnalyzeInput { field: Field; cropHistory: CropYear[]; priorities: Priorities }
export interface ProfileProvider { getClimate(field: Field): Promise<ClimateProfile> }
export interface ContextProvider {
  getCrops(country: Country): Promise<CropTraits[]>;
  getCropHistory(field: Field): Promise<AsyncResult<CropYear[]>>;
  getSuitability(field: Field, crops: CropId[]): Promise<Record<CropId, Sourced>>;
  getSoil(field: Field): Promise<Soil>;
  getSlope(field: Field): Promise<Sourced>;
}
export interface TwinsProvider { getTwins(field: Field, profile: FieldProfile, rotation: RotationOption['years']): Promise<AsyncResult<TwinEvidence>> }
export interface CropEconomics { crop: CropId; referenceYieldTPerHa: Sourced; pricePerT: Sourced; directCostsPerHa: Sourced }
export interface MoneyProvider {                 // tables only; the engine does the year-by-year calculation
  getEconomics(field: Field, crops: CropId[]): Promise<AsyncResult<CropEconomics[]>>;
  getPayments(field: Field, rotation: RotationOption['years']): Promise<AsyncResult<MoneyEstimate['payments']>>;
}
export type AnalyzeField = (input: AnalyzeInput, providers: Providers) => Promise<Analysis>;
export interface Providers { profile: ProfileProvider; context: ContextProvider; twins: TwinsProvider; money: MoneyProvider }

export { SourceError } from './errors';
