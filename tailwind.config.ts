import type { Config } from 'tailwindcss';

/**
 * Design tokens — "Signal".
 *
 * Direction: a diagnostic instrument for a web team, read in daylight and
 * screenshotted into Slack. The previous pass drifted into broadsheet
 * territory (hairline rules, 3px radius, mono-caps labels on everything),
 * which reads as unfinished rather than precise. This pass commits to a
 * calm, high-craft product surface — now dark: a blue-black canvas with a
 * faint indigo glow, one electric-indigo accent, elevation by hairline and
 * inset highlight rather than drop shadow, and colour reserved almost
 * entirely for severity — so when something turns red it means something.
 *
 * Two themes now. Dark is the default and the one the system was drawn for;
 * light exists because this gets read in daylight and screenshotted into
 * Slack. Light is not an inversion: severity hues are re-picked so every token
 * clears 4.5:1 against both the page and the card, which a naive flip does not.
 * The values live in globals.css; this file names them.
 *
 * Token *names* are unchanged from the previous system on purpose: every
 * component already references them, so the whole surface restyles from
 * this one file.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /**
       * Every colour is a CSS variable, resolved per theme in globals.css.
       *
       * The `<alpha-value>` form is not decoration: the surface leans on alpha
       * modifiers (`bg-paper/60`, `border-critical/25`, `bg-tint/[0.045]`) and
       * a plain `var(--x)` breaks every one of them.
       */
      colors: {
        paper: 'rgb(var(--c-paper) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',
        rule: 'rgb(var(--c-rule) / <alpha-value>)',

        /**
         * The hover and open-row wash. White on the dark ground, black on the
         * light one — the same 3-6% lift in both, which is why it is a token
         * and not the literal `bg-white/[0.045]` this replaced. On a light
         * surface that literal was invisible.
         */
        tint: 'rgb(var(--c-tint) / <alpha-value>)',

        // Severity. The only colours allowed to carry alarm.
        critical: 'rgb(var(--c-critical) / <alpha-value>)',
        serious: 'rgb(var(--c-serious) / <alpha-value>)',
        moderate: 'rgb(var(--c-moderate) / <alpha-value>)',
        minor: 'rgb(var(--c-minor) / <alpha-value>)',
        good: 'rgb(var(--c-good) / <alpha-value>)',

        // Structure and interaction.
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        // Reserved exclusively for the phantom menu — the one finding that is
        // invisible on screen but loud in the accessibility tree.
        phantom: 'rgb(var(--c-phantom) / <alpha-value>)',

        // Brand identity in charts. Not severity colours: a brand is not a
        // problem, and red has to keep meaning one thing here. Mirrored as
        // literal values in BRAND_COLOR (model.ts), which the chart needs.
        'brand-ion': 'rgb(var(--c-brand-ion) / <alpha-value>)',
        'brand-tig': 'rgb(var(--c-brand-tig) / <alpha-value>)',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        eyebrow: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        figure: ['2.25rem', { lineHeight: '1.05', letterSpacing: '-0.025em' }],
        'figure-lg': ['3.5rem', { lineHeight: '1', letterSpacing: '-0.035em' }],
        hero: ['3rem', { lineHeight: '1.04', letterSpacing: '-0.035em' }],
      },
      borderRadius: {
        card: '10px',
        lg: '14px',
        pill: '999px',
      },
      /**
       * Elevation is theme-dependent in a way colour is not. The dark surface
       * lifts a card with a white inset highlight and a deep shadow; on the
       * light one the highlight is invisible and that shadow reads as dirt, so
       * each theme supplies its own in globals.css.
       */
      boxShadow: {
        card: 'var(--shadow-card)',
        raised: 'var(--shadow-raised)',
        pop: 'var(--shadow-pop)',
        focus: 'var(--shadow-focus)',
      },
      maxWidth: { measure: '68ch' },
    },
  },
  plugins: [],
};

export default config;
