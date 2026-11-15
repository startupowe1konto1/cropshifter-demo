// One rotation as a tile. Open on the tile: the title with the first "why" line, soil health and climate resilience
// first whatever the goal (D9), the calendar strip, the first gaps and local risks, and the support sentence at the
// bottom (SPEC section 11). Everything else sits in one list of folded rows (HANDOFF-frontend step 5): how the scores
// are made (the range note is said once above the cards), the income, the reasons, the evidence, the benefits and the regions. Folded, not deleted.
import { useState, type ReactNode } from 'react';
import { currentLang, t } from '../../app/i18n';
import type { Dataset, GoalId, Message, RotationOption } from '../../contracts';
import { moneyAvailable as moneyOn } from '../../app/providers';
import { SourcedNumber, StateBoundary } from '../../ui-kit';
import { cropName } from '../shared/cropName';
import { IncomeSection } from './IncomeSection';
import { ScoreRow } from './ScoreRow';

export function ordinal(n: number): string {
  // Polish writes an ordinal as the number with a dot ("132."), English adds a suffix ("132nd").
  if (currentLang() === 'pl') return `${n}.`;
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

export function rotationTitle(rotation: RotationOption): string {
  return rotation.years
    .map((y) => (y.coverCrop ? `${cropName(y.crop)} + ${cropName(y.coverCrop)}` : cropName(y.crop)))
    .join(' → ');
}

/** Each card section goes through <StateBoundary>: an empty section says so instead of showing nothing. */
function Section({ title, empty, children }: { title: string; empty?: boolean; children: ReactNode }) {
  return (
    <section className="grid gap-1.5">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      <StateBoundary state={empty ? 'no-data' : 'ready'} reason={t('steps.rotations.sectionEmpty')}>
        {children}
      </StateBoundary>
    </section>
  );
}

/** One folded row of the card's detail list: closed by default, opened by its title. Native <details>. */
function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group border-t border-zinc-200 first:border-t-0">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-2 sm:px-6 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-900 [&::-webkit-details-marker]:hidden">
        <h3 className="text-sm font-medium text-zinc-900">{title}</h3>
        <span aria-hidden="true" className="text-zinc-500 transition-transform group-open:rotate-180 motion-reduce:transition-none">
          ▾
        </span>
      </summary>
      <div className="grid gap-2 px-5 pb-5 sm:px-6">{children}</div>
    </details>
  );
}

/** The engine may repeat a code with other params, so the key holds both. */
const keyOf = (m: Message, i: number) => `${m.code}:${JSON.stringify(m.params ?? {})}:${i}`;

const Para = ({ m }: { m: Message }) => <p className="text-base leading-snug text-zinc-800">{t(m)}</p>;

/** Gaps and local risks show their first lines on the tile; the rest open with one button, so no list buries the card. */
const SHORT_LIST = 2;

function ShortList({ label, items }: { label: string; items: Message[] }) {
  const [all, setAll] = useState(false);
  const rest = items.length - SHORT_LIST;
  return (
    <>
      <ul aria-label={label} className="list-disc space-y-1 pl-5 text-sm leading-snug text-zinc-800">
        {(all ? items : items.slice(0, SHORT_LIST)).map((m, i) => (
          <li key={keyOf(m, i)}>{t(m)}</li>
        ))}
      </ul>
      {rest > 0 ? (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll(!all)}
          className="min-h-9 w-fit rounded text-left text-sm font-semibold text-zinc-900 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
        >
          {all ? t('steps.rotations.listLess') : t('steps.rotations.listMore', { count: rest })}
        </button>
      ) : null}
    </>
  );
}

export function RotationCard(props: {
  rotation: RotationOption;
  /** 1–3 for the other rotations in the order shown; not shown on the current rotation. */
  rank: number;
  goal: GoalId;
  datasets: Dataset[];
  /** Slot for the calendar strip (O2-B4), placed after the scores. */
  calendar?: ReactNode;
  /** Shows the income section. Defaults to `moneyAvailable` in src/app/providers.ts; tests pass it to switch money on. */
  moneyAvailable?: boolean;
}) {
  const { rotation: r, rank, goal, datasets, calendar, moneyAvailable = moneyOn } = props;
  const total = r.totals[goal];
  const goalName = t(`steps.goal.${goal}`);
  const keepRank = r.rankByGoal.keepSoil;

  return (
    <article
      data-testid={`card-${r.id}`}
      className="flex flex-col overflow-hidden rounded-[20px] border border-zinc-200 bg-white"
    >
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
        <div className="grid content-start gap-5">
        <header className="grid gap-1.5">
          {!r.isCurrent && rank === 1 ? (
            <span className="mb-1 inline-flex w-fit items-center gap-2 rounded-xl bg-lime-300 px-3 py-1.5 text-sm font-bold text-zinc-950">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12 5 5 9-10" />
              </svg>
              {t('steps.rotations.bestFor', { goal: goalName })}
            </span>
          ) : null}
          <span
            className={`w-fit text-xs font-semibold uppercase tracking-wide ${r.isCurrent ? 'text-zinc-500' : 'text-emerald-700'}`}
          >
            {r.isCurrent ? t('steps.rotations.current') : t('steps.rotations.option', { n: rank })}
          </span>
          <h2 className="text-xl font-semibold leading-snug tracking-tight text-zinc-900">{rotationTitle(r)}</h2>
          {r.why[0] ? <p className="text-sm leading-snug text-zinc-600">{t(r.why[0])}</p> : null}
          {goal !== 'keepSoil' && keepRank !== undefined ? (
            <p className="text-sm text-zinc-700">{t('steps.rotations.rankOnKeep', { nth: ordinal(keepRank) })}</p>
          ) : null}
        </header>

        <div className="grid gap-5 sm:grid-cols-2">
          <ScoreRow label={t('steps.rotations.soilHealth')} score={r.soilHealth} />
          <ScoreRow label={t('steps.rotations.climate')} score={r.climateResilience} />
          {goal !== 'keepSoil' ? (
            total.status === 'ready' ? (
              <ScoreRow label={t('steps.rotations.goalTotal', { goal: goalName })} score={total.data} />
            ) : (
              <div className="grid gap-1">
                <p className="text-sm font-medium text-zinc-800">{t('steps.rotations.goalTotalMissing', { goal: goalName })}</p>
                <StateBoundary
                  state={total.status === 'error' ? 'error' : 'no-data'}
                  source={total.status === 'error' ? total.source : t('steps.rotations.goalTotalSource')}
                  reason={total.status === 'not-loaded' ? t('steps.rotations.goalTotalNotLoaded') : t(total.reason)}
                >
                  {null}
                </StateBoundary>
              </div>
            )
          ) : null}
        </div>

        {calendar}
        </div>

        <div className="grid content-start gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />
            {t('steps.rotations.checkTitle')}
          </p>
          <Section title={t('steps.rotations.gaps')} empty={r.gaps.length === 0}>
            <ShortList label={t('steps.rotations.gaps')} items={r.gaps} />
          </Section>
          <Section title={t('steps.rotations.risks')} empty={r.localReviewRisks.length === 0}>
            <ShortList label={t('steps.rotations.risks')} items={r.localReviewRisks} />
          </Section>
        </div>
      </div>

      <div className="mt-auto border-t border-zinc-200">
        <Fold title={t('steps.rotations.scoresHow')}>
          <p className="text-sm leading-snug text-zinc-700">
            <span className="font-semibold text-zinc-900">{t('steps.rotations.soilHealth')}: </span>
            {t(r.soilHealth.basis)}
          </p>
          <p className="text-sm leading-snug text-zinc-700">
            <span className="font-semibold text-zinc-900">{t('steps.rotations.climate')}: </span>
            {t(r.climateResilience.basis)}
          </p>
          {goal !== 'keepSoil' && total.status === 'ready' ? (
            <p className="text-sm leading-snug text-zinc-700">
              <span className="font-semibold text-zinc-900">{t('steps.rotations.goalTotal', { goal: goalName })}: </span>
              {t(total.data.basis)}
            </p>
          ) : null}
        </Fold>

        {moneyAvailable ? (
          <Fold title={t('steps.rotations.income.title')}>
            <IncomeSection money={r.money} datasets={datasets} headingHidden />
          </Fold>
        ) : null}

        <Fold title={t('steps.rotations.why')}>
          <StateBoundary state={r.why.length === 0 ? 'no-data' : 'ready'} reason={t('steps.rotations.sectionEmpty')}>
            {r.why.map((m, i) => (
              <Para key={keyOf(m, i)} m={m} />
            ))}
          </StateBoundary>
        </Fold>

        <Fold title={t('steps.rotations.evidence')}>
          <StateBoundary state={r.evidence.length === 0 ? 'no-data' : 'ready'} reason={t('steps.rotations.sectionEmpty')}>
            {r.evidence.map((e, i) => (
              <div key={keyOf(e.message, i)} className="grid gap-1">
                <Para m={e.message} />
                {e.values.length > 0 ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-base text-zinc-900">
                    {e.values.map((v, j) => (
                      <SourcedNumber key={j} value={v} datasets={datasets} />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </StateBoundary>
        </Fold>

        <Fold title={t('steps.rotations.benefits')}>
          {r.benefits.length > 0 ? (
            r.benefits.map((m, i) => <Para key={keyOf(m, i)} m={m} />)
          ) : (
            <p className="text-base text-zinc-700">{t('steps.rotations.benefitsNone')}</p>
          )}
        </Fold>

        <Fold title={t('steps.rotations.twins')}>
          {r.twins.status === 'ready' ? (
            <div className="grid gap-2">
              <p className="text-base text-zinc-800">
                {t('steps.rotations.twinsReady', {
                  count: r.twins.data.caseCount,
                  similarity: Math.round(r.twins.data.meanSimilarity),
                })}
              </p>
              {/* A table, not a list: the card keeps exactly two lists (gaps, local risks). */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-base text-zinc-800">
                  <caption className="sr-only">{t('steps.rotations.twinsTable')}</caption>
                  <thead>
                    <tr className="border-b border-zinc-300 text-sm text-zinc-700">
                      <th scope="col" className="py-1 pr-3 font-medium">{t('steps.rotations.twinsRegion')}</th>
                      <th scope="col" className="py-1 pr-3 font-medium">{t('steps.rotations.twinsCrops')}</th>
                      <th scope="col" className="py-1 pr-3 font-medium">{t('steps.rotations.twinsYears')}</th>
                      <th scope="col" className="py-1 pr-3 font-medium">{t('steps.rotations.twinsSimilarity')}</th>
                      <th scope="col" className="py-1 font-medium">{t('steps.rotations.twinsYield')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.twins.data.cases.map((c, i) => (
                      <tr key={`${c.regionName}:${c.years}:${i}`} className="border-b border-zinc-200 align-top">
                        <th scope="row" className="py-1.5 pr-3 font-medium">{c.regionName}</th>
                        <td className="py-1.5 pr-3">{c.crops.map((crop) => cropName(crop)).join(', ')}</td>
                        <td className="py-1.5 pr-3">{c.years}</td>
                        <td className="py-1.5 pr-3">
                          {/* Our calculation: the case's NASA POWER features against the field's (src/twins/similarity.ts). */}
                          <SourcedNumber
                            value={{
                              value: Math.round(c.similarity),
                              unit: '%',
                              kind: 'derived',
                              datasetIds: c.outcome.datasetIds.filter((id) => id.startsWith('nasa-power')),
                              retrievedAt: c.outcome.retrievedAt,
                            }}
                            datasets={datasets}
                            decimals={0}
                          />
                        </td>
                        <td className="py-1.5">
                          <SourcedNumber value={c.outcome} datasets={datasets} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <StateBoundary
              state={r.twins.status === 'error' ? 'error' : 'no-data'}
              source={r.twins.status === 'error' ? r.twins.source : undefined}
              reason={
                r.twins.status === 'not-loaded' ? t('steps.rotations.twinsNotLoaded') : t(r.twins.reason)
              }
            >
              {null}
            </StateBoundary>
          )}
        </Fold>
      </div>

      <p className="border-t border-zinc-200 bg-zinc-50 px-5 py-3 text-sm leading-snug text-zinc-600 sm:px-6">{t('app.support')}</p>
    </article>
  );
}
