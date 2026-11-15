// Step 2: the farmer's main goal (SPEC section 12, D9). The goal only reorders the rotations; soil health is always shown first.
import type { ComponentType } from 'react';
import { t } from '../../app/i18n';
import { moneyAvailable } from '../../app/providers';
import { useAppStore } from '../../app/store';
import type { GoalId } from '../../contracts';
import { IconImproveSoil, IconIncome, IconKeepSoil } from '../icons';

const goals: { id: GoalId; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'keepSoil', Icon: IconKeepSoil },
  { id: 'improveSoil', Icon: IconImproveSoil },
  { id: 'income', Icon: IconIncome },
];

export function GoalStep() {
  const goal = useAppStore((s) => s.goal);
  const setGoal = useAppStore((s) => s.setGoal);

  return (
    <section className="grid gap-4">
      {/* The step title in the header already asks the question; the group repeats it for screen readers. */}
      <div role="radiogroup" aria-label={t('steps.goal.question')} className="grid gap-3">
        {goals.map(({ id, Icon }) => {
          const chosen = goal === id;
          // The note sits inside the option, so it is read once as part of its name.
          const showNote = id === 'income' && !moneyAvailable;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => setGoal(id)}
              className={`flex min-h-[76px] w-full cursor-pointer items-center gap-4 rounded-[20px] border-2 px-4 py-4 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/40 ${
                chosen ? 'border-zinc-900 bg-lime-100' : 'border-zinc-200 bg-white hover:border-zinc-500'
              }`}
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] ${
                  chosen ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-800'
                }`}
              >
                <Icon size={28} />
              </span>
              <span className="grid flex-1 gap-1">
                <span className="text-lg font-semibold text-zinc-900">{t(`steps.goal.${id}`)}</span>
                <span className="text-base leading-snug text-zinc-700">{t(`steps.goal.${id}.hint`)}</span>
                {showNote ? (
                  <span className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-sm text-amber-900">
                    {t('steps.goal.income.noMoney')}
                  </span>
                ) : null}
              </span>
              {/* The tick repeats the chosen state as a shape, so colour is not the only sign (design.md rule 4). */}
              <span
                aria-hidden="true"
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${
                  chosen ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 text-transparent'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
