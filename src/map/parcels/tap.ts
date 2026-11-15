// A tap on the map, or an address search hit, adds the field there. Near the Iowa demo field it takes the demo
// field's stored outline. In Poland it asks ULDK for the parcel; with no parcel, or when ULDK fails, it still adds
// the 4 ha square, and the note says why. Elsewhere it adds the 4 ha square.
import { create } from 'zustand';
import { useAppStore } from '../../app/store';
import type { Field } from '../../contracts';
import { demoFieldNear } from '../demoSnap';
import { guessCountry, pointToField } from '../pointToField';
import { getParcelByPoint } from './uldk';

export type TapState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'parcel'; teryt: string }
  | { status: 'fallback'; reason: 'none' | 'error' | 'offline' };

export const useParcelTap = create<{ tap: TapState }>(() => ({ tap: { status: 'idle' } }));

let latestTap = 0;

/** Drops the answer of a tap or search hit still waiting for ULDK, e.g. when the farmer finds a parcel by number. */
export function cancelPendingTap(): void {
  latestTap++;
  useParcelTap.setState({ tap: { status: 'idle' } });
}

/** Adds the field for a tap at this point. Only the answer to the latest tap is used. */
export async function addFieldAt(lat: number, lon: number, fetchImpl: typeof fetch = fetch): Promise<void> {
  const ticket = ++latestTap;
  const add = (field: Field, tap: TapState) => {
    useAppStore.getState().addField(field);
    useParcelTap.setState({ tap });
  };

  const demo = demoFieldNear(lat, lon);
  if (demo) {
    add(demo, { status: 'idle' });
    return;
  }

  if (guessCountry(lat, lon) !== 'PL') {
    add(pointToField(lat, lon), { status: 'idle' });
    return;
  }

  useParcelTap.setState({ tap: { status: 'loading' } });
  let parcel: Field | null = null;
  let failed = false;
  try {
    parcel = await getParcelByPoint(lat, lon, fetchImpl);
  } catch {
    failed = true;
  }
  if (ticket !== latestTap) return;

  if (parcel) add(parcel, { status: 'parcel', teryt: parcel.parcelIds?.[0] ?? parcel.name });
  else add(pointToField(lat, lon), { status: 'fallback', reason: failed ? (navigator.onLine === false ? 'offline' : 'error') : 'none' });
}
