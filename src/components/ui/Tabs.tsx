import Link from 'next/link';

export interface TabItem {
  href: string;
  label: string;
  active: boolean;
  /** Rendered as a focusable, aria-disabled button with the reason visible beside the label. Never hidden: a tab that vanishes reads as a bug. */
  disabled?: boolean;
  title?: string;
}

/** Underline tabs that sit on the PageHeader hairline. */
export function Tabs({ items, ariaLabel }: { items: TabItem[]; ariaLabel: string }) {
  return (
    <nav aria-label={ariaLabel} className="-mb-px flex gap-0.5">
      {items.map((t) =>
        t.disabled ? (
          <button
            key={t.href}
            type="button"
            aria-disabled="true"
            title={t.title}
            className="cursor-not-allowed border-b-2 border-transparent px-3 py-2 text-sm text-faint"
          >
            {t.label}
            {t.title ? <span className="ml-1.5 text-[11px]">· {t.title}</span> : null}
          </button>
        ) : (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? 'page' : undefined}
            className={`border-b-2 px-3 py-2 text-sm transition-colors ${
              t.active
                ? 'border-accent font-medium text-ink'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </Link>
        )
      )}
    </nav>
  );
}
