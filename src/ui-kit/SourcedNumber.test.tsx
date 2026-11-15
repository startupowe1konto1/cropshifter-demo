import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Dataset, Sourced } from '../contracts';
import { SourcedNumber } from './SourcedNumber';

const smap: Dataset = {
  id: 'smap-l4',
  name: 'SMAP L4 root zone soil moisture',
  provider: 'NASA NSIDC DAAC',
  url: 'https://nsidc.org/data/spl4smgp',
  nasa: true,
  resolution: '9 km',
  period: '2015–2025',
  kind: 'model',
};

const moisture: Sourced<number> = {
  value: 0.31,
  unit: 'm³/m³',
  datasetIds: ['smap-l4'],
  kind: 'model',
  retrievedAt: '2026-11-14',
  range: { low: 0.22, high: 0.38, basis: '10th to 90th percentile of the record' },
};

describe('SourcedNumber', () => {
  it('shows "No data" and the reason for a null value, and no digit', () => {
    const missing: Sourced<number> = {
      value: null,
      unit: 'm³/m³',
      datasetIds: ['smap-l4'],
      kind: 'model',
      retrievedAt: '2026-11-14',
      missingReason: 'The satellite record starts after this year',
    };
    const { container } = render(<SourcedNumber value={missing} datasets={[smap]} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('The satellite record starts after this year')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d/);
    expect(container.textContent).not.toMatch(/[-–—]/);
  });

  it('says so when a null value comes without a reason', () => {
    const missing: Sourced<number> = { value: null, datasetIds: [], kind: 'derived', retrievedAt: '2026-11-14' };
    render(<SourcedNumber value={missing} datasets={[]} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('The source gave no reason.')).toBeInTheDocument();
  });

  it('treats a number that is not finite as missing', () => {
    const broken: Sourced<number> = { value: Number.NaN, datasetIds: [], kind: 'derived', retrievedAt: '2026-11-14' };
    render(<SourcedNumber value={broken} datasets={[]} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.queryByText('NaN')).not.toBeInTheDocument();
  });

  it('shows the value, unit, range and basis', () => {
    render(<SourcedNumber value={moisture} datasets={[smap]} decimals={2} />);
    expect(screen.getByText('0.31')).toBeInTheDocument();
    expect(screen.getByText('m³/m³')).toBeInTheDocument();
    expect(screen.getByText('0.22–0.38')).toBeInTheDocument();
    expect(screen.getByText('10th to 90th percentile of the record')).toBeInTheDocument();
  });

  it('rounds numbers to one decimal by default', () => {
    render(<SourcedNumber value={moisture} datasets={[smap]} />);
    expect(screen.getByText('0.3')).toBeInTheDocument();
    expect(screen.getByText('0.2–0.4')).toBeInTheDocument();
  });

  it('shows a text value as it is', () => {
    const suitability: Sourced<string> = { value: 'S2', datasetIds: [], kind: 'model', retrievedAt: '2026-11-14' };
    render(<SourcedNumber value={suitability} datasets={[]} />);
    expect(screen.getByText('S2')).toBeInTheDocument();
  });

  it('opens and closes the source panel from the chip', async () => {
    const user = userEvent.setup();
    render(<SourcedNumber value={moisture} datasets={[smap]} decimals={2} />);
    const chip = screen.getByRole('button', { name: 'Source: model estimate' });
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('SMAP L4 root zone soil moisture')).not.toBeInTheDocument();

    await user.click(chip);
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('SMAP L4 root zone soil moisture')).toBeInTheDocument();
    expect(screen.getByText('NASA NSIDC DAAC')).toBeInTheDocument();
    expect(screen.getByText('9 km')).toBeInTheDocument();
    expect(screen.getByText('2015–2025')).toBeInTheDocument();
    expect(screen.getByText('2026-11-14')).toBeInTheDocument();

    await user.click(chip);
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('SMAP L4 root zone soil moisture')).not.toBeInTheDocument();
  });

  it.each([
    ['observation', 'observed'],
    ['model', 'model estimate'],
    ['derived', 'our calculation'],
  ] as const)('names the %s kind as "%s" on the number and in its source panel', async (kind, label) => {
    render(<SourcedNumber value={{ ...moisture, kind }} datasets={[smap]} />);
    // D56: no chip next to the number. The number is the button; its accessible name says what a tap opens, and the
    // panel says the kind in words.
    const number = screen.getByRole('button', { name: `Source: ${label}` });
    expect(number).toHaveTextContent('0.3');
    expect(number).not.toHaveTextContent(label);
    await userEvent.setup().click(number);
    expect(within(screen.getByRole('group', { name: 'Source details' })).getByText(label)).toBeInTheDocument();
  });

  it('lists a dataset id it cannot find as an unknown source', async () => {
    const user = userEvent.setup();
    render(<SourcedNumber value={{ ...moisture, datasetIds: ['smap-l4', 'mystery-set'] }} datasets={[smap]} />);
    await user.click(screen.getByRole('button', { name: 'Source: model estimate' }));
    expect(await screen.findByText('unknown source: mystery-set')).toBeInTheDocument();
    expect(screen.getByText('SMAP L4 root zone soil moisture')).toBeInTheDocument();
  });

  it('says when no source is listed', async () => {
    const user = userEvent.setup();
    render(<SourcedNumber value={{ ...moisture, datasetIds: [] }} datasets={[smap]} />);
    await user.click(screen.getByRole('button', { name: 'Source: model estimate' }));
    expect(await screen.findByText('No source is listed for this value.')).toBeInTheDocument();
  });
});
