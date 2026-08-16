'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { FullScanRunner, type ScanTarget } from '../FullScanRunner';
import { LiveScanClient } from '../LiveScanClient';
import { PageHeader } from '../ui/PageHeader';
import { Tabs } from '../ui/Tabs';

export type ScanMode = 'single' | 'compare' | 'full';

function parseMode(raw: string | null): ScanMode {
  return raw === 'compare' || raw === 'full' ? raw : 'single';
}

/**
 * One page, three modes. Measure and Compare shared a form, an engine and a
 * result shape; the full run drove the same engine in batches. What differed
 * was a mode, so it is a tab, not a nav item. The mode lives in the URL so
 * "check the fix" can be linked to directly.
 *
 * `useSearchParams` needs a Suspense boundary on a statically prerendered page
 * — without it the build fails, with it the shell prerenders and the mode
 * resolves on the client.
 */
export function ScanClient({ targets }: { targets: ScanTarget[] }) {
  return (
    <Suspense fallback={<ScanShell mode="single" targets={targets} />}>
      <ScanWithParams targets={targets} />
    </Suspense>
  );
}

function ScanWithParams({ targets }: { targets: ScanTarget[] }) {
  const params = useSearchParams();
  return <ScanShell mode={parseMode(params.get('mode'))} targets={targets} />;
}

function ScanShell({ mode, targets }: { mode: ScanMode; targets: ScanTarget[] }) {
  return (
    <>
      <PageHeader
        title="Scan"
        description="Point the scanner at any URL — production, staging, a preview build. Nothing is saved to the run history."
        aside={
          <Tabs
            ariaLabel="Scan modes"
            items={[
              { href: '/scan', label: 'Single URL', active: mode === 'single' },
              { href: '/scan?mode=compare', label: 'Before / after', active: mode === 'compare' },
              { href: '/scan?mode=full', label: `Full run · ${targets.length} pages`, active: mode === 'full' },
            ]}
          />
        }
      />
      {mode === 'full' ? (
        <FullScanRunner targets={targets} />
      ) : (
        <LiveScanClient mode={mode === 'compare' ? 'compare' : 'scan'} />
      )}
    </>
  );
}
