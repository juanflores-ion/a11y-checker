/**
 * The theme, named in one place.
 *
 * Deliberately its own module rather than an export of `ThemeToggle.tsx`.
 * That file is `'use client'`, and a Server Component importing from it gets a
 * client *reference* rather than the value — the layout's inline script
 * stringified to `localStorage.getItem({})`, which reads the key
 * "[object Object]" and so never finds anything. The theme silently stopped
 * persisting and nothing failed.
 */
export type Theme = 'dark' | 'light';

export const THEME_KEY = 'agent-readiness-theme';
