import { useEffect, useId, useRef, useState } from 'react';
import { t } from '../app/i18n';

export function Term(props: { label: string; explanation: string }) {
  const { label, explanation } = props;
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // A mouse or touch press focuses the button before the click arrives, and focus opens the tooltip.
  // Remembering the state at press time keeps that first click from closing it again.
  const openAtPress = useRef<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function show() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setAlignRight(rect.left > window.innerWidth / 2); // keep the tooltip on the screen of a phone
    setOpen(true);
  }

  function onClick() {
    const before = openAtPress.current ?? open;
    openAtPress.current = null;
    if (before) setOpen(false);
    else show();
  }

  return (
    <span className="relative inline-flex items-center">
      <span>{label}</span>
      <button
        ref={buttonRef}
        type="button"
        aria-label={t('ui.term.about', { label })}
        aria-describedby={open ? tooltipId : undefined}
        onMouseDown={() => {
          openAtPress.current = open;
        }}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={onClick}
        className="group -my-3 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full focus:outline-none"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-500 text-xs font-semibold italic text-zinc-700 group-hover:bg-zinc-100 group-focus-visible:ring-2 group-focus-visible:ring-zinc-900 group-focus-visible:ring-offset-2"
        >
          i
        </span>
      </button>
      {open ? (
        <span
          role="tooltip"
          id={tooltipId}
          className={`absolute top-full z-20 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg bg-zinc-900 px-3 py-2 text-left text-sm font-normal not-italic leading-snug text-white shadow-lg ${alignRight ? 'right-0' : 'left-0'}`}
        >
          {explanation}
        </span>
      ) : null}
    </span>
  );
}
