import { t } from '../app/i18n';

type Confidence = 'strong' | 'moderate' | 'weak';

// Each level differs by icon shape, border weight and text, so it reads without colour.
const STYLE: Record<Confidence, string> = {
  strong: 'border border-zinc-900 bg-lime-100 text-zinc-950',
  moderate: 'border border-zinc-500 bg-zinc-50 text-zinc-800',
  weak: 'border-2 border-amber-700 bg-amber-100 text-amber-950 font-semibold',
};

const ICON: Record<Confidence, React.ReactNode> = {
  strong: <path d="M3.5 8.5l3 3 6-7" />,
  moderate: <path d="M3 8h10" />,
  weak: (
    <>
      <path d="M8 1.8L14.8 13.6H1.2Z" />
      <path d="M8 6v3.6M8 11.6v.2" />
    </>
  ),
};

export function ConfidenceBadge(props: { confidence: Confidence }) {
  const { confidence } = props;
  return (
    <span
      data-confidence={confidence}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm leading-tight ${STYLE[confidence]}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ICON[confidence]}
      </svg>
      <span>{t(`ui.confidence.${confidence}`)}</span>
    </span>
  );
}
