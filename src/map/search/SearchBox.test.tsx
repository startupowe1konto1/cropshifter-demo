// UI tests with fetch stubbed by the saved geocoder answers (data/samples/geocoders).
import { readFileSync } from 'node:fs';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { t } from '../../app/i18n';
import { GUGIK_SOURCE, parseGugik } from './gugik';
import { NOMINATIM_SOURCE, parseNominatim } from './nominatim';
import { SearchBox } from './SearchBox';
import { createThrottle } from './throttle';

const sample = (file: string) => readFileSync(`data/samples/geocoders/${file}`, 'utf8');
const gugikHit = sample('gugik-address-swarzedz-rynek-1.json');
const gugikEmpty = sample('gugik-empty.json');
const nominatimHit = sample('nominatim-ames-iowa.json');
const nominatimEmpty = sample('nominatim-empty.json');
// Two places, built from the saved answer, for the list of results.
const [ames] = JSON.parse(nominatimHit) as Record<string, string>[];
const nominatimTwo = JSON.stringify([ames, { ...ames, lat: String(Number(ames!.lat) + 1), display_name: `${ames!.display_name} (2)` }]);
// The query the GUGiK sample answers, read from the sample.
const gugikRow = Object.values(JSON.parse(gugikHit).results)[0] as Record<string, string>;
const polishQuery = `${gugikRow.city}, ${gugikRow.street} ${gugikRow.number}`;

const fetchMock = vi.fn<typeof fetch>();
const answer = (body: string, status = 200) => fetchMock.mockResolvedValueOnce(new Response(body, { status }));
const noWait = createThrottle(0);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function search(query: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(t('search.label')), query);
  await user.click(screen.getByRole('button', { name: t('search.button') }));
  return user;
}

describe('SearchBox', () => {
  it('has no hint under the field, only the label and the Search button (review of the O4 redesign)', () => {
    render(<SearchBox onPick={vi.fn()} throttle={noWait} />);
    expect(screen.getByLabelText(t('search.label'))).not.toHaveAccessibleDescription();
  });

  it('moves the map to the only place GUGiK finds for a Polish address', async () => {
    answer(gugikHit);
    const onPick = vi.fn();
    render(<SearchBox onPick={onPick} throttle={noWait} />);
    await search(polishQuery);

    const [place] = parseGugik(gugikHit);
    await screen.findByText(t('search.moved', { label: place!.label }));
    expect(onPick).toHaveBeenCalledWith(place);
  });

  it('shows the loading state with the name of the source', async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (release = resolve)));
    render(<SearchBox onPick={vi.fn()} throttle={noWait} />);
    await search(polishQuery);

    await screen.findByText(t('ui.state.loading', { source: GUGIK_SOURCE }));
    await act(async () => release(new Response(gugikHit, { status: 200 })));
    await screen.findByText(t('search.moved', { label: parseGugik(gugikHit)[0]!.label }));
  });

  it('lists several places and moves the map to the one picked', async () => {
    answer(nominatimTwo);
    const onPick = vi.fn();
    render(<SearchBox onPick={onPick} throttle={noWait} />);
    const user = await search('Ames');

    const places = parseNominatim(nominatimTwo);
    const list = await screen.findByRole('list', { name: t('search.results') });
    expect(list.querySelectorAll('li')).toHaveLength(places.length);
    expect(onPick).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: places[1]!.label }));
    expect(onPick).toHaveBeenCalledWith(places[1]);
    await screen.findByText(t('search.moved', { label: places[1]!.label }));
  });

  it('asks Nominatim after a GUGiK miss and says so in plain words when nothing matches', async () => {
    answer(gugikEmpty);
    answer(nominatimEmpty);
    const onPick = vi.fn();
    render(<SearchBox onPick={onPick} throttle={noWait} />);
    await search(polishQuery);

    await screen.findByText(t('search.none'));
    expect(fetchMock.mock.calls.map((call) => new URL(String(call[0])).hostname)).toEqual([
      'services.gugik.gov.pl',
      'nominatim.openstreetmap.org',
    ]);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('credits Nominatim next to results that came from it, and not for GUGiK results', async () => {
    answer(nominatimTwo);
    const first = render(<SearchBox onPick={vi.fn()} throttle={noWait} />);
    await search('Ames');
    await screen.findByRole('list', { name: t('search.results') });
    expect(screen.getByText(t('search.attribution'))).toBeInTheDocument();
    first.unmount();

    answer(gugikHit);
    render(<SearchBox onPick={vi.fn()} throttle={noWait} />);
    await search(polishQuery);
    await screen.findByText(t('search.moved', { label: parseGugik(gugikHit)[0]!.label }));
    expect(screen.queryByText(t('search.attribution'))).not.toBeInTheDocument();
  });

  it('shows the Nominatim credit also when Nominatim finds nothing', async () => {
    answer(nominatimEmpty);
    render(<SearchBox onPick={vi.fn()} throttle={noWait} />);
    await search('Ames');
    await screen.findByText(t('search.none'));
    expect(screen.getByText(t('search.attribution'))).toBeInTheDocument();
  });

  it('shows the source error and finds the place on retry', async () => {
    answer('Service unavailable', 503);
    answer(gugikHit);
    const onPick = vi.fn();
    render(<SearchBox onPick={onPick} throttle={noWait} />);
    const user = await search(polishQuery);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t('ui.state.error', { source: GUGIK_SOURCE }));
    await user.click(screen.getByRole('button', { name: t('ui.state.retry') }));

    await screen.findByText(t('search.moved', { label: parseGugik(gugikHit)[0]!.label }));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('names Nominatim when it is the source that failed', async () => {
    answer('', 429);
    render(<SearchBox onPick={vi.fn()} throttle={noWait} />);
    await search('Ames');
    expect(await screen.findByRole('alert')).toHaveTextContent(t('ui.state.error', { source: NOMINATIM_SOURCE }));
  });

  it('shows the offline state and does not search while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<SearchBox onPick={vi.fn()} throttle={noWait} />);
    await screen.findByText(t('ui.state.offline.title'));
    expect(screen.getByRole('button', { name: t('search.button') })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not search for empty text', async () => {
    render(<SearchBox onPick={vi.fn()} throttle={noWait} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t('search.button') }));
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});
