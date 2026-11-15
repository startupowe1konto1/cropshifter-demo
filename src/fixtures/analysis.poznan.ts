// Fixture analysis for the Poznań demo field. Built, not hand-written: see build.ts.
// Slope is missing here on purpose, so the no-data path of the UI has a case to show.
import type { Analysis, ClimateProfile, Soil, Sourced } from '../contracts';
import { POZNAN_NORMALS, buildAnalysis, buildClimate, fixtureValue, msg } from './build';
import { fixtureCrops } from './crops';
import { demoFields } from './fields';

export const poznanClimate: ClimateProfile = buildClimate(5245, POZNAN_NORMALS);

const prediction = (low: number, high: number) => ({ low, high, basis: '5th–95th percentile of the SoilGrids prediction' });
const soilGrids = { datasetIds: ['isric-soilgrids'], kind: 'model' } as const;

export const poznanSoil: Soil = {
  sandPct: fixtureValue(62, { ...soilGrids, unit: '%', range: prediction(48, 74) }),
  clayPct: fixtureValue(9, { ...soilGrids, unit: '%', range: prediction(5, 15) }),
  organicCarbon: fixtureValue(1.1, { ...soilGrids, unit: '% by weight', range: prediction(0.7, 1.8) }),
  ph: fixtureValue(6.1, { ...soilGrids, unit: 'pH', range: prediction(5.5, 6.7) }),
};

export const poznanSlope: Sourced = fixtureValue(null, {
  unit: '%',
  datasetIds: ['nasadem'],
  kind: 'derived',
  missingReason: 'slope not precomputed for this field',
});

export const poznanAnalysis: Analysis = buildAnalysis({
  field: demoFields.poznan,
  profile: { ...poznanClimate, soil: poznanSoil, slopePct: poznanSlope },
  crops: fixtureCrops.PL,
  rotations: [
    {
      id: 'pl-wheat-rapeseed-wheat',
      isCurrent: true,
      years: [{ crop: 'winter-wheat' }, { crop: 'winter-rapeseed' }, { crop: 'winter-wheat' }],
      indicators: {
        nitrogen: { value: 35, confidence: 'strong' },
        organicMatter: { value: 48, confidence: 'moderate' },
        erosion: { value: 70, confidence: 'moderate' },
        pestBreak: { value: 38, confidence: 'strong' },
      },
      climateResilience: { value: 63, low: 45, high: 80, confidence: 'strong' },
      water: { value: 55, confidence: 'strong' },
      forage: { value: 0, confidence: 'strong' },
      why: [msg('fx.why.current'), msg('fx.why.winter-cover')],
      benefits: [msg('fx.benefit.known-system'), msg('fx.benefit.winter-cover')],
      gaps: [msg('fx.gap.soc-grid'), msg('fx.gap.slope-missing')],
      localReviewRisks: [msg('fx.risk.rapeseed-interval'), msg('fx.risk.cereal-disease')],
    },
    {
      id: 'pl-rapeseed-wheat-mustard-pea-wheat',
      isCurrent: false,
      years: [
        { crop: 'winter-rapeseed' },
        { crop: 'winter-wheat', coverCrop: 'white-mustard' },
        { crop: 'field-pea' },
        { crop: 'winter-wheat' },
      ],
      indicators: {
        nitrogen: { value: 68, confidence: 'moderate' },
        organicMatter: { value: 55, confidence: 'moderate' },
        erosion: { value: 66, confidence: 'moderate' },
        pestBreak: { value: 70, confidence: 'strong' },
      },
      climateResilience: { value: 66, low: 48, high: 82, confidence: 'moderate' },
      water: { value: 60, confidence: 'moderate' },
      forage: { value: 25, confidence: 'strong' },
      why: [msg('fx.why.pea-nitrogen'), msg('fx.why.mustard-cover'), msg('fx.why.four-year')],
      benefits: [msg('fx.benefit.less-fertiliser'), msg('fx.benefit.disease-break')],
      gaps: [msg('fx.gap.soc-grid'), msg('fx.gap.pea-dry-spring')],
      localReviewRisks: [msg('fx.risk.pea-market'), msg('fx.risk.mustard-clubroot')],
    },
    {
      id: 'pl-rapeseed-wheat-beet-barley-pea',
      isCurrent: false,
      years: [
        { crop: 'winter-rapeseed' },
        { crop: 'winter-wheat', coverCrop: 'white-mustard' },
        { crop: 'sugar-beet' },
        { crop: 'spring-barley' },
        { crop: 'field-pea' },
      ],
      indicators: {
        nitrogen: { value: 64, confidence: 'moderate' },
        organicMatter: { value: 58, confidence: 'moderate' },
        erosion: { value: 52, confidence: 'moderate' },
        pestBreak: { value: 90, confidence: 'strong' },
      },
      climateResilience: { value: 58, low: 38, high: 76, confidence: 'moderate' },
      water: { value: 46, confidence: 'moderate' },
      forage: { value: 20, confidence: 'strong' },
      why: [msg('fx.why.diverse'), msg('fx.why.pea-before-rapeseed')],
      benefits: [msg('fx.benefit.disease-break'), msg('fx.benefit.spread-risk')],
      gaps: [msg('fx.gap.soc-grid'), msg('fx.gap.beet-water')],
      localReviewRisks: [msg('fx.risk.beet-contract'), msg('fx.risk.beet-harvest')],
    },
    {
      id: 'pl-wheat-potato-barley',
      isCurrent: false,
      years: [{ crop: 'winter-wheat' }, { crop: 'potato' }, { crop: 'spring-barley' }],
      indicators: {
        nitrogen: { value: 38, confidence: 'moderate' },
        organicMatter: { value: 36, confidence: 'moderate' },
        erosion: { value: 34, confidence: 'weak' },
        pestBreak: { value: 72, confidence: 'strong' },
      },
      climateResilience: { value: 44, low: 20, high: 68, confidence: 'weak' },
      water: { value: 38, confidence: 'weak' },
      forage: { value: 0, confidence: 'strong' },
      why: [msg('fx.why.spring-crops'), msg('fx.why.root-crop')],
      benefits: [msg('fx.benefit.disease-break'), msg('fx.benefit.workload')],
      gaps: [msg('fx.gap.weak.potato-inputs'), msg('fx.gap.bare-after-potato')],
      localReviewRisks: [msg('fx.risk.potato-irrigation'), msg('fx.risk.potato-storage')],
    },
    {
      id: 'pl-rye-rye-barley',
      isCurrent: false,
      years: [{ crop: 'rye' }, { crop: 'rye' }, { crop: 'spring-barley' }],
      indicators: {
        nitrogen: { value: 30, confidence: 'moderate' },
        organicMatter: { value: 45, confidence: 'moderate' },
        erosion: { value: 62, confidence: 'moderate' },
        pestBreak: { value: 22, confidence: 'strong' },
      },
      climateResilience: { value: 82, low: 66, high: 94, confidence: 'strong' },
      water: { value: 78, confidence: 'strong' },
      forage: { value: 0, confidence: 'strong' },
      why: [msg('fx.why.rye-hardy'), msg('fx.why.low-water-crops')],
      benefits: [msg('fx.benefit.fewer-drought-losses', { years: 45 }), msg('fx.benefit.low-cost')],
      gaps: [msg('fx.gap.below-floor', { points: 5 }), msg('fx.gap.soc-grid')],
      localReviewRisks: [msg('fx.risk.cereal-only'), msg('fx.risk.rye-price')],
    },
  ],
});
