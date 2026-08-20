import type { HowItWorksFigures } from '@/lib/howItWorks';
import { Figure, NoFigure } from './Figure';

/**
 * One address, and the several documents it actually served.
 *
 * The single most confusing thing about the figures on this dashboard, and
 * until now it was a footnote at the bottom of a list of caveats. Every number
 * here is read off the run: the variant names the content team uses, each
 * document's own failing-element total, and which one the run's figures were
 * taken from.
 */
export function VariantSplit({ figures }: { figures: HowItWorksFigures | null }) {
  const variants = figures?.variants;

  if (!variants || variants.length === 0) {
    return (
      <NoFigure>
        The run on file did not record which document this URL served, so there is nothing to draw.
        A page that declares no identity is measured as one page — which is correct for every page
        we track except this one.
      </NoFigure>
    );
  }

  const counts = variants.map((v) => v.failing);
  const low = Math.min(...counts);
  const high = Math.max(...counts);
  const attempts = figures?.identityAttempts ?? null;

  const TOP = 24;
  const CARD_H = 44;
  const GAP = 37;
  const height = TOP + (variants.length - 1) * (CARD_H + GAP) + CARD_H + 16;
  const centre = TOP + ((variants.length - 1) * (CARD_H + GAP)) / 2 + CARD_H / 2;
  const y = (i: number) => TOP + i * (CARD_H + GAP);

  return (
    <Figure
      label="The documents one URL served, and what each was worth"
      caption={
        <>
          Measured on the run this page reads from. The same address is worth{' '}
          <strong className="font-medium text-ink">{low}</strong> to{' '}
          <strong className="font-medium text-ink">{high}</strong> failing elements depending on which
          document came back
          {attempts && attempts > 1 ? <> — this run asked {attempts} times before it landed on the one it records</> : null}.
          The others are kept beside it as reference copies; only the page of record feeds a figure.
        </>
      }
    >
      <svg
        viewBox={`0 0 600 ${height}`}
        role="img"
        aria-label={`One URL returned ${variants.length} different documents: ${variants
          .map((v) => `${v.name} at ${v.failing} failing elements`)
          .join(', ')}.`}
        className="h-auto w-full min-w-[520px] text-muted"
      >
        <defs>
          <marker id="vs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0L10 5L0 10z" fill="currentColor" />
          </marker>
        </defs>

        <rect x="0" y={centre - 23} width="196" height="46" rx="8" className="fill-none stroke-rule" />
        <text x="98" y={centre - 3} textAnchor="middle" className="fill-muted text-[12px]">one address</text>
        <text x="98" y={centre + 15} textAnchor="middle" className="fill-ink font-mono text-[11px]">www.insureon.com/</text>

        <line x1="200" y1={centre} x2="258" y2={centre} stroke="currentColor" strokeWidth="1.4" markerEnd="url(#vs-arrow)" opacity="0.7" />
        <text x="229" y={centre - 11} textAnchor="middle" className="fill-faint text-[11px]">content test</text>

        <line x1="262" y1={y(0) + CARD_H / 2} x2="262" y2={y(variants.length - 1) + CARD_H / 2} className="stroke-rule" strokeWidth="1.4" />
        {variants.map((v, i) => (
          <line
            key={`l-${v.name}`}
            x1="262"
            y1={y(i) + CARD_H / 2}
            x2="322"
            y2={y(i) + CARD_H / 2}
            stroke="currentColor"
            strokeWidth="1.4"
            markerEnd="url(#vs-arrow)"
            opacity="0.7"
          />
        ))}

        {variants.map((v, i) => (
          <g key={v.name}>
            <rect
              x="332"
              y={y(i)}
              width="252"
              height={CARD_H}
              rx="8"
              className={v.ofRecord ? 'fill-accent/[0.07] stroke-accent/40' : 'fill-none stroke-rule'}
            />
            <text x="348" y={y(i) + 19} className={v.ofRecord ? 'fill-ink text-[13px]' : 'fill-muted text-[13px]'}>
              {v.name}
            </text>
            <text
              x="568"
              y={y(i) + 19}
              textAnchor="end"
              className={`font-mono text-[15px] ${v.ofRecord ? 'fill-ink' : 'fill-muted'}`}
            >
              {v.failing}
            </text>
            <text x="348" y={y(i) + 35} className="fill-faint text-[11px]">
              {v.rules} {v.rules === 1 ? 'rule' : 'rules'} failing
            </text>
            {v.ofRecord ? (
              <text x="568" y={y(i) + 35} textAnchor="end" className="fill-accent text-[10.5px]">
                page of record
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </Figure>
  );
}
