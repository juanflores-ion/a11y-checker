import { ScanClient } from '@/components/scan/ScanClient';
import type { ScanTarget } from '@/components/FullScanRunner';
import { targetList } from '../../../scanner/targets.mjs';

export const metadata = {
  title: 'Scan — Agent Readiness',
  description: 'Check a fix before and after, measure a URL now, or record a full run.',
};

export default function ScanPage() {
  const targets: ScanTarget[] = targetList();
  return <ScanClient targets={targets} />;
}
