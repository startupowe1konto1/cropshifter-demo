// Step 5 overview: the shown rotations as small tiles in one row, each with the two scores that come first on every
// card (D9). Picking a tile opens that rotation's full card below, so the farmer reads one card at a time.
import { t } from '../../app/i18n';
import type { RotationOption, Score } from '../../contracts';
import { rotationTitle } from './RotationCard';

function Meter({ label, score }: { label: string; score: Score }) {
  const value = Math.min(100, Math.max(0, Math.round(score.value)));
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-zinc-600">{label}</span>
        <span className="font-semibold tabular-nums text-zinc-900">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200" aria-hidden="true">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function OptionPicker(props: {
  rotations: RotationOption[];
  /** "Option n" number per rotation id; the current rotation has none. */
  numberOf: (id: string) => number;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { rotations, numberOf, selectedId, onSelect } = props;
  return (
    <div role="radiogroup" aria-label={t('steps.rotations.pick')} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {rotations.map((r) => {
        const on = r.id === selectedId;
        const label = r.isCurrent ? t('steps.rotations.current') : t('steps.rotations.option', { n: numberOf(r.id) });
        return (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${label}: ${rotationTitle(r)}`}
            onClick={() => onSelect(r.id)}
            className={`grid content-start gap-3 rounded-2xl border bg-white p-4 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 motion-reduce:transition-none ${
              on ? 'border-zinc-900 ring-1 ring-zinc-900' : 'border-zinc-200 hover:border-zinc-400'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className={`text-xs font-semibold uppercase tracking-wide ${r.isCurrent ? 'text-zinc-500' : 'text-emerald-700'}`}>
                {label}
              </span>
              <span
                aria-hidden="true"
                className={`grid h-4 w-4 place-items-center rounded-full border ${on ? 'border-zinc-900 bg-zinc-900' : 'border-zinc-300'}`}
              >
                {on ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
              </span>
            </span>
            <span className="min-h-10 text-sm font-semibold leading-snug text-zinc-900">{rotationTitle(r)}</span>
            <span className="grid gap-2">
              <Meter label={t('steps.rotations.soilHealth')} score={r.soilHealth} />
              <Meter label={t('steps.rotations.climate')} score={r.climateResilience} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
