/** Quiet inline tag: `n/m`, `drifts`, `our probe`, `manual finding`. Never louder than the figure next to it. */
export function Tag({
  children,
  tone = 'neutral',
  title,
  className = '',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'phantom' | 'critical';
  title?: string;
  className?: string;
}) {
  const toneClass =
    tone === 'phantom'
      ? 'border-phantom/35 text-phantom'
      : tone === 'critical'
        ? 'border-critical/35 text-critical'
        : 'border-rule text-faint';
  return (
    <span
      title={title}
      className={`inline-block rounded-[4px] border px-1 align-[1px] font-sans text-[10.5px] leading-[15px] ${toneClass} ${className}`}
    >
      {children}
    </span>
  );
}
