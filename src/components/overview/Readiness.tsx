'use client';

import { ISSUES } from '@/lib/issues';
import { BRAND_LABEL, type Brand } from '@/lib/model';
import { useRuns } from '../RunContext';
import type { OverviewBrandSnapshot } from './types';

/**
 * The first thing on the Overview: how far each site is from meeting every
 * target, as a bar of the targets themselves. No invented score — the bar is
 * `passed / total` from the scorecard, the same figures the table below
 * shows, and the count beside it is the blocking issues the catalogue lists
 * for that site. When a fix lands on staging and a new run is recorded, this
 * is the thing on the page that visibly moves.
 */
export function Readiness({
  now,
  before,
}: {
  now: Record<Brand, OverviewBrandSnapshot>;
  before: Record<Brand, OverviewBrandSnapshot> | null;
}) {
  const { brands } = useRuns();
  return (
    <section aria-label="Readiness" className="rounded-card border border-rule bg-card shadow-card">
      {brands.map((b, i) => {
        const { passed, total } = now[b].passRatio;
        const prev = before ? before[b].passRatio.passed : null;
        const pct = total ? Math.round((passed / total) * 100) : 0;
        const blocking = ISSUES.filter((x) => x.inScope && x.severity === 'blocking' && x.brands.includes(b)).length;
        return (
          <div
            key={b}
            className={`grid grid-cols-[minmax(7rem,9rem)_1fr_auto] items-center gap-x-5 px-4 py-3 sm:gap-x-6 ${
              i > 0 ? 'border-t border-rule' : ''
            }`}
          >
            <span className="text-sm font-semibold text-ink">{BRAND_LABEL[b]}</span>
            <div
              role="meter"
              aria-label={`${BRAND_LABEL[b]}: ${passed} of ${total} targets met`}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={passed}
              className="relative h-2 overflow-hidden rounded-full bg-rule"
            >
              <span
                className={`absolute inset-y-0 left-0 rounded-full transition-[width] ${passed === total ? 'bg-good' : 'bg-good/80'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="whitespace-nowrap text-right font-mono text-xs text-muted tnum">
              <span className="font-medium text-ink">
                {passed} of {total}
              </span>{' '}
              targets met
              {prev !== null && prev !== passed ? (
                <span className={`ml-1.5 ${passed > prev ? 'text-good' : 'text-critical'}`}>
                  ({passed > prev ? '+' : ''}
                  {passed - prev})
                </span>
              ) : null}
              <span className="text-faint"> · </span>
              <span className={`font-medium ${blocking ? 'text-critical' : 'text-good'}`}>{blocking}</span> blocking
            </span>
          </div>
        );
      })}
    </section>
  );
}
