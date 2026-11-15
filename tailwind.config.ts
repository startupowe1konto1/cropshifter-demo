import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

// Theme changes go through a [contract] PR (owner O1). O2 proposes the visual direction in task O2-B1.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Inter is bundled with the app (@fontsource-variable/inter), so no font host outside SPEC section 15 is called.
      fontFamily: { sans: ['"Inter Variable"', ...defaultTheme.fontFamily.sans] },
    },
  },
  plugins: [],
} satisfies Config;
