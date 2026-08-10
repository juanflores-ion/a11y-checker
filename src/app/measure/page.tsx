import { FullScanRunner, type ScanTarget } from '@/components/FullScanRunner';
import { LiveScanClient } from '@/components/LiveScanClient';
import { targetList } from '../../../scanner/targets.mjs';

/**
 * Measure does two jobs: scan whatever URL you paste, or re-record the full
 * tracked set. They share the same engine and the same endpoint — the second
 * just drives it in batches from the browser, which is what lets a ~100-second
 * scan run against a host that gives each request far less than that.
 */
export default function MeasurePage() {
  const targets: ScanTarget[] = targetList();

  return (
    <div className="space-y-10">
      <LiveScanClient mode="scan" />
      <FullScanRunner targets={targets} />
    </div>
  );
}
