// Step 6 data: the rows the money chart draws and the one axis they share. Pure functions, no UI.
// The rotations and their order are the ones step 5 shows (analysis.shownByGoal), so both steps name the same options.
import type { Analysis, GoalId, Message, MoneyEstimate, Sourced } from '../../contracts';
import { rotationTitle } from '../cards/RotationCard';

export interface MoneyRow {
  id: string;
  title: string;
  isCurrent: boolean;
  status: 'ready' | 'no-data' | 'error' | 'not-loaded';
  /** Set when status is 'ready'. */
  money?: MoneyEstimate;
  margin?: Sourced;
  low?: number;
  mean?: number;
  high?: number;
  /** Why there is no number (no-data and error). */
  reason?: Message;
  /** The failing source (error). */
  source?: string;
}

/** The goal whose ranking is used: the chosen one, or keepSoil when the analysis has none for it (as step 5 does). */
export function rankingGoal(analysis: Analysis, goal: GoalId): GoalId {
  return analysis.shownByGoal[goal] ? goal : 'keepSoil';
}

export function moneyRows(analysis: Analysis, goal: GoalId): MoneyRow[] {
  const ids = analysis.shownByGoal[rankingGoal(analysis, goal)] ?? [];
  return ids.flatMap((id) =>
    analysis.rotations
      .filter((r) => r.id === id)
      .map((r): MoneyRow => {
        const base = { id: r.id, title: rotationTitle(r), isCurrent: r.isCurrent };
        const money = r.money;
        if (money.status === 'not-loaded') return { ...base, status: 'not-loaded' };
        if (money.status === 'no-data') return { ...base, status: 'no-data', reason: money.reason };
        if (money.status === 'error') return { ...base, status: 'error', reason: money.reason, source: money.source };
        const m = money.data.marginPerHa;
        if (m.value === null || !Number.isFinite(m.value)) {
          // The missing reason is already text; t() returns an unknown code as it is, so it reads as the reason.
          return { ...base, status: 'no-data', reason: { code: m.missingReason ?? 'income.no-margin' } };
        }
        return {
          ...base,
          status: 'ready',
          money: money.data,
          margin: m,
          mean: m.value,
          low: m.range ? Math.min(m.range.low, m.range.high) : m.value,
          high: m.range ? Math.max(m.range.low, m.range.high) : m.value,
        };
      }),
  );
}

export interface Comparison {
  /** The farmer's rotation, the reference every option is measured against. */
  current?: MoneyRow;
  /** The other rotations: those with money first, by how much more they earn than the reference, then the rest. */
  options: (MoneyRow & { diff?: number })[];
  /** Position of a difference on a bar centred on the reference, 0–100 with the reference at 50. */
  pct(diff: number): number;
}

/**
 * The options against the farmer's rotation in an average year. A difference needs both average years, so with no
 * reference the options keep their own numbers and no difference.
 */
export function compareRows(rows: MoneyRow[]): Comparison {
  const current = rows.find((r) => r.isCurrent);
  const ref = current?.status === 'ready' ? current.mean! : undefined;
  const options = rows
    .filter((r) => !r.isCurrent)
    .map((r) => ({ ...r, diff: ref !== undefined && r.status === 'ready' ? r.mean! - ref : undefined }));
  const withMoney = options.filter((o) => o.diff !== undefined).sort((a, b) => b.diff! - a.diff!);
  const without = options.filter((o) => o.diff === undefined);
  const maxAbs = Math.max(0, ...withMoney.map((o) => Math.abs(o.diff!)));
  const pct = (diff: number) => (maxAbs === 0 ? 50 : 50 + (diff / maxAbs) * 50);
  return { current, options: [...withMoney, ...without], pct };
}
