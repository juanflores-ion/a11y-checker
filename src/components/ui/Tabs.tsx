import Link from 'next/link';

export interface TabItem {
  href: string;
  label: string;
  active: boolean;
}

/** Underline tabs that sit on the PageHeader hairline. */
export function Tabs({ items, ariaLabel }: { items: TabItem[]; ariaLabel: string }) {
  return (
    <nav aria-label={ariaLabel} className="-mb-px flex gap-0.5">
      {items.map((t) => (
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
      ))}
    </nav>
  );
}
