'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { FullScanRunner, type ScanTarget } from '../FullScanRunner';
import { LiveScanClient } from '../LiveScanClient';
import { PageHeader } from '../ui/PageHeader';
import { Tabs } from '../ui/Tabs';

export type ScanMode = 'single' | 'compare' | 'full';

/**
 * Before / after is the mode this page exists for once fixes reach staging, so
 * it is the first tab and where a bare `/scan` lands. `?mode=compare` still
 * resolves to it, so links written before it became the default keep working.
 */
function parseMode(raw: string | null): ScanMode {
  return raw === 'single' || raw === 'full' ? raw : 'compare';
}

/**
 * One page, three modes. Compare and Measure share a form, an engine and a
 * result shape; the full run drives the same engine in batches. What differs
 * is a mode, so it is a tab, not a nav item. The mode lives in the URL so
 * "measure this one URL" can be linked to directly.
 *
 * `useSearchParams` needs a Suspense boundary on a statically prerendered page
 * — without it the build fails, with it the shell prerenders and the mode
 * resolves on the client.
 */
export function ScanClient({ targets }: { targets: ScanTarget[] }) {
  return (
    <Suspense fallback={<ScanShell mode="compare" targets={targets} />}>
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
              { href: '/scan', label: 'Before / after', active: mode === 'compare' },
              { href: '/scan?mode=single', label: 'Single URL', active: mode === 'single' },
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
