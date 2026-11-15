// Crop icons in the style of src/steps/icons.tsx: 24×24, 2 px stroke, currentColor, always shown next to the crop name.
import type { ReactNode } from 'react';
import type { CropId } from '../../contracts';

function Glyph({ size = 32, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const grain = (
  <>
    <path d="M12 22V8" />
    <path d="M12 8c-2-1-3-3-3-5 2 1 3 3 3 5zM12 8c2-1 3-3 3-5-2 1-3 3-3 5z" />
    <path d="M12 13c-2.5-.5-4-2.5-4-4.5 2.5.5 4 2.5 4 4.5zM12 13c2.5-.5 4-2.5 4-4.5-2.5.5-4 2.5-4 4.5z" />
    <path d="M12 18c-2.5-.5-4-2.5-4-4.5 2.5.5 4 2.5 4 4.5zM12 18c2.5-.5 4-2.5 4-4.5-2.5.5-4 2.5-4 4.5z" />
  </>
);

const cob = (
  <>
    <path d="M12 3c2.5 0 4 3 4 7.5S14.5 19 12 19s-4-4-4-8.5S9.5 3 12 3z" />
    <path d="M10 8h4M9.5 11.5h5M10 15h4" />
    <path d="M8 13c-3 1-4 4-4 8 3-1 6-2 8-2M16 13c3 1 4 4 4 8-3-1-6-2-8-2" />
  </>
);

const pod = (
  <>
    <path d="M5 19C5 11 10 5 19 5c0 9-6 14-14 14z" />
    <circle cx="9.5" cy="14.5" r="1.3" />
    <circle cx="12.5" cy="11.5" r="1.3" />
    <circle cx="15.5" cy="8.5" r="1.3" />
  </>
);

const flower = (
  <>
    <circle cx="12" cy="8" r="2" />
    <path d="M12 6c0-2 1-3 2-3s1.5 2 0 3.5M14 8c2 0 3 1 3 2s-2 1.5-3.5 0M12 10c0 2-1 3-2 3s-1.5-2 0-3.5M10 8c-2 0-3-1-3-2s2-1.5 3.5 0" />
    <path d="M12 10v11" />
    <path d="M12 17c-2 0-3.5-1-4-3 2 0 3.5 1 4 3z" />
  </>
);

const tuber = (
  <>
    <path d="M6 9c1-3.5 5-5 8.5-4S20 9.5 19 13s-4 6.5-8 6S4.5 14 6 9z" />
    <path d="M10 10h.01M14 9h.01M15 14h.01M10.5 15h.01" strokeWidth={2.5} />
  </>
);

const beet = (
  <>
    <path d="M7 10c0-2 2.2-3 5-3s5 1 5 3c0 4-3 8-5 12-2-4-5-8-5-12z" />
    <path d="M12 7c-1-2-3-3-5-3 0 2 2 3 5 3zM12 7c1-2 3-3 5-3 0 2-2 3-5 3zM12 7V3" />
  </>
);

const trefoil = (
  <>
    <circle cx="12" cy="7.5" r="3" />
    <circle cx="8" cy="12.5" r="3" />
    <circle cx="16" cy="12.5" r="3" />
    <path d="M12 14v8" />
  </>
);

const byCrop: Record<string, ReactNode> = {
  'winter-wheat': grain,
  rye: grain,
  'cereal-rye': grain,
  oats: grain,
  'spring-barley': grain,
  maize: cob,
  soybean: pod,
  'field-pea': pod,
  'winter-rapeseed': flower,
  'white-mustard': flower,
  phacelia: flower,
  potato: tuber,
  'sugar-beet': beet,
  alfalfa: trefoil,
  'red-clover': trefoil,
};

/** Icon for a crop, or null when we have none; the caller always shows the name too. */
export function CropIcon({ crop, size }: { crop: CropId; size?: number }) {
  const shape = byCrop[crop];
  return shape ? <Glyph size={size}>{shape}</Glyph> : null;
}
