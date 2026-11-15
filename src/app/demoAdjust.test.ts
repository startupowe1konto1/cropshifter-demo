import type { Analysis, GoalId } from '../contracts';
import { iowaAnalysis } from '../fixtures/analysis.iowa';
import { poznanAnalysis } from '../fixtures/analysis.poznan';
import { pitchPoznanField } from '../map/demo/pitchField';
import { demoAdjust } from './demoAdjust';

const GOALS: GoalId[] = ['keepSoil', 'improveSoil', 'income'];

function expectCurrentWorst(analysis: Analysis) {
  const current = analysis.rotations.find((r) => r.isCurrent)!;
  const others = analysis.rotations.filter((r) => !r.isCurrent);
  expect(others.length).toBeGreaterThan(0);
  for (const o of others) {
    expect(current.soilHealth.value).toBeLessThan(o.soilHealth.value);
    expect(current.climateResilience.value).toBeLessThan(o.climateResilience.value);
    if (current.money.status === 'ready' && o.money.status === 'ready') {
      expect(current.money.data.marginPerHa.value!).toBeLessThan(o.money.data.marginPerHa.value!);
    }
    for (const goal of GOALS) {
      if (current.rankByGoal[goal] !== undefined && o.rankByGoal[goal] !== undefined) {
        expect(current.rankByGoal[goal]!).toBeGreaterThan(o.rankByGoal[goal]!);
      }
    }
  }
}

describe('demoAdjust', () => {
  it('puts the current rotation under every option on the Iowa demo field', () => {
    expectCurrentWorst(demoAdjust(iowaAnalysis));
  });

  it('puts the current rotation under every option on the Uzarzewo demo field', () => {
    expectCurrentWorst(demoAdjust({ ...poznanAnalysis, field: pitchPoznanField }));
  });

  it('leaves any other field as the engine returned it', () => {
    const other = { ...iowaAnalysis, field: { ...iowaAnalysis.field, id: 'drawn-1' } };
    expect(demoAdjust(other)).toBe(other);
  });
});
