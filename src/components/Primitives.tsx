import type { Delta } from '@/lib/aggregate';
import { Impact, IMPACT_BG } from '@/lib/rules';

/**
 * Small section label.
 *
 * Deliberately *not* mono-uppercase. Shouting a monospaced micro-caps label
 * above every element flattens hierarchy — everything ends up equally loud,
 * which is most of what made the earlier pass feel unfinished. This is quiet
 * by default; the content underneath does the talking.
 */
export function Eyebrow({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-eyebrow font-medium text-muted ${className}`}>{children}</div>
  );
}

/**
 * If a number moved, that's the story. Down is good on every metric except
 * main-element coverage, so `higherIsBetter` flips the colouring, not the arrow.
 */
export function DeltaChip({
  delta,
  higherIsBetter = false,
  className = '',
}: {
  delta: Delta | null;
  higherIsBetter?: boolean;
  className?: string;
}) {
  if (!delta || delta.change === null) {
    return (
      <span
        className={`text-xs text-faint ${className}`}
        title="No earlier run to compare against"
      >
        —
      </span>
    );
  }

  if (delta.change === 0) {
    return <span className={`text-xs text-faint tnum ${className}`}>No change</span>;
  }

  const improving = higherIsBetter ? delta.change > 0 : delta.change < 0;
  const tone = improving
    ? 'text-good bg-good/[0.08]'
    : 'text-critical bg-critical/[0.08]';
  const title = delta.exact
    ? `${delta.previous} → ${delta.current}. This rule should be exact — any movement is real.`
    : `${delta.previous} → ${delta.current}. Small drift on this rule is normal content churn.`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-1.5 py-0.5 text-xs font-medium tnum ${tone} ${className}`}
      title={title}
    >
      <span aria-hidden="true">{delta.change > 0 ? '↑' : '↓'}</span>
      {Math.abs(delta.change)}
    </span>
  );
}

export function ImpactDot({ impact, className = '' }: { impact: Impact; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${IMPACT_BG[impact]} ${className}`}
    />
  );
}

/**
 * Renders scanner-captured markup as *text*.
 *
 * React escapes children by default, which is exactly what's wanted — the one
 * thing that must never happen here is dangerouslySetInnerHTML. An earlier
 * findings export rendered `<main>` as a live empty element and the row went
 * blank.
 */
export function CodeSample({ html }: { html: string }) {
  return (
    <code className="block overflow-x-auto whitespace-pre-wrap break-all rounded-card border border-rule bg-paper px-3 py-2 font-mono text-xs leading-relaxed text-ink">
      {html}
    </code>
  );
}

/**
 * Shared by the scan results, compare view and page detail: a page that failed
 * to load, one that passed clean, or one that isn't part of the current batch.
 */
export function Notice({
  tone,
  title,
  children,
}: {
  tone: 'error' | 'good' | 'neutral';
  title: string;
  children: React.ReactNode;
}) {
  const styles = {
    error: 'border-critical/25 bg-critical/[0.04]',
    good: 'border-good/25 bg-good/[0.04]',
    neutral: 'border-rule bg-paper',
  }[tone];
  const titleTone = {
    error: 'text-critical',
    good: 'text-good',
    neutral: 'text-muted',
  }[tone];

  return (
    <div className={`mt-3 rounded-card border p-4 ${styles}`}>
      <p className={`text-eyebrow font-semibold ${titleTone}`}>{title}</p>
      <div className="mt-1.5 text-sm leading-relaxed text-ink">{children}</div>
    </div>
  );
}
