// A score on the rotation card: the value large, a thin track with the range as a band and the value as a marker,
// and the range and the confidence in words underneath (colour is never the only signal).
import { t } from '../../app/i18n';
import type { Score } from '../../contracts';

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

const CONFIDENCE_TEXT: Record<Score['confidence'], string> = {
  strong: 'text-emerald-800',
  moderate: 'text-zinc-700',
  weak: 'text-amber-800',
};
const CONFIDENCE_DOT: Record<Score['confidence'], string> = {
  strong: 'bg-emerald-600',
  moderate: 'bg-zinc-400',
  weak: 'bg-amber-500',
};

export function ScoreRow({ label, score }: { label: string; score: Score }) {
  const value = clamp(score.value);
  const low = clamp(Math.min(score.low, score.high));
  const high = clamp(Math.max(score.low, score.high));
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-zinc-700">{label}</span>
        <span className="tabular-nums">
          <span className="text-2xl font-semibold tracking-tight text-zinc-900">{value}</span>
          <span className="text-sm text-zinc-500"> / 100</span>
        </span>
      </div>
      <div role="img" aria-label={t('ui.score.barLabel', { label, value, low, high })} className="relative h-2 rounded-full bg-zinc-100">
        <div className="absolute inset-y-0 rounded-full bg-emerald-200" style={{ left: `${low}%`, width: `${Math.max(high - low, 1)}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-600" style={{ width: `${value}%` }} />
        <div className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded bg-zinc-900" style={{ left: `${value}%` }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <span className="tabular-nums text-zinc-500">{t('ui.score.range', { low, high })}</span>
        <span className={`inline-flex items-center gap-1.5 font-medium ${CONFIDENCE_TEXT[score.confidence]}`}>
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${CONFIDENCE_DOT[score.confidence]}`} />
          {t(`ui.confidence.${score.confidence}`)}
        </span>
      </div>
    </div>
  );
}
