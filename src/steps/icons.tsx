// O2's icon set: 24×24 line icons, 2 px stroke, round caps, drawn in currentColor (see src/steps/design.md).
// Drawn for this project, so no icon package is needed. Icons are decoration next to a text label, never alone.
import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 28, children, ...rest }: IconProps & { children: ReactNode }) {
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
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Keep the soil: a shield with a tick. */
export const IconKeepSoil = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
    <path d="M8.5 12l2.5 2.5 4.5-5" />
  </Icon>
);

/** Improve the soil: a sprout over layered soil with an arrow up. */
export const IconImproveSoil = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 17h18" />
    <path d="M5 21h14" />
    <path d="M12 17V9" />
    <path d="M12 11c-3 0-5-2-5-5 3 0 5 2 5 5z" />
    <path d="M12 9c0-2.8 1.8-4.5 4.5-4.5 0 2.8-1.8 4.5-4.5 4.5z" />
  </Icon>
);

/** Income: two stacked coins. */
export const IconIncome = (p: IconProps) => (
  <Icon {...p}>
    <ellipse cx="9" cy="7" rx="6" ry="2.5" />
    <path d="M3 7v4c0 1.4 2.7 2.5 6 2.5" />
    <ellipse cx="15" cy="14" rx="6" ry="2.5" />
    <path d="M9 14v3.5C9 18.9 11.7 20 15 20s6-1.1 6-2.5V14" />
  </Icon>
);

export const IconWater = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" />
    <path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5" />
  </Icon>
);

/** Forage: a bale of hay. */
export const IconForage = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="7" width="18" height="11" rx="2" />
    <path d="M8 7v11M16 7v11" />
    <path d="M3 12.5h18" />
  </Icon>
);

/** Nitrogen: a root with nodules. */
export const IconNitrogen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v7" />
    <path d="M12 10c-2 2-3 4-3 7M12 10c2 2 3 4 3 7M12 10v9" />
    <circle cx="8.5" cy="17.5" r="1.5" />
    <circle cx="15.5" cy="17.5" r="1.5" />
    <circle cx="12" cy="20" r="1" />
  </Icon>
);

/** Erosion: a slope with soil washing off. */
export const IconErosion = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 19L14 6l7 13z" />
    <path d="M6 21c1 0 1.5-1 2.5-1s1.5 1 2.5 1 1.5-1 2.5-1" />
  </Icon>
);

/** Organic matter: soil layers with a leaf. */
export const IconOrganicMatter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 14h18M3 18h18" />
    <path d="M7 10c0-3.3 2.7-6 6-6h4v1c0 3-2.5 5-5.5 5H7z" />
    <path d="M7 10l5-3" />
  </Icon>
);

/** A tick, for chosen options. */
export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);
