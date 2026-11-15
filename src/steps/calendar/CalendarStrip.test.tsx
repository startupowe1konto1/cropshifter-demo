import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CalendarMonth, Dataset, Sourced } from '../../contracts';
import { fixtureDatasets, iowaAnalysis } from '../../fixtures';
import { cropName } from '../shared/cropName';
import { CalendarStrip } from './CalendarStrip';
import { COVER_CLASS, COVER_STATES, markShare } from './marks';

const power: Dataset = {
  id: 'nasa-power-monthly',
  name: 'NASA POWER monthly agroclimatology',
  provider: 'NASA LaRC',
  url: 'https://power.larc.nasa.gov/',
  nasa: true,
  resolution: 'about 50 km',
  period: '1981–2025',
  kind: 'model',
};

// Shares are built from the rule file's mark share, so a new rule value does not break the tests.
const threshold = markShare ?? 0;
const above = Math.round((threshold + (1 - threshold) / 2) * 100) / 100;
const higher = Math.round((threshold + (1 - threshold) * 0.75) * 100) / 100;
const below = Math.round((threshold / 2) * 100) / 100;

const share = (value: number | null, extra: Partial<Sourced> = {}): Sourced => ({
  value,
  unit: 'share of years',
  datasetIds: ['nasa-power-monthly'],
  kind: 'model',
  retrievedAt: '2026-11-14',
  ...extra,
});

/** Two rotation years: maize then soybean, bare from harvest to planting, a cover crop in the first December. */
function twoYears(): CalendarMonth[] {
  const months: CalendarMonth[] = [];
  for (let yearIndex = 0; yearIndex < 2; yearIndex++) {
    const crop = yearIndex === 0 ? 'maize' : 'soybean';
    for (let month = 1; month <= 12; month++) {
      const growing = month >= 5 && month <= 10;
      months.push({
        yearIndex,
        month,
        ...(growing ? { crop } : {}),
        cover: growing ? 'crop' : month === 11 ? 'residue' : 'bare',
        exposure: [],
      });
    }
  }
  months[11] = { yearIndex: 0, month: 12, crop: 'cereal-rye', cover: 'cover-crop', exposure: [] };
  months[6]!.exposure = [{ hazard: 'drought', probability: share(above) }];
  months[12 + 7]!.exposure = [{ hazard: 'heat', probability: share(higher) }];
  months[12 + 8]!.exposure = [
    { hazard: 'frost', probability: share(null, { missingReason: 'frost days are missing for 1983' }) },
  ];
  return months;
}

const maize = cropName('maize');
const soybean = cropName('soybean');

describe('CalendarStrip', () => {
  it('is a table named as a calendar, with one row per rotation year and twelve months each', async () => {
    render(<CalendarStrip months={twoYears()} datasets={[power]} />);
    const table = await screen.findByRole('table', { name: /calendar/i });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // month header + two years
    expect(within(rows[1]!).getByRole('rowheader')).toHaveTextContent('Year 1');
    expect(within(rows[1]!).getAllByRole('cell')).toHaveLength(12);
    expect(within(rows[2]!).getAllByRole('cell')).toHaveLength(12);
  });

  it('puts the words for each month inside the cell, so screen readers and colour-blind readers get them', async () => {
    render(<CalendarStrip months={twoYears()} datasets={[power]} />);
    expect(await screen.findAllByRole('cell', { name: 'March, bare soil' })).toHaveLength(2);
    expect(screen.getAllByRole('cell', { name: 'November, residue' })).toHaveLength(2);
    expect(screen.getByRole('cell', { name: `June, ${maize}` })).toBeInTheDocument();
    expect(
      screen.getByRole('cell', { name: `December, cover crop: ${cropName('cereal-rye')}` }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('March, bare soil')[0]).toHaveClass('sr-only');
  });

  it('gives cover crop, residue and bare soil their own pattern, so the four states differ without colour', () => {
    const patterns = COVER_STATES.map((cover) => COVER_CLASS[cover].match(/gradient\([^\]]*/)?.[0] ?? null);
    expect(patterns[0]).toBeFalsy(); // living crop: plain colour
    expect(new Set(patterns.slice(1)).size).toBe(3);
    expect(patterns.slice(1).every(Boolean)).toBe(true);
  });

  it('uses the crop names it is given', async () => {
    render(
      <CalendarStrip months={twoYears()} datasets={[power]} cropName={(id) => (id === 'maize' ? 'Corn' : id)} />,
    );
    expect(await screen.findByRole('cell', { name: 'June, Corn' })).toBeInTheDocument();
  });

  it('marks a month with a hazard and names the hazard in the label', async () => {
    render(<CalendarStrip months={twoYears()} datasets={[power]} />);
    const july = await screen.findByRole('button', { name: `July, ${maize}, drought risk` });
    expect(within(july).getByTestId('mark-drought')).toBeInTheDocument();
  });

  it('shows the share of years as a percentage with its source chip when the month is tapped', async () => {
    const user = userEvent.setup();
    render(<CalendarStrip months={twoYears()} datasets={[power]} />);
    await user.click(await screen.findByRole('button', { name: `July, ${maize}, drought risk` }));
    const details = await screen.findByRole('region', { name: /July, year 1/ });
    expect(await within(details).findByText('Drought in July')).toBeInTheDocument();
    expect(within(details).getByText(String(Math.round(above * 100)))).toBeInTheDocument();
    expect(within(details).getByText('% of years')).toBeInTheDocument();
    expect(within(details).getByRole('button', { name: /model estimate/ })).toBeInTheDocument();
    await user.click(within(details).getByRole('button', { name: /model estimate/ }));
    expect(await within(details).findByText('NASA POWER monthly agroclimatology')).toBeInTheDocument();
    expect(within(details).getByText('1981–2025')).toBeInTheDocument();
  });

  it('never claims a year count, even when a range basis names a period', async () => {
    const user = userEvent.setup();
    const months = twoYears();
    months[6]!.exposure = [
      { hazard: 'drought', probability: share(above, { range: { low: threshold, high: 1, basis: '95% interval, 1981–2025' } }) },
    ];
    render(<CalendarStrip months={months} datasets={[power]} />);
    await user.click(await screen.findByRole('button', { name: `July, ${maize}, drought risk` }));
    const details = await screen.findByRole('region', { name: /July, year 1/ });
    expect(await within(details).findByText('% of years')).toBeInTheDocument();
    expect(details.textContent).not.toMatch(/ of \d+ years/);
  });

  it('shows a missing share as missing, not as a hazard, with the reason and no number', async () => {
    const user = userEvent.setup();
    render(<CalendarStrip months={twoYears()} datasets={[power]} />);
    const september = await screen.findByRole('button', { name: `September, ${soybean}, no data on frost` });
    expect(within(september).queryByTestId('mark-frost')).not.toBeInTheDocument();
    expect(within(september).getByTestId('mark-missing')).toBeInTheDocument();
    await user.click(september);
    const details = await screen.findByRole('region', { name: /September, year 2/ });
    expect(await within(details).findByText('No data')).toBeInTheDocument();
    expect(within(details).getByText('frost days are missing for 1983')).toBeInTheDocument();
  });

  it('closes the details when the same month is tapped again', async () => {
    const user = userEvent.setup();
    render(<CalendarStrip months={twoYears()} datasets={[power]} />);
    const july = await screen.findByRole('button', { name: `July, ${maize}, drought risk` });
    await user.click(july);
    expect(july).toHaveAttribute('aria-expanded', 'true');
    await user.click(july);
    expect(july).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Drought in July')).not.toBeInTheDocument();
  });

  it('has a legend with the four cover states, their patterns and three hazards, and says bare months are our calculation', async () => {
    render(<CalendarStrip months={twoYears()} datasets={[power]} />);
    const legend = await screen.findByRole('group', { name: 'Legend' });
    for (const text of ['Crop', 'Cover crop', 'Residue', 'Bare soil', 'Drought', 'Heat', 'Frost']) {
      expect(within(legend).getByText(text)).toBeInTheDocument();
    }
    for (const cover of COVER_STATES) {
      expect(within(legend).getByTestId(`swatch-${cover}`).className).toContain(COVER_CLASS[cover]);
    }
    expect(screen.getByText('Bare periods are our calculation from crop calendars.')).toBeInTheDocument();
  });

  it('holds no lists, so the lists of a card keep their order (gaps, then risks)', async () => {
    const user = userEvent.setup();
    render(<CalendarStrip months={twoYears()} datasets={[power]} />);
    await user.click(await screen.findByRole('button', { name: `July, ${maize}, drought risk` }));
    await screen.findByText('Drought in July');
    expect(screen.queryAllByRole('list')).toHaveLength(0);
  });

  it('shows the no-data state with a reason for an empty calendar, never a blank', async () => {
    render(<CalendarStrip months={[]} datasets={[power]} />);
    expect(await screen.findByText('No data')).toBeInTheDocument();
    expect(screen.getByText(/no month-by-month calendar/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('marks a month as missing when the calendar skips it', async () => {
    const months = twoYears().filter((m) => !(m.yearIndex === 1 && m.month === 4));
    render(<CalendarStrip months={months} datasets={[power]} />);
    expect(await screen.findByRole('cell', { name: 'April, no data' })).toBeInTheDocument();
  });

  it('leaves out a mark for a hazard at or under the mark share of the hazard rules', async () => {
    const months = twoYears();
    months[6]!.exposure = [
      { hazard: 'drought', probability: share(below) },
      { hazard: 'heat', probability: share(threshold) },
    ];
    render(<CalendarStrip months={months} datasets={[power]} />);
    expect(await screen.findByRole('cell', { name: `July, ${maize}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /July/ })).not.toBeInTheDocument();
  });

  it('renders a rotation from the Iowa fixture: one row per rotation year', async () => {
    const rotation = iowaAnalysis.rotations[0]!;
    render(<CalendarStrip months={rotation.calendar} datasets={fixtureDatasets} label="your rotation" />);
    const table = await screen.findByRole('table', { name: /calendar: your rotation/i });
    expect(within(table).getAllByRole('row')).toHaveLength(rotation.years.length + 1);
  });
});
