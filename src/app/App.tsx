import { useEffect, useRef, useState, type ComponentType } from 'react';
import { MapStep } from '../map/MapStep';
import { RotationsStep } from '../steps/cards/RotationsStep';
import { CropsStep } from '../steps/crops/CropsStep';
import { GlossaryPage } from '../steps/glossary/GlossaryPage';
import { GoalStep } from '../steps/goal/GoalStep';
import { MoneyStep } from '../steps/money/MoneyStep';
import { PrioritiesStep } from '../steps/priorities/PrioritiesStep';
import { PROJECT_NAME } from './brand';
import { IntroPage } from './IntroPage';
import { LANGS, setLang, t, useLang } from './i18n';
import { StateBoundary } from '../ui-kit';
import { STEP_COUNT, STEP_KEYS, canContinue, useAppStore, type StepKey } from './store';
import { useOnline } from './useOnline';

// One component per step (SPEC section 12); the order lives in STEP_KEYS. Step 0 is the start page.
const STEP_COMPONENTS: Record<StepKey, ComponentType> = {
  field: MapStep,
  goal: GoalStep,
  crops: CropsStep,
  priorities: PrioritiesStep,
  rotations: RotationsStep,
  money: MoneyStep,
};

export function App() {
  const state = useAppStore();
  const key: StepKey | undefined = STEP_KEYS[state.step - 1];
  const Step = key ? STEP_COMPONENTS[key] : null;
  const online = useOnline();
  // Subscribing here re-renders the whole tree when the language changes; t() reads the language itself.
  const lang = useLang((s) => s.lang);
  // The glossary covers the step instead of being a step, so the farmer comes back to where they were.
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const glossaryButton = useRef<HTMLButtonElement>(null);

  function closeGlossary() {
    setGlossaryOpen(false);
    glossaryButton.current?.focus();
  }

  useEffect(() => {
    if (!glossaryOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeGlossary();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [glossaryOpen]);

  // Steps with a map or with cards side by side get the wide layout; the question steps stay narrow and easy to read.
  const wide = key === 'rotations' || key === 'money' || key === 'field';
  const width = wide ? 'max-w-7xl' : key ? 'max-w-3xl' : 'max-w-6xl';

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100 text-zinc-950">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:gap-x-6 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-900 text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M4 19c5-1 8-5 10-9s4-5 6-6" />
                <path d="M4 12c3-.5 5-2 6-4" />
              </svg>
            </span>
            <p className="text-base font-semibold tracking-tight text-zinc-900">{PROJECT_NAME}</p>
          </div>
          {key ? (
            <ol className="order-3 flex w-full gap-1 overflow-x-auto lg:order-none lg:w-auto lg:flex-1 lg:justify-center" aria-label={t('app.progress')}>
              {STEP_KEYS.map((k, i) => {
                const n = i + 1;
                const done = n < state.step;
                const now = n === state.step;
                return (
                  <li
                    key={k}
                    aria-current={now ? 'step' : undefined}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium ${
                      now ? 'bg-zinc-900 text-white' : done ? 'text-zinc-900' : 'text-zinc-500'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold ${
                        now ? 'bg-white text-zinc-900' : done ? 'bg-lime-300 text-zinc-900' : 'border border-zinc-300'
                      }`}
                    >
                      {done ? '✓' : n}
                    </span>
                    <span className={now ? '' : 'hidden sm:inline'}>{t(`app.stepShort.${k}`)}</span>
                  </li>
                );
              })}
            </ol>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
            <button
              ref={glossaryButton}
              type="button"
              aria-expanded={glossaryOpen}
              className={`h-8 rounded-full border px-2.5 text-xs font-medium sm:h-9 sm:px-4 sm:text-sm transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 ${
                glossaryOpen
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-300 bg-white text-zinc-900 hover:border-zinc-900 hover:bg-lime-100'
              }`}
              onClick={() => (glossaryOpen ? closeGlossary() : setGlossaryOpen(true))}
            >
              {t('app.glossary')}
            </button>
            {/* A two-way switch: the green thumb slides under the chosen language. */}
            <div role="group" aria-label={t('app.language')} className="relative grid h-8 grid-cols-2 rounded-full bg-zinc-100 p-1 sm:h-9">
              <span
                aria-hidden="true"
                className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-zinc-900 transition-transform duration-200 ease-out motion-reduce:transition-none ${
                  lang === LANGS[1] ? 'translate-x-full' : 'translate-x-0'
                }`}
              />
              {LANGS.map((code) => (
                <button
                  key={code}
                  type="button"
                  lang={code}
                  aria-pressed={lang === code}
                  aria-label={t(`app.lang.${code}`)}
                  className={`relative z-10 rounded-full px-2 text-xs font-medium sm:px-3 sm:text-sm transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 ${
                    lang === code ? 'text-white' : 'text-zinc-700 hover:text-zinc-900'
                  }`}
                  onClick={() => setLang(code)}
                >
                  <span aria-hidden="true" className="sm:hidden">{code.toUpperCase()}</span>
                  <span aria-hidden="true" className="hidden sm:inline">{t(`app.lang.${code}`)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className={`mx-auto w-full flex-1 px-4 pb-8 pt-6 sm:px-6 ${width}`}>
        {key && !glossaryOpen ? (
          <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              <span className="sr-only">{t('app.stepOf', { n: state.step, total: STEP_COUNT })}:</span>{' '}
              {t(`app.step.${key}`)}
            </h1>
            <span aria-hidden="true" className="text-sm font-medium text-zinc-500">
              {t('app.stepOf', { n: state.step, total: STEP_COUNT })}
            </span>
          </div>
        ) : null}
        {glossaryOpen ? <GlossaryPage onBack={closeGlossary} backToStep={state.step} /> : null}
        {/* Hidden, not unmounted, while the glossary is open, so the step keeps its local state (the map view). */}
        <div hidden={glossaryOpen}>
          {/* The analysis needs NASA POWER, so step 5 waits for a connection instead of starting a request that will fail. */}
          {!Step ? (
            <IntroPage onStart={() => state.goToStep(1)} />
          ) : key === 'rotations' && !online && state.analysis.status !== 'ready' ? (
            <StateBoundary state="offline">{null}</StateBoundary>
          ) : (
            <Step />
          )}
        </div>
      </main>

      {glossaryOpen || !Step ? null : (
        <footer className="sticky bottom-0 z-20 border-t border-zinc-200 bg-white/95 backdrop-blur print:hidden">
          <div className={`mx-auto flex justify-between gap-3 px-4 py-3 sm:px-6 ${width}`}>
            <button
              type="button"
              className="min-h-12 rounded-2xl border border-zinc-300 bg-white px-5 font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-40"
              onClick={() => state.goToStep(state.step - 1)}
            >
              {t('app.back')}
            </button>
            {/* The last step has nothing after it, so it has no Next button. */}
            {state.step < STEP_COUNT ? (
              <button
                type="button"
                className="min-h-12 flex-1 rounded-2xl bg-zinc-900 px-8 text-base font-bold text-white hover:bg-zinc-700 disabled:opacity-40 sm:flex-none"
                disabled={!canContinue(state)}
                onClick={() => state.goToStep(state.step + 1)}
              >
                {t('app.next')}
              </button>
            ) : null}
          </div>
        </footer>
      )}
    </div>
  );
}
