// UI tests with fetch stubbed by the saved ULDK answers (data/samples/uldk).
import { readFileSync } from 'node:fs';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { t } from '../../app/i18n';
import { useAppStore } from '../../app/store';
import { demoFields } from '../../fixtures';
import { pointToField } from '../pointToField';
import { ParcelSearch } from './ParcelSearch';
import { addFieldAt, useParcelTap } from './tap';
import { ULDK_SOURCE } from './uldk';

const sample = (file: string) => readFileSync(`data/samples/uldk/${file}`, 'utf8');
const found = sample('parcel-by-id-428-1-srid4326.txt');
const foundAtPoint = sample('parcel-by-xy-poznan-srid4326.txt');
const notFound = sample('not-found-by-id.txt');
const notFoundAtPoint = sample('not-found-by-xy-sea.txt');
const teryt = found.trim().split('|').pop()!;

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  useAppStore.getState().reset();
  useParcelTap.setState({ tap: { status: 'idle' } });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const answer = (body: string, status = 200) => fetchMock.mockResolvedValueOnce(new Response(body, { status }));

async function search(id: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Parcel number'), id);
  await user.click(screen.getByRole('button', { name: 'Find parcel' }));
  return user;
}

describe('ParcelSearch', () => {
  it('adds and selects the parcel found by its number', async () => {
    answer(found);
    render(<ParcelSearch />);
    await search(teryt);

    await screen.findByText(`Added parcel ${teryt}.`);
    const state = useAppStore.getState();
    expect(state.fields).toHaveLength(1);
    expect(state.fields[0]!.parcelIds).toEqual([teryt]);
    expect(state.selectedFieldId).toBe(state.fields[0]!.id);
  });

  it('shows the loading state while ULDK answers', async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (release = resolve)));
    render(<ParcelSearch />);
    await search(teryt);

    await screen.findByText('Loading GUGiK ULDK');
    await act(async () => release(new Response(found, { status: 200 })));
    await screen.findByText(`Added parcel ${teryt}.`);
  });

  it('says so in plain words when no parcel has that number', async () => {
    answer(notFound);
    render(<ParcelSearch />);
    await search('123');

    await screen.findByText('No data');
    await screen.findByText(/No parcel has this number/);
    expect(useAppStore.getState().fields).toHaveLength(0);
  });

  it('shows the source error and finds the parcel on retry', async () => {
    answer('Service unavailable', 503);
    answer(found);
    render(<ParcelSearch />);
    const user = await search(teryt);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('GUGiK ULDK did not answer');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(`Added parcel ${teryt}.`);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not search for an empty number', async () => {
    render(<ParcelSearch />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Find parcel' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the offline state and does not search while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<ParcelSearch />);
    await screen.findByText('No connection');
    expect(screen.getByRole('button', { name: 'Find parcel' })).toBeDisabled();
    vi.restoreAllMocks();
  });

  it('has no button named after a demo field (e2e matches those names by substring)', () => {
    render(<ParcelSearch />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).not.toHaveAccessibleName(new RegExp(demoFields.iowa.name));
      expect(button).not.toHaveAccessibleName(new RegExp(demoFields.poznan.name));
    }
  });
});

describe('a tap on the map', () => {
  it('adds the ULDK parcel in Poland', async () => {
    answer(foundAtPoint);
    render(<ParcelSearch />);
    const { lat, lon } = demoFields.poznan.centroid;
    await act(() => addFieldAt(lat, lon));

    const field = useAppStore.getState().fields[0]!;
    expect(field.parcelIds).toEqual([teryt]);
    expect(field.country).toBe('PL');
    await screen.findByText(`Added parcel ${teryt}.`);
  });

  it('falls back to the 4 ha square with a note when there is no parcel', async () => {
    answer(notFoundAtPoint);
    render(<ParcelSearch />);
    await act(() => addFieldAt(54.85, 16.5));

    expect(useAppStore.getState().fields[0]).toEqual(pointToField(54.85, 16.5));
    await screen.findByText(/No parcel was found at that spot/);
  });

  it('falls back to the 4 ha square with a note when ULDK fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<ParcelSearch />);
    const { lat, lon } = demoFields.poznan.centroid;
    await act(() => addFieldAt(lat, lon));

    expect(useAppStore.getState().fields[0]).toEqual(pointToField(lat, lon));
    await screen.findByText(/GUGiK ULDK did not answer, so a 4 ha square/);
  });

  it('says the browser is offline, not that ULDK did not answer, when the tap fails offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<ParcelSearch />);
    const { lat, lon } = demoFields.poznan.centroid;
    await act(() => addFieldAt(lat, lon));

    expect(useAppStore.getState().fields[0]).toEqual(pointToField(lat, lon));
    await screen.findByText(t('parcels.tap.offline'));
    expect(screen.queryByText(t('parcels.tap.error', { source: ULDK_SOURCE }))).not.toBeInTheDocument();
  });

  it('gives a second tap on the same parcel its own field, so an edited field is not replaced', async () => {
    answer(foundAtPoint);
    answer(foundAtPoint);
    const { lat, lon } = demoFields.poznan.centroid;
    await act(() => addFieldAt(lat, lon));
    await act(() => addFieldAt(lat, lon));

    const fields = useAppStore.getState().fields;
    expect(fields).toHaveLength(2);
    expect(fields[0]!.id).not.toBe(fields[1]!.id);
    expect(fields[1]!.parcelIds).toEqual([teryt]);
  });

  it('does not ask ULDK outside Poland', async () => {
    // A US point away from the Iowa demo field, which a nearby tap now takes as a whole (src/map/demoSnap.ts).
    const [lat, lon] = [38.5, -98.0];
    await act(() => addFieldAt(lat, lon));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().fields[0]).toEqual(pointToField(lat, lon));
  });

  it('does not let a late tap answer replace the parcel found by its number (review finding 1)', async () => {
    let releaseTap: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (releaseTap = resolve)));
    answer(found);
    render(<ParcelSearch />);
    const { lat, lon } = demoFields.poznan.centroid;

    let pendingTap: Promise<void> = Promise.resolve();
    act(() => {
      pendingTap = addFieldAt(lat, lon);
    });
    await search(teryt);
    await screen.findByText(`Added parcel ${teryt}.`);
    await act(async () => {
      releaseTap(new Response(notFoundAtPoint, { status: 200 }));
      await pendingTap;
    });

    const { fields, selectedFieldId } = useAppStore.getState();
    expect(fields).toHaveLength(1);
    expect(fields.find((f) => f.id === selectedFieldId)?.parcelIds).toEqual([teryt]);
  });

  it('keeps only the answer to the last tap', async () => {
    let releaseFirst: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (releaseFirst = resolve)));
    answer(notFoundAtPoint);
    const { lat, lon } = demoFields.poznan.centroid;

    const first = addFieldAt(lat, lon);
    await addFieldAt(54.85, 16.5);
    releaseFirst(new Response(foundAtPoint, { status: 200 }));
    await first;

    const fields = useAppStore.getState().fields;
    expect(fields).toHaveLength(1);
    expect(fields[0]!.parcelIds).toBeUndefined();
  });

  it('shows the loading state while the tap waits for ULDK', async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (release = resolve)));
    render(<ParcelSearch />);
    const { lat, lon } = demoFields.poznan.centroid;
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = addFieldAt(lat, lon);
    });

    await screen.findByText('Loading GUGiK ULDK');
    await act(async () => {
      release(new Response(foundAtPoint, { status: 200 }));
      await pending;
    });
    await waitFor(() => expect(screen.queryByText('Loading GUGiK ULDK')).not.toBeInTheDocument());
  });
});
