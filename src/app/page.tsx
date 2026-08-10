import type { IssueMetrics } from '@/components/IssueList';
import { OverviewHome, type SiteCard } from '@/components/OverviewHome';
import { inScopeNodes, mainCoverage, phantomFocusable, resolveMetric, ruleTotals } from '@/lib/aggregate';
import { ISSUES } from '@/lib/issues';
import { ruleMeta } from '@/lib/rules';
import { SITES } from '@/lib/sites';
import { BRANDS, formatRunTime, latestRun, loadRuns } from '@/lib/loadRuns';

/**
 * The landing page for an internal user, whichever team they're on.
 *
 * It answers "where do our sites stand" in one screen and then routes to the
 * four things people actually come here to do.
 */
export default function HomePage() {
  const runs = loadRuns();
  const latest = latestRun(runs);

  const sites: SiteCard[] = BRANDS.map((brand) => {
    const totals = latest ? ruleTotals(latest, brand) : {};
    const main = latest ? mainCoverage(latest, brand) : { withMain: 0, scanned: 0 };
    return {
      brand,
      url: SITES[brand].url,
      phantom: latest ? phantomFocusable(latest, brand) : 0,
      failing: latest ? inScopeNodes(latest, brand) : 0,
      unnamedControls: (totals['button-name'] ?? 0) + (totals['link-name'] ?? 0),
      unnamedControlsMisleading:
        (totals['button-name'] ?? 0) + (totals['link-name'] ?? 0) === 0 &&
        ['button-name', 'link-name'].some((id) =>
          (ruleMeta(id).misleadingZeroOn ?? []).includes(brand)
        ),
      unlabelledFields: totals['label'] ?? 0,
      pagesMissingMain: main.scanned - main.withMain,
      pagesScanned: main.scanned,
    };
  });

  const metrics: IssueMetrics = {};
  if (latest) {
    for (const issue of ISSUES) {
      metrics[issue.id] = {};
      for (const brand of BRANDS) {
        metrics[issue.id][brand] = issue.metrics.map((ref) => resolveMetric(latest, brand, ref));
      }
    }
  }

  return (
    <OverviewHome
      sites={sites}
      metrics={metrics}
      runLabel={latest ? formatRunTime(latest) : null}
      runNote={latest?.meta.label ?? null}
      viewport={latest?.meta.viewport ?? null}
      runCount={runs.length}
    />
  );
}
