'use client';

import { usePathname } from 'next/navigation';

import { PageHeader } from './ui/PageHeader';
import { Tabs } from './ui/Tabs';

export function RunsHeader({ aside }: { aside?: React.ReactNode } = {}) {
  const pathname = usePathname() ?? '/runs';

  return (
    <PageHeader
      title="Runs"
      description="Every figure the scanner produced for the selected run, by check and by page."
      aside={
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          {aside ? <div className="pb-2">{aside}</div> : null}
          <Tabs
            ariaLabel="Run views"
            items={[
              { href: '/runs', label: 'By check', active: pathname === '/runs' || pathname === '/runs/' },
              { href: '/runs/pages', label: 'By page', active: pathname.startsWith('/runs/pages') },
            ]}
          />
        </div>
      }
    />
  );
}
