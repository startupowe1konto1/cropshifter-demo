import { useEffect, useId, useRef } from 'react';
import { t, useLang } from '../../app/i18n';
import { TERM_IDS, term } from './useTerm';

// The text is bundled with the app, so this page has no loading, offline or source-error state.
// Built on each render in the current language and sorted by that language's alphabet (ł after l, ś after s in Polish).
function entriesFor(lang: string) {
  return TERM_IDS.map((id) => ({ id, ...term(id) })).sort((a, b) => a.label.localeCompare(b.label, lang, { sensitivity: 'base' }));
}

export function GlossaryPage(props: { onBack?: () => void; backToStep?: number }) {
  const { onBack, backToStep } = props;
  const lang = useLang((s) => s.lang);
  const entries = entriesFor(lang);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  // Opened from the header, so move focus here for keyboard and screen reader users.
  useEffect(() => {
    if (onBack) headingRef.current?.focus();
  }, [onBack]);

  return (
    <section aria-labelledby={headingId} className="text-base text-zinc-900">
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
        {t('steps.glossary.title')}
      </h2>
      <p className="mt-2 text-zinc-700">{t('steps.glossary.intro')}</p>
      <dl className="mt-4 divide-y divide-zinc-200">
        {entries.map((entry) => (
          <div key={entry.id} id={`term-${entry.id}`} className="py-3">
            <dt className="font-semibold first-letter:uppercase">{entry.label}</dt>
            <dd className="mt-1 leading-relaxed">{entry.explanation}</dd>
          </div>
        ))}
      </dl>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mt-4 min-h-11 rounded border border-zinc-300 px-4 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
        >
          {backToStep === 0 ? t('steps.glossary.backToStart') : t('steps.glossary.back', { n: backToStep ?? 1 })}
        </button>
      ) : null}
    </section>
  );
}
