// Datasets behind the field twins (case base in data/twins/cases.json). Picked up by src/app/datasets.ts.
import type { Dataset } from '../contracts';

export const datasets: Dataset[] = [
  {
    id: 'nasa-power-climatology', name: 'NASA POWER climatology (case-base features)', provider: 'NASA LaRC',
    url: 'https://power.larc.nasa.gov/', nasa: true, resolution: 'about 50 km', period: '2001–2025', kind: 'model',
  },
  {
    id: 'usda-nass-county-crops', name: 'USDA NASS Quick Stats, county harvested area and yield (case base)', provider: 'USDA NASS',
    url: 'https://quickstats.nass.usda.gov/', nasa: false, resolution: 'county', period: '2019–2023', kind: 'observation',
  },
  {
    id: 'eurostat-apro-cpnhr', name: 'Eurostat crop production in national humidity by NUTS 2 regions (apro_cpnhr)', provider: 'Eurostat',
    url: 'https://ec.europa.eu/eurostat/databrowser/view/apro_cpnhr/default/table', nasa: false, resolution: 'NUTS 2 region', period: '2019–2023', kind: 'observation',
  },
];
