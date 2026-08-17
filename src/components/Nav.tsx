'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Named after what someone came here to do, not after what the data is.
 *
 * Overview: where the sites stand and what is wrong. Runs: every figure of a
 * measurement, by check and by page. Scan: take a measurement now — a single
 * URL, a before/after, or a full run.
 *
 * How it works is not one of those three. It answers "why should I believe
 * these numbers", which is asked after the numbers, so it sits apart on the
 * right as a help entry rather than competing as a fourth destination.
 *
 * Measure and Compare used to be two entries. They shared one form, one engine
 * and one result shape; what differed was a mode, so they are one page now.
 */
export const PRIMARY = [
  { href: '/', label: 'Overview', hint: 'Where the sites stand, and what’s wrong' },
  { href: '/runs', label: 'Runs', hint: 'Every figure of a measurement, by check and by page' },
  { href: '/scan', label: 'Scan', hint: 'Check a fix before and after, measure a URL, or record a full run' },
];

export const HELP = {
  href: '/how-it-works',
  label: 'How it works',
  hint: 'What the scanner does, in plain English',
};

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href.replace(/\/$/, ''));
}

export function Nav() {
  const pathname = usePathname() ?? '/';

  return (
    <nav aria-label="Sections" className="flex flex-1 items-center gap-0.5">
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

      <Link
        href={HELP.href}
        title={HELP.hint}
        aria-current={isActive(pathname, HELP.href) ? 'page' : undefined}
        className={`ml-auto inline-flex items-center gap-1.5 rounded-card px-2.5 py-1.5 text-sm transition-colors ${
          isActive(pathname, HELP.href)
            ? 'bg-ink/[0.06] font-medium text-ink'
            : 'text-muted hover:bg-ink/[0.035] hover:text-ink'
        }`}
      >
        <QuestionMark />
        {HELP.label}
      </Link>
    </nav>
  );
}

/** A question mark in a circle — the one icon in the header, and it earns it. */
function QuestionMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M5.3 5.2a1.75 1.75 0 1 1 2.1 1.9c-.3.1-.4.35-.4.6v.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="7" cy="10.2" r="0.75" fill="currentColor" />
    </svg>
  );
}
