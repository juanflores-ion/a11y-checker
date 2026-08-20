'use client';

import { BRANDS, type Brand } from '@/lib/model';
import type { ResolvedMetric } from '@/lib/aggregate';
import { useRuns } from '../RunContext';
import { PageHeader } from '../ui/PageHeader';
import { IssuesTable } from './IssuesTable';
import { Readiness } from './Readiness';
import { Scorecard } from './Scorecard';
import type { OverviewSnapshots } from './types';
import { Arrow } from '../Primitives';

export function OverviewClient({ snapshots }: { snapshots: OverviewSnapshots }) {
  const { currentKey, compareKey } = useRuns();
  const now = snapshots[currentKey];
  const before = compareKey ? snapshots[compareKey] ?? null : null;

  if (!now) {
    return (
      <>
        <PageHeader title="Overview" description="Where Insureon and TechInsurance stand for an AI agent." />
        <p className="text-sm text-muted">
          No scan on file. Take one from Scan <Arrow className="mx-0.5 text-muted" /> Full run, or run <code className="font-mono text-xs">npm run scan</code>.
        </p>
      </>
    );
  }

  const metricsByBrand = Object.fromEntries(
    BRANDS.map((b) => [b, now[b].issueMetrics])
  ) as Record<Brand, Record<string, ResolvedMetric[]>>;

  return (
    // 56px between chapters — the rule each SectionHead draws sits on top of
    // this gap, so a section break reads as one and a row break as the other.
    <div className="space-y-14">
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
