import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { t } from '../../app/i18n';
import { useAppStore } from '../../app/store';
import { demoFields } from '../../fixtures';
import { DemoPicker, demoFromUrl } from './DemoPicker';

describe('DemoPicker', () => {
  beforeEach(() => useAppStore.setState({ fields: [], selectedFieldId: null, fieldHistory: [] }));

  it.each([
    ['poznan', demoFields.poznan],
    ['iowa', demoFields.iowa],
  ] as const)('the %s button adds and selects that demo field', async (key, field) => {
    render(<DemoPicker />);
    await userEvent.click(await screen.findByRole('button', { name: t(`demo.${key}`) }));
    await waitFor(() => expect(useAppStore.getState().selectedFieldId).toBe(field.id));
    expect(useAppStore.getState().fields).toEqual([field]);
  });

  it('switching between the demo locations keeps one field per location', async () => {
    render(<DemoPicker />);
    await userEvent.click(await screen.findByRole('button', { name: t('demo.poznan') }));
    await userEvent.click(screen.getByRole('button', { name: t('demo.iowa') }));
    await userEvent.click(screen.getByRole('button', { name: t('demo.poznan') }));
    await waitFor(() => expect(useAppStore.getState().selectedFieldId).toBe(demoFields.poznan.id));
    expect(useAppStore.getState().fields).toHaveLength(2);
  });

  it('reads the demo field from ?demo= in the address', () => {
    expect(demoFromUrl('?demo=poznan&lang=pl')).toEqual(demoFields.poznan);
    expect(demoFromUrl('?demo=iowa')).toEqual(demoFields.iowa);
    expect(demoFromUrl('?demo=paris')).toBeNull();
    expect(demoFromUrl('')).toBeNull();
  });
});
