// Every dataset the analysis used, NASA first, with native resolution, period and what kind of value it gives.
// Folded by default (HANDOFF-frontend step 5); the title opens it.
import { t } from '../../app/i18n';
import type { Dataset } from '../../contracts';

export function SourcesPanel({ datasets }: { datasets: Dataset[] }) {
  const sorted = [...datasets].sort((a, b) => Number(b.nasa) - Number(a.nasa) || a.name.localeCompare(b.name));
  return (
    <section aria-labelledby="sources-title" className="rounded-[20px] border border-zinc-200 bg-white">
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-[20px] px-5 py-4 hover:bg-zinc-50 sm:px-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 [&::-webkit-details-marker]:hidden">
          <h2 id="sources-title" className="text-base font-semibold text-zinc-900">
            {t('steps.rotations.sources.title')}
          </h2>
          <span aria-hidden="true" className="text-zinc-700 transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="grid gap-2 px-5 pb-5 sm:px-6">
          <p className="text-base text-zinc-700">{t('steps.rotations.sources.intro')}</p>
          <ul className="grid gap-2">
            {sorted.map((d) => (
              <li key={d.id} data-nasa={d.nasa} className="grid gap-0.5 border-b border-zinc-200 pb-2 last:border-0">
                <span className="flex flex-wrap items-center gap-2">
                  {d.nasa ? (
                    <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-xs font-bold tracking-wide text-white">
                      {t('steps.rotations.sources.nasa')}
                    </span>
                  ) : null}
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-base font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-950"
                  >
                    {d.name}
                  </a>
                </span>
                <span className="text-sm text-zinc-700">
                  {d.provider} · {t('steps.rotations.sources.resolution', { value: d.resolution })} · {d.period} · {t(`ui.kind.${d.kind}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}
