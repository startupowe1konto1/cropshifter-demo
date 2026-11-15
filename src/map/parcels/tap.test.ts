// addFieldAt is used by a map tap and by the address search (O1-F2): near the Iowa demo field it takes the demo
// field's stored outline, in Poland the ULDK parcel, elsewhere a 4 ha square.
import { readFileSync } from 'node:fs';
import { useAppStore } from '../../app/store';
import { demoFields } from '../../fixtures';
import { addFieldAt, cancelPendingTap, useParcelTap } from './tap';

const uldkAnswer = readFileSync('data/samples/uldk/parcel-by-xy-poznan-srid4326.txt', 'utf8');
const selected = () => {
  const s = useAppStore.getState();
  return s.fields.find((f) => f.id === s.selectedFieldId);
};

beforeEach(() => useAppStore.getState().reset());

describe('addFieldAt', () => {
  it('takes the Iowa demo field near its centroid, without a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await addFieldAt(demoFields.iowa.centroid.lat, demoFields.iowa.centroid.lon, fetchImpl);
    expect(selected()).toEqual(demoFields.iowa);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('adds a 4 ha square elsewhere in the USA', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await addFieldAt(38.5, -98.0, fetchImpl);
    expect(selected()?.country).toBe('US');
    expect(selected()?.areaHa).toBeCloseTo(4, 1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps the newer Iowa field when an older ULDK answer for Poland comes back later', async () => {
    let answer!: (r: Response) => void;
    const slow = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => (answer = resolve)));
    const first = addFieldAt(demoFields.poznan.centroid.lat, demoFields.poznan.centroid.lon, slow);
    await addFieldAt(demoFields.iowa.centroid.lat, demoFields.iowa.centroid.lon, vi.fn<typeof fetch>());
    answer(new Response(uldkAnswer, { status: 200 }));
    await first;
    expect(selected()?.id).toBe(demoFields.iowa.id);
  });
});

describe('cancelPendingTap (review finding 1)', () => {
  it('drops the answer of a tap still waiting for ULDK and clears the loading state', async () => {
    let answer!: (r: Response) => void;
    const slow = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => (answer = resolve)));
    const pending = addFieldAt(demoFields.poznan.centroid.lat, demoFields.poznan.centroid.lon, slow);
    expect(useParcelTap.getState().tap.status).toBe('loading');
    cancelPendingTap();
    expect(useParcelTap.getState().tap.status).toBe('idle');
    answer(new Response(uldkAnswer, { status: 200 }));
    await pending;
    expect(useAppStore.getState().fields).toHaveLength(0);
  });
});
