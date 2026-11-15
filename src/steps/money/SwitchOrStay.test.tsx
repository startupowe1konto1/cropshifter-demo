// Step 6 "Switch or stay?" (O1-F14): one option next to the farmer's rotation, a one-line verdict, three rows of
// numbers and the confirmed payments. Every value is read back from the analysis or the estimates the test builds.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { t } from '../../app/i18n';
import type { MoneyEstimate, RotationOption } from '../../contracts';
import { iowaAnalysis } from '../../fixtures';
import { moneyRows } from './moneyRows';
import { term } from '../glossary/useTerm';
import { SwitchOrStay } from './SwitchOrStay';
import { estimate, withMoney } from './testMoney';

const ids = iowaAnalysis.shownByGoal.keepSoil ?? [];
const rotation = (id: string) => iowaAnalysis.rotations.find((r) => r.id === id)!;
const isCurrent = (id: string) => rotation(id).isCurrent;
const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n));
const datasetId = iowaAnalysis.datasets[0]!.id;

const payment = (amount: number, confirmed: boolean): MoneyEstimate['payments'][number] => ({
  programme: confirmed ? 'Confirmed programme' : 'Unconfirmed programme',
  amountPerHa: { value: amount, unit: 'USD/ha per year', datasetIds: [datasetId], kind: 'observation', retrievedAt: '2026-11-14' },
  condition: { code: 'money.condition.us-328-basic' },
  confirmed,
});

/** The current rotation earns 500; option i earns 1000·(i+1). The first option has one confirmed and one unconfirmed payment. */
function draw(lower = false) {
  let firstOption = true;
  const money: RotationOption['money'][] = ids.map((id, i) => {
    const mean = isCurrent(id) ? 500 : lower ? 100 * (i + 1) : 1000 * (i + 1);
    const pays = !isCurrent(id) && firstOption ? [payment(49, true), payment(30, false)] : [];
    if (!isCurrent(id)) firstOption = false;
    return { status: 'ready', data: estimate(mean, mean / 2, mean * 1.5, 'USD', pays) };
  });
  const analysis = withMoney(iowaAnalysis, money);
  const rows = moneyRows(analysis, 'keepSoil');
  render(<SwitchOrStay rows={rows} analysis={analysis} goal="keepSoil" />);
  const current = rows.find((r) => r.isCurrent)!;
  const options = rows.filter((r) => !r.isCurrent);
  return { rows, current, options };
}

const grid = () => screen.getByRole('table', { name: t('steps.money.compare') });

describe('SwitchOrStay', () => {
  it('puts the first option next to the current rotation with soil, climate and income', async () => {
    const { current, options } = draw();
    const table = await screen.findByRole('table', { name: t('steps.money.compare') });
    const opt = options[0]!;
    expect(within(table).getByText(opt.title)).toBeInTheDocument();
    expect(within(table).getByText(current.title)).toBeInTheDocument();
    expect(within(table).getByText(t('steps.money.bestFor', { goal: t('steps.goal.keepSoil') }))).toBeInTheDocument();
    for (const r of [opt, current]) {
      const rot = rotation(r.id);
      expect(within(table).getAllByText(String(Math.round(rot.soilHealth.value))).length).toBeGreaterThan(0);
      expect(within(table).getAllByText(String(Math.round(rot.climateResilience.value))).length).toBeGreaterThan(0);
    }
    expect(within(table).getAllByRole('button', { name: /our calculation/ }).length).toBeGreaterThanOrEqual(2);
  });

  it('sums up the trade-off in one line, with the income difference as a sourced number', async () => {
    const { current, options } = draw();
    const verdict = await screen.findByTestId('money-verdict');
    const diff = options[0]!.mean! - current.mean!;
    expect(verdict).toHaveTextContent(fmt(Math.abs(diff)));
    expect(verdict).toHaveTextContent(diff > 0 ? /more/ : /less/);
    expect(within(verdict).getByRole('button', { name: /our calculation/ })).toBeInTheDocument();
  });

  it('says less when the option earns less than the current rotation', async () => {
    draw(true);
    expect(await screen.findByTestId('money-verdict')).toHaveTextContent(/less/);
  });

  it('switches the compared option', async () => {
    const { options } = draw();
    await screen.findByTestId('money-verdict');
    await userEvent.setup().click(screen.getByRole('radio', { name: t('steps.rotations.option', { n: 2 }) }));
    expect(within(grid()).getByText(options[1]!.title)).toBeInTheDocument();
    expect(within(grid()).queryByText(options[0]!.title)).toBeNull();
  });

  it('counts only confirmed payments', async () => {
    draw();
    const bar = await screen.findByTestId('money-payments');
    expect(bar).toHaveTextContent('49');
    expect(bar).not.toHaveTextContent('79');
  });

  // O1-F15: the bar says what a payment is, who pays it and that it comes on top of the income, and names the programmes.
  it('explains the payments and names only the confirmed programmes', async () => {
    draw();
    const bar = await screen.findByTestId('money-payments');
    expect(within(bar).getByRole('button', { name: new RegExp(term('government-support').label, 'i') })).toBeInTheDocument();
    expect(bar).toHaveTextContent(t('steps.money.paymentsHow.US'));
    expect(bar).toHaveTextContent('Confirmed programme');
    expect(bar).not.toHaveTextContent('Unconfirmed programme');
  });
});
