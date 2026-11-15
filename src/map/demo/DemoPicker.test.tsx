import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { t } from '../../app/i18n';
import { MAX_DISTANCE_KM } from '../../context-data/provider';
import { useAppStore } from '../../app/store';
import { demoFields } from '../../fixtures';
import { DemoPicker, demoFromUrl } from './DemoPicker';
import { pitchPoznanField } from './pitchField';

describe('DemoPicker', () => {
  beforeEach(() => useAppStore.setState({ fields: [], selectedFieldId: null, fieldHistory: [] }));

  it.each([
    ['poznan', pitchPoznanField],
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
    await waitFor(() => expect(useAppStore.getState().selectedFieldId).toBe(pitchPoznanField.id));
    expect(useAppStore.getState().fields).toHaveLength(2);
  });

  it('reads the demo field from ?demo= in the address', () => {
    expect(demoFromUrl('?demo=poznan&lang=pl')).toEqual(pitchPoznanField);
    expect(demoFromUrl('?demo=iowa')).toEqual(demoFields.iowa);
    expect(demoFromUrl('?demo=paris')).toBeNull();
    expect(demoFromUrl('')).toBeNull();
  });

  it('the Poznań button is the parcel from the presentation, close enough for the precomputed data', () => {
    expect(pitchPoznanField.parcelIds).toEqual(['302116_5.0015.28/1']);
    const dLat = (pitchPoznanField.centroid.lat - demoFields.poznan.centroid.lat) * 111.32;
    const dLon = (pitchPoznanField.centroid.lon - demoFields.poznan.centroid.lon) * 111.32 * Math.cos((52.45 * Math.PI) / 180);
    expect(Math.hypot(dLat, dLon)).toBeLessThan(MAX_DISTANCE_KM);
    expect(pitchPoznanField.areaHa).toBeGreaterThan(20);
    expect(pitchPoznanField.areaHa).toBeLessThan(24);
  });
});
