import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { t } from '../../app/i18n';
import { liveSoilData } from '../../app/providers';
import { useAppStore } from '../../app/store';
import { cropName } from '../shared/cropName';
import { term } from '../glossary/useTerm';
import type { Analysis, RotationOption } from '../../contracts';
import { iowaAnalysis, poznanAnalysis } from '../../fixtures';
import { RotationCard, rotationTitle } from './RotationCard';
import { RotationsStep } from './RotationsStep';

const SUPPORT = /This is decision support\./;

function readyWith(analysis: Analysis, goal: 'keepSoil' | 'improveSoil' | 'income' = 'keepSoil') {
  useAppStore.setState({
    step: 5,
    goal,
    fields: [analysis.field],
    selectedFieldId: analysis.field.id,
    analysis: { status: 'ready', data: analysis },
  });
}

const current = (a: Analysis) => a.rotations.find((r) => r.isCurrent)!;
const pickerOf = () => screen.getByRole('radiogroup', { name: t('steps.rotations.pick') });
/** The shown rotations, in order, as the picker names them ("Option 1: …", "Your rotation: …"). */
const optionTitles = () => within(pickerOf()).getAllByRole('radio').map((b) => b.getAttribute('aria-label')!.replace(/^[^:]+: /, ''));

beforeEach(() => {
  useAppStore.getState().reset();
});

describe('RotationCard', () => {
  it('shows the crops, soil health and climate resilience first, the five sections and the support sentence', async () => {
    const r = current(iowaAnalysis);
    render(<RotationCard rotation={r} rank={1} goal="keepSoil" datasets={iowaAnalysis.datasets} />);
    const card = await screen.findByRole('article');
    const heading = within(card).getByRole('heading', { level: 2 });
    for (const y of r.years) expect(heading).toHaveTextContent(cropName(y.crop));
    expect(within(card).getByText('Your rotation')).toBeInTheDocument();

    const text = card.textContent ?? '';
    const soil = text.indexOf('Soil health');
    const climate = text.indexOf('Climate resilience');
    const why = text.indexOf('Why this rotation');
    expect(soil).toBeGreaterThan(-1);
    expect(climate).toBeGreaterThan(soil);
    expect(why).toBeGreaterThan(climate);

    for (const section of ['Why this rotation', 'Evidence', 'Benefits', 'What we do not know', 'Check locally']) {
      expect(within(card).getByRole('heading', { name: section })).toBeInTheDocument();
    }
    expect(within(card).getByText(SUPPORT)).toBeInTheDocument();
  });

  it('keeps gaps as the first list and local risks as the second (the e2e tests read them that way)', () => {
    const r = current(iowaAnalysis);
    render(<RotationCard rotation={r} rank={1} goal="keepSoil" datasets={iowaAnalysis.datasets} />);
    const card = screen.getByRole('article');
    const lists = within(card).getAllByRole('list');
    expect(within(lists[0]!).getAllByRole('listitem')).toHaveLength(r.gaps.length);
    expect(within(lists[1]!).getAllByRole('listitem')).toHaveLength(r.localReviewRisks.length);
    expect(within(card).getByRole('list', { name: 'What we do not know' })).toBe(lists[0]);
    expect(within(card).getByRole('list', { name: 'Check locally' })).toBe(lists[1]);
  });

  it('shows the evidence values with a source chip', () => {
    const r = current(iowaAnalysis);
    render(<RotationCard rotation={r} rank={1} goal="keepSoil" datasets={iowaAnalysis.datasets} />);
    expect(within(screen.getByRole('article')).getAllByRole('button', { name: /observed|model estimate|our calculation/ }).length).toBeGreaterThan(0);
  });

  it('a weak card has no banner above the title: the badge sits with the score and the reason leads the gaps (HANDOFF-frontend step 5)', () => {
    const weak = iowaAnalysis.rotations.find((r) => r.climateResilience.confidence === 'weak' && r.gaps.length > 0)!;
    render(<RotationCard rotation={weak} rank={2} goal="keepSoil" datasets={iowaAnalysis.datasets} />);
    const card = screen.getByRole('article');
    expect(within(card).queryByTestId('weak-evidence')).toBeNull();
    expect(within(card).queryByText(t('steps.rotations.weakTitle'))).toBeNull();
    expect(within(card).getAllByText(t('ui.confidence.weak')).length).toBeGreaterThan(0);
    const gaps = within(card).getByRole('list', { name: t('steps.rotations.gaps') });
    expect(within(gaps).getAllByRole('listitem')[0]).toHaveTextContent(t(weak.gaps[0]!));
    const text = card.textContent ?? '';
    expect(text.indexOf(t('steps.rotations.soilHealth'))).toBeGreaterThan(text.indexOf(within(card).getByRole('heading', { level: 2 }).textContent!));
  });

  it('shows the title, the first reason, the scores, the calendar and the first gaps and risks; the rest is folded', async () => {
    const user = userEvent.setup();
    const r = iowaAnalysis.rotations.find((x) => x.why.length > 1 && x.evidence.length > 0)!;
    render(<RotationCard rotation={r} rank={1} goal="keepSoil" datasets={iowaAnalysis.datasets} moneyAvailable />);
    const card = screen.getByRole('article');

    // The first reason sits under the title; every reason, the evidence, the score basis and the income open from the
    // card's fold list.
    expect(within(card).getAllByText(t(r.why[0]!))[0]).toBeVisible();
    expect(within(card).getByText(t(r.why[1]!))).not.toBeVisible();
    expect(within(card).getByText(t(r.evidence[0]!.message))).not.toBeVisible();
    expect(within(card).getByText(t(r.soilHealth.basis))).not.toBeVisible();
    expect(within(card).getByText(t('steps.rotations.income.notForecast'))).not.toBeVisible();

    // Gaps and local risks: the first two of each are open, the rest open with one button per list.
    for (const m of [...r.gaps.slice(0, 2), ...r.localReviewRisks.slice(0, 2)]) expect(within(card).getByText(t(m))).toBeVisible();
    for (const [items, name] of [[r.gaps, 'steps.rotations.gaps'], [r.localReviewRisks, 'steps.rotations.risks']] as const) {
      if (items.length <= 2) continue;
      expect(within(card).queryByText(t(items[2]!))).toBeNull();
      const list = within(card).getByRole('list', { name: t(name) });
      await user.click(within(list.parentElement!).getByRole('button', { name: t('steps.rotations.listMore', { count: items.length - 2 }) }));
      for (const m of items) expect(within(card).getByText(t(m))).toBeVisible();
    }
    expect(within(card).getByText(SUPPORT)).toBeVisible();

    await user.click(within(card).getByText(t('steps.rotations.evidence')));
    expect(within(card).getByText(t(r.evidence[0]!.message))).toBeVisible();
    await user.click(within(card).getByText(t('steps.rotations.why')));
    expect(within(card).getByText(t(r.why[1]!))).toBeVisible();
  });

  it('shows the reason when similar fields are not loaded', () => {
    const r: RotationOption = {
      ...current(iowaAnalysis),
      twins: { status: 'no-data', reason: { code: 'fx.twins.not-loaded' } },
    };
    render(<RotationCard rotation={r} rank={1} goal="keepSoil" datasets={iowaAnalysis.datasets} />);
    expect(screen.getByText(t({ code: 'fx.twins.not-loaded' }))).toBeInTheDocument();
  });

  it('shows similar regions with each case yield as a sourced number, and the reason when a yield is missing', () => {
    const base = current(iowaAnalysis);
    const dataset = iowaAnalysis.datasets[0]!.id;
    const outcome = (value: number | null) => ({
      value,
      unit: 't/ha',
      datasetIds: [dataset],
      kind: 'observation' as const,
      retrievedAt: '2026-11-14',
      ...(value === null ? { missingReason: 'No yield was reported for those years.' } : {}),
    });
    const [crop] = base.years.map((y) => y.crop);
    const r: RotationOption = {
      ...base,
      twins: {
        status: 'ready',
        data: {
          caseCount: 2,
          meanSimilarity: 81.4,
          cases: [
            { regionName: 'Region One', country: 'US', similarity: 90, crops: [crop!], outcome: outcome(11.2), years: '2015-2019' },
            { regionName: 'Region Two', country: 'US', similarity: 72, crops: [crop!], outcome: outcome(null), years: '2016-2020' },
          ],
        },
      },
    };
    render(<RotationCard rotation={r} rank={1} goal="keepSoil" datasets={iowaAnalysis.datasets} />);
    const card = screen.getByRole('article');
    expect(within(card).getByText(t('steps.rotations.twinsReady', { count: 2, similarity: 81 }))).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/similar fields/);
    const table = within(card).getByRole('table', { name: t('steps.rotations.twinsTable') });
    expect(within(table).getByText('Region One')).toBeInTheDocument();
    expect(within(table).getByText('Region Two')).toBeInTheDocument();
    expect(within(table).getAllByRole('button', { name: new RegExp(t('ui.kind.observation')) }).length).toBeGreaterThan(0);
    // #141 review: the similarity is a number from the analysis, so it is a Sourced value (our calculation), not bare text.
    const similarityCell = within(table).getByText(/^90%?$/).closest('td')!;
    expect(within(similarityCell).getByRole('button', { name: new RegExp(t('ui.kind.derived')) })).toBeInTheDocument();
    expect(within(table).getByText(/11\.2/)).toBeInTheDocument();
    expect(within(table).getByText('No yield was reported for those years.')).toBeInTheDocument();
    // The card keeps exactly its two lists.
    expect(within(card).getAllByRole('list')).toHaveLength(2);
  });

  it('under another goal, says where the card would rank on keeping the soil', () => {
    const r = iowaAnalysis.rotations.find((x) => x.rankByGoal.keepSoil !== x.rankByGoal.improveSoil)!;
    render(<RotationCard rotation={r} rank={r.rankByGoal.improveSoil!} goal="improveSoil" datasets={iowaAnalysis.datasets} />);
    expect(screen.getByText(new RegExp(`${r.rankByGoal.keepSoil}\\w* if you rank on keeping the soil`))).toBeInTheDocument();
  });
});

describe('RotationsStep', () => {
  // #141 review: soil data is precomputed today (providers.context), so the "comes live from SoilGrids, up to two
  // minutes" note would name a source the app does not call. It shows only once liveSoilData is true.
  it('does not say soil data comes live from SoilGrids while the soil data is precomputed', async () => {
    expect(liveSoilData).toBe(false);
    useAppStore.setState({ step: 5, analysis: { status: 'loading' } });
    render(<RotationsStep />);
    await screen.findByText(t('ui.state.loading', { source: t('steps.rotations.analysis') }));
    expect(screen.queryByText(t('steps.rotations.loadingNote'))).not.toBeInTheDocument();
  });

  it('offers the four rotations as picks and opens one card at a time, the best other one first', async () => {
    const user = userEvent.setup();
    for (const analysis of [iowaAnalysis, poznanAnalysis]) {
      readyWith(analysis);
      const { unmount } = render(<RotationsStep />);
      expect(await screen.findAllByRole('article')).toHaveLength(1);
      const picks = within(pickerOf()).getAllByRole('radio');
      expect(picks).toHaveLength(analysis.shownByGoal.keepSoil!.length);
      expect(within(pickerOf()).getByText('Your rotation')).toBeInTheDocument();
      const firstOther = analysis.shownByGoal.keepSoil!.find((id) => !analysis.rotations.find((r) => r.id === id)!.isCurrent)!;
      expect(screen.getByTestId(`card-${firstOther}`)).toBeInTheDocument();
      // Picking the farmer's own rotation swaps the card.
      const current = analysis.rotations.find((r) => r.isCurrent)!;
      await user.click(within(pickerOf()).getByRole('radio', { name: /^Your rotation/ }));
      expect(screen.getByTestId(`card-${current.id}`)).toBeInTheDocument();
      expect(screen.getAllByRole('article')).toHaveLength(1);
      unmount();
    }
  });

  it('orders the cards by the goal chosen on the goal step and offers no goal switch here (HANDOFF-frontend step 5)', async () => {
    readyWith(iowaAnalysis, 'improveSoil');
    render(<RotationsStep />);
    await screen.findAllByRole('article');
    const titleOf = (id: string) => rotationTitle(iowaAnalysis.rotations.find((r) => r.id === id)!);
    expect(optionTitles()).toEqual(iowaAnalysis.shownByGoal.improveSoil!.map(titleOf));
    // The only radios on the step are the rotation picks: no goal switch.
    expect(screen.getAllByRole('radio')).toHaveLength(within(pickerOf()).getAllByRole('radio').length);
    expect(screen.queryByRole('radio', { name: /Improve my soil|Keep my soil|Income/ })).toBeNull();
    expect(screen.getByText(t('steps.rotations.intro'))).toBeVisible();
    expect(t('steps.rotations.intro')).not.toMatch(/Tap a goal/);
  });

  it('falls back to keeping the soil when the income goal has no data, and says so', async () => {
    readyWith(iowaAnalysis, 'income');
    render(<RotationsStep />);
    expect(await screen.findByText(/ranked on keeping the soil/)).toBeInTheDocument();
    expect(within(pickerOf()).getAllByRole('radio')).toHaveLength(iowaAnalysis.shownByGoal.keepSoil!.length);
  });

  it('shows the field summary with sourced values', async () => {
    readyWith(iowaAnalysis);
    render(<RotationsStep />);
    const summary = await screen.findByRole('region', { name: /This field/ });
    expect(within(summary).getByText(/Drought years/)).toBeInTheDocument();
    expect(within(summary).getByText(/Slope/)).toBeInTheDocument();
    expect(within(summary).getAllByRole('button', { name: /observed|model estimate|our calculation/ }).length).toBeGreaterThan(0);
  });

  it('the summary counts drought years in the last 15 seasons and names no "highest drought month" (#105 item 3, D42)', async () => {
    readyWith(iowaAnalysis);
    render(<RotationsStep />);
    const summary = await screen.findByRole('region', { name: /This field/ });
    const years = iowaAnalysis.profile.yearly.map((y) => y.year);
    const last = Math.max(...years);
    const recent = iowaAnalysis.profile.droughtYears.filter((y) => y > last - 15).length;
    const label = within(summary).getByText(`Drought years, ${last - 14}–${last}`);
    const row = label.parentElement!;
    expect(row.querySelector('dd')!.textContent).toMatch(new RegExp(`^${recent}(?!\\d).*of 15 years`));
    expect(within(summary).queryByText(/Highest drought risk/)).toBeNull();
    expect(within(summary).getByText(/Highest heat risk/)).toBeInTheDocument();
  });

  it('the range note does not call the soil-health range a range of past years (#76)', async () => {
    readyWith(iowaAnalysis);
    render(<RotationsStep />);
    await screen.findAllByRole('article');
    const note = screen.getByText(/where a source gives a single value/);
    expect(note.textContent).toMatch(/climate resilience/);
    expect(note.textContent).toMatch(/soil health/);
  });

  it('a field outside the USA and Poland shows the summary and no cards', async () => {
    readyWith({ ...iowaAnalysis, rotations: [], shownByGoal: {} });
    render(<RotationsStep />);
    expect(await screen.findByText(/Crop lists exist for the USA and Poland only/)).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByRole('region', { name: /This field/ })).toBeInTheDocument();
  });

  it('lists the data sources, NASA first, folded until opened', async () => {
    const user = userEvent.setup();
    readyWith(iowaAnalysis);
    render(<RotationsStep />);
    const panel = await screen.findByRole('region', { name: /Data sources/ });
    const items = within(panel).getAllByRole('listitem');
    const nasaFlags = items.map((li) => li.getAttribute('data-nasa') === 'true');
    expect(nasaFlags[0]).toBe(true);
    expect(nasaFlags.indexOf(false)).toBeGreaterThan(nasaFlags.lastIndexOf(true));
    expect(items[0]).not.toBeVisible();
    await user.click(within(panel).getByText(t('steps.rotations.sources.title')));
    expect(items[0]).toBeVisible();
  });

  it('shows a source error with a retry instead of an empty screen', async () => {
    useAppStore.setState({ step: 5, analysis: { status: 'error', source: 'NASA POWER', reason: 'timeout' } });
    render(<RotationsStep />);
    expect(await screen.findByRole('alert')).toHaveTextContent('NASA POWER');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('puts a calendar strip on every card', async () => {
    readyWith(iowaAnalysis);
    render(<RotationsStep />);
    for (const card of await screen.findAllByRole('article')) {
      expect(within(card).getByRole('table', { name: /calendar/i })).toBeInTheDocument();
    }
  });

  it('numbers the other rotations 1 to 3 without counting the current one', async () => {
    readyWith(iowaAnalysis);
    render(<RotationsStep />);
    await screen.findAllByRole('article');
    for (const n of [1, 2, 3]) expect(within(pickerOf()).getByText(`Option ${n}`)).toBeInTheDocument();
    expect(screen.queryByText('Option 4')).not.toBeInTheDocument();
  });

  it('shows why a goal score is missing, with its source', async () => {
    const base = iowaAnalysis;
    const rotations = base.rotations.map((r) => ({
      ...r,
      totals: { ...r.totals, improveSoil: { status: 'error' as const, source: 'Soil rules', reason: { code: 'fx.twins.not-loaded' } } },
    }));
    readyWith({ ...base, rotations }, 'improveSoil');
    render(<RotationsStep />);
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => /Soil rules/.test(a.textContent ?? ''))).toBe(true);
  });

  it('shows the missing reason when a hazard has no values at all', async () => {
    const reason = 'POWER has no frost days for this point.';
    const profile = {
      ...iowaAnalysis.profile,
      monthlyRisk: iowaAnalysis.profile.monthlyRisk.map((m) =>
        m.hazard === 'frost' ? { ...m, probability: { ...m.probability, value: null, missingReason: reason } } : m,
      ),
    };
    readyWith({ ...iowaAnalysis, profile });
    render(<RotationsStep />);
    const summary = await screen.findByRole('region', { name: /This field/ });
    expect(within(summary).getByText(new RegExp(reason))).toBeInTheDocument();
  });

  it('explains the terms behind the numbers with glossary tooltips, in the summary and on every card', async () => {
    readyWith(iowaAnalysis);
    render(<RotationsStep />);
    const about = (id: Parameters<typeof term>[0]) => t('ui.term.about', { label: term(id).label });
    const summary = await screen.findByRole('region', { name: /This field/ });
    for (const id of ['root-zone', 'soil-wetness-index', 'model-estimate'] as const) {
      expect(within(summary).getByRole('button', { name: about(id) })).toBeInTheDocument();
    }
    // The range note is said once above the cards, not on every card.
    expect(screen.getAllByRole('button', { name: about('percentile-range') })).toHaveLength(1);
  });
});

