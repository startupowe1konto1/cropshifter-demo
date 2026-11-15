// The step 6 chart: the farmer's rotation first as the reference, each option as its difference from it.
// Numbers come from the estimates the test builds, never from the fixtures.
import { render, screen, within } from '@testing-library/react';
import { t } from '../../app/i18n';
import type { RotationOption } from '../../contracts';
import { iowaAnalysis } from '../../fixtures';
import { MarginChart } from './MarginChart';
import { compareRows, moneyRows } from './moneyRows';
import { estimate, withMoney } from './testMoney';

const datasets = iowaAnalysis.datasets;
const ids = iowaAnalysis.shownByGoal.keepSoil ?? [];
const currentIndex = ids.findIndex((id) => iowaAnalysis.rotations.find((r) => r.id === id)?.isCurrent);
const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);

// The reference earns 650; the options earn 100, 1199 and 5263 in turn, so one earns less and the others more.
const means = ids.map((_, i) => (i === currentIndex ? 650 : [100, 1199, 5263, 3000][i]!));
const ready = (): RotationOption['money'][] =>
  means.map((m) => ({ status: 'ready', data: estimate(m, m - 400, m + 400, 'PLN') }));

function draw(money: RotationOption['money'][] = ready()) {
  const rows = moneyRows(withMoney(iowaAnalysis, money), 'keepSoil');
  render(<MarginChart rows={rows} datasets={datasets} />);
  return { rows, ...compareRows(rows) };
}

describe('MarginChart', () => {
  it('shows the current rotation first, as the reference, with its average-year margin', async () => {
    const { current } = draw();
    const reference = await screen.findByRole('group', { name: `${t('steps.money.reference')}: ${current!.title}` });
    expect(reference).toHaveTextContent(t('steps.money.current'));
    expect(reference).toHaveTextContent(fmt(current!.mean!));
    const groups = within(screen.getByRole('figure')).getAllByRole('group');
    expect(groups[0]).toBe(reference);
  });

  it('draws each option as its difference from the reference, best first, from a centre line', async () => {
    const { options, current, pct } = draw();
    await screen.findByRole('group', { name: options[0]!.title });
    const names = within(screen.getByRole('figure'))
      .getAllByRole('group')
      .slice(1)
      .map((g) => g.getAttribute('aria-label'));
    expect(names).toEqual(options.map((o) => o.title));
    for (const option of options) {
      const diff = option.mean! - current!.mean!;
      const bar = within(screen.getByRole('group', { name: option.title })).getByRole('img');
      expect(bar).toHaveAccessibleName(
        t('steps.money.barLabel', {
          name: option.title,
          diff: fmt(Math.abs(diff)),
          unit: 'PLN',
          direction: diff > 0 ? t('steps.money.more') : t('steps.money.less'),
        }),
      );
      const fill = bar.querySelector<HTMLElement>('[data-part="bar"]')!;
      expect(fill.style.left).toBe(`${Math.min(50, pct(diff))}%`);
      expect(fill.style.width).toBe(`${Math.abs(pct(diff) - 50)}%`);
      expect(fill).toHaveClass(diff > 0 ? 'bg-emerald-600' : 'bg-red-600');
    }
  });

  it('says in words whether an option earns more or less, with the difference as a sourced number', async () => {
    const { options, current } = draw();
    await screen.findByRole('group', { name: options[0]!.title });
    for (const option of options) {
      const diff = option.mean! - current!.mean!;
      const row = screen.getByRole('group', { name: option.title });
      expect(row).toHaveTextContent(fmt(Math.abs(diff)));
      expect(row).toHaveTextContent(diff > 0 ? t('steps.money.more') : t('steps.money.less'));
      expect(within(row).getByRole('button', { name: /our calculation/ })).toBeInTheDocument();
    }
  });

  it('keeps an option without money as a row with its reason and no bar', async () => {
    const reason = { code: 'income.no-yield-response', params: { crop: 'oats' } };
    const money = ready();
    const noMoney = currentIndex === 0 ? 1 : 0;
    money[noMoney] = { status: 'no-data', reason };
    const { rows } = draw(money);
    const row = await screen.findByRole('group', { name: rows[noMoney]!.title });
    expect(row).toHaveTextContent(t(reason));
    expect(within(row).queryByRole('img')).toBeNull();
  });

  it('shows the options on their own when the current rotation has no money', async () => {
    const money = ready();
    money[currentIndex] = {
      status: 'no-data',
      reason: { code: 'income.no-yield-response', params: { crop: 'maize' } },
    };
    draw(money);
    expect(await screen.findByText(t('steps.money.noReference'))).toBeInTheDocument();
    expect(within(screen.getByRole('figure')).queryAllByRole('img')).toHaveLength(0);
  });

  it('has a hidden table with every rotation, its average and its difference', async () => {
    const { rows, current } = draw();
    const table = await screen.findByRole('table', { name: t('steps.money.table') });
    const bodyRows = within(table).getAllByRole('row').slice(1);
    expect(bodyRows).toHaveLength(rows.length);
    expect(bodyRows[0]).toHaveTextContent(current!.title);
    for (const row of rows) {
      const line = bodyRows.find((r) => r.textContent?.startsWith(row.title))!;
      expect(line).toHaveTextContent(fmt(row.mean!));
      if (!row.isCurrent) expect(line).toHaveTextContent(fmt(Math.abs(row.mean! - current!.mean!)));
    }
  });

  it('ranks the options best first and marks only the best one, when it earns more', async () => {
    const { options } = draw();
    const first = await screen.findByRole('group', { name: options[0]!.title });
    expect(first).toHaveTextContent(t('steps.money.best'));
    for (const option of options.slice(1)) {
      expect(screen.getByRole('group', { name: option.title })).not.toHaveTextContent(t('steps.money.best'));
    }
  });
});
