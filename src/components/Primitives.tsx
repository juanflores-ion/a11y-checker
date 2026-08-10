import type { Delta } from '@/lib/aggregate';
import { SEVERITY_LABEL, type Severity } from '@/lib/issues';
import { Impact, IMPACT_BG, IMPACT_TEXT } from '@/lib/rules';

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

export function ImpactLabel({ impact }: { impact: Impact }) {
  return <span className={`text-xs font-medium ${IMPACT_TEXT[impact]}`}>{impact}</span>;
}

/** Inline trend, no charting library, no axes — shape only. */
export function Sparkline({
  values,
  className = '',
  width = 108,
  height = 28,
}: {
  values: number[];
  className?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) {
    return <span className="text-xs text-faint">One run only</span>;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
  const last = values[values.length - 1];
  const first = values[0];
  const stroke = last < first ? '#067647' : last > first ? '#C81E1E' : '#8B95A3';

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Trend across ${values.length} runs: ${values.join(', ')}`}
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={(values.length - 1) * step} cy={y(last)} r="2.75" fill={stroke} />
    </svg>
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

/* ------------------------------------------------------------------ */
/* Issue catalogue primitives                                          */
/* ------------------------------------------------------------------ */

const SEVERITY_STYLE: Record<Severity, { dot: string; text: string; ring: string }> = {
  blocking: { dot: 'bg-critical', text: 'text-critical', ring: 'border-critical/30' },
  serious: { dot: 'bg-serious', text: 'text-serious', ring: 'border-serious/30' },
  moderate: { dot: 'bg-moderate', text: 'text-moderate', ring: 'border-rule' },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLE[severity];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-pill border bg-card px-2 py-0.5 text-xs font-medium ${s.ring} ${s.text}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

/**
 * The distinction the README insists on and the old UI never showed: some
 * findings no scanner can catch, so a green automated report is not done.
 */
export function DetectionTag({ detection }: { detection: 'scanner' | 'manual' }) {
  if (detection === 'scanner') {
    return (
      <span className="text-xs text-faint" title="Measured automatically on every scan">
        Measured by the scanner
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill border border-phantom/30 bg-phantom/[0.06] px-2 py-0.5 text-xs font-medium text-phantom"
      title="No automated tool can detect this — it was found by reading the code and testing by hand"
    >
      <span aria-hidden="true">◆</span>
      Automated tools can&apos;t see this
    </span>
  );
}

export function Footnote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 border-l-2 border-rule pl-3 text-xs leading-relaxed text-muted">
      {children}
    </p>
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
