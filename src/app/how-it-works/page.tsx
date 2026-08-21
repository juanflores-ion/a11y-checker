import { HowItWorks } from '@/components/HowItWorks';
import { environmentPair, variantFigures, type HowItWorksFigures } from '@/lib/howItWorks';
import { isScannedPage, latestRun, runAtViewport, VIEWPORT_LABEL, type Run } from '@/lib/loadRuns';
import { loadAllRuns } from '@/lib/runStore';

/**
 * Rendered per request, not baked at build.
 *
 * Runs are no longer only files on disk: one taken from the dashboard lives in
 * the run store, and a page prerendered at build time cannot know about it.
 * This is the cost of runs that appear the moment they are taken.
 */
export const dynamic = 'force-dynamic';


export const metadata = {
  title: 'How it works · Agent Readiness',
  description:
    'What an agent sees, how a page is scanned, what counts as a defect, how to read the numbers, and what the tool cannot tell you.',
};

/**
 * The run the prose is about.
 *
 * Production, because every sentence on this page describes the site the public
 * gets, and because the dashboard itself opens on production. Falling back to
 * the newest run of any deployment is better than rendering nothing, and the
 * environment chapter names both sides anyway.
 */
function subjectRun(runs: Run[]): Run | null {
  const production = runs.filter((r) => r.environment === 'production');
  return latestRun(production.length ? production : runs);
}

/**
 * The explainer.
 *
 * Its figures come from real runs rather than from the prose, so the page
 * cannot drift away from what the tool actually measures. If there is no run on
 * file it renders without them — an explanation with no numbers is fine; an
 * explanation with invented ones is not.
 */
export default async function HowItWorksPage() {
  const runs = await loadAllRuns();
  const subject = subjectRun(runs);

  let figures: HowItWorksFigures | null = null;
  if (subject) {
    // Desktop where it was measured, because that is the profile an agent is
    // served and the one the surrounding prose is about.
    const view = runAtViewport(subject, 'desktop') ?? subject;
    const home = view.insureon?.home;
    const scanned = isScannedPage(home) ? home : null;

    figures = {
      navTotal: scanned?.navLinks?.total ?? 0,
      navInTree: scanned?.navLinks?.inTree ?? 0,
      profiles: subject.viewports.map((v) => VIEWPORT_LABEL[v]),
      // Read straight off the run. Anything the run did not record stays
      // undefined and renders as "not recorded".
      axeVersion: subject.meta.axeVersion,
      probeVersion: subject.meta.probeVersion,
      probeVersionInferred: subject.meta.probeVersionInferred,
      browserVersion: subject.meta.browserVersion,
      variants: scanned ? variantFigures(scanned) : null,
      identityAttempts: scanned?.identityAttempts ?? null,
      environments: environmentPair(runs),
    };
  }

  return <HowItWorks figures={figures} />;
}
