// Step 6 screen: rows in step 5 order, the headline, the disclosures, and the loading, error, offline and no-data states.
// Money comes from estimates the test builds (the fixtures carry money "not-loaded"); no value is typed twice.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLang, t } from '../../app/i18n';
import { useAppStore } from '../../app/store';
import type { Analysis, RotationOption } from '../../contracts';
import { iowaAnalysis } from '../../fixtures';
import { term } from '../glossary/useTerm';
import { MoneyStep } from './MoneyStep';
import { compareRows, moneyRows } from './moneyRows';
import { estimate, withMoney } from './testMoney';

const ids = iowaAnalysis.shownByGoal.keepSoil ?? [];
const isCurrent = (id: string) => iowaAnalysis.rotations.find((r) => r.id === id)!.isCurrent;
const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

function ready(analysis: Analysis) {
  useAppStore.setState({
    step: 6,
    goal: 'keepSoil',
    fields: [analysis.field],
    selectedFieldId: analysis.field.id,
    analysis: { status: 'ready', data: analysis },
  });
}

/** The current rotation earns 500; option i earns 1000·(i+1), so the last option is the best. */
const money = (lowerOptions = false): RotationOption['money'][] =>
  ids.map((id, i) => {
    const mean = isCurrent(id) ? 500 : lowerOptions ? 100 * (i + 1) : 1000 * (i + 1);
    return { status: 'ready', data: estimate(mean, mean / 2, mean * 1.5) };
  });

beforeEach(() => {
  useAppStore.getState().reset();
  setLang('en');
});
afterEach(() => {
  setNavigatorOnline(true);
  setLang('en');
});

describe('MoneyStep', () => {
  it('shows the title, the margin term, your rotation first and every other rotation of step 5', async () => {
    const analysis = withMoney(iowaAnalysis, money());
    ready(analysis);
    render(<MoneyStep />);
    expect(await screen.findByRole('heading', { name: t('steps.money.title') })).toBeInTheDocument();
    // The intro explains "margin"; the disclosures repeat the term in their own lead line.
    const intro = screen.getByTestId('money-intro');
    expect(intro).toHaveTextContent(t('steps.money.intro').split('{')[1]!.split('}')[1]!.trim());
    expect(
      within(intro).getByRole('button', { name: t('ui.term.about', { label: term('margin').label }) }),
    ).toBeInTheDocument();
    const chart = screen.getByRole('figure');
    const names = within(chart)
      .getAllByRole('group')
      .map((g) => g.getAttribute('aria-label'));
    const { current, options } = compareRows(moneyRows(analysis, 'keepSoil'));
    expect(names).toEqual([`${t('steps.money.reference')}: ${current!.title}`, ...options.map((o) => o.title)]);
    expect(new Set(options.map((o) => o.id))).toEqual(new Set(ids.filter((id) => !isCurrent(id))));
    expect(screen.getByText(t('steps.rotations.income.notForecast'))).toBeInTheDocument();
    expect(screen.getByText(t('app.support'))).toBeInTheDocument();
  });

  it('names the best option and how much more it earns than the current rotation', async () => {
    const analysis = withMoney(iowaAnalysis, money());
    ready(analysis);
    render(<MoneyStep />);
    const rows = moneyRows(analysis, 'keepSoil');
    const current = rows.find((r) => r.isCurrent)!;
    const best = rows.filter((r) => !r.isCurrent).sort((a, b) => b.mean! - a.mean!)[0]!;
    const headline = await screen.findByTestId('money-headline');
    expect(headline).toHaveTextContent(best.title);
    expect(headline).toHaveTextContent(fmt(best.mean! - current.mean!));
    expect(within(headline).getByRole('button', { name: /our calculation/ })).toBeInTheDocument();
  });

  it('says so when no option beats the current rotation', async () => {
    ready(withMoney(iowaAnalysis, money(true)));
    render(<MoneyStep />);
    // Options earn 100·(i+1) and the current rotation 500; with up to 4 rows no option reaches it.
    expect(await screen.findByText(t('steps.money.headlineNone'))).toBeInTheDocument();
  });

  it('has a disclosure per rotation with the bad, average and good year and the payments', async () => {
    const analysis = withMoney(iowaAnalysis, money());
    ready(analysis);
    render(<MoneyStep />);
    const rows = moneyRows(analysis, 'keepSoil');
    const details = await screen.findAllByTestId('money-details');
    expect(details).toHaveLength(rows.length);
    const user = userEvent.setup();
    // The disclosures follow the chart, so the first one is the farmer's rotation.
    const first = compareRows(rows).current!;
    expect(details[0]!).toHaveTextContent(first.title);
    await user.click(details[0]!.querySelector('summary')!);
    expect(details[0]!).toHaveTextContent(t('steps.rotations.income.bad'));
    expect(details[0]!).toHaveTextContent(fmt(first.high!));
    expect(details[0]!).toHaveTextContent(t('steps.rotations.income.payments'));
    expect(details[0]!).toHaveTextContent(t('steps.rotations.income.campaign', { campaign: 'test campaign 2026' }));
  });

  it('keeps a rotation without money and shows its reason', async () => {
    const reason = { code: 'income.no-yield-response', params: { crop: 'oats' } };
    const m = money();
    m[0] = { status: 'no-data', reason };
    ready(withMoney(iowaAnalysis, m));
    render(<MoneyStep />);
    expect((await screen.findAllByText(t(reason))).length).toBeGreaterThan(0);
  });

  it('says there is no income data when no rotation has money, and still lists the rows', async () => {
    ready(iowaAnalysis);
    render(<MoneyStep />);
    expect(await screen.findByText(t('steps.money.noneReady'))).toBeInTheDocument();
    expect(within(screen.getByRole('figure')).getAllByRole('group')).toHaveLength(ids.length);
  });

  it('starts the analysis when it has not run yet', async () => {
    const runAnalysis = vi.fn(async () => {});
    useAppStore.setState({ analysis: { status: 'idle' }, runAnalysis });
    render(<MoneyStep />);
    await screen.findByText(t('ui.state.loading', { source: t('steps.rotations.analysis') }));
    expect(runAnalysis).toHaveBeenCalledTimes(1);
  });

  it('shows the loading state', async () => {
    useAppStore.setState({ analysis: { status: 'loading' } });
    render(<MoneyStep />);
    expect(
      await screen.findByText(t('ui.state.loading', { source: t('steps.rotations.analysis') })),
    ).toBeInTheDocument();
  });

  it('shows a source error with a retry', async () => {
    const runAnalysis = vi.fn(async () => {});
    useAppStore.setState({ analysis: { status: 'error', source: 'NASA POWER', reason: 'test failure' }, runAnalysis });
    render(<MoneyStep />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t('ui.state.error', { source: 'NASA POWER' }));
    await userEvent.setup().click(within(alert).getByRole('button', { name: t('ui.state.retry') }));
    expect(runAnalysis).toHaveBeenCalled();
  });

  it('shows the offline state and does not start the analysis while offline', async () => {
    const runAnalysis = vi.fn(async () => {});
    setNavigatorOnline(false);
    useAppStore.setState({ analysis: { status: 'idle' }, runAnalysis });
    render(<MoneyStep />);
    expect(await screen.findByText(t('ui.state.offline.title'))).toBeInTheDocument();
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it('shows the Polish title under Polish', async () => {
    ready(withMoney(iowaAnalysis, money()));
    act(() => setLang('pl'));
    render(<MoneyStep />);
    expect(await screen.findByRole('heading', { name: t('steps.money.title') })).toHaveTextContent('Ile zarobiłby');
  });

  it('shows the payment names, the campaign and the source details in Polish under Polish', async () => {
    const payments = [
      {
        programme: 'Eco-scheme carbon farming: straw mixed into the soil',
        amountPerHa: {
          value: 62,
          unit: 'PLN/ha per year',
          datasetIds: ['pl-eco-scheme-2026'],
          kind: 'observation' as const,
          retrievedAt: '2026-11-14',
        },
        condition: { code: 'money.condition.pl-straw' },
        confirmed: false,
      },
    ];
    const m: RotationOption['money'][] = ids.map((id) => ({
      status: 'ready',
      data: {
        ...estimate(isCurrent(id) ? 650 : 900, 100, 1200, 'PLN', payments),
        campaign:
          'campaign 2026: grain and rapeseed prices of 2-8 Nov 2026, other prices 2025 or Sep 2026, WODR costs Feb 2026; eco-scheme rates are 2026 estimates, check ARiMR',
      },
    }));
    const analysis = withMoney(iowaAnalysis, m);
    ready({
      ...analysis,
      datasets: [
        ...analysis.datasets,
        {
          id: 'pl-eco-scheme-2026',
          name: 'Estimated 2026 eco-scheme rates',
          provider: 'Polish Ministry of Agriculture and ARiMR',
          url: 'https://www.gov.pl/',
          nasa: false,
          resolution: 'Poland',
          period: '2026 estimates for advance payments (19 Aug 2026)',
          kind: 'observation',
        },
      ],
    });
    act(() => setLang('pl'));
    render(<MoneyStep />);
    const details = (await screen.findAllByTestId('money-details'))[0]!;
    const user = userEvent.setup();
    await user.click(details.querySelector('summary')!);
    expect(details).toHaveTextContent('Ekoschemat „Rolnictwo węglowe”: wymieszanie słomy z glebą');
    expect(details).toHaveTextContent('PLN/ha rocznie');
    expect(details).toHaveTextContent(t('money.condition.pl-straw'));
    expect(t('money.condition.pl-straw')).toMatch(/słom/);
    expect(details).toHaveTextContent('kampania 2026');
    await user.click(
      within(details)
        .getAllByRole('button', { name: /Źródło/ })
        .at(-1)!,
    );
    expect(details).toHaveTextContent('szacunki na 2026 r. do wypłaty zaliczek');
  });
});
