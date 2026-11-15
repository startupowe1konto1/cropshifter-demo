// One line under a section that says, once, what kind of numbers it holds and where they come from (D56). It
// replaces the chip that used to sit next to every number; each number still opens its own source panel.
import type { Dataset, Sourced, ValueKind } from '../contracts';
import { t } from '../app/i18n';

const ORDER: ValueKind[] = ['observation', 'model', 'derived'];
const MAX_NAMES = 4;

export function SourcesNote({ values, datasets }: { values: Sourced<number | string>[]; datasets: Dataset[] }) {
  const kinds = ORDER.filter((k) => values.some((v) => v.kind === k)).map((k) => t(`ui.kind.${k}`));
  const ids = [...new Set(values.flatMap((v) => v.datasetIds))];
  const names = ids.map((id) => datasets.find((d) => d.id === id)?.name).filter((n): n is string => Boolean(n));
  if (kinds.length === 0) return null;
  const shown = names.slice(0, MAX_NAMES).join(', ');
  const more = names.length > MAX_NAMES ? ` ${t('ui.sources.more', { n: names.length - MAX_NAMES })}` : '';
  return (
    <p data-testid="sources-note" className="text-sm leading-snug text-zinc-600">
      {names.length > 0
        ? t('ui.sources.line', { kinds: kinds.join(', '), names: `${shown}${more}` })
        : t('ui.sources.lineNoNames', { kinds: kinds.join(', ') })}
    </p>
  );
}
