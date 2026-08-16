import type { ResolvedMetric, ScorecardRow } from '@/lib/aggregate';
import type { Brand } from '@/lib/model';

/** Everything Overview needs for one brand at one run × device. Computed at build time. */
export interface OverviewBrandSnapshot {
  scorecard: ScorecardRow[];
  passRatio: { passed: number; total: number };
  /** Failing elements across in-scope rules — a volume figure, shown in the footer only. */
  inScopeNodes: number;
  failed: Array<{ key: string; url: string; error: string }>;
  /** issue id → the figures that issue quotes, resolved from this run. */
  issueMetrics: Record<string, ResolvedMetric[]>;
}

/** Keyed by `viewKey(runId, viewport)`, then brand. */
export type OverviewSnapshots = Record<string, Record<Brand, OverviewBrandSnapshot>>;
