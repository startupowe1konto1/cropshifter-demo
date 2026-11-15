import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dictionaries, setLang } from '../../app/i18n';
import { providers } from '../../app/providers';
import { canContinue, useAppStore } from '../../app/store';
import { SourceError } from '../../contracts';
import type { CropYear } from '../../contracts';
import { demoFields, fixtureCrops } from '../../fixtures';
import { cropName } from '../shared/cropName';
import { CropsStep, lastSeasons } from './CropsStep';

beforeEach(() => {
  useAppStore.getState().reset();
  vi.restoreAllMocks();
  // Tested against the fixture crop lists, not the sourced tables in data/crops/, which grow as O4 adds sources.
  vi.spyOn(providers.context, 'getCrops').mockImplementation(async (country) =>
    country === 'OTHER' ? [] : fixtureCrops[country],
  );
});

// Values come from the data, never typed into the test (CLAUDE.md): the proposed history from the provider,
// the crop tiles from the fixture crop lists the provider is mocked with.
async function proposedHistory(): Promise<CropYear[]> {
  const h = await providers.context.getCropHistory(demoFields.iowa);
  if (h.status !== 'ready') throw new Error('the Iowa demo field should have a crop history');
  return [...h.data].sort((a, b) => a.year - b.year);
}
const mainCrops = (country: 'US' | 'PL') => fixtureCrops[country].filter((c) => c.kind !== 'cover');

const atStep3 = (field = demoFields.iowa) => {
  useAppStore.getState().addField(field);
  useAppStore.getState().goToStep(3);
};

describe('CropsStep with a proposed history (CropScape)', () => {
  it('asks "Is this right?" with the years and crops', async () => {
    atStep3();
    render(<CropsStep />);
    expect(await screen.findByText(/Is this right\?/)).toBeInTheDocument();
    const list = screen.getByRole('list', { name: /crops on this field/i });
    const history = await proposedHistory();
    for (const y of history.slice(-3)) {
      expect(within(list).getByText(String(y.year))).toBeInTheDocument();
      expect(within(list).getAllByText(cropName(y.crop)).length).toBeGreaterThan(0);
    }
  });

  it('"Yes" stores the history with source cropscape', async () => {
    const user = userEvent.setup();
    atStep3();
    render(<CropsStep />);
    await user.click(await screen.findByRole('button', { name: /Yes, use these crops/ }));
    const stored = useAppStore.getState().cropHistory[demoFields.iowa.id] ?? [];
    expect(stored.length).toBeGreaterThanOrEqual(2);
    expect(stored.every((y) => y.source === 'cropscape')).toBe(true);
    expect(await screen.findByText(/Saved \d+ years of crops/)).toBeInTheDocument();
    expect(canContinue(useAppStore.getState())).toBe(true);
  });

  it('editing one year stores that year with source farmer', async () => {
    const user = userEvent.setup();
    atStep3();
    render(<CropsStep />);
    const history = await proposedHistory();
    const newest = history[history.length - 1]!;
    const other = history[0]!;
    const replacement = mainCrops('US').find((c) => c.id !== newest.crop)!;
    await user.click(await screen.findByRole('button', { name: `Change ${newest.year}` }));
    const picker = await screen.findByRole('radiogroup', { name: new RegExp(String(newest.year)) });
    await user.click(within(picker).getByRole('radio', { name: cropName(replacement.id) }));
    const stored = useAppStore.getState().cropHistory[demoFields.iowa.id] ?? [];
    expect(stored.find((y) => y.year === newest.year)).toEqual({ year: newest.year, crop: replacement.id, source: 'farmer' });
    expect(stored.find((y) => y.year === other.year)?.source).toBe('cropscape');
  });
});

describe('CropsStep without a history (most of Poland)', () => {
  it('shows the icon picker for the last three seasons', async () => {
    atStep3(demoFields.poznan);
    render(<CropsStep />);
    expect(await screen.findByText(/Which crops grew here/)).toBeInTheDocument();
    for (const year of lastSeasons()) {
      const group = screen.getByRole('radiogroup', { name: new RegExp(String(year)) });
      for (const crop of mainCrops('PL')) expect(within(group).getByRole('radio', { name: cropName(crop.id) })).toBeInTheDocument();
    }
  });

  it('needs at least two years before the farmer can continue', async () => {
    const user = userEvent.setup();
    atStep3(demoFields.poznan);
    render(<CropsStep />);
    const [first, second] = lastSeasons();
    const [cropA, cropB] = mainCrops('PL');
    await user.click(
      within(await screen.findByRole('radiogroup', { name: new RegExp(String(first)) })).getByRole('radio', {
        name: cropName(cropA!.id),
      }),
    );
    expect(canContinue(useAppStore.getState())).toBe(false);
    expect(screen.getByText(/Pick at least two years/)).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('radiogroup', { name: new RegExp(String(second)) })).getByRole('radio', {
        name: cropName(cropB!.id),
      }),
    );
    const stored = useAppStore.getState().cropHistory[demoFields.poznan.id] ?? [];
    expect(stored).toEqual([
      { year: second, crop: cropB!.id, source: 'farmer' },
      { year: first, crop: cropA!.id, source: 'farmer' },
    ]);
    expect(canContinue(useAppStore.getState())).toBe(true);
    expect(await screen.findByText(/Saved 2 years of crops/)).toBeInTheDocument();
  });

  it('says "no crop history" in Polish when the UI is in Polish', async () => {
    const h = await providers.context.getCropHistory(demoFields.poznan);
    if (h.status !== 'no-data') throw new Error('the Poznań demo field should have no crop history');
    const polish = dictionaries.pl[h.reason.code];
    expect(polish, `${h.reason.code} has no Polish text`).toBeDefined();
    act(() => setLang('pl'));
    try {
      atStep3(demoFields.poznan);
      render(<CropsStep />);
      expect(await screen.findByText(polish!)).toBeInTheDocument();
      expect(screen.queryByText(dictionaries.en[h.reason.code]!)).not.toBeInTheDocument();
    } finally {
      act(() => setLang('en'));
    }
  });

  it('leaves cover crops out of the main crop list', async () => {
    atStep3(demoFields.poznan);
    render(<CropsStep />);
    const group = await screen.findByRole('radiogroup', { name: new RegExp(String(lastSeasons()[0])) });
    const cover = fixtureCrops.PL.find((c) => c.kind === 'cover')!;
    expect(within(group).queryByRole('radio', { name: cropName(cover.id) })).not.toBeInTheDocument();
  });
});

describe('CropsStep states', () => {
  it('asks for a field when none is selected', async () => {
    render(<CropsStep />);
    expect(await screen.findByText('Pick a field first.')).toBeInTheDocument();
  });

  it('shows a source error with a retry when the crop history fails, and the picker still works', async () => {
    vi.spyOn(providers.context, 'getCropHistory').mockRejectedValueOnce(new SourceError('USDA CropScape', 'timeout'));
    atStep3();
    render(<CropsStep />);
    expect(await screen.findByRole('alert')).toHaveTextContent('USDA CropScape');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(await screen.findByText(/Which crops grew here/)).toBeInTheDocument();
  });
});

describe('lastSeasons', () => {
  it('counts the current year once its harvest is in (from August)', () => {
    expect(lastSeasons(new Date(2026, 10, 14))).toEqual([2026, 2025, 2024]);
    expect(lastSeasons(new Date(2026, 2, 1))).toEqual([2025, 2024, 2023]);
  });
});

describe('CropsStep review follow-ups (#76)', () => {
  it('shows the three newest proposed years first and the rest behind "Show earlier years"', async () => {
    const user = userEvent.setup();
    const history = await proposedHistory();
    atStep3();
    render(<CropsStep />);
    const list = await screen.findByRole('list', { name: /crops on this field/i });
    const newest = history.slice(-3);
    const older = history.slice(0, -3);
    expect(within(list).getAllByRole('listitem')).toHaveLength(Math.min(3, history.length));
    for (const y of newest) expect(within(list).getByText(String(y.year))).toBeInTheDocument();
    if (older.length > 0) {
      for (const y of older) expect(within(list).queryByText(String(y.year))).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: `Show ${older.length} earlier years` }));
      expect(within(list).getAllByRole('listitem')).toHaveLength(history.length);
    }
  });

  it('"Yes" still stores every proposed year, not only the visible ones', async () => {
    const user = userEvent.setup();
    const history = await proposedHistory();
    atStep3();
    render(<CropsStep />);
    await user.click(await screen.findByRole('button', { name: /Yes, use these crops/ }));
    expect(useAppStore.getState().cropHistory[demoFields.iowa.id]).toHaveLength(history.length);
  });

  it('says "1 year" for a single saved season', async () => {
    const user = userEvent.setup();
    atStep3(demoFields.poznan);
    render(<CropsStep />);
    const [first] = lastSeasons();
    const [crop] = mainCrops('PL');
    await user.click(
      within(await screen.findByRole('radiogroup', { name: new RegExp(String(first)) })).getByRole('radio', {
        name: cropName(crop!.id),
      }),
    );
    expect(await screen.findByText('Saved 1 year of crops.')).toBeInTheDocument();
  });

  it('asks "Is this right?" as a heading, like the picker title', async () => {
    atStep3();
    render(<CropsStep />);
    expect(await screen.findByRole('heading', { level: 2, name: /Is this right\?/ })).toBeInTheDocument();
  });
});

