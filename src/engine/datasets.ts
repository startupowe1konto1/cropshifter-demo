// Datasets the engine itself adds: the crop calendars that bare months and cover states are counted from.
import type { Dataset } from '../contracts';

export const CROP_CALENDARS_ID = 'team-crop-calendars';

export const datasets: Dataset[] = [
  {
    id: CROP_CALENDARS_ID,
    name: 'Crop calendars and traits used by this tool (sowing and harvest months, residue cover)',
    provider: 'Team, from the sources listed per crop (USDA NASS, FAO, IUNG-PIB)',
    url: 'https://github.com/startupowe1konto1/nasa-space-apps-hackathon/tree/main/data/crops',
    nasa: false,
    resolution: 'per crop, per country',
    period: 'usual dates',
    kind: 'derived',
  },
];
