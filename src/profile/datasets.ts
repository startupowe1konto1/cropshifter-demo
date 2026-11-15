// Datasets the profile module reads. Ids match src/fixtures/datasets.ts.
import type { Dataset } from '../contracts';

export const datasets: Dataset[] = [
  {
    id: 'nasa-power-monthly',
    name: 'NASA POWER monthly agroclimatology',
    provider: 'NASA Langley Research Center (LaRC)',
    url: 'https://power.larc.nasa.gov/',
    nasa: true,
    resolution: 'about 50 km',
    period: '1981–2025',
    kind: 'model',
  },
  {
    id: 'nasa-power-daily',
    name: 'NASA POWER daily agroclimatology (daily maximum temperature)',
    provider: 'NASA Langley Research Center (LaRC)',
    url: 'https://power.larc.nasa.gov/',
    nasa: true,
    resolution: 'about 50 km',
    period: '1981–2025',
    kind: 'model',
  },
  {
    id: 'smap-l4-rootzone',
    name: 'SMAP L4 root-zone soil moisture (NASA GIBS)',
    provider: 'NASA',
    url: 'https://nasa-gibs.github.io/gibs-api-docs/',
    nasa: true,
    resolution: '9 km',
    period: '2015–present',
    kind: 'model',
  },
];
