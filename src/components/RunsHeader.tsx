'use client';

import { usePathname } from 'next/navigation';

import { PageHeader } from './ui/PageHeader';
import { Tabs } from './ui/Tabs';

export function RunsHeader({ aside }: { aside?: React.ReactNode } = {}) {
  const pathname = usePathname() ?? '/runs';

  return (
    <PageHeader
      title="Runs"
      description="Every figure the scanner produced for the selected run, by page and by check."
      aside={
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          {aside ? <div className="pb-2">{aside}</div> : null}
          <Tabs
            ariaLabel="Run views"
            items={[
              {
                href: '/runs/pages',
                label: 'By page',
                // `/runs` redirects here, but the tab has to read as active for
                // the instant the old URL is still in the bar.
                active: pathname.startsWith('/runs/pages') || pathname === '/runs' || pathname === '/runs/',
              },
              { href: '/runs/checks', label: 'By check', active: pathname.startsWith('/runs/checks') },
            ]}
          />
        </div>
      }
    />
  );
}
