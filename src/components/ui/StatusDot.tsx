export type DotTone = 'ok' | 'bad' | 'serious' | 'moderate' | 'na';

const DOT: Record<DotTone, string> = {
  ok: 'bg-good',
  bad: 'bg-critical',
  serious: 'bg-serious',
  moderate: 'bg-moderate',
  na: 'border border-dashed border-faint bg-transparent',
};

/** 6px status dot. Decorative — the figure or word beside it carries the meaning. */
export function StatusDot({ tone, className = '' }: { tone: DotTone; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tone]} ${className}`}
    />
  );
}
