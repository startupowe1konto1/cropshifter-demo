// Step 4 priority scores that are not part of soil health: forage and water (SPEC 7, "Water priority").
//
// Water method (SPEC 7, proposed decision in #119): for each crop-year the crop's growing-season rain on this field,
// summed over its months in the ground (sowMonth..harvestMonth; a winter crop starts in the previous calendar year),
// must cover the larger of two demands: the seasonal need in mm for the crop's need class (data/rules rows
// 'water.needMm.<class>', EngineRules.waterNeedMm) and the field's own growing-season evapotranspiration that year
// (NASA POWER EVPTRNS). analyzeField scores water only when the need rows exist (#105 item 6). One need per class is a
// coarse check, so the score is never 'strong': 'moderate' with a complete record, 'weak' when a season was skipped
// for a gap in the rain or evapotranspiration record. Missing data is never a zero score: the outcome is 'not-scored'.
import type { ClimateProfile, CropTraits, RotationOption, Score, WaterNeed } from '../contracts';
import { cropById } from './calendar';


/** Every message code this module emits, with the intended English text (task O3-B6 writes messages/en.json). */
export const PRIORITY_MESSAGE_CODES = [
  'priority.basis.forage', //        "{forageYears} of {years} rotation years give forage: a forage crop or a grazed cover crop. Counted from crop traits."
  'priority.basis.water', //         "Growing-season rain covered both the crop's seasonal need and the field's evapotranspiration in {coveredYears} of {cropYears} crop-years on this field's NASA POWER record (model estimates). Range: 10th to 90th percentile year."
] as const;
export type PriorityMessageCode = (typeof PRIORITY_MESSAGE_CODES)[number];

type Years = RotationOption['years'];
const round = (x: number) => Math.round(x * 10) / 10;

/** Share of rotation years with a forage main crop or a forage (grazed) cover crop, × 100. */
export function forageScore(years: Years, crops: CropTraits[]): Score {
  const forageYears = years.filter(
    (y) => cropById(crops, y.crop).forage || (y.coverCrop !== undefined && cropById(crops, y.coverCrop).forage),
  ).length;
  const value = years.length === 0 ? 0 : round((100 * forageYears) / years.length);
  return { value, low: value, high: value, confidence: 'strong', basis: { code: 'priority.basis.forage', params: { forageYears, years: years.length } } };
}

/** Nearest-rank percentile of sorted values. */
const percentile = (sorted: number[], p: number) => sorted[Math.round(p * (sorted.length - 1))] ?? 0;

/** Water priority outcome. 'not-scored' leaves the score unset; the card then names the priority as not scored. */
export type WaterOutcome =
  | { status: 'scored'; score: Score; meanRainMm: number; meanEtMm: number; needKeys: string[] }
  | { status: 'not-scored'; reason: 'no-data' | 'no-need-class' };

/**
 * Share of crop-years (main crop of each rotation year × each year of the climate record) in which growing-season rain
 * reached the larger of the crop's class need and that season's evapotranspiration. A season that runs before the
 * record starts is left out; a season with a missing rain or evapotranspiration month is left out and lowers
 * confidence to weak. A crop without a water need class is skipped. `meanRainMm` and `meanEtMm` are the means over the
 * checked crop-years, for the card's evidence.
 *
 * `waterNeedMm` is the seasonal need in mm per class, from the 'water.needMm.<class>' rows; `byCropMm` a crop's own
 * need from 'water.needMm.<crop>', which wins over its class (#119 review). `needKeys` lists the keys used (crop id or
 * class), in order of first use, so the evidence can name the rows behind the score.
 */
export function waterScore(
  years: Years,
  crops: CropTraits[],
  climate: ClimateProfile,
  waterNeedMm: Record<WaterNeed, number>,
  byCropMm: Record<string, number> = {},
): WaterOutcome {
  if (!years.some((y) => cropById(crops, y.crop).waterNeed !== undefined)) return { status: 'not-scored', reason: 'no-need-class' };
  const rain = new Map<string, number | null>();
  const et = new Map<string, number | null>();
  for (const m of climate.monthly) {
    rain.set(`${m.year}-${m.month}`, m.rainMm);
    et.set(`${m.year}-${m.month}`, m.evapotranspirationMm);
  }
  const recordYears = [...new Set(climate.monthly.map((m) => m.year))].sort((a, b) => a - b);
  const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

  let checked = 0;
  let covered = 0;
  let rainTotal = 0;
  let etTotal = 0;
  let gaps = false;
  const perYear: number[] = [];
  const needKeys: string[] = [];
  for (const year of recordYears) {
    let yearChecked = 0;
    let yearCovered = 0;
    for (const y of years) {
      const crop = cropById(crops, y.crop);
      const need = crop.waterNeed;
      if (need === undefined) continue; // cover crops may carry no water need class (#44)
      const months: string[] = [];
      if (crop.harvestMonth < crop.sowMonth) {
        for (let m = crop.sowMonth; m <= 12; m++) months.push(`${year - 1}-${m}`);
        for (let m = 1; m <= crop.harvestMonth; m++) months.push(`${year}-${m}`);
      } else {
        for (let m = crop.sowMonth; m <= crop.harvestMonth; m++) months.push(`${year}-${m}`);
      }
      const rainValues = months.map((k) => rain.get(k));
      const etValues = months.map((k) => et.get(k));
      if (rainValues.some((v) => v === undefined)) continue; // outside the record
      if ([...rainValues, ...etValues].some((v) => v === null || v === undefined)) {
        gaps = true;
        continue;
      }
      const seasonRain = sum(rainValues);
      const seasonEt = sum(etValues);
      yearChecked++;
      rainTotal += seasonRain;
      etTotal += seasonEt;
      const key = byCropMm[crop.id] !== undefined ? crop.id : need;
      if (!needKeys.includes(key)) needKeys.push(key);
      const needMm = byCropMm[crop.id] ?? waterNeedMm[need];
      if (seasonRain >= Math.max(needMm, seasonEt)) yearCovered++;
    }
    if (yearChecked > 0) perYear.push(yearCovered / yearChecked);
    checked += yearChecked;
    covered += yearCovered;
  }

  if (checked === 0) return { status: 'not-scored', reason: 'no-data' };
  const sorted = [...perYear].sort((a, b) => a - b);
  // The value pools all crop-years, the range is the 10th to 90th percentile of the per-year shares; with few covered
  // years the pooled value can fall outside that range, so the range is widened to contain it (as resilience.ts does).
  const value = round((100 * covered) / checked);
  return {
    status: 'scored',
    score: {
      value,
      low: Math.min(value, round(100 * percentile(sorted, 0.1))),
      high: Math.max(value, round(100 * percentile(sorted, 0.9))),
      confidence: gaps ? 'weak' : 'moderate', // coarse check: one need per class
      basis: { code: 'priority.basis.water', params: { coveredYears: covered, cropYears: checked } },
    },
    meanRainMm: round(rainTotal / checked),
    meanEtMm: round(etTotal / checked),
    needKeys,
  };
}
