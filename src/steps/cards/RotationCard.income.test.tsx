// The income section of the rotation card (issue #98 item 9). The fixtures carry no money yet, so these tests attach
// a MoneyEstimate of their own to the Iowa current rotation; every value is read back from it, never typed twice.
import { render, screen, within } from '@testing-library/react';
import { t } from '../../app/i18n';
import type { MoneyEstimate, RotationOption } from '../../contracts';
import { iowaAnalysis } from '../../fixtures';
import { term } from '../glossary/useTerm';
import { RotationCard } from './RotationCard';

const datasets = iowaAnalysis.datasets;
const current = iowaAnalysis.rotations.find((r) => r.isCurrent)!;
const datasetId = datasets[0]!.id;

const estimate: MoneyEstimate = {
  currency: 'USD',
  campaign: 'test campaign 2026',
  marginPerHa: {
    value: 1234.56,
    unit: 'USD/ha',
    datasetIds: [datasetId],
    kind: 'derived',
    retrievedAt: '2026-11-14',
    range: { low: 310.4, high: 2050.9, basis: '10th–90th percentile year' },
  },
  payments: [
    {
      programme: 'Confirmed programme',
      amountPerHa: { value: 98.7, unit: 'USD/ha per year', datasetIds: [datasetId], kind: 'observation', retrievedAt: '2026-11-14' },
      condition: { code: 'money.condition.us-328-basic' },
      confirmed: true,
    },
    {
      programme: 'Unconfirmed programme',
      amountPerHa: { value: 55.5, unit: 'USD/ha per year', datasetIds: [datasetId], kind: 'observation', retrievedAt: '2026-11-14' },
      condition: { code: 'money.condition.us-340' },
      confirmed: false,
    },
  ],
};

const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
const withMoney = (money: RotationOption['money']): RotationOption => ({ ...current, money });
const card = (money: RotationOption['money'], moneyAvailable: boolean) =>
  render(<RotationCard rotation={withMoney(money)} rank={1} goal="keepSoil" datasets={datasets} moneyAvailable={moneyAvailable} />);
const incomeSection = () => screen.getByRole('region', { name: t('steps.rotations.income.title') });

describe('RotationCard income section', () => {
  it('renders nothing while money is off, even when the rotation carries an estimate', () => {
    card({ status: 'ready', data: estimate }, false);
    const article = screen.getByRole('article');
    expect(within(article).queryByRole('heading', { name: t('steps.rotations.income.title') })).not.toBeInTheDocument();
    expect(within(article).queryByText(t('steps.rotations.income.notForecast'))).not.toBeInTheDocument();
  });

  it('shows the average, bad-year and good-year margin with sources and the currency', async () => {
    card({ status: 'ready', data: estimate }, true);
    await screen.findByText(t('steps.rotations.income.notForecast'));
    const section = incomeSection();
    const m = estimate.marginPerHa;
    for (const [label, value] of [
      ['steps.rotations.income.average', m.value!],
      ['steps.rotations.income.bad', m.range!.low],
      ['steps.rotations.income.good', m.range!.high],
    ] as const) {
      const row = within(section).getByText(t(label)).closest('div')!;
      expect(row).toHaveTextContent(fmt(value));
      expect(row).toHaveTextContent(m.unit!);
      expect(within(row as HTMLElement).getByRole('button', { name: /our calculation/ })).toBeInTheDocument();
    }
    expect(within(section).getByRole('button', { name: t('ui.term.about', { label: term('margin').label }) })).toBeInTheDocument();
  });

  it('lists the payments: confirmed ones with their amount, the others marked as not confirmed, with the campaign', async () => {
    card({ status: 'ready', data: estimate }, true);
    await screen.findByText(t('steps.rotations.income.notForecast'));
    const section = incomeSection();
    const payments = within(section).getByRole('group', { name: t('steps.rotations.income.payments') });
    const items = estimate.payments.map((p) => within(payments).getByRole('group', { name: p.programme }));
    expect(items).toHaveLength(estimate.payments.length);
    estimate.payments.forEach((p, i) => {
      const item = items[i]!;
      expect(item).toHaveTextContent(p.programme);
      expect(item).toHaveTextContent(fmt(p.amountPerHa.value!));
      expect(item).toHaveTextContent(t(p.condition));
      if (p.confirmed) expect(item).not.toHaveTextContent(t('steps.rotations.income.unconfirmed'));
      else expect(item).toHaveTextContent(t('steps.rotations.income.unconfirmed'));
    });
    expect(section).toHaveTextContent(t('steps.rotations.income.campaign', { campaign: estimate.campaign }));
  });

  it('keeps gaps as the first list and local risks as the second with money on (e2e/helpers.ts reads them by index)', async () => {
    card({ status: 'ready', data: estimate }, true);
    await screen.findByText(t('steps.rotations.income.notForecast'));
    const lists = within(screen.getByRole('article')).getAllByRole('list');
    expect(lists[0]).toBe(screen.getByRole('list', { name: t('steps.rotations.gaps') }));
    expect(lists[1]).toBe(screen.getByRole('list', { name: t('steps.rotations.risks') }));
  });

  it('says so when the rotation qualifies for no payment', async () => {
    card({ status: 'ready', data: { ...estimate, payments: [] } }, true);
    expect(await screen.findByText(t('steps.rotations.income.paymentsNone'))).toBeInTheDocument();
  });

  it('comes after soil health and climate resilience (D9)', async () => {
    card({ status: 'ready', data: estimate }, true);
    await screen.findByText(t('steps.rotations.income.notForecast'));
    const text = screen.getByRole('article').textContent ?? '';
    const income = text.indexOf(t('steps.rotations.income.title'), text.indexOf(t('steps.rotations.climate')));
    expect(text.indexOf(t('steps.rotations.soilHealth'))).toBeLessThan(text.indexOf(t('steps.rotations.climate')));
    expect(income).toBeGreaterThan(text.indexOf(t('steps.rotations.climate')));
    expect(income).toBeLessThan(text.indexOf(t('steps.rotations.why')));
  });

  it('shows the reason when there is no income estimate', async () => {
    const reason = { code: 'money.no-economics', params: { crop: 'maize' } };
    card({ status: 'no-data', reason }, true);
    expect(await screen.findByText(t(reason))).toBeInTheDocument();
    expect(incomeSection()).toHaveTextContent(t('steps.rotations.income.notForecast'));
  });

  it('shows a source error with its source', async () => {
    const reason = { code: 'money.no-tables' };
    card({ status: 'error', source: 'test money source', reason }, true);
    const alert = await within(await screen.findByRole('region', { name: t('steps.rotations.income.title') })).findByRole('alert');
    expect(alert).toHaveTextContent(t('ui.state.error', { source: 'test money source' }));
    expect(alert).toHaveTextContent(t(reason));
  });

  it('says income is not part of the analysis when money was not loaded', async () => {
    card({ status: 'not-loaded' }, true);
    expect(await screen.findByText(t('steps.rotations.income.notLoaded'))).toBeInTheDocument();
  });

  it('shows the missing reason instead of a number when the margin is null', async () => {
    const marginPerHa = { ...estimate.marginPerHa, value: null, range: undefined, missingReason: 'test: no replayable year' };
    card({ status: 'ready', data: { ...estimate, marginPerHa } }, true);
    expect(await screen.findByText('test: no replayable year')).toBeInTheDocument();
  });
});
