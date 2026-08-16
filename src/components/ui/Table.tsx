import { NOT_MEASURABLE_TITLE, NOT_MEASURED_TITLE, type CellTone } from '@/lib/format';
import { StatusDot } from './StatusDot';
import { Tag } from './Tag';

/**
 * Dense table primitives. 36px rows, 13px type, hairline rules, one card
 * border around the whole thing. Numbers are always mono, tabular and
 * right-aligned; colour comes only from `NumCell`'s tone.
 */
export function Table({
  children,
  className = '',
  label,
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * Names the scroll container, and makes it focusable so it can be scrolled.
   *
   * A `overflow-x-auto` div is reachable with the mouse wheel and with a
   * finger, and with nothing else: a keyboard user cannot put focus on it, so
   * the columns past the fold are simply unreadable. `tabIndex={0}` fixes
   * that, and a focusable region with no accessible name is its own defect —
   * hence the name, not an optional nicety.
   */
  label?: string;
}) {
  return (
    <div
      {...(label ? { tabIndex: 0, role: 'region', 'aria-label': label } : {})}
      className={`relative overflow-x-auto rounded-lg border border-rule bg-card shadow-card ${className}`}
    >
      <table className="w-full border-collapse text-[13px] leading-snug">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-paper/60">{children}</thead>;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return (
    <tbody className="[&>tr:last-child>td]:border-b-0 [&>tr:last-child>th]:border-b-0">
      {children}
    </tbody>
  );
}

export function Th({
  children,
  align = 'left',
  className = '',
  scope = 'col',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
  scope?: 'col' | 'row';
}) {
  return (
    <th
      scope={scope}
      className={`border-b border-rule px-3 py-2 text-[11.5px] font-medium text-muted ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className = '',
  colSpan,
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`h-9 border-b border-rule px-3 align-middle ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  );
}

/** A full-width muted row that names the group beneath it. */
export function GroupRow({ children, colSpan }: { children: React.ReactNode; colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="border-b border-rule bg-paper/60 px-3 py-1.5 text-[11.5px] font-medium text-muted"
      >
        {children}
      </td>
    </tr>
  );
}

/** Tone → figure classes. Exported so a cell that isn't a `NumCell` still colours the same way. */
export const FIGURE_CLASS: Record<CellTone, string> = {
  ok: 'text-ink',
  bad: 'font-medium text-critical',
  serious: 'font-medium text-serious',
  neutral: 'text-ink',
  na: 'text-faint',
  nm: 'text-faint',
};

/**
 * A number cell. `text` is already formatted (see `formatCount`); `children`
 * is for anything that follows the figure — a DeltaChip, usually.
 */
export function NumCell({
  tone,
  text,
  tag,
  title,
  children,
  className = '',
}: {
  tone: CellTone;
  text: string;
  tag?: React.ReactNode;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const resolvedTitle =
    title ?? (tone === 'na' ? NOT_MEASURED_TITLE : tone === 'nm' ? NOT_MEASURABLE_TITLE : undefined);
  return (
    <td
      title={resolvedTitle}
      className={`h-9 whitespace-nowrap border-b border-rule px-3 text-right align-middle font-mono text-xs tnum ${className}`}
    >
      {tone === 'ok' ? <StatusDot tone="ok" className="mr-2" /> : null}
      {tone === 'bad' ? <StatusDot tone="bad" className="mr-2" /> : null}
      <span className={FIGURE_CLASS[tone]}>{tone === 'na' ? '—' : text}</span>
      {tone === 'nm' ? <Tag className="ml-1.5">n/m</Tag> : null}
      {tag}
      {children}
    </td>
  );
}

/** The chevron cell that opens a detail row. One contract everywhere: focusable, named, aria-expanded, aria-controls to the panel it reveals. */
export function ToggleCell({
  open,
  onToggle,
  controls,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  controls: string;
  label?: string;
}) {
  return (
    <td className="h-9 border-b border-rule px-3 text-right align-middle text-faint">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? controls : undefined}
        aria-label={label ?? (open ? 'Collapse' : 'Expand')}
      >
        <span aria-hidden="true" className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>
          ›
        </span>
      </button>
    </td>
  );
}
