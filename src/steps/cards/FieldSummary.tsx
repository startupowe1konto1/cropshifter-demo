// The field's NASA climate record and soil in a few lines, above the cards. Every value goes through <SourcedNumber>.
import { t } from '../../app/i18n';
import type { Analysis, Dataset, Hazard, Sourced } from '../../contracts';
import { SourcesNote, SourcedNumber } from '../../ui-kit';
import { TermText } from './TermText';

// Drought is measured against the field's own record (D42), so every month is a drought in about the same share of
// years and over the whole record the count of drought years is fixed by the percentile. Neither says anything
// about this field, so the summary shows no "highest drought month" and counts drought years in the recent seasons.
const hazards: Hazard[] = ['heat', 'frost'];
/** Recent seasons in which drought years are counted. */
const RECENT_SEASONS = 15;

function recentYears(analysis: Analysis): { from: number; to: number; years: number[] } | null {
  const years = analysis.profile.yearly.map((y) => y.year);
  if (years.length === 0) return null;
  const to = Math.max(...years);
  const from = Math.max(Math.min(...years), to - RECENT_SEASONS + 1);
  return { from, to, years: years.filter((y) => y >= from) };
}

/** Counting drought years from the record is our calculation on top of the provider's data. */
function droughtYears(analysis: Analysis): Sourced {
  const { profile } = analysis;
  const recent = recentYears(analysis);
  // drought years come from monthly root-zone wetness only, not from the daily temperature record (D43)
  const datasetIds = profile.source.datasetIds.filter((id) => id !== 'nasa-power-daily');
  const base = { datasetIds, kind: 'derived' as const, retrievedAt: profile.source.retrievedAt };
  if (!recent) return { ...base, value: null, missingReason: t('steps.rotations.summary.droughtYears.none') };
  const value = profile.droughtYears.filter((y) => y >= recent.from).length;
  return { ...base, value, unit: t('steps.rotations.summary.droughtYears.unit', { n: recent.years.length }) };
}

/** The month with the highest share of years hit by a hazard, shown as a percentage of years. */
function peak(analysis: Analysis, hazard: Hazard): { month: number; share: Sourced } | null {
  const rows = analysis.profile.monthlyRisk.filter((m) => m.hazard === hazard && m.probability.value !== null);
  if (rows.length === 0) return null;
  const top = rows.reduce((a, b) => ((b.probability.value ?? 0) > (a.probability.value ?? 0) ? b : a));
  const p = top.probability;
  const pct = (x: number) => Math.round(x * 100);
  return {
    month: top.month,
    share: {
      ...p,
      value: pct(p.value ?? 0),
      unit: t('steps.rotations.summary.yearsShare'),
      range: p.range ? { ...p.range, low: pct(p.range.low), high: pct(p.range.high) } : undefined,
    },
  };
}

function droughtLabel(analysis: Analysis): string {
  const recent = recentYears(analysis);
  return recent
    ? t('steps.rotations.summary.droughtYears.recent', { from: recent.from, to: recent.to })
    : t('steps.rotations.summary.droughtYears');
}

function Row({ label, value, datasets, decimals }: { label: string; value: Sourced; datasets: Dataset[]; decimals?: number }) {
  return (
    <div className="grid content-start gap-1 py-1">
      <dt className="text-sm text-zinc-600">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-zinc-900">
        <SourcedNumber value={value} datasets={datasets} decimals={decimals} />
      </dd>
    </div>
  );
}

/**
 * One stripe per growing season, wetter seasons darker, drought years in amber (D42). A picture of the same NASA POWER
 * record the rows below count from; the rows carry the numbers and their sources.
 */
function SeasonStripes({ analysis }: { analysis: Analysis }) {
  const rows = analysis.profile.yearly.filter((y) => y.growingSeasonWetness.value !== null);
  if (rows.length === 0) return null;
  const values = rows.map((y) => y.growingSeasonWetness.value!);
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  const drought = new Set(analysis.profile.droughtYears);
  const first = rows[0]!.year;
  const last = rows[rows.length - 1]!.year;
  return (
    <figure className="grid gap-1.5">
      <div
        role="img"
        aria-label={t('steps.rotations.summary.stripes.label', { n: rows.length, from: first, to: last, drought: analysis.profile.droughtYears.length })}
        className="flex h-8 items-stretch gap-[2px]"
      >
        {rows.map((y) => {
          const share = (y.growingSeasonWetness.value! - lo) / span;
          return (
            <span
              key={y.year}
              title={`${y.year}${drought.has(y.year) ? ` · ${t('steps.rotations.summary.stripes.drought')}` : ''}`}
              className={`flex-1 rounded-[2px] ${drought.has(y.year) ? 'bg-amber-600' : 'bg-sky-700'}`}
              style={drought.has(y.year) ? undefined : { opacity: 0.25 + share * 0.75 }}
            />
          );
        })}
      </div>
      <figcaption className="flex flex-wrap justify-between gap-x-3 text-xs text-zinc-600">
        <span className="tabular-nums">{first}</span>
        <span>{t('steps.rotations.summary.stripes.caption')}</span>
        <span className="tabular-nums">{last}</span>
      </figcaption>
    </figure>
  );
}

export function FieldSummary({ analysis }: { analysis: Analysis }) {
  const { profile, datasets, field } = analysis;
  return (
    <section aria-labelledby="field-summary-title" className="grid gap-4 rounded-[20px] border border-zinc-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="field-summary-title" className="text-base font-semibold text-zinc-900">
          {t('steps.rotations.summary.title')}: {field.name}
        </h2>
        <span className="text-xs text-zinc-500">{t('steps.rotations.summary.stripes.title')}</span>
      </div>
      <SeasonStripes analysis={analysis} />
      <details className="group">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded text-sm font-medium text-zinc-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 [&::-webkit-details-marker]:hidden">
          {t('steps.rotations.summary.droughtWhat')}
          <span aria-hidden="true" className="text-zinc-900 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none">
            ▾
          </span>
        </summary>
        <p className="pb-3 text-sm leading-relaxed text-zinc-700">
          <TermText
            code="steps.rotations.summary.droughtNote"
            terms={{ rootZone: 'root-zone', wetness: 'soil-wetness-index', model: 'model-estimate' }}
          />
        </p>
      </details>
      <dl className="grid gap-x-6 gap-y-2 border-y border-zinc-100 py-3 sm:grid-cols-3">
        <Row label={droughtLabel(analysis)} value={droughtYears(analysis)} datasets={datasets} decimals={0} />
        {hazards.map((hazard) => {
          const top = peak(analysis, hazard);
          const name = t(`steps.rotations.summary.hazard.${hazard}`);
          if (!top) {
            // Every value is missing: show the provider's reason instead of a blank line.
            const missing = analysis.profile.monthlyRisk.find((m) => m.hazard === hazard)?.probability;
            if (missing) {
              return (
                <Row key={hazard} label={t('steps.rotations.summary.peak', { hazard: name })} value={missing} datasets={datasets} />
              );
            }
            return (
              <div key={hazard} className="py-1 text-sm text-zinc-700">
                {t('steps.rotations.summary.peak.none', { hazard: name })}
              </div>
            );
          }
          return (
            <Row
              key={hazard}
              label={`${t('steps.rotations.summary.peak', { hazard: name })}: ${t(`steps.rotations.month.${top.month}`)}`}
              value={top.share}
              datasets={datasets}
              decimals={0}
            />
          );
        })}
      </dl>
      {/* Soil and slope fold away so the cards start on the first screen of a phone. */}
      <details className="group">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded text-sm font-medium text-zinc-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 [&::-webkit-details-marker]:hidden">
          {t('steps.rotations.summary.soilAndSlope')}
          <span aria-hidden="true" className="text-zinc-900 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none">
            ▾
          </span>
        </summary>
        <dl>
          <Row label={t('steps.rotations.summary.sand')} value={profile.soil.sandPct} datasets={datasets} decimals={0} />
          <Row label={t('steps.rotations.summary.clay')} value={profile.soil.clayPct} datasets={datasets} decimals={0} />
          <Row label={t('steps.rotations.summary.organicCarbon')} value={profile.soil.organicCarbon} datasets={datasets} />
          <Row label={t('steps.rotations.summary.slope')} value={profile.slopePct} datasets={datasets} />
        </dl>
      </details>
      <SourcesNote
        values={[droughtYears(analysis), profile.soil.sandPct, profile.soil.clayPct, profile.soil.organicCarbon, profile.slopePct]}
        datasets={datasets}
      />
    </section>
  );
}
