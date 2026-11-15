import { describe, expect, it } from 'vitest';
import type { Score } from '../contracts';
import { changedYears, goalTotal, mainCropKey, rankByGoal, rankSoil, type Scored } from './ranking';
import { engineRules, shippedRules } from './rules';

const rules = engineRules(shippedRules);
const s = (value: number): Score => ({ value, low: value, high: value, confidence: 'strong', basis: { code: 'test' } });

const item = (id: string, years: Scored['years'], soil: number, climate: number, isCurrent = false): Scored => ({
  id,
  isCurrent,
  years,
  soilHealth: s(soil),
  climateResilience: s(climate),
  priorityScores: {},
});

const current = item('maize/soybean', [{ crop: 'maize' }, { crop: 'soybean' }], 50, 60, true);

describe('goalTotal', () => {
  it('follows the weights, sharing the priorities weight when nothing is switched on', () => {
    const t = goalTotal(item('a', [{ crop: 'maize' }], 80, 40), rules.weights.keepSoil, []);
    // 0.4 and 0.45 scaled to sum to 1: 0.4/0.85 and 0.45/0.85
    expect(t.value).toBeCloseTo((0.4 * 80 + 0.45 * 40) / 0.85, 1);
  });

  it('uses the mean of switched-on water and forage scores', () => {
    const a = { ...item('a', [{ crop: 'maize' }], 80, 40), priorityScores: { water: s(20), forage: s(60) } };
    const t = goalTotal(a, rules.weights.improveSoil, ['water', 'forage']);
    expect(t.value).toBeCloseTo(0.6 * 80 + 0.25 * 40 + 0.15 * 40, 1);
  });

  // Missing data is never a zero: a switched-on priority without a score is left out of the mean, not counted as 0.
  it('leaves a switched-on priority without a score out of the priorities column', () => {
    const base = item('a', [{ crop: 'maize' }], 80, 40);
    const forageOnly = goalTotal({ ...base, priorityScores: { forage: s(60) } }, rules.weights.improveSoil, ['water', 'forage']);
    const asIfForageAlone = goalTotal({ ...base, priorityScores: { forage: s(60) } }, rules.weights.improveSoil, ['forage']);
    expect(forageOnly.value).toBe(asIfForageAlone.value);
    const waterZero = goalTotal({ ...base, priorityScores: { forage: s(60), water: s(0) } }, rules.weights.improveSoil, ['water', 'forage']);
    expect(forageOnly.value).toBeGreaterThan(waterZero.value);
  });

  it('keeps low <= value <= high', () => {
    const a = { ...item('a', [{ crop: 'maize' }], 80, 40), climateResilience: { ...s(40), low: 20, high: 70 } };
    const t = goalTotal(a, rules.weights.keepSoil, []);
    expect(t.low).toBeLessThanOrEqual(t.value);
    expect(t.high).toBeGreaterThanOrEqual(t.value);
  });
});

describe('changedYears', () => {
  it('counts changed years, aligned over the cycle', () => {
    expect(changedYears([{ crop: 'soybean' }, { crop: 'maize' }], current.years)).toBe(0);
    expect(changedYears([{ crop: 'maize', coverCrop: 'cereal-rye' }, { crop: 'soybean' }], current.years)).toBe(1);
    expect(changedYears([{ crop: 'maize' }, { crop: 'soybean' }, { crop: 'oats' }], current.years)).toBe(1);
  });
});

describe('rankByGoal', () => {
  const others = [
    item('maize+cereal-rye/soybean', [{ crop: 'maize', coverCrop: 'cereal-rye' }, { crop: 'soybean' }], 60, 60),
    item('maize+red-clover/soybean', [{ crop: 'maize', coverCrop: 'red-clover' }, { crop: 'soybean' }], 59, 60),
    item('maize/soybean/oats', [{ crop: 'maize' }, { crop: 'soybean' }, { crop: 'oats' }], 55, 62),
    item('maize/soybean/alfalfa', [{ crop: 'maize' }, { crop: 'soybean' }, { crop: 'alfalfa' }], 70, 50),
    item('maize/soybean/wheat', [{ crop: 'maize' }, { crop: 'soybean' }, { crop: 'wheat' }], 54, 61),
    item('soybean/soybean/maize', [{ crop: 'soybean' }, { crop: 'soybean' }, { crop: 'maize' }], 40, 90), // below the floor
  ];
  const result = rankByGoal([current, ...others], rules, []);
  const byId = new Map(result.items.map((r) => [r.id, r]));

  it('ranks every rotation per goal, 1 = best, the current one included', () => {
    const ranks = result.items.map((r) => r.rankByGoal.keepSoil).sort((a, b) => a! - b!);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(byId.get('soybean/soybean/maize')?.rankByGoal.keepSoil).toBe(1); // best total, but below the floor
  });

  it('sets belowSoilFloor and leaves those rotations out of keepSoil and income, not improveSoil', () => {
    expect(byId.get('soybean/soybean/maize')?.belowSoilFloor).toBe(true);
    expect(byId.get('maize/soybean/oats')?.belowSoilFloor).toBe(false);
    expect(result.shownByGoal.keepSoil).not.toContain('soybean/soybean/maize');
  });

  it('shows the current rotation plus up to three others, best first', () => {
    const shown = result.shownByGoal.keepSoil!;
    expect(shown).toContain('maize/soybean');
    expect(shown.length).toBe(4);
    const totals = shown.map((id) => {
      const t = byId.get(id)!.totals.keepSoil;
      return t.status === 'ready' ? t.data.value : NaN;
    });
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
  });

  it('never shows two others that differ only by a cover crop', () => {
    const shown = result.shownByGoal.keepSoil!;
    expect(shown.includes('maize+cereal-rye/soybean') && shown.includes('maize+red-clover/soybean')).toBe(false);
  });

  it('never shows a cover-crop variant of the current rotation next to it (SPEC section 7 diversity rule)', () => {
    const currentMains = mainCropKey(current.years);
    for (const goal of ['keepSoil', 'improveSoil'] as const) {
      const others = result.shownByGoal[goal]!.filter((id) => id !== current.id);
      expect(others.length).toBeGreaterThan(0);
      for (const id of others) expect(mainCropKey(byId.get(id)!.years)).not.toBe(currentMains);
    }
  });

  it('has no income list and an income total of no-data while income is not wired', () => {
    expect(result.shownByGoal.income).toBeUndefined();
    expect(result.items[0]!.totals.income.status).toBe('no-data');
  });

  describe('income goal', () => {
    const noPrice = { status: 'no-data', reason: { code: 'income.no-price', params: { crop: 'oats' } } } as const;
    const withIncome = (it: Scored, income: number): Scored => ({ ...it, income: s(income) });
    const items: Scored[] = [
      withIncome(current, 40),
      withIncome(others[0]!, 90),
      { ...others[2]!, incomeStatus: noPrice },
      withIncome(others[3]!, 60),
      withIncome(others[5]!, 100), // below the soil floor
    ];
    const r = rankByGoal(items, rules, []);
    const get = (id: string) => r.items.find((x) => x.id === id)!;

    it('ranks only the rotations with an income, the current one included', () => {
      expect(r.shownByGoal.income).toContain(current.id);
      expect(get(others[2]!.id).rankByGoal.income).toBeUndefined();
      expect(get(others[2]!.id).totals.income).toEqual(noPrice);
      const ranks = items.filter((i) => i.income).map((i) => get(i.id).rankByGoal.income).sort((a, b) => a! - b!);
      expect(ranks).toEqual(ranks.map((_, i) => i + 1));
    });

    it('keeps the soil floor and soil and climate in the total (D9)', () => {
      expect(r.shownByGoal.income).not.toContain(others[5]!.id);
      const t = get(others[0]!.id).totals.income;
      expect(t.status).toBe('ready');
      if (t.status === 'ready') expect(t.data.value).toBeCloseTo(goalTotal(items[1]!, rules.weights.income, []).value, 5);
    });

    it('has no income list when the current rotation has no income', () => {
      const none = rankByGoal([{ ...current, incomeStatus: noPrice }, withIncome(others[0]!, 90)], rules, []);
      expect(none.shownByGoal.income).toBeUndefined();
      expect(none.items[0]!.totals.income).toEqual(noPrice);
      expect(none.items[1]!.rankByGoal.income).toBeUndefined();
    });
  });

  it('breaks a keepSoil tie towards the fewest changed years', () => {
    const near = item('maize+cereal-rye/soybean', [{ crop: 'maize', coverCrop: 'cereal-rye' }, { crop: 'soybean' }], 60, 60);
    const far = item('oats/alfalfa', [{ crop: 'oats' }, { crop: 'alfalfa' }], 60, 60);
    const r = rankByGoal([current, far, near], rules, []);
    const rank = (id: string) => r.items.find((x) => x.id === id)!.rankByGoal.keepSoil!;
    expect(rank('maize+cereal-rye/soybean')).toBeLessThan(rank('oats/alfalfa'));
  });

  it('shows fewer than four when fewer than three others pass the floor', () => {
    const low = item('x', [{ crop: 'oats' }], 10, 99);
    const r = rankByGoal([current, low], rules, []);
    expect(r.shownByGoal.keepSoil).toEqual(['maize/soybean']);
    expect(r.shownByGoal.improveSoil).toEqual(['maize/soybean', 'x']);
  });
});

describe('rankSoil: soil compared with the current rotation over shared indicators', () => {
  const sc = (value: number, low = value, high = value): Score => ({ value, low, high, confidence: 'moderate', basis: { code: 'test' } });
  const cur = {
    isCurrent: true,
    coverOnly: false,
    soilHealth: sc(40, 30, 50),
    indicators: { nitrogen: sc(20, 10, 30), erosion: sc(20, 15, 25), pestBreak: sc(80, 70, 90) },
  };
  const cand = {
    isCurrent: false,
    coverOnly: false,
    soilHealth: sc(70),
    indicators: { nitrogen: sc(50, 40, 60), pestBreak: sc(90, 85, 95) },
  };

  it('is the current total plus the weighted mean of the shared deltas', () => {
    const r = rankSoil(cand, cur, (id) => (id === 'nitrogen' ? 2 : 1));
    // deltas: nitrogen +30 (weight 2), pest break +10 (weight 1) → (60 + 10) / 3
    expect(r.score.value).toBeCloseTo(40 + 70 / 3, 1);
    expect(r.score.low).toBeCloseTo(30 + (2 * 30 + 15) / 3, 1);
    expect(r.score.high).toBeCloseTo(50 + (2 * 30 + 5) / 3, 1);
    expect(r.shared).toEqual(['nitrogen', 'pestBreak']);
    expect(r.partial).toBe(true);
  });

  // #124 review: the ranked score is not the weighted mean of the rotation's own indicators, so it says how it was made.
  it('gives a partial comparison its own basis naming the shared indicators', () => {
    const r = rankSoil(cand, cur, () => 1);
    expect(r.score.basis).toEqual({ code: 'soil.basis.compared', params: { shared: 'nitrogen, pest break' } });
  });

  it('keeps the own score for the current rotation and for the cover-only stand-in', () => {
    expect(rankSoil(cur, cur, () => 1).score).toEqual(cur.soilHealth);
    expect(rankSoil({ ...cand, coverOnly: true }, cur, () => 1).score).toEqual(cand.soilHealth);
  });

  it('is weak with no shared indicator', () => {
    const r = rankSoil({ ...cand, indicators: { organicMatter: sc(60) } }, cur, () => 1);
    expect(r.score.confidence).toBe('weak');
    expect(r.score.value).toBe(70);
  });

  it('is used by goalTotal and the soil floor instead of soilHealth', () => {
    const a = { ...item('a', [{ crop: 'oats' }], 90, 60), rankSoil: s(30) };
    const r = rankByGoal([current, a], rules, []);
    expect(r.items.find((x) => x.id === 'a')!.belowSoilFloor).toBe(true);
    const t = r.items.find((x) => x.id === 'a')!.totals.keepSoil;
    expect(t.status === 'ready' && t.data.value).toBeCloseTo((0.4 * 30 + 0.45 * 60) / 0.85, 1);
  });
});
