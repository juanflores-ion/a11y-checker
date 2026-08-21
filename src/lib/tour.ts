/**
 * The first-run tour, named in one place.
 *
 * Its own module rather than an export of the tour component, which is
 * `'use client'`: a Server Component importing from one of those gets a client
 * reference instead of the value. That cost an hour on the theme toggle, where
 * the key stringified to `{}` and the setting silently never persisted.
 */
export const TOUR_KEY = 'agent-readiness-tour-seen';
