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
 * The attribute is already on <html> before this mounts — see the script in
 * layout.tsx — so this reads the DOM rather than storage for its initial
 * state, and the button never renders the wrong icon for a frame.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  /**
   * Until this mounts, the server-rendered markup and the DOM can disagree:
   * the pre-paint script may have set light, and the server always renders
   * dark. Rendering the label only after mount keeps hydration honest instead
   * of shipping a button that says the wrong thing.
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
  return (
    <button
      type="button"
      onClick={() => choose(next)}
      aria-label={ready ? `Switch to ${next} theme` : 'Switch theme'}
      title={ready ? `Switch to ${next} theme` : undefined}
      className="ml-auto flex shrink-0 items-center gap-1.5 rounded-[7px] border border-rule bg-card px-2 py-1 text-[11.5px] text-muted transition-colors hover:border-accent hover:text-ink"
    >
      {/* Both faces ship and CSS hides the one that does not apply, keyed off
          the same attribute the pre-paint script sets. React state would be
          right too, but only from hydration onward: a reader who chose light
          would watch the button say "Dark" for a frame. */}
      <SunIcon className="theme-only-light h-3.5 w-3.5" />
      <MoonIcon className="theme-only-dark h-3.5 w-3.5" />
      <span className="hidden sm:inline">
        <span className="theme-only-dark">Dark</span>
        <span className="theme-only-light">Light</span>
      </span>
    </button>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="none">
      <path
        d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="none">
      <circle cx="8" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
