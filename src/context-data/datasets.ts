// Datasets behind the context provider (soil, slope, suitability, crop history). Picked up by src/app/datasets.ts.
import type { Dataset } from '../contracts';

export const datasets: Dataset[] = [
  {
    id: 'nasadem', name: 'NASADEM elevation (slope is our calculation)', provider: 'NASA JPL',
    url: 'https://planetarycomputer.microsoft.com/dataset/nasadem', nasa: true, resolution: '30 m', period: '2000', kind: 'observation',
  },
  {
    id: 'usda-cropscape', name: 'USDA NASS Cropland Data Layer', provider: 'USDA NASS',
    url: 'https://nassgeodata.gmu.edu/CropScape/', nasa: false, resolution: '30 m', period: '2008–2025', kind: 'model',
  },
  {
    id: 'usda-ssurgo', name: 'USDA NRCS SSURGO soil survey', provider: 'USDA NRCS',
    url: 'https://sdmdataaccess.sc.egov.usda.gov/', nasa: false, resolution: 'map unit, about 1:24,000', period: 'survey', kind: 'observation',
  },
  {
    id: 'isric-soilgrids', name: 'SoilGrids 2.0', provider: 'ISRIC',
    url: 'https://soilgrids.org/', nasa: false, resolution: '250 m', period: '2020 release', kind: 'model',
  },
  {
    id: 'fao-gaez-v4', name: 'FAO GAEZ v4 crop suitability and attainable yield', provider: 'FAO',
    url: 'https://gaez.fao.org/', nasa: false, resolution: 'about 9 km', period: '1981–2010; scenarios 2041–2100', kind: 'model',
  },
];
