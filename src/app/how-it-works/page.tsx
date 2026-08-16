import { HowItWorks, type HowItWorksFigures } from '@/components/HowItWorks';
import { navReach } from '@/lib/aggregate';
import { latestRun, loadRuns, runAtViewport } from '@/lib/loadRuns';
import { VIEWPORT_LABEL } from '@/lib/model';

export const metadata = {
  title: 'How it works — Agent Readiness',
  description:
    'What an agent sees, how a page is scanned, what counts as a defect, and what the tool cannot tell you.',
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
        profiles: latest.viewports.map((v) => VIEWPORT_LABEL[v]),
        // Read straight off the run. Anything the run did not record stays
        // undefined and renders as "not recorded".
        axeVersion: latest.meta.axeVersion,
        probeVersion: latest.meta.probeVersion,
        browserVersion: latest.meta.browserVersion,
      };
    }
  }

  return <HowItWorks figures={figures} />;
}
