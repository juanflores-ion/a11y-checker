'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { TOUR_KEY } from '@/lib/tour';
import { Tour } from './Tour';

/**
 * Runs the tour once, and gives it a way back.
 *
 * The tour points at things on Overview, so it only opens itself there. The
 * button is in the header on every page, because someone who gets lost on
 * Runs still wants it.
 */
export function TourHost() {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname !== '/') return;
    try {
      if (!window.localStorage.getItem(TOUR_KEY)) setOpen(true);
    } catch {
      // Storage disabled. Better never than on every page load.
    }
  }, [pathname]);

  function close() {
    setOpen(false);
    try {
      window.localStorage.setItem(TOUR_KEY, 'yes');
    } catch {
      // It comes back next time. Harmless.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Show me around"
        title="Show me around"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-rule bg-card text-muted transition-colors hover:border-accent hover:text-ink"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none">
          <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M6.3 6.1a1.75 1.75 0 1 1 2.3 1.66c-.4.14-.6.5-.6.92v.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="8" cy="11.4" r="0.75" fill="currentColor" />
        </svg>
      </button>
      {open ? <Tour onClose={close} /> : null}
    </>
  );
}
