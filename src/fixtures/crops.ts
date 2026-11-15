// Fixture crop traits. Plausible values only: every row is a placeholder until task O4-A2 ships sourced tables.
// Thresholds: drought = percentile of the field's own root-zone wetness, heat = monthly maximum temperature in °C,
// frost = frost days in the month.
import type { CropTraits, SourceRef } from '../contracts';

const placeholderSource = (): SourceRef[] => [
  { title: 'Fixture value, not sourced', url: 'https://example.org/fixture', locator: 'placeholder until task O4-A2' },
];

const crop = (row: Omit<CropTraits, 'sources'>): CropTraits => ({ ...row, sources: placeholderSource() });

const US: CropTraits[] = [
  crop({
    id: 'maize', family: 'Poaceae', legume: false, kind: 'cash', sowMonth: 5, harvestMonth: 10,
    sensitive: [
      { hazard: 'drought', months: [7, 8], threshold: 20, lossShare: 0.35 },
      { hazard: 'heat', months: [7], threshold: 35, lossShare: 0.2 },
      { hazard: 'frost', months: [5], threshold: 2, lossShare: 0.15 },
    ],
    waterNeed: 'high', yieldResponseFactor: 1.25, forage: false, residueCover: 'high',
  }),
  crop({
    id: 'soybean', family: 'Fabaceae', legume: true, kind: 'cash', sowMonth: 5, harvestMonth: 10,
    sensitive: [
      { hazard: 'drought', months: [8], threshold: 20, lossShare: 0.3 },
      { hazard: 'heat', months: [8], threshold: 36, lossShare: 0.15 },
      { hazard: 'frost', months: [5], threshold: 2, lossShare: 0.1 },
    ],
    waterNeed: 'medium', yieldResponseFactor: 0.85, forage: false, residueCover: 'low',
  }),
  crop({
    id: 'oats', family: 'Poaceae', legume: false, kind: 'cash', sowMonth: 4, harvestMonth: 7,
    sensitive: [
      { hazard: 'drought', months: [6], threshold: 20, lossShare: 0.25 },
      { hazard: 'heat', months: [6, 7], threshold: 32, lossShare: 0.2 },
    ],
    waterNeed: 'medium', yieldResponseFactor: 1.0, forage: true, residueCover: 'medium',
  }),
  crop({
    id: 'winter-wheat', family: 'Poaceae', legume: false, kind: 'cash', sowMonth: 10, harvestMonth: 7,
    sensitive: [
      { hazard: 'drought', months: [5, 6], threshold: 20, lossShare: 0.3 },
      { hazard: 'heat', months: [6], threshold: 32, lossShare: 0.2 },
      { hazard: 'frost', months: [4, 5], threshold: 5, lossShare: 0.2 },
    ],
    waterNeed: 'medium', yieldResponseFactor: 1.05, forage: false, residueCover: 'medium',
  }),
  crop({
    id: 'alfalfa', family: 'Fabaceae', legume: true, kind: 'perennial', sowMonth: 4, harvestMonth: 10,
    sensitive: [
      { hazard: 'drought', months: [7, 8], threshold: 15, lossShare: 0.2 },
      { hazard: 'frost', months: [4], threshold: 8, lossShare: 0.1 },
    ],
    waterNeed: 'high', yieldResponseFactor: 1.1, forage: true, residueCover: 'high',
  }),
  crop({
    id: 'cereal-rye', family: 'Poaceae', legume: false, kind: 'cover', sowMonth: 10, harvestMonth: 4,
    sensitive: [],
    waterNeed: 'low', yieldResponseFactor: 1.0, forage: true, residueCover: 'high',
  }),
  crop({
    id: 'red-clover', family: 'Fabaceae', legume: true, kind: 'cover', sowMonth: 8, harvestMonth: 4,
    sensitive: [{ hazard: 'drought', months: [8], threshold: 20, lossShare: 0.3 }],
    waterNeed: 'medium', yieldResponseFactor: 1.0, forage: true, residueCover: 'medium',
  }),
];

const PL: CropTraits[] = [
  crop({
    id: 'winter-wheat', family: 'Poaceae', legume: false, kind: 'cash', sowMonth: 10, harvestMonth: 8,
    sensitive: [
      { hazard: 'drought', months: [5, 6], threshold: 20, lossShare: 0.3 },
      { hazard: 'heat', months: [6], threshold: 30, lossShare: 0.15 },
      { hazard: 'frost', months: [4], threshold: 8, lossShare: 0.1 },
    ],
    waterNeed: 'medium', yieldResponseFactor: 1.05, forage: false, residueCover: 'medium',
  }),
  crop({
    id: 'winter-rapeseed', family: 'Brassicaceae', legume: false, kind: 'cash', sowMonth: 8, harvestMonth: 7,
    sensitive: [
      { hazard: 'drought', months: [5], threshold: 20, lossShare: 0.25 },
      { hazard: 'heat', months: [6], threshold: 30, lossShare: 0.1 },
      { hazard: 'frost', months: [4, 5], threshold: 6, lossShare: 0.2 },
    ],
    waterNeed: 'medium', yieldResponseFactor: 1.0, forage: false, residueCover: 'medium',
  }),
  crop({
    id: 'maize', family: 'Poaceae', legume: false, kind: 'cash', sowMonth: 5, harvestMonth: 10,
    sensitive: [
      { hazard: 'drought', months: [7, 8], threshold: 20, lossShare: 0.35 },
      { hazard: 'heat', months: [7], threshold: 34, lossShare: 0.2 },
      { hazard: 'frost', months: [5], threshold: 3, lossShare: 0.15 },
    ],
    waterNeed: 'high', yieldResponseFactor: 1.25, forage: true, residueCover: 'high',
  }),
  crop({
    id: 'spring-barley', family: 'Poaceae', legume: false, kind: 'cash', sowMonth: 3, harvestMonth: 7,
    sensitive: [
      { hazard: 'drought', months: [5, 6], threshold: 20, lossShare: 0.35 },
      { hazard: 'heat', months: [6], threshold: 29, lossShare: 0.15 },
    ],
    waterNeed: 'medium', yieldResponseFactor: 1.15, forage: false, residueCover: 'medium',
  }),
  crop({
    id: 'rye', family: 'Poaceae', legume: false, kind: 'cash', sowMonth: 9, harvestMonth: 8,
    sensitive: [{ hazard: 'drought', months: [5], threshold: 15, lossShare: 0.15 }],
    waterNeed: 'low', yieldResponseFactor: 0.9, forage: false, residueCover: 'medium',
  }),
  crop({
    id: 'field-pea', family: 'Fabaceae', legume: true, kind: 'cash', sowMonth: 3, harvestMonth: 7,
    sensitive: [
      { hazard: 'drought', months: [5, 6], threshold: 20, lossShare: 0.35 },
      { hazard: 'heat', months: [6], threshold: 28, lossShare: 0.2 },
      { hazard: 'frost', months: [4], threshold: 10, lossShare: 0.05 },
    ],
    waterNeed: 'medium', yieldResponseFactor: 1.15, forage: true, residueCover: 'low',
  }),
  crop({
    id: 'sugar-beet', family: 'Amaranthaceae', legume: false, kind: 'cash', sowMonth: 4, harvestMonth: 10,
    sensitive: [
      { hazard: 'drought', months: [7, 8], threshold: 20, lossShare: 0.3 },
      { hazard: 'frost', months: [4], threshold: 8, lossShare: 0.1 },
    ],
    waterNeed: 'high', yieldResponseFactor: 1.0, forage: false, residueCover: 'low',
  }),
  crop({
    id: 'potato', family: 'Solanaceae', legume: false, kind: 'cash', sowMonth: 4, harvestMonth: 9,
    sensitive: [
      { hazard: 'drought', months: [6, 7], threshold: 25, lossShare: 0.4 },
      { hazard: 'heat', months: [7], threshold: 30, lossShare: 0.2 },
      { hazard: 'frost', months: [5], threshold: 2, lossShare: 0.15 },
    ],
    waterNeed: 'high', yieldResponseFactor: 1.1, forage: false, residueCover: 'low',
  }),
  crop({
    id: 'white-mustard', family: 'Brassicaceae', legume: false, kind: 'cover', sowMonth: 8, harvestMonth: 11,
    sensitive: [],
    waterNeed: 'low', yieldResponseFactor: 1.0, forage: false, residueCover: 'medium',
  }),
  crop({
    id: 'phacelia', family: 'Boraginaceae', legume: false, kind: 'cover', sowMonth: 8, harvestMonth: 11,
    sensitive: [],
    waterNeed: 'low', yieldResponseFactor: 1.0, forage: false, residueCover: 'medium',
  }),
];

export const fixtureCrops: { US: CropTraits[]; PL: CropTraits[] } = { US, PL };
