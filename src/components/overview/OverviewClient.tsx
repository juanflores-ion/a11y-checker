'use client';

import { BRANDS, type Brand } from '@/lib/model';
import type { ResolvedMetric } from '@/lib/aggregate';
import { useRuns } from '../RunContext';
import { PageHeader } from '../ui/PageHeader';
import { IssuesTable } from './IssuesTable';
import { Readiness } from './Readiness';
import { Scorecard } from './Scorecard';
import type { OverviewSnapshots } from './types';

export function OverviewClient({ snapshots }: { snapshots: OverviewSnapshots }) {
  const { currentKey, compareKey } = useRuns();
  const now = snapshots[currentKey];
  const before = compareKey ? snapshots[compareKey] ?? null : null;

  if (!now) {
    return (
      <>
        <PageHeader title="Overview" description="Where Insureon and TechInsurance stand for an AI agent." />
        <p className="text-sm text-muted">
          No scan on file. Take one from Scan → Full run, or run <code className="font-mono text-xs">npm run scan</code>.
        </p>
      </>
    );
  }

  const metricsByBrand = Object.fromEntries(
    BRANDS.map((b) => [b, now[b].issueMetrics])
  ) as Record<Brand, Record<string, ResolvedMetric[]>>;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Where Insureon and TechInsurance stand for an AI agent, from the selected production scan."
      />
      <Readiness now={now} before={before} />
      <Scorecard now={now} before={before} />
      <IssuesTable metricsByBrand={metricsByBrand} />
    </div>
  );
}
