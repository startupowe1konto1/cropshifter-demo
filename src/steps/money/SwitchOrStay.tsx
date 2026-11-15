// Step 6 top (O1-F14): "Switch or stay?". One option from step 5 next to the farmer's rotation: a one-line verdict,
// three rows (soil health, climate resilience, income in an average year) and the confirmed payments. Soil and
// climate come first, as on every card (D9). Bad and good years, all payments and sources stay in the details below.
// Every row has a fixed height, so the two columns line up whatever the rotation names are.
import { Fragment, useState, type ReactNode } from 'react';
import { t } from '../../app/i18n';
import type { Analysis, GoalId, RotationOption, Sourced } from '../../contracts';
import { SourcedNumber } from '../../ui-kit';
import { TermText } from '../cards/TermText';
import type { MoneyRow } from './moneyRows';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);

/** A message template with React elements in place of its {placeholders}. */
function Template({ code, parts }: { code: string; parts: Record<string, ReactNode> }) {
  const pieces = t(code).split(/\{(\w+)\}/);
  return (
    <>
      {pieces.map((piece, i) => (
        <Fragment key={i}>{i % 2 === 0 ? piece : (parts[piece] ?? `{${piece}}`)}</Fragment>
      ))}
    </>
  );
}

function scoresKey(soil: number, climate: number): string {
  if (soil === 0 && climate === 0) return 'steps.money.v.sameScores';
  if (soil >= 0 && climate >= 0) return 'steps.money.v.better';
  if (soil < 0 && climate < 0) return 'steps.money.v.worse';
  return soil > 0 ? 'steps.money.v.soil' : 'steps.money.v.climate';
}

/** Difference in score points, said with an arrow; the words are there for screen readers. */
function Delta({ n }: { n: number }) {
  if (n === 0) return null;
  const up = n > 0;
  return (
    <span
      className={`ml-auto inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-base font-bold ${
        up ? 'bg-emerald-50 text-emerald-800' : 'bg-zinc-100 text-zinc-900'
      }`}
    >
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      <span aria-hidden="true">{fmt(Math.abs(n))}</span>
      <span className="sr-only">{t(up ? 'steps.money.deltaMore' : 'steps.money.deltaLess', { n: fmt(Math.abs(n)) })}</span>
    </span>
  );
}

const average = (row: MoneyRow): Sourced => ({ ...row.margin!, range: undefined });

/** Confirmed payments only: the engine adds just these to the income, and so does this bar. */
function confirmedSum(row: MoneyRow): { sum: Sourced; names: string[] } | null {
  const paid = (row.money?.payments ?? []).filter((p) => p.confirmed && p.amountPerHa.value !== null);
  if (paid.length === 0) return null;
  return {
    sum: {
      value: paid.reduce((sum, p) => sum + p.amountPerHa.value!, 0),
      unit: paid[0]!.amountPerHa.unit,
      datasetIds: [...new Set(paid.flatMap((p) => p.amountPerHa.datasetIds))],
      kind: 'derived',
      retrievedAt: paid[0]!.amountPerHa.retrievedAt,
    },
    names: [...new Set(paid.map((p) => p.programme))],
  };
}

const cell = 'h-[88px] px-4 py-3 align-middle sm:px-6';

export function SwitchOrStay({ rows, analysis, goal }: { rows: MoneyRow[]; analysis: Analysis; goal: GoalId }) {
  const options = rows.filter((r) => !r.isCurrent);
  const current = rows.find((r) => r.isCurrent);
  const [pickedId, setPickedId] = useState(options[0]?.id);
  if (!current || options.length === 0) return null;

  const picked = options.find((o) => o.id === pickedId) ?? options[0]!;
  const n = options.indexOf(picked) + 1;
  const rot = (id: string): RotationOption => analysis.rotations.find((r) => r.id === id)!;
  const a = rot(picked.id);
  const b = rot(current.id);
  const soilDiff = Math.round(a.soilHealth.value) - Math.round(b.soilHealth.value);
  const climateDiff = Math.round(a.climateResilience.value) - Math.round(b.climateResilience.value);
  const bothMoney = picked.status === 'ready' && current.status === 'ready';
  const moneyDiff = bothMoney ? Math.round(picked.mean! - current.mean!) : null;
  const diffValue: Sourced | null = bothMoney
    ? {
        value: Math.abs(moneyDiff!),
        unit: current.margin!.unit,
        datasetIds: [...new Set([...picked.margin!.datasetIds, ...current.margin!.datasetIds])],
        kind: 'derived',
        retrievedAt: picked.margin!.retrievedAt,
      }
    : null;
  const moneyKey =
    moneyDiff === null ? 'steps.money.v.noMoney' : moneyDiff > 0 ? 'steps.money.v.more' : moneyDiff < 0 ? 'steps.money.v.less' : 'steps.money.v.same';
  const paid = picked.status === 'ready' ? confirmedSum(picked) : null;
  const optionName = t('steps.rotations.option', { n });

  const income = (row: MoneyRow, diff?: number | null) =>
    row.status === 'ready' ? (
      <span className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[28px]">
        <SourcedNumber value={average(row)} datasets={analysis.datasets} decimals={0} />
        {diff !== undefined && diff !== null && diff !== 0 ? (
          // On a phone the verdict above already says the difference, so the pill would only crowd the cell.
          <span
            className={`ml-auto hidden h-8 shrink-0 items-center gap-1 rounded-full px-3 text-base font-bold sm:inline-flex ${
              diff > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-zinc-100 text-zinc-900'
            }`}
          >
            <span aria-hidden="true">{diff > 0 ? '▲' : '▼'}</span>
            <span aria-hidden="true">{fmt(Math.abs(diff))}</span>
          </span>
        ) : null}
      </span>
    ) : (
      <span className="text-base font-semibold text-zinc-700">{t('ui.noData')}</span>
    );

  return (
    <section aria-labelledby="switch-title" className="grid gap-4">
      <h2 id="switch-title" className="text-xl font-bold tracking-tight text-zinc-950">
        {t('steps.money.switchTitle')}
      </h2>

      {options.length > 1 ? (
        <div role="radiogroup" aria-label={t('steps.money.pickOption')} className="inline-flex w-fit gap-1 rounded-full bg-white p-1 ring-1 ring-inset ring-zinc-200">
          {options.map((o, i) => {
            const on = o.id === picked.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPickedId(o.id)}
                className={`h-10 rounded-full px-4 text-[15px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 motion-reduce:transition-none ${
                  on ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {t('steps.rotations.option', { n: i + 1 })}
              </button>
            );
          })}
        </div>
      ) : null}

      <p
        data-testid="money-verdict"
        className="flex min-h-[72px] flex-wrap items-center gap-x-1.5 rounded-[20px] border border-lime-300 bg-lime-100 px-5 py-3 text-lg font-semibold leading-snug text-zinc-950"
      >
        <Template
          code="steps.money.verdict"
          parts={{
            scores: t(scoresKey(soilDiff, climateDiff)),
            money: diffValue ? (
              <Template code={moneyKey} parts={{ diff: <SourcedNumber value={diffValue} datasets={analysis.datasets} decimals={0} /> }} />
            ) : (
              t(moneyKey)
            ),
          }}
        />
      </p>

      <h3 id="switch-compare-title" className="mt-4 border-t border-zinc-200 pt-5 text-lg font-semibold text-zinc-950">
        {t('steps.money.compareTitle')}
      </h3>
      <div className="mt-1 overflow-hidden rounded-[20px] border border-zinc-200 bg-white shadow-sm sm:mx-2">
        <table aria-label={t('steps.money.compare')} className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[27%] sm:w-[26%]" />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <td className="h-28" />
              <th scope="col" className="h-28 border-l border-zinc-200 px-4 text-left align-middle font-normal sm:px-5">
                <span className="grid justify-items-start gap-1.5">
                  {n === 1 ? (
                    <span className="inline-flex min-h-[26px] items-center rounded-lg bg-lime-300 px-2.5 py-0.5 text-xs leading-tight font-bold sm:text-sm text-zinc-950">
                      {t('steps.money.bestFor', { goal: t(`steps.goal.${goal}`) })}
                    </span>
                  ) : (
                    <span className="inline-flex h-[26px] items-center text-xs font-bold uppercase sm:text-sm tracking-wide text-zinc-600">{optionName}</span>
                  )}
                  <span className="line-clamp-3 text-base font-bold leading-snug sm:text-lg text-zinc-950">{picked.title}</span>
                </span>
              </th>
              <th scope="col" className="h-28 border-l border-zinc-200 bg-zinc-50 px-4 text-left align-middle font-normal sm:px-5">
                <span className="grid justify-items-start gap-1.5">
                  <span className="inline-flex min-h-[26px] items-center rounded-lg bg-zinc-800 px-2.5 py-0.5 text-xs leading-tight font-bold sm:text-sm text-white">
                    {t('steps.money.current')}
                  </span>
                  <span className="line-clamp-3 text-base font-bold leading-snug sm:text-lg text-zinc-950">{current.title}</span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: t('steps.rotations.soilHealth'), mine: a.soilHealth.value, theirs: b.soilHealth.value, diff: soilDiff },
              { label: t('steps.rotations.climate'), mine: a.climateResilience.value, theirs: b.climateResilience.value, diff: climateDiff },
            ].map((r) => (
              <tr key={r.label} className="border-t border-zinc-200">
                <th scope="row" className={`${cell} text-left text-base font-semibold text-zinc-700 sm:text-lg`}>
                  {r.label}
                </th>
                <td className={`${cell} border-l border-zinc-200`}>
                  <span className="flex items-center gap-2">
                    <span className="text-[28px] font-extrabold sm:text-[32px] tabular-nums tracking-tight text-zinc-950">{Math.round(r.mine)}</span>
                    <Delta n={r.diff} />
                  </span>
                </td>
                <td className={`${cell} border-l border-zinc-200 bg-zinc-50`}>
                  <span className="text-[28px] font-extrabold sm:text-[32px] tabular-nums tracking-tight text-zinc-950">{Math.round(r.theirs)}</span>
                </td>
              </tr>
            ))}
            <tr className="border-t border-zinc-200">
              <th scope="row" className={`${cell} text-left text-base font-semibold text-zinc-700 sm:text-lg`}>
                {t('steps.money.incomeRow')}
              </th>
              <td className={`${cell} border-l border-zinc-200`}>{income(picked, moneyDiff)}</td>
              <td className={`${cell} border-l border-zinc-200 bg-zinc-50`}>{income(current)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p data-testid="demo-data-note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-snug text-amber-950 sm:mx-2">
        {t('steps.money.demoNote')}
      </p>

      {picked.status === 'ready' ? (
        <div data-testid="money-payments" className="grid min-h-16 gap-1.5 rounded-[20px] border border-zinc-200 bg-white px-5 py-4 text-[15px] text-zinc-800">
          {paid ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="font-semibold text-zinc-950">
                  <TermText code="steps.money.payments" terms={{ payments: 'government-support' }} />
                </span>
                <span className="text-lg font-bold text-zinc-950">
                  + <SourcedNumber value={paid.sum} datasets={analysis.datasets} decimals={0} />
                </span>
              </div>
              <p className="text-sm leading-snug text-zinc-700">
                {t(picked.money!.currency === 'USD' ? 'steps.money.paymentsHow.US' : 'steps.money.paymentsHow.PL')}
              </p>
              <ul className="grid gap-0.5 text-sm text-zinc-700">
                {paid.names.map((name) => (
                  <li key={name} className="flex gap-2">
                    <span aria-hidden="true">·</span>
                    {name}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>{t('steps.money.paymentsNone', { name: optionName })}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
