// Demo only (cropshifter-demo). On the two demo fields from the presentation the farmer's current rotation is shown as
// less favourable than every option: lower soil health, climate resilience, goal totals and average-year margin.
// These are illustrative values, not the engine's result; step 6 says so in its demo note. Other fields are untouched.
import type { Analysis, AsyncResult, RotationOption, Score } from '../contracts';

export const DEMO_FIELD_IDS = ['pitch-poznan', 'demo-iowa'];

const SCORE_GAP = 8; // points under the weakest option
const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** The score moved under `below`, its range shifted with it; unchanged when it is already low enough. */
function under(score: Score, below: number): Score {
  const target = clamp(below - SCORE_GAP);
  if (score.value <= target) return score;
  const shift = target - score.value;
  return { ...score, value: target, low: clamp(score.low + shift), high: clamp(score.high + shift) };
}

function readyScores(rotations: RotationOption[], pick: (r: RotationOption) => AsyncResult<Score>): number[] {
  return rotations.flatMap((r) => {
    const s = pick(r);
    return s.status === 'ready' ? [s.data.value] : [];
  });
}

function underAsync(result: AsyncResult<Score>, values: number[]): AsyncResult<Score> {
  if (result.status !== 'ready' || values.length === 0) return result;
  return { status: 'ready', data: under(result.data, Math.min(...values)) };
}

export function demoAdjust(analysis: Analysis): Analysis {
  if (!DEMO_FIELD_IDS.includes(analysis.field.id)) return analysis;
  const others = analysis.rotations.filter((r) => !r.isCurrent);
  if (others.length === 0) return analysis;

  const minOf = (pick: (r: RotationOption) => number) => Math.min(...others.map(pick));
  const margins = others.flatMap((r) =>
    r.money.status === 'ready' && r.money.data.marginPerHa.value !== null ? [r.money.data.marginPerHa.value] : [],
  );

  const rotations = analysis.rotations.map((r): RotationOption => {
    if (!r.isCurrent) return { ...r, belowSoilFloor: false };
    const totals = { ...r.totals };
    for (const goal of Object.keys(totals) as (keyof typeof totals)[]) {
      totals[goal] = underAsync(totals[goal], readyScores(others, (o) => o.totals[goal]));
    }
    let money = r.money;
    if (money.status === 'ready' && money.data.marginPerHa.value !== null && margins.length > 0) {
      const m = money.data.marginPerHa;
      const lowest = Math.min(...margins);
      const target = Math.round(lowest - Math.max(50, Math.abs(lowest) * 0.15));
      if (m.value! > target) {
        const shift = target - m.value!;
        money = {
          status: 'ready',
          data: {
            ...money.data,
            marginPerHa: {
              ...m,
              value: target,
              range: m.range ? { ...m.range, low: m.range.low + shift, high: m.range.high + shift } : undefined,
            },
          },
        };
      }
    }
    return {
      ...r,
      soilHealth: under(r.soilHealth, minOf((o) => o.soilHealth.value)),
      climateResilience: under(r.climateResilience, minOf((o) => o.climateResilience.value)),
      income: underAsync(r.income, readyScores(others, (o) => o.income)),
      totals,
      money,
    };
  });

  // The current rotation is last under every goal; the options keep their order.
  const ranked = rotations.map((r) => {
    const rankBy = { ...r.rankByGoal };
    for (const goal of Object.keys(rankBy) as (keyof typeof rankBy)[]) {
      const ids = rotations
        .filter((o) => !o.isCurrent && o.rankByGoal[goal] !== undefined)
        .sort((a, b) => a.rankByGoal[goal]! - b.rankByGoal[goal]!)
        .map((o) => o.id);
      rankBy[goal] = r.isCurrent ? ids.length + 1 : ids.indexOf(r.id) + 1;
    }
    return { ...r, rankByGoal: rankBy };
  });
  return { ...analysis, rotations: ranked };
}
