'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { FullScanRunner, type ScanTarget } from '../FullScanRunner';
import { LiveScanClient } from '../LiveScanClient';
import { PageHeader } from '../ui/PageHeader';
import { RecordedCompare } from './RecordedCompare';
import { Tabs } from '../ui/Tabs';

export type ScanMode = 'single' | 'full' | 'runs';

/**
 * Compare runs is where a bare `/scan` lands.
 *
 * Before / after used to be here: it scanned production and staging live and
 * diffed them. That is the one comparison this tool refuses everywhere else,
 * because the two deployments serve different content — on 19 Aug production's
 * home page was one document and staging's was another, so the diff read "19
 * fewer" with nobody having fixed anything. Two runs of the same deployment is
 * the comparison that means something, and that is this tab.
 *
 * `?mode=compare` still resolves rather than 404ing, so old links land on the
 * screen that answers what they were asking.
 */
function parseMode(raw: string | null): ScanMode {
  return raw === 'single' || raw === 'full' || raw === 'runs' ? raw : 'runs';
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
    <Suspense fallback={<ScanShell mode="runs" targets={targets} />}>
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
        description="Compare two runs already on file, point the scanner at any URL, or take a full run of a site."
        aside={
          <Tabs
            ariaLabel="Scan modes"
            items={[
              { href: '/scan', label: 'Compare runs', active: mode === 'runs' },
              { href: '/scan?mode=single', label: 'Single URL', active: mode === 'single' },
              { href: '/scan?mode=full', label: `Full run · ${targets.length} pages`, active: mode === 'full' },
            ]}
          />
        }
      />
      {mode === 'runs' ? (
        <RecordedCompare />
      ) : mode === 'full' ? (
        <FullScanRunner targets={targets} />
      ) : (
        <LiveScanClient mode="scan" targets={targets} />
      )}
    </>
  );
}
