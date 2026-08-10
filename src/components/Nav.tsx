'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useRuns } from './RunContext';

/**
 * Named after what someone came here to do, not after what the data is.
 *
 * "Measurements" and "Rules" described the scanner's output. These describe
 * the four reasons an internal user opens this tool: find out what's wrong,
 * read an existing measurement, take a new one, or prove a fix landed.
 *
 * Issues was a fifth until the scanner learned to measure what only prose
 * could describe. Once every figure it quoted was also in Runs, it stopped
 * being a destination and became a section of Overview.
 */
export const PRIMARY = [
  { href: '/', label: 'Overview', hint: 'Where the sites stand, and what’s wrong' },
  { href: '/runs', label: 'Runs', hint: 'Measurements already taken' },
  { href: '/measure', label: 'Measure', hint: 'Scan a live site now' },
  { href: '/compare', label: 'Compare', hint: 'Before vs after — check a fix landed' },
];

/**
 * The cuts through a run. Shown only while inside Runs.
 *
 * "Over time" plots one figure across every scan, so with a single scan on
 * file it would draw a single dot — it only appears once there are two runs to
 * draw a line between.
 */
export const RUN_VIEWS = [
  { href: '/runs', label: 'Summary', minRuns: 1 },
  { href: '/runs/rules', label: 'By check', minRuns: 1 },
  { href: '/runs/pages', label: 'By page', minRuns: 1 },
  { href: '/runs/trend', label: 'Over time', minRuns: 2 },
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

/**
 * Sub-navigation for the Runs section. Renders nothing anywhere else, so the
 * two nav levels never compete for attention on the same screen.
 */
export function RunsNav() {
  const pathname = usePathname() ?? '/';
  const { runs } = useRuns();
  if (!pathname.startsWith('/runs')) return null;

  const views = RUN_VIEWS.filter((v) => runs.length >= v.minRuns);

  return (
    // Its own tinted band with a top rule, so the two nav levels read as
    // parent and child rather than as one squashed strip of links.
    <nav aria-label="Run views" className="border-t border-rule bg-card/60">
      <ul className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-5 sm:px-8">
        {views.map((view) => {
          // Summary is the section index, so it must match exactly or every
          // child route would light it up alongside the real active tab.
          const active =
            view.href === '/runs/'
              ? pathname === '/runs' || pathname === '/runs/'
              : pathname.startsWith(view.href.replace(/\/$/, ''));
          return (
            <li key={view.href}>
              <Link
                href={view.href}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px inline-block border-b-2 px-2.5 py-3 text-sm transition-colors ${
                  active
                    ? 'border-accent font-medium text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {view.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
