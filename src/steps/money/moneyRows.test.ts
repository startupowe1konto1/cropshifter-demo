// Step 6 rows and the shared axis. The fixtures carry money "not-loaded", so each test attaches a MoneyEstimate of its
// own to the shown rotations and reads every expected value back from it, never from the fixture data.
import type { MoneyEstimate, RotationOption } from '../../contracts';
import { iowaAnalysis } from '../../fixtures';
import { rotationTitle } from '../cards/RotationCard';
import { compareRows, moneyRows } from './moneyRows';
import { estimate, withMoney } from './testMoney';

const shownIds = iowaAnalysis.shownByGoal.keepSoil ?? [];

describe('moneyRows', () => {
  it('keeps the rotations and the order of step 5 (shownByGoal)', () => {
    const analysis = withMoney(
      iowaAnalysis,
      shownIds.map((_, i) => ({ status: 'ready', data: estimate(100 * (i + 1), 50 * i, 200 * (i + 1)) })),
    );
    const rows = moneyRows(analysis, 'keepSoil');
    expect(rows.map((r) => r.id)).toEqual(shownIds);
    rows.forEach((row) => {
      const rotation = analysis.rotations.find((r) => r.id === row.id)!;
      expect(row.title).toBe(rotationTitle(rotation));
      expect(row.isCurrent).toBe(rotation.isCurrent);
      expect(row.status).toBe('ready');
      const m = (rotation.money as { data: MoneyEstimate }).data.marginPerHa;
      expect(row.mean).toBe(m.value);
      expect(row.low).toBe(m.range!.low);
      expect(row.high).toBe(m.range!.high);
    });
  });

  it('falls back to keepSoil when the goal has no ranking, like step 5', () => {
    const analysis = { ...iowaAnalysis, shownByGoal: { keepSoil: shownIds } };
    expect(moneyRows(analysis, 'income').map((r) => r.id)).toEqual(shownIds);
  });

  it('keeps a rotation without money with its reason and no numbers', () => {
    const reason = { code: 'income.no-yield-response', params: { crop: 'oats' } };
    const analysis = withMoney(iowaAnalysis, [{ status: 'no-data', reason }]);
    const row = moneyRows(analysis, 'keepSoil').find((r) => r.id === shownIds[0])!;
    expect(row.status).toBe('no-data');
    expect(row.reason).toEqual(reason);
    expect(row.mean).toBeUndefined();
  });

  it('treats a missing margin as no data, with its missing reason', () => {
    const m = estimate(1, 0, 2);
    const data = {
      ...m,
      marginPerHa: { ...m.marginPerHa, value: null, range: undefined, missingReason: 'test: no year' },
    };
    const row = moneyRows(withMoney(iowaAnalysis, [{ status: 'ready', data }]), 'keepSoil')[0]!;
    expect(row.status).toBe('no-data');
    expect(row.reason?.code).toBe('test: no year');
  });

  it('says not-loaded and error apart', () => {
    const analysis = withMoney(iowaAnalysis, [
      { status: 'not-loaded' },
      { status: 'error', source: 'test source', reason: { code: 'money.no-tables' } },
    ]);
    const [a, b] = moneyRows(analysis, 'keepSoil');
    expect(a!.status).toBe('not-loaded');
    expect(b!.status).toBe('error');
    expect(b!.source).toBe('test source');
  });
});

describe('compareRows', () => {
  const currentIndex = shownIds.findIndex((id) => iowaAnalysis.rotations.find((r) => r.id === id)!.isCurrent);
  // The reference earns 650; the options earn 100, 900, 2000 … so one loses, the others gain.
  const means = shownIds.map((_, i) => (i === currentIndex ? 650 : [100, 900, 2000, 3000][i]!));
  const rowsOf = (
    money: RotationOption['money'][] = means.map((m) => ({
      status: 'ready' as const,
      data: estimate(m, m / 2, m * 1.5),
    })),
  ) => moneyRows(withMoney(iowaAnalysis, money), 'keepSoil');

  it('puts the current rotation aside as the reference and orders the options by how much more they earn', () => {
    const rows = rowsOf();
    const { current, options } = compareRows(rows);
    expect(current?.isCurrent).toBe(true);
    expect(options.some((o) => o.isCurrent)).toBe(false);
    expect(options).toHaveLength(rows.length - 1);
    options.forEach((o) => expect(o.diff).toBe(o.mean! - current!.mean!));
    const diffs = options.map((o) => o.diff!);
    expect(diffs).toEqual([...diffs].sort((a, b) => b - a));
  });

  it('centres the bar on the reference and puts the largest difference at an end', () => {
    const { options, pct } = compareRows(rowsOf());
    expect(pct(0)).toBe(50);
    const maxAbs = Math.max(...options.map((o) => Math.abs(o.diff!)));
    const ends = options.map((o) => pct(o.diff!));
    expect(ends.some((e) => e === 0 || e === 100)).toBe(true);
    ends.forEach((e) => expect(e).toBeGreaterThanOrEqual(0));
    ends.forEach((e) => expect(e).toBeLessThanOrEqual(100));
    expect(pct(maxAbs)).toBe(100);
  });

  it('keeps options without money last, without a difference', () => {
    const money: RotationOption['money'][] = means.map((m, i) =>
      i !== currentIndex && i === (currentIndex === 0 ? 1 : 0)
        ? { status: 'no-data', reason: { code: 'income.no-yield-response' } }
        : { status: 'ready', data: estimate(m, m / 2, m * 1.5) },
    );
    const { options } = compareRows(rowsOf(money));
    const last = options[options.length - 1]!;
    expect(last.status).toBe('no-data');
    expect(last.diff).toBeUndefined();
  });

  it('gives no differences when the current rotation has no money', () => {
    const money: RotationOption['money'][] = means.map((m, i) =>
      i === currentIndex
        ? { status: 'no-data', reason: { code: 'income.no-yield-response' } }
        : { status: 'ready', data: estimate(m, m / 2, m * 1.5) },
    );
    const { options } = compareRows(rowsOf(money));
    options.forEach((o) => expect(o.diff).toBeUndefined());
  });
});
