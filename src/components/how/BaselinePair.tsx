import type { EnvironmentPair } from '@/lib/howItWorks';
import { Figure } from './Figure';

/**
 * What a baseline is, and why no figure anywhere is a change since last time.
 *
 * The policy is deliberate and invisible in the interface: a reader who does
 * not know it will read the absence of trend lines as something nobody got
 * round to building. The `pair` is only used to say whether the current
 * baseline is complete — the shape of the rule does not depend on the data.
 */
export function BaselinePair({ pair }: { pair: EnvironmentPair | null }) {
  const complete = Boolean(pair?.production && pair?.staging);

  return (
    <Figure
      label="What a baseline is made of"
      caption={
        <>
          A baseline is a pair, not a run: one production scan and one staging scan taken in the same
          sitting, with the same scanner. Taking a new baseline deletes the previous pair, which is why
          nothing on the dashboard is expressed as a change since last time.{' '}
          {complete ? (
            <>The pair on file is complete.</>
          ) : (
            <>The pair on file is incomplete — one side is missing.</>
          )}
        </>
      }
    >
      <svg
        viewBox="0 0 780 186"
        role="img"
        aria-label="A baseline is one production run and one staging run taken in the same sitting. Taking a new baseline deletes the previous pair, and no figure is shown as a change since the last run."
        className="h-auto w-full min-w-[620px] text-muted"
      >
        <defs>
          <marker id="bp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0L10 5L0 10z" fill="currentColor" />
          </marker>
        </defs>

        <path d="M6 74 L6 30 L266 30 L266 74" className="fill-none stroke-accent" strokeWidth="1.3" opacity="0.55" />
        <text x="136" y="20" textAnchor="middle" className="fill-accent text-[11.5px]">one baseline</text>
        <rect x="6" y="80" width="124" height="58" rx="9" className="fill-none stroke-rule" />
        <text x="68" y="103" textAnchor="middle" className="fill-faint text-[11px]">production</text>
        <text x="68" y="123" textAnchor="middle" className="fill-ink text-[13px]">1 run</text>
        <rect x="142" y="80" width="124" height="58" rx="9" className="fill-none stroke-rule" />
        <text x="204" y="103" textAnchor="middle" className="fill-faint text-[11px]">staging</text>
        <text x="204" y="123" textAnchor="middle" className="fill-ink text-[13px]">1 run</text>
        <text x="136" y="160" textAnchor="middle" className="fill-muted text-[11.5px]">same sitting, same scanner</text>

        <line x1="282" y1="109" x2="352" y2="109" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#bp-arrow)" opacity="0.7" />
        <text x="317" y="98" textAnchor="middle" className="fill-faint text-[11px]">next baseline</text>

        <path d="M368 74 L368 30 L628 30 L628 74" className="fill-none stroke-accent" strokeWidth="1.3" opacity="0.55" />
        <rect x="368" y="80" width="124" height="58" rx="9" className="fill-none stroke-rule" />
        <text x="430" y="103" textAnchor="middle" className="fill-faint text-[11px]">production</text>
        <text x="430" y="123" textAnchor="middle" className="fill-ink text-[13px]">1 run</text>
        <rect x="504" y="80" width="124" height="58" rx="9" className="fill-none stroke-rule" />
        <text x="566" y="103" textAnchor="middle" className="fill-faint text-[11px]">staging</text>
        <text x="566" y="123" textAnchor="middle" className="fill-ink text-[13px]">1 run</text>
        <text x="498" y="160" textAnchor="middle" className="fill-critical text-[11.5px]">the previous pair is deleted</text>

        <line x1="644" y1="109" x2="706" y2="109" className="stroke-critical" strokeWidth="1.4" strokeDasharray="5 4" opacity="0.75" />
        <line x1="662" y1="95" x2="690" y2="123" className="stroke-critical" strokeWidth="2" strokeLinecap="round" />
        <line x1="690" y1="95" x2="662" y2="123" className="stroke-critical" strokeWidth="2" strokeLinecap="round" />
        <text x="676" y="147" textAnchor="middle" className="fill-muted text-[11px]">no &#8220;since last run&#8221;</text>
      </svg>
    </Figure>
  );
}
