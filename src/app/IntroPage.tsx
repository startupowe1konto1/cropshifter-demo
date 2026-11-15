// Step 0: the start page (HANDOFF-frontend.md v2.1). The app name as the title, what the tool does in one sentence,
// a Start button, and a drawing of a field being outlined. The drawing carries no numbers: there is no analysis yet.
import { PROJECT_NAME } from './brand';
import { t } from './i18n';

function FieldDrawing() {
  const lines = Array.from({ length: 21 }, (_, i) => i * 24);
  return (
    <svg viewBox="0 0 480 400" aria-hidden="true" className="h-full w-full">
      {lines.map((x) => (
        <line key={`v${x}`} x1={x} y1={0} x2={x} y2={400} className="stroke-zinc-200" strokeWidth={1} />
      ))}
      {lines.map((y) => (
        <line key={`h${y}`} x1={0} y1={y} x2={480} y2={y} className="stroke-zinc-200" strokeWidth={1} />
      ))}
      {[
        [36, 150, 118, 120],
        [312, 36, 132, 92],
        [318, 296, 136, 84],
        [20, 296, 120, 92],
      ].map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx={2} fill="none" className="stroke-zinc-300" strokeDasharray="4 5" />
      ))}
      <polygon
        points="176,132 392,146 382,268 166,254"
        className="intro-field fill-emerald-500/15 stroke-emerald-700"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <circle cx="279" cy="200" r="5" className="fill-emerald-700" />
      <circle cx="279" cy="200" r="14" className="intro-pulse fill-none stroke-emerald-600" strokeWidth={2} />
    </svg>
  );
}

// The text and the drawing sit side by side as one block, centred on the page both ways (review of the O4 redesign).
export function IntroPage(props: { onStart: () => void }) {
  return (
    <section className="mx-auto grid w-full max-w-5xl items-center gap-10 py-6 lg:min-h-[calc(100dvh-10rem)] lg:grid-cols-2 lg:gap-16">
      <div className="flex flex-col items-start gap-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">{t('app.intro.eyebrow')}</p>
        <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-zinc-900 sm:text-6xl">{PROJECT_NAME}</h1>
        <p className="max-w-md text-lg leading-relaxed text-zinc-700 sm:text-xl">{t('app.intro.text')}</p>
        <button
          type="button"
          onClick={props.onStart}
          className="mt-2 min-h-14 rounded-[20px] bg-zinc-900 px-12 text-lg font-semibold text-white shadow-md transition duration-200 ease-out hover:bg-zinc-700 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/40 motion-reduce:transition-none"
        >
          {t('app.intro.start')}
        </button>
      </div>
      <div className="relative aspect-[6/5] w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white">
        <FieldDrawing />
      </div>
    </section>
  );
}
