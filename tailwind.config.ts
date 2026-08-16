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
 * Severity hues are the softened dark-mode variants; they still read as
 * red/orange/green without glaring on the dark ground.
 *
 * Token *names* are unchanged from the previous system on purpose: every
 * component already references them, so the whole surface restyles from
 * this one file.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#0B0F17',
        card: '#111827',
        ink: '#E7ECF3',
        muted: '#98A2B3',
        faint: '#5F6B7A',
        rule: '#1E2735',

        // Severity. The only colours allowed to carry alarm.
        critical: '#F0655C',
        serious: '#F59E4B',
        moderate: '#9AA4B2',
        minor: '#6B7280',
        good: '#34D399',

        // Structure and interaction.
        accent: '#7C96FF',
        // Reserved exclusively for the phantom menu — the one finding that is
        // invisible on screen but loud in the accessibility tree.
        phantom: '#A78BFA',

        // Brand identity in charts. Not severity colours: a brand is not a
        // problem, and red has to keep meaning one thing here. Mirrored as
        // literal values in BRAND_COLOR (model.ts), which the chart needs.
        'brand-ion': '#7C96FF',
        'brand-tig': '#2DD4BF',
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
      boxShadow: {
        card: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 8px 24px -12px rgba(0,0,0,0.6)',
        raised: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 16px 40px -16px rgba(0,0,0,0.7)',
        pop: '0 16px 48px -12px rgba(0,0,0,0.8)',
        focus: '0 0 0 3px rgba(124,150,255,0.35)',
      },
      maxWidth: { measure: '68ch' },
    },
  },
  plugins: [],
};

export default config;
