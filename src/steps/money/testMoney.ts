// Test helpers for step 6: the fixtures carry money "not-loaded", so the tests attach estimates of their own.
import type { Analysis, MoneyEstimate, RotationOption } from '../../contracts';
import { iowaAnalysis } from '../../fixtures';

const datasetId = iowaAnalysis.datasets[0]!.id;

export function estimate(
  value: number,
  low: number,
  high: number,
  currency: MoneyEstimate['currency'] = 'USD',
  payments: MoneyEstimate['payments'] = [],
): MoneyEstimate {
  return {
    currency,
    campaign: 'test campaign 2026',
    marginPerHa: {
      value,
      unit: `${currency}/ha`,
      datasetIds: [datasetId],
      kind: 'derived',
      retrievedAt: '2026-11-14',
      range: { low, high, basis: '10th–90th percentile year' },
    },
    payments,
  };
}

/** The analysis with money on the rotations shown under keepSoil, given in shown order. */
export function withMoney(analysis: Analysis, money: RotationOption['money'][]): Analysis {
  const ids = analysis.shownByGoal.keepSoil ?? [];
  return {
    ...analysis,
    rotations: analysis.rotations.map((r) => {
      const i = ids.indexOf(r.id);
      return i >= 0 && money[i] ? { ...r, money: money[i]! } : r;
    }),
  };
}
