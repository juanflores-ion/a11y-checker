import { HowItWorks, type HowItWorksFigures } from '@/components/HowItWorks';
import { navReach, scannedPages } from '@/lib/aggregate';
import { latestRun, loadRuns, runAtViewport } from '@/lib/loadRuns';

export const metadata = {
  title: 'How it works — Agent Readiness',
  description:
    'How the scanner measures a page, why it measures two devices, and what it deliberately does not do.',
};

/**
 * The explainer.
 *
 * Its figures come from the latest real run rather than the prose, so the page
 * cannot drift away from what the tool actually measures. If there is no run on
 * file it renders without them — an explanation with no numbers is fine; an
 * explanation with invented ones is not.
 */
export default function HowItWorksPage() {
  const runs = loadRuns();
  const latest = latestRun(runs);

  let figures: HowItWorksFigures | null = null;
  if (latest) {
    // Desktop where it was measured, because that is the profile an agent is
    // served and the one the surrounding prose is about.
    const view = runAtViewport(latest, 'desktop') ?? latest;
    const home = view.insureon?.home;
    const nav = home && !('error' in home && home.error) ? navReach(view, 'insureon') : null;
    const homeNav =
      home && !('error' in home && home.error)
        ? (home as { navLinks?: { total: number; inTree: number } }).navLinks
        : undefined;

    if (homeNav || nav) {
      figures = {
        navTotal: homeNav?.total ?? 0,
        navInTree: homeNav?.inTree ?? 0,
        pages: scannedPages(view, 'insureon').length + scannedPages(view, 'techinsurance').length,
        profiles: latest.viewports.length,
      };
    }
  }

  return <HowItWorks figures={figures} />;
}
