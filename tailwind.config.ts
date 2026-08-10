import type { Config } from 'tailwindcss';

/**
 * Design tokens — "Signal".
 *
 * Direction: a diagnostic instrument for a web team, read in daylight and
 * screenshotted into Slack. The previous pass drifted into broadsheet
 * territory (hairline rules, 3px radius, mono-caps labels on everything),
 * which reads as unfinished rather than precise. This pass commits to a
 * calm, high-craft product surface: cool neutral canvas, one confident
 * cobalt accent, real elevation, and colour reserved almost entirely for
 * severity — so when something turns red it means something.
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
        paper: '#F5F6F8',
        card: '#FFFFFF',
        ink: '#0D1117',
        muted: '#5A6472',
        faint: '#8B95A3',
        rule: '#E6E9EE',

        // Severity. The only colours allowed to carry alarm.
        critical: '#C81E1E',
        serious: '#C2410C',
        moderate: '#4B5563',
        minor: '#9CA3AF',
        good: '#067647',

        // Structure and interaction.
        accent: '#1F3FD8',
        // Reserved exclusively for the phantom menu — the one finding that is
        // invisible on screen but loud in the accessibility tree.
        phantom: '#6D28D9',

        // Brand identity in charts. Not severity colours: a brand is not a
        // problem, and red has to keep meaning one thing here. Mirrored as
        // literal values in BRAND_COLOR (model.ts), which the chart needs.
        'brand-ion': '#1F3FD8',
        'brand-tig': '#0F766E',
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
        card: '0 1px 2px rgba(13,17,23,0.04), 0 1px 3px rgba(13,17,23,0.05)',
        raised: '0 2px 4px rgba(13,17,23,0.04), 0 8px 20px -8px rgba(13,17,23,0.12)',
        pop: '0 12px 32px -8px rgba(13,17,23,0.18)',
        focus: '0 0 0 3px rgba(31,63,216,0.18)',
      },
      maxWidth: { measure: '68ch' },
    },
  },
  plugins: [],
};

export default config;
