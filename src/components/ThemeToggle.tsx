'use client';

import { useEffect, useState } from 'react';

import { THEME_KEY, type Theme } from '@/lib/theme';

/**
 * Dark or light, remembered.
 *
 * Dark is the default and the theme the system was drawn for. Light exists
 * because this gets read in daylight and screenshotted into Slack, and it is a
 * choice someone makes rather than something inferred: `prefers-color-scheme`
 * is deliberately not consulted, so a machine set to light does not decide for
 * a tool whose default is dark.
 *
 * No visible label. One mark that morphs between a moon and a sun says it
 * faster than a word does, and the word was the widest thing in the header.
 * The accessible name stays — this is an accessibility tool, and an icon-only
 * control with no name is one of the things it reports on other people's
 * sites.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  /**
   * Until this mounts, the server-rendered markup and the DOM can disagree:
   * the pre-paint script may have set light, and the server always renders
   * dark. The icon does not care — it is drawn from the attribute by CSS — but
   * the accessible name is React's, so it waits rather than announcing the
   * wrong direction.
   */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    setTheme(attr === 'light' ? 'light' : 'dark');
    setReady(true);
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private browsing, or storage disabled. The theme still applies for
      // this page; it just will not survive a reload.
    }
  }

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const name = ready ? `Switch to ${next} theme` : 'Switch theme';
  return (
    <button
      type="button"
      onClick={() => choose(next)}
      aria-label={name}
      title={name}
      className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-rule bg-card text-muted transition-colors hover:border-accent hover:text-ink"
    >
      <ThemeMark />
    </button>
  );
}

/**
 * One mark, two states.
 *
 * A disc that shrinks to a sun and grows to a moon, a bite taken out of it by
 * a masked circle that slides in from off-canvas, and rays that spin out as
 * the bite arrives. Every moving part is a CSS transition keyed off
 * `data-theme` rather than React state, for the same reason the pre-paint
 * script exists: the attribute is correct before hydration, so the mark is
 * never briefly the wrong one. It also means the reduced-motion rule in
 * globals.css already covers it.
 */
function ThemeMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 overflow-visible">
      <mask id="theme-mark-bite">
        <rect x="0" y="0" width="16" height="16" fill="#fff" />
        <circle className="theme-bite" cy="4" r="5.6" fill="#000" />
      </mask>
      <circle
        className="theme-orb"
        cx="8"
        cy="8"
        fill="currentColor"
        mask="url(#theme-mark-bite)"
      />
      <g
        className="theme-rays"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        <path d="M8 0.6v1.7M8 13.7v1.7M0.6 8h1.7M13.7 8h1.7" />
        <path d="M2.8 2.8l1.2 1.2M12 12l1.2 1.2M13.2 2.8L12 4M4 12l-1.2 1.2" />
      </g>
    </svg>
  );
}
