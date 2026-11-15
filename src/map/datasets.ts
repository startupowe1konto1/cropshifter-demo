// Datasets behind the field step. Picked up by src/app/datasets.ts.
// Name and provider copied from https://uldk.gugik.gov.pl/ (opened Sun 15 Nov 2026): "Usługa lokalizacji działek
// ewidencyjnych (ULDK)", run by Główny Urząd Geodezji i Kartografii, which locates a parcel "z wykorzystaniem informacji
// zawartych w powiatowych bazach ewidencji gruntów i budynków" (from the county land and building records).
import type { Dataset } from '../contracts';
import { ULDK_URL } from './parcels/uldk';

export const datasets: Dataset[] = [
  {
    id: 'gugik-uldk',
    name: 'ULDK, Usługa lokalizacji działek ewidencyjnych (parcel outlines from the county land and building records)',
    provider: 'GUGiK',
    url: ULDK_URL,
    nasa: false,
    resolution: 'parcel',
    period: 'current county records',
    kind: 'observation',
  },
];
