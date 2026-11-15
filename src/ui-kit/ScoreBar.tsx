import type { Score } from '../contracts';
import { t } from '../app/i18n';
import { ConfidenceBadge } from './ConfidenceBadge';

/** Whole number inside 0–100, so text and bar always agree and nothing is drawn outside the track. */
function clamp(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function ScoreBar(props: { label: string; score: Score; basisText?: string }) {
  const { label, score, basisText } = props;
  const value = clamp(score.value);
  const low = clamp(Math.min(score.low, score.high));
  const high = clamp(Math.max(score.low, score.high));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base font-medium text-zinc-900">{label}</span>
        <span className="shrink-0 text-base font-semibold tabular-nums text-zinc-900">
          {t('ui.score.value', { value })}
        </span>
      </div>

      <div
        role="img"
        aria-label={t('ui.score.barLabel', { label, value, low, high })}
        className="relative h-6"
      >
        <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-zinc-200" />
        <div
          data-part="range"
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full border border-emerald-700 bg-emerald-300"
          style={{ left: `${low}%`, width: `${high - low}%` }}
        />
        <div
          data-part="marker"
          className="absolute top-0 h-6 w-1.5 -translate-x-1/2 rounded-sm bg-zinc-900 ring-2 ring-white"
          style={{ left: `${value}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-sm tabular-nums text-zinc-700">{t('ui.score.range', { low, high })}</span>
        <ConfidenceBadge confidence={score.confidence} />
      </div>

      {basisText ? <p className="text-sm text-zinc-600">{basisText}</p> : null}
    </div>
  );
}
