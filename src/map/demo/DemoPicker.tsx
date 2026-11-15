// The two demo locations from the pitch, one tap each: no address search needed during a demo.
import { useEffect } from 'react';
import { t } from '../../app/i18n';
import { useAppStore } from '../../app/store';
import { demoFields } from '../../fixtures';

const DEMOS = [
  { key: 'poznan', field: demoFields.poznan },
  { key: 'iowa', field: demoFields.iowa },
] as const;

const BUTTON =
  'min-h-11 rounded-lg border px-4 text-base font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2';

/** `?demo=poznan` or `?demo=iowa` in the address, so a link opens straight on a demo field. */
export function demoFromUrl(search: string): (typeof DEMOS)[number]['field'] | null {
  const key = new URLSearchParams(search).get('demo');
  return DEMOS.find((d) => d.key === key)?.field ?? null;
}

export function DemoPicker() {
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const fields = useAppStore((s) => s.fields);

  const pick = (field: (typeof DEMOS)[number]['field']) => {
    const { addField, selectField } = useAppStore.getState();
    // A demo field already on the list is only selected, so an outline the user reshaped stays as it is.
    if (fields.some((f) => f.id === field.id)) selectField(field.id);
    else addField(field);
  };

  useEffect(() => {
    const field = demoFromUrl(window.location.search);
    if (field && useAppStore.getState().fields.length === 0) useAppStore.getState().addField(field);
  }, []);

  return (
    <section aria-labelledby="demo-title" className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <h2 id="demo-title" className="text-base font-semibold text-zinc-900">
        {t('demo.title')}
      </h2>
      <p className="mt-1 text-sm text-zinc-600">{t('demo.hint')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {DEMOS.map(({ key, field }) => {
          const active = selectedFieldId === field.id;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              className={`${BUTTON} ${active ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100'}`}
              onClick={() => pick(field)}
            >
              {t(`demo.${key}`)}
            </button>
          );
        })}
      </div>
    </section>
  );
}
