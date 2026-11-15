# Visual direction (O2-B1)

Who uses it: a farmer on a phone, standing in a field. Bright sun, maybe gloves, one free hand, a few minutes. The farm advisor later reads the same screens on a laptop or on paper.

Written Sat 14 Nov 2026 after a `ui-ux-pro-max` pass. Its generated design system suggested a dark OLED style and a luxury serif; both are wrong for a screen read in sunlight, so we kept only its agriculture palette idea (field green with a harvest-gold accent) and its touch and contrast rules.

## Rules

1. **Light theme only.** Dark text on white reads best in sunlight. No dark mode before Sunday.
2. **Contrast 4.5:1 or more for all text,** 7:1 for body text where we can. Never `slate-400` or lighter for text.
3. **Touch targets at least 44 px,** 64–72 px for the main choices on a step. At least 8 px between targets.
4. **Icon and colour before text, never instead of it.** Every icon sits next to its label. Colour never carries meaning alone: a state also has a word, a pattern or a mark.
5. **One main action per screen,** in the footer ("Next"). Choices on a step are big cards, not small controls.
6. **Motion is short and optional:** colour and transform only, 150 ms, and off under `prefers-reduced-motion`.

## Colours: Grafit (O1-F10, Tailwind defaults, so no theme change is needed)

Chosen Sun 15 Nov 2026 from three colorways in the redesign mockup. Grafit is close to Revolut: grey page, white panels, black actions, a lime accent. Controls are grey and black; data stays green, so a green mark on screen always means a result, never a button.

| Role | Class | Hex | Use |
|---|---|---|---|
| Page background | `zinc-100` | #F4F4F5 | behind the panels |
| Primary | `zinc-900` | #18181B | main button, chosen card border, switch on, focus ring (white text 17.7:1) |
| Primary tint | `lime-100` | #ECFCCB | chosen card background |
| Accent | `lime-300` | #BEF264 | done step mark, order numbers; always with `zinc-900`/`zinc-950` text (15:1) |
| Text | `zinc-900` / `zinc-950` | #18181B | headings, labels |
| Text, secondary | `zinc-700` | #3F3F46 | hints, explanations |
| Lines | `zinc-300` / `zinc-500` hover | | card borders |
| Data | `emerald-600` / `emerald-700` | | score bars, score ranges, crop months, margin bars, the "observed" dot |
| Notice | `amber-50` bg, `amber-900` text | | "not loaded yet", "check locally" |
| Error | `amber-700` border | | source errors (from `<StateBoundary>`) |

Reserved for later steps (calendar strip, cards): drought `amber-700`, heat `red-700`, frost `blue-700`; bare soil `stone-500` with a hatch pattern; living crop `emerald-600`; cover crop `lime-500`; residue `yellow-700`. Each hazard also gets its own mark so the strip works in black and white print.

## Type

Inter (`@fontsource-variable/inter`), then the system font stack (Tailwind `font-sans`). The font files ship with the app, so nothing loads from a host outside SPEC section 15. Each `@font-face` uses `font-display: swap` and a `unicode-range`, so the first screen paints at once in the system font on a weak signal and only the subsets on screen load, Polish included.

| Use | Class |
|---|---|
| Step question | `text-2xl font-semibold` |
| Card title, switch label | `text-lg font-semibold` |
| Body, hints | `text-base` (16 px, never smaller for something the farmer must read) |
| Badges, counts | `text-sm font-medium` |

## Icons

`src/steps/icons.tsx`: line icons drawn for this project, 24 × 24 grid, 2 px stroke, round caps, `currentColor`, `aria-hidden`. No icon package, so no new dependency. Crop icons for O2-B2 go in the same file in the same style.

## Components used on the steps

- **Choice card** (goal step): full-width button, `role="radio"`, icon in a 48 px circle, title and one-line hint. Chosen: zinc-900 border, lime-100 tint, white icon on zinc-900.
- **Switch row** (priorities): label wrapping a visually hidden checkbox, title and hint, switch drawn at the end. The input is labelled by the title only, the hint is its description.
- **Tick list** (excluded crops): two columns from 640 px, one column on phones; a ticked crop is struck through.
- **States:** every list that loads goes through `<StateBoundary>` (loading, offline, no data, source error with retry).
