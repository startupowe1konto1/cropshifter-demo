// Fixture analysis for the Iowa demo field. Built, not hand-written: see build.ts.
import type { Analysis, ClimateProfile, Soil, Sourced } from '../contracts';
import { IOWA_NORMALS, buildAnalysis, buildClimate, fixtureValue, msg } from './build';
import { fixtureCrops } from './crops';
import { demoFields } from './fields';

export const iowaClimate: ClimateProfile = buildClimate(4203, IOWA_NORMALS);

const mapUnit = (low: number, high: number) => ({ low, high, basis: 'low and high value of the SSURGO map unit' });
const ssurgo = { datasetIds: ['usda-ssurgo'], kind: 'observation' } as const;

export const iowaSoil: Soil = {
  sandPct: fixtureValue(32, { ...ssurgo, unit: '%', range: mapUnit(25, 40) }),
  clayPct: fixtureValue(26, { ...ssurgo, unit: '%', range: mapUnit(22, 30) }),
  organicCarbon: fixtureValue(2.6, { ...ssurgo, unit: '% by weight', range: mapUnit(2.0, 3.2) }),
  ph: fixtureValue(6.4, { ...ssurgo, unit: 'pH', range: mapUnit(6.1, 6.8) }),
};

export const iowaSlope: Sourced = fixtureValue(2.1, { unit: '%', datasetIds: ['nasadem'], kind: 'derived' });

export const iowaAnalysis: Analysis = buildAnalysis({
  field: demoFields.iowa,
  profile: { ...iowaClimate, soil: iowaSoil, slopePct: iowaSlope },
  crops: fixtureCrops.US,
  rotations: [
    {
      id: 'ia-maize-soybean',
      isCurrent: true,
      years: [{ crop: 'maize' }, { crop: 'soybean' }],
      indicators: {
        nitrogen: { value: 55, confidence: 'strong' },
        organicMatter: { value: 40, confidence: 'strong' },
        erosion: { value: 38, confidence: 'strong' },
        pestBreak: { value: 50, confidence: 'strong' },
      },
      climateResilience: { value: 68, low: 52, high: 84, confidence: 'strong' },
      water: { value: 62, confidence: 'strong' },
      forage: { value: 0, confidence: 'strong' },
      why: [msg('fx.why.current'), msg('fx.why.legume')],
      benefits: [msg('fx.benefit.known-system'), msg('fx.benefit.legume-credit')],
      gaps: [msg('fx.gap.soc-map'), msg('fx.gap.history-source')],
      localReviewRisks: [msg('fx.risk.winter-bare'), msg('fx.risk.two-crop-pests')],
    },
    {
      id: 'ia-maize-rye-soybean',
      isCurrent: false,
      years: [{ crop: 'maize', coverCrop: 'cereal-rye' }, { crop: 'soybean' }],
      indicators: {
        nitrogen: { value: 62, confidence: 'moderate' },
        organicMatter: { value: 55, confidence: 'moderate' },
        erosion: { value: 48, confidence: 'strong' },
        pestBreak: { value: 52, confidence: 'strong' },
      },
      climateResilience: { value: 70, low: 54, high: 85, confidence: 'strong' },
      water: { value: 60, confidence: 'moderate' },
      forage: { value: 25, confidence: 'strong' },
      why: [msg('fx.why.rye-cover'), msg('fx.why.small-change'), msg('fx.why.legume')],
      benefits: [msg('fx.benefit.living-roots'), msg('fx.benefit.nitrate-kept')],
      gaps: [msg('fx.gap.soc-map'), msg('fx.gap.rye-after-soybean')],
      localReviewRisks: [msg('fx.risk.rye-termination'), msg('fx.risk.rye-seed-cost')],
    },
    {
      id: 'ia-maize-soybean-wheat',
      isCurrent: false,
      years: [{ crop: 'maize' }, { crop: 'soybean' }, { crop: 'winter-wheat' }],
      indicators: {
        nitrogen: { value: 40, confidence: 'moderate' },
        organicMatter: { value: 45, confidence: 'moderate' },
        erosion: { value: 35, confidence: 'moderate' },
        pestBreak: { value: 65, confidence: 'strong' },
      },
      climateResilience: { value: 52, low: 30, high: 74, confidence: 'weak' },
      water: { value: 64, confidence: 'weak' },
      forage: { value: 0, confidence: 'strong' },
      why: [msg('fx.why.small-grain'), msg('fx.why.summer-window')],
      benefits: [msg('fx.benefit.pest-break'), msg('fx.benefit.workload')],
      gaps: [msg('fx.gap.weak.wheat-record'), msg('fx.gap.long-fallow')],
      localReviewRisks: [msg('fx.risk.wheat-market'), msg('fx.risk.winterkill')],
    },
    {
      id: 'ia-maize-soybean-oats-alfalfa',
      isCurrent: false,
      years: [{ crop: 'maize' }, { crop: 'soybean' }, { crop: 'oats' }, { crop: 'alfalfa' }, { crop: 'alfalfa' }],
      indicators: {
        nitrogen: { value: 85, confidence: 'strong' },
        organicMatter: { value: 82, confidence: 'moderate' },
        erosion: { value: 86, confidence: 'strong' },
        pestBreak: { value: 88, confidence: 'strong' },
      },
      climateResilience: { value: 76, low: 60, high: 90, confidence: 'moderate' },
      water: { value: 55, confidence: 'moderate' },
      forage: { value: 60, confidence: 'strong' },
      why: [msg('fx.why.perennial'), msg('fx.why.alfalfa-nitrogen'), msg('fx.why.forage')],
      benefits: [msg('fx.benefit.less-erosion'), msg('fx.benefit.forage-supply')],
      gaps: [msg('fx.gap.soc-map'), msg('fx.gap.alfalfa-establishment')],
      localReviewRisks: [msg('fx.risk.hay-market'), msg('fx.risk.hay-equipment')],
    },
    {
      id: 'ia-maize-soybean-soybean',
      isCurrent: false,
      years: [{ crop: 'maize' }, { crop: 'soybean' }, { crop: 'soybean' }],
      indicators: {
        nitrogen: { value: 60, confidence: 'moderate' },
        organicMatter: { value: 28, confidence: 'moderate' },
        erosion: { value: 25, confidence: 'moderate' },
        pestBreak: { value: 35, confidence: 'moderate' },
      },
      climateResilience: { value: 78, low: 64, high: 90, confidence: 'strong' },
      water: { value: 72, confidence: 'strong' },
      forage: { value: 0, confidence: 'strong' },
      why: [msg('fx.why.soybean-drought'), msg('fx.why.lower-water')],
      benefits: [msg('fx.benefit.fewer-drought-losses', { years: 45 }), msg('fx.benefit.no-nitrogen-fertiliser')],
      gaps: [msg('fx.gap.below-floor', { points: 5 }), msg('fx.gap.nematode-not-checked')],
      localReviewRisks: [msg('fx.risk.soybean-after-soybean'), msg('fx.risk.low-residue')],
    },
  ],
});
