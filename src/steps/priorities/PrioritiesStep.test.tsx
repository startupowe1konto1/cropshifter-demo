import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAppStore } from '../../app/store';
import { providers } from '../../app/providers';
import { SourceError } from '../../contracts';
import type { CropTraits } from '../../contracts';
import { demoFields } from '../../fixtures';
import { cropName } from '../shared/cropName';
import { PrioritiesStep } from './PrioritiesStep';

beforeEach(() => {
  useAppStore.getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const SWITCHES = ['Use less water', 'Grow forage', 'Fix and keep nitrogen', 'Stop erosion', 'Build organic matter'];

describe('PrioritiesStep', () => {
  // Safari shrinks a <legend> to one word per line when its <fieldset> is a grid or flex box (O1-F12), so the
  // fieldsets stay plain blocks and the grid sits on an inner element.
  it('keeps every fieldset a plain block so Safari lays out the legend on one line', async () => {
    useAppStore.getState().addField(demoFields.iowa);
    const { container } = render(<PrioritiesStep />);
    await screen.findByRole('checkbox', { name: SWITCHES[0] });
    const sets = container.querySelectorAll('fieldset');
    expect(sets.length).toBeGreaterThan(0);
    for (const set of sets) {
      expect(set.className).not.toMatch(/\b(grid|flex|inline-grid|inline-flex)\b/);
    }
  });

  it('shows five switches, each with a one-line explanation', async () => {
    useAppStore.getState().addField(demoFields.iowa);
    render(<PrioritiesStep />);
    for (const name of SWITCHES) {
      const box = await screen.findByRole('checkbox', { name });
      expect(box).not.toBeChecked();
      expect(box).toHaveAccessibleDescription(/\w{3,}/);
    }
  });

  it('stores a switched-on priority and removes it when switched off', async () => {
    const user = userEvent.setup();
    useAppStore.getState().addField(demoFields.iowa);
    render(<PrioritiesStep />);
    await user.click(await screen.findByRole('checkbox', { name: 'Stop erosion' }));
    await user.click(screen.getByRole('checkbox', { name: 'Use less water' }));
    expect(useAppStore.getState().priorities.on).toEqual(['erosion', 'water']);
    await user.click(screen.getByRole('checkbox', { name: 'Stop erosion' }));
    expect(useAppStore.getState().priorities.on).toEqual(['water']);
  });

  it('lists the crops of the field country and stores an excluded crop', async () => {
    const user = userEvent.setup();
    useAppStore.getState().addField(demoFields.iowa);
    render(<PrioritiesStep />);
    const list = await screen.findByRole('group', { name: /crops you will not grow/i });
    const [first, second] = await providers.context.getCrops('US');
    await user.click(await within(list).findByRole('checkbox', { name: cropName(first!.id) }));
    expect(useAppStore.getState().priorities.excludedCrops).toEqual([first!.id]);
    expect(within(list).getByRole('checkbox', { name: cropName(second!.id) })).not.toBeChecked();
  });

  it('shows Polish crops for the Poznań field', async () => {
    useAppStore.getState().addField(demoFields.poznan);
    render(<PrioritiesStep />);
    const list = await screen.findByRole('group', { name: /crops you will not grow/i });
    // Read the expected crops from the provider, so the test follows data/crops/pl.json instead of a fixed list.
    const crops = await providers.context.getCrops('PL');
    expect(crops.length).toBeGreaterThan(0);
    for (const crop of crops) {
      expect(await within(list).findByRole('checkbox', { name: cropName(crop.id) })).toBeInTheDocument();
    }
    expect(within(list).queryByRole('checkbox', { name: 'Soybean' })).not.toBeInTheDocument();
  });

  it('explains that crop lists exist for the USA and Poland only when the field is elsewhere', async () => {
    useAppStore.getState().addField({ ...demoFields.iowa, id: 'elsewhere', country: 'OTHER' });
    render(<PrioritiesStep />);
    expect(await screen.findByText(/Crop lists exist for the USA and Poland only/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Stop erosion' })).toBeInTheDocument();
  });

  it('asks for a field first when none is selected, and the switches still work', async () => {
    render(<PrioritiesStep />);
    expect(await screen.findByText(/Pick a field first to see its crops/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Grow forage' })).toBeInTheDocument();
  });

  it('drops excluded crops that the loaded crop list of this field does not have', async () => {
    const pl = await providers.context.getCrops('PL');
    const us = await providers.context.getCrops('US');
    const kept = us[0]!.id;
    const foreign = pl.find((c) => !us.some((u) => u.id === c.id))?.id;
    expect(foreign).toBeDefined(); // the tables must hold at least one crop that only Poland has
    useAppStore.getState().addField(demoFields.iowa);
    useAppStore.getState().setPriorities({ on: [], excludedCrops: [foreign!, kept] });
    render(<PrioritiesStep />);
    await screen.findByRole('checkbox', { name: cropName(kept) });
    expect(useAppStore.getState().priorities.excludedCrops).toEqual([kept]);
  });

  it('keeps the newest crop list when an older request answers late', async () => {
    const user = userEvent.setup();
    const us = await providers.context.getCrops('US');
    const pl = await providers.context.getCrops('PL');
    let releaseLate: (crops: CropTraits[]) => void = () => undefined;
    vi.spyOn(providers.context, 'getCrops')
      .mockRejectedValueOnce(new SourceError('Crop table', 'timeout'))
      .mockImplementationOnce(() => new Promise<CropTraits[]>((resolve) => (releaseLate = resolve)))
      .mockResolvedValueOnce(us);
    useAppStore.getState().addField(demoFields.poznan);
    render(<PrioritiesStep />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    act(() => useAppStore.getState().addField(demoFields.iowa));
    await screen.findByRole('checkbox', { name: cropName(us[0]!.id) });
    await act(async () => releaseLate(pl));
    expect(screen.getByRole('checkbox', { name: cropName(us[0]!.id) })).toBeInTheDocument();
    const plOnly = pl.find((c) => !us.some((u) => u.id === c.id));
    if (plOnly) expect(screen.queryByRole('checkbox', { name: cropName(plOnly.id) })).not.toBeInTheDocument();
  });
});
