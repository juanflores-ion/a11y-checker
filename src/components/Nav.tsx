'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Named after what someone came here to do, not after what the data is.
 *
 * Overview: where the sites stand and what is wrong. Runs: every figure of a
 * measurement, by check and by page. Scan: take a measurement now — a single
 * URL, a before/after, or a full run. How it works is last on purpose: it is
 * the answer to "why should I believe these numbers", asked after seeing them.
 *
 * Measure and Compare used to be two entries. They shared one form, one engine
 * and one result shape; what differed was a mode, so they are one page now.
 */
export const PRIMARY = [
  { href: '/', label: 'Overview', hint: 'Where the sites stand, and what’s wrong' },
  { href: '/runs', label: 'Runs', hint: 'Every figure of a measurement, by check and by page' },
  { href: '/scan', label: 'Scan', hint: 'Measure a URL now, check a fix, or record a full run' },
  { href: '/how-it-works', label: 'How it works', hint: 'What the scanner does, in plain English' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href.replace(/\/$/, ''));
}

export function Nav() {
  const pathname = usePathname() ?? '/';

  return (
    <nav aria-label="Sections" className="flex items-center gap-0.5">
      {PRIMARY.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            title={link.hint}
            aria-current={active ? 'page' : undefined}
            className={`rounded-card px-2.5 py-1.5 text-sm transition-colors ${
              active
                ? 'bg-ink/[0.06] font-medium text-ink'
                : 'text-muted hover:bg-ink/[0.035] hover:text-ink'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
