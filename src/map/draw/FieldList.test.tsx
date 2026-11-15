import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { t } from '../../app/i18n';
import { useAppStore } from '../../app/store';
import { demoFields } from '../../fixtures';
import { cutField } from '../parcels/editFields';
import { FieldList } from './FieldList';

const real = {
  selectField: useAppStore.getState().selectField,
  removeField: useAppStore.getState().removeField,
  updateField: useAppStore.getState().updateField,
};
const { iowa, poznan } = demoFields;
const rowText = (f: { name: string; areaHa: number }) => `${f.name}, ${f.areaHa.toFixed(1)} ha`;
const rowOf = (f: { name: string; areaHa: number }) => screen.getByText(rowText(f)).closest('li')!;

beforeEach(() => {
  useAppStore.getState().reset();
  useAppStore.setState({
    fields: [iowa, poznan],
    selectedFieldId: iowa.id,
    selectField: vi.fn(real.selectField),
    removeField: vi.fn(real.removeField),
    updateField: vi.fn(real.updateField),
  });
});

afterEach(() => {
  useAppStore.setState(real);
});

describe('FieldList', () => {
  it('shows one row per field with its name and area', async () => {
    render(<FieldList />);
    const list = screen.getByRole('list', { name: 'Your fields' });
    await within(list).findByText(rowText(iowa));
    expect(within(list).getByText(rowText(poznan))).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('marks the selected field and selects another one with its radio', async () => {
    const user = userEvent.setup();
    render(<FieldList />);
    expect(await screen.findByRole('radio', { name: rowText(iowa) })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: rowText(poznan) }));

    expect(useAppStore.getState().selectField).toHaveBeenCalledWith(poznan.id);
    expect(await screen.findByRole('radio', { name: rowText(poznan) })).toBeChecked();
  });

  it('selects with the keyboard', async () => {
    const user = userEvent.setup();
    render(<FieldList />);
    (await screen.findByRole('radio', { name: rowText(iowa) })).focus();
    await user.keyboard('{ArrowDown}');
    expect(useAppStore.getState().selectField).toHaveBeenCalledWith(poznan.id);
  });

  it('deletes a field with its Delete button', async () => {
    const user = userEvent.setup();
    render(<FieldList />);
    await screen.findByText(rowText(poznan));

    await user.click(within(rowOf(poznan)).getByRole('button', { name: 'Delete' }));

    expect(useAppStore.getState().removeField).toHaveBeenCalledWith(poznan.id);
    expect(screen.queryByText(rowText(poznan))).not.toBeInTheDocument();
    await screen.findByText(rowText(iowa));
  });

  it('renames a field', async () => {
    const user = userEvent.setup();
    render(<FieldList />);
    await screen.findByText(rowText(iowa));
    const input = within(rowOf(iowa)).getByRole('textbox', { name: 'Field name' });

    await user.clear(input);
    await user.type(input, 'North block{Enter}');

    expect(useAppStore.getState().updateField).toHaveBeenCalledWith(expect.objectContaining({ id: iowa.id, name: 'North block' }));
    await screen.findByText(rowText({ name: 'North block', areaHa: iowa.areaHa }));
  });

  it('saves a new name when the input loses focus', async () => {
    const user = userEvent.setup();
    render(<FieldList />);
    await screen.findByText(rowText(poznan));
    const input = within(rowOf(poznan)).getByRole('textbox', { name: 'Field name' });

    await user.clear(input);
    await user.type(input, 'Meadow');
    await user.tab();

    expect(useAppStore.getState().updateField).toHaveBeenCalledWith(expect.objectContaining({ id: poznan.id, name: 'Meadow' }));
    await screen.findByText(rowText({ name: 'Meadow', areaHa: poznan.areaHa }));
  });

  it('keeps the old name when the new one is blank', async () => {
    const user = userEvent.setup();
    render(<FieldList />);
    await screen.findByText(rowText(iowa));
    const input = within(rowOf(iowa)).getByRole('textbox', { name: 'Field name' });

    await user.clear(input);
    await user.tab();

    expect(useAppStore.getState().updateField).not.toHaveBeenCalled();
    expect(input).toHaveValue(iowa.name);
  });

  it('gives no button a name that contains a field name', async () => {
    render(<FieldList />);
    await screen.findByText(rowText(iowa));
    // Every row has one button, Delete; the join button below the list is not a row button.
    const buttons = screen.getAllByRole('listitem').flatMap((row) => within(row).getAllByRole('button'));
    expect(buttons).toHaveLength(2);
    for (const button of [...buttons, screen.getByRole('button', { name: t('edit.join.button') })]) {
      const name = button.textContent ?? '';
      const label = `${name} ${button.getAttribute('aria-label') ?? ''}`.toLowerCase();
      for (const field of [iowa, poznan]) expect(label).not.toContain(field.name.toLowerCase());
    }
    for (const button of buttons) expect(button).toHaveAccessibleName('Delete');
    // Delete still tells a screen reader which field it removes, through its description.
    expect(within(rowOf(iowa)).getByRole('button', { name: 'Delete' })).toHaveAccessibleDescription(rowText(iowa));
  });

  it('says so when there are no fields', async () => {
    useAppStore.setState({ fields: [], selectedFieldId: null });
    render(<FieldList />);
    await screen.findByText('No fields yet.');
  });
});

describe('FieldList joining', () => {
  const joinButton = () => screen.getByRole('button', { name: t('edit.join.button') });
  const tick = (user: ReturnType<typeof userEvent.setup>, name: string) =>
    user.click(within(screen.getByText((text) => text.startsWith(`${name}, `)).closest('li')!).getByRole('checkbox'));

  /** The Poznań field cut in two: two fields that share a border exactly. */
  const halves = () => {
    const cut = cutField(poznan.id, [
      [poznan.centroid.lon - 1, poznan.centroid.lat],
      [poznan.centroid.lon + 1, poznan.centroid.lat],
    ]);
    if (!cut.ok) throw new Error('setup: the cut failed');
    return cut.fields;
  };

  // #143 review: the checkbox name is one message with {name}, so Polish can order the words its own way.
  it('names each join checkbox with one message that holds the field name', () => {
    const [a, b] = halves();
    useAppStore.setState({ fields: [a!, b!], selectedFieldId: a!.id });
    render(<FieldList />);
    expect(screen.getByRole('checkbox', { name: t('edit.join.pickField', { name: a!.name }) })).toBeInTheDocument();
  });

  it('offers no joining with a single field', () => {
    useAppStore.setState({ fields: [iowa] });
    render(<FieldList />);
    expect(screen.queryByRole('button', { name: t('edit.join.button') })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('keeps the join button off until exactly two fields are ticked', async () => {
    const user = userEvent.setup();
    render(<FieldList />);
    expect(joinButton()).toBeDisabled();
    await tick(user, iowa.name);
    expect(joinButton()).toBeDisabled();
    await tick(user, poznan.name);
    expect(joinButton()).toBeEnabled();
    await tick(user, poznan.name);
    expect(joinButton()).toBeDisabled();
  });

  it('joins two fields that share a border into one and says so', async () => {
    const user = userEvent.setup();
    const [a, b] = halves();
    render(<FieldList />);

    await tick(user, a.name);
    await tick(user, b.name);
    await user.click(joinButton());

    const joinedName = t('merge.field.name', { a: a.name, b: b.name });
    expect(await screen.findByText(t('edit.join.done', { name: joinedName }))).toBeInTheDocument();
    expect(useAppStore.getState().fields.map((f) => f.name).sort()).toEqual([iowa.name, joinedName].sort());
    await waitFor(() => expect(joinButton()).toBeDisabled());
  });

  it('explains why two fields cannot be joined and leaves them as they are', async () => {
    const user = userEvent.setup();
    render(<FieldList />);
    await tick(user, iowa.name);
    await tick(user, poznan.name);
    await user.click(joinButton());

    expect(await screen.findByText(t('edit.join.fail.not-adjacent'))).toBeInTheDocument();
    expect(useAppStore.getState().fields.map((f) => f.id)).toEqual([iowa.id, poznan.id]);
  });

  it('forgets a tick when its field is deleted', async () => {
    const user = userEvent.setup();
    render(<FieldList />);
    await tick(user, iowa.name);
    await tick(user, poznan.name);
    expect(joinButton()).toBeEnabled();
    act(() => useAppStore.getState().removeField(iowa.id));
    await waitFor(() => expect(screen.queryByRole('button', { name: t('edit.join.button') })).not.toBeInTheDocument());
  });
});

