// Fixture providers and a fixture analyzeField. Screens are built against these until the real modules exist.
import type { AnalyzeField, AsyncResult, CropId, CropYear, Field, Providers, Sourced } from '../contracts';
import { iowaAnalysis, iowaClimate, iowaSlope, iowaSoil } from './analysis.iowa';
import { poznanAnalysis, poznanClimate, poznanSlope, poznanSoil } from './analysis.poznan';
import { MONEY_NOT_LOADED, TWINS_NOT_LOADED, fixtureValue } from './build';
import { fixtureCrops } from './crops';

const isUS = (field: Field) => field.country === 'US';

/** Suitability index, 0–100. A crop outside this table comes back as a missing value. */
const SUITABILITY: Record<'US' | 'OTHER', Record<CropId, number>> = {
  US: { maize: 88, soybean: 84, oats: 70, 'winter-wheat': 58, alfalfa: 76, 'cereal-rye': 72, 'red-clover': 68 },
  OTHER: {
    'winter-wheat': 74, 'winter-rapeseed': 70, maize: 62, 'spring-barley': 66, rye: 80, 'field-pea': 60,
    'sugar-beet': 55, potato: 64, 'white-mustard': 72, phacelia: 70,
  },
};

function suitability(field: Field, crop: CropId): Sourced {
  const options = { unit: 'suitability index, 0–100', datasetIds: ['fao-gaez-v4'], kind: 'model' } as const;
  const value = SUITABILITY[isUS(field) ? 'US' : 'OTHER'][crop];
  return value === undefined
    ? fixtureValue(null, { ...options, missingReason: `no fixture suitability value for ${crop}` })
    : fixtureValue(value, options);
}

function cropHistory(field: Field): AsyncResult<CropYear[]> {
  if (!isUS(field)) return { status: 'no-data', reason: { code: 'fx.history.none' } };
  const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
  // Same pattern as CropScape at the demo field of PR #40: corn in even years, soybeans in odd years.
  return {
    status: 'ready',
    data: years.map((year) => ({ year, crop: year % 2 === 0 ? 'maize' : 'soybean', source: 'cropscape' })),
  };
}

export const fixtureProviders: Providers = {
  profile: {
    getClimate: async (field) => (isUS(field) ? iowaClimate : poznanClimate),
  },
  context: {
    getCrops: async (country) => (country === 'OTHER' ? [] : fixtureCrops[country]),
    getCropHistory: async (field) => cropHistory(field),
    getSuitability: async (field, crops) => Object.fromEntries(crops.map((crop) => [crop, suitability(field, crop)])),
    getSoil: async (field) => (isUS(field) ? iowaSoil : poznanSoil),
    getSlope: async (field) => (isUS(field) ? iowaSlope : poznanSlope),
  },
  twins: {
    getTwins: async () => TWINS_NOT_LOADED,
  },
  money: {
    getEconomics: async () => MONEY_NOT_LOADED,
    getPayments: async () => MONEY_NOT_LOADED,
  },
};

const FIXTURE_DELAY_MS = 300;

/** Resolves after a short delay, so loading states are visible. Iowa analysis for US fields, Poznań for all others. */
export const fixtureAnalyzeField: AnalyzeField = (input, _providers) =>
  new Promise((resolve) => {
    const analysis = isUS(input.field) ? iowaAnalysis : poznanAnalysis;
    setTimeout(() => resolve({ ...analysis, field: input.field }), FIXTURE_DELAY_MS);
  });
