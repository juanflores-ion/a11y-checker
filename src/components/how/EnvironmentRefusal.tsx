import type { EnvironmentPair } from '@/lib/howItWorks';
import { Arrow } from '../Primitives';
import { Figure, NoFigure } from './Figure';

/**
 * Why the dashboard declines one particular comparison.
 *
 * Drawn from the two runs actually on file rather than from an example, because
 * the concrete version is the convincing one: on 19 Aug the production home page
 * served one document and staging served another, so the diff a reader would
 * naturally ask for reports a movement nobody caused.
 *
 * If only one deployment has been scanned, the picture says so instead of
 * inventing an opposite side.
 */
export function EnvironmentRefusal({ pair }: { pair: EnvironmentPair | null }) {
  if (!pair?.production || !pair?.staging) {
    return (
      <NoFigure>
        {pair?.production
          ? 'Only a production run is on file, so there is no pair to draw. A staging run needs a scanner inside the network.'
          : pair?.staging
          ? 'Only a staging run is on file, so there is no pair to draw.'
          : 'No run on file, so there is no pair to draw.'}
      </NoFigure>
    );
  }

  const { production, staging } = pair;
  const gap = production.failing - staging.failing;
  const differentDocuments =
    production.variant !== null && staging.variant !== null && production.variant !== staging.variant;

  return (
    <Figure
      label="The production and staging runs, and the comparison that is refused"
      caption={
        <>
          The two runs on file, and the comparison the dashboard refuses to make.{' '}
          {differentDocuments ? (
            <>
              Production served <strong className="font-medium text-ink">{production.variant}</strong> and
              staging served <strong className="font-medium text-ink">{staging.variant}</strong>, so the
              difference between them is the difference between two documents.
            </>
          ) : (
            <>
              The two deployments serve different content, so the difference between them is not a
              measure of anything anybody changed.
            </>
          )}{' '}
          Two runs of the <em>same</em> deployment do compare — that is what Scan{' '}
          <Arrow className="mx-0.5 text-muted" /> Compare runs is for.
        </>
      }
    >
      <svg
        viewBox="0 0 780 196"
        role="img"
        aria-label={`The production run recorded ${production.variant ?? 'no variant'} at ${production.failing} failing elements and the staging run recorded ${staging.variant ?? 'no variant'} at ${staging.failing}; the dashboard refuses to diff them.`}
        className="h-auto w-full min-w-[620px] text-muted"
      >
        <rect x="0" y="22" width="292" height="88" rx="10" className="fill-none stroke-rule" />
        <text x="18" y="45" className="fill-faint text-[10.5px] uppercase tracking-[0.09em]">Production run</text>
        <text x="18" y="70" className="fill-ink text-[13px]">{production.variant ?? 'variant not recorded'}</text>
        <text x="274" y="72" textAnchor="end" className="fill-ink font-mono text-[22px]">{production.failing}</text>
        <text x="18" y="92" className="fill-faint font-mono text-[11px]">www.insureon.com</text>

        <rect x="488" y="22" width="292" height="88" rx="10" className="fill-none stroke-rule" />
        <text x="506" y="45" className="fill-faint text-[10.5px] uppercase tracking-[0.09em]">Staging run</text>
        <text x="506" y="70" className="fill-ink text-[13px]">{staging.variant ?? 'variant not recorded'}</text>
        <text x="762" y="72" textAnchor="end" className="fill-ink font-mono text-[22px]">{staging.failing}</text>
        <text x="506" y="92" className="fill-faint font-mono text-[11px]">cd-preview &#183; staging</text>

        <line x1="298" y1="66" x2="482" y2="66" className="stroke-critical" strokeWidth="1.4" strokeDasharray="5 4" opacity="0.8" />
        <line x1="372" y1="48" x2="408" y2="84" className="stroke-critical" strokeWidth="2" strokeLinecap="round" />
        <line x1="408" y1="48" x2="372" y2="84" className="stroke-critical" strokeWidth="2" strokeLinecap="round" />

        <text x="390" y="134" textAnchor="middle" className="fill-critical text-[12px]">refused</text>
        <text x="390" y="156" textAnchor="middle" className="fill-muted text-[11.5px]">
          This diff would read &#8220;{Math.abs(gap)} {gap === 1 || gap === -1 ? 'element' : 'elements'}{' '}
          {gap > 0 ? 'fewer' : gap < 0 ? 'more' : 'changed'}&#8221;.
        </text>
        <text x="390" y="174" textAnchor="middle" className="fill-muted text-[11.5px]">
          Nobody changed anything &#8212; the two sides are not the same page.
        </text>
      </svg>
    </Figure>
  );
}
