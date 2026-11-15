// Income on a rotation card (issue #98 item 9, SPEC section 7): the margin in an average, a bad and a good year,
// the payments with their conditions, and the "not a forecast" line. Every number goes through <SourcedNumber>.
import { useId } from 'react';
import { t } from '../../app/i18n';
import type { Dataset, MoneyEstimate, RotationOption, Sourced } from '../../contracts';
import { SourcedNumber, StateBoundary } from '../../ui-kit';
import { TermText } from './TermText';

/** Money is shown in whole units: cents per hectare would suggest a precision the replay does not have. */
const DECIMALS = 0;

/** The bad or good year as a value of its own, with the same sources as the mean. */
const yearValue = (m: Sourced, value: number): Sourced => ({ ...m, value, range: undefined });

export function Margins({ m, datasets }: { m: Sourced; datasets: Dataset[] }) {
  const rows: [string, Sourced][] = [['steps.rotations.income.average', { ...m, range: undefined }]];
  if (m.value !== null && m.range) {
    rows.push(['steps.rotations.income.bad', yearValue(m, m.range.low)]);
    rows.push(['steps.rotations.income.good', yearValue(m, m.range.high)]);
  }
  return (
    <div className="grid gap-1">
      <p className="text-base text-zinc-800">
        <TermText code="steps.rotations.income.marginLead" terms={{ margin: 'margin' }} />
      </p>
      <dl className="grid gap-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-wrap items-center justify-between gap-x-3 border-b border-zinc-100 py-1 last:border-b-0">
            <dt className="text-base text-zinc-700">{t(label)}</dt>
            <dd className="text-base">
              <SourcedNumber value={value} datasets={datasets} decimals={DECIMALS} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Payments({ money, datasets }: { money: MoneyEstimate; datasets: Dataset[] }) {
  const headingId = useId();
  return (
    <div role="group" aria-labelledby={headingId} className="grid gap-2">
      <h4 id={headingId} className="text-base font-semibold text-zinc-900">
        {t('steps.rotations.income.payments')}
      </h4>
      {money.payments.length === 0 ? (
        <p className="text-base text-zinc-700">{t('steps.rotations.income.paymentsNone')}</p>
      ) : (
        money.payments.map((p, i) => (
          <div
            key={`${p.programme}:${i}`}
            role="group"
            aria-label={p.programme}
            className={`grid gap-1 rounded-lg border p-3 ${p.confirmed ? 'border-zinc-200' : 'border-dashed border-amber-700 bg-amber-50'}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <span className="text-base font-medium text-zinc-900">{p.programme}</span>
              <SourcedNumber value={p.amountPerHa} datasets={datasets} decimals={DECIMALS} />
            </div>
            {p.confirmed ? null : (
              <p className="text-base font-semibold text-amber-950">{t('steps.rotations.income.unconfirmed')}</p>
            )}
            <p className="text-sm leading-snug text-zinc-700">{t(p.condition)}</p>
          </div>
        ))
      )}
      <p className="text-sm text-zinc-700">{t('steps.rotations.income.campaign', { campaign: money.campaign })}</p>
    </div>
  );
}

export function IncomeSection(props: {
  money: RotationOption['money'];
  datasets: Dataset[];
  /** Inside a fold the fold's title already says "Income": the heading stays for screen readers only. */
  headingHidden?: boolean;
}) {
  const { money, datasets, headingHidden = false } = props;
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="grid gap-2">
      <h3 id={headingId} className={headingHidden ? 'sr-only' : 'text-base font-semibold text-zinc-900'}>
        {t('steps.rotations.income.title')}
      </h3>
      <p className="text-sm font-medium text-zinc-800">{t('steps.rotations.income.notForecast')}</p>
      {money.status === 'ready' ? (
        <div className="grid gap-3">
          <Margins m={money.data.marginPerHa} datasets={datasets} />
          <Payments money={money.data} datasets={datasets} />
        </div>
      ) : (
        <StateBoundary
          state={money.status === 'error' ? 'error' : 'no-data'}
          source={money.status === 'error' ? money.source : undefined}
          reason={money.status === 'not-loaded' ? t('steps.rotations.income.notLoaded') : t(money.reason)}
        >
          {null}
        </StateBoundary>
      )}
    </section>
  );
}
