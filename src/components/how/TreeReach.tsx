import type { HowItWorksFigures } from '@/lib/howItWorks';
import { Figure, NoFigure } from './Figure';

const COLS = 9;
const CELL = 20;
const ROW = 12;
const GAP_X = 6;
const GAP_Y = 8;

function grid(count: number, x0: number, y0: number) {
  return Array.from({ length: count }, (_, i) => ({
    key: i,
    x: x0 + (i % COLS) * (CELL + GAP_X),
    y: y0 + Math.floor(i / COLS) * (ROW + GAP_Y),
  }));
}

/**
 * The whole point of the tool, in one picture: how much of a page survives the
 * translation into the list an agent reads.
 *
 * Both figures are measured — `navLinks.total` and `navLinks.inTree` off the
 * run's Insureon homepage. A run that never counted them draws nothing, because
 * a picture of this claim with invented numbers would be the most misleading
 * thing on the site.
 */
export function TreeReach({ figures }: { figures: HowItWorksFigures | null }) {
  const total = figures?.navTotal ?? 0;
  const inTree = figures?.navInTree ?? 0;

  if (!figures || total <= 0) {
    return (
      <NoFigure>
        No run on file counted the navigation links on this page, so there is nothing to draw here
        yet. The figure appears as soon as a run records them.
      </NoFigure>
    );
  }

  const lost = Math.max(0, total - inTree);
  const rows = Math.ceil(total / COLS);
  const height = 48 + rows * (ROW + GAP_Y);

  return (
    <Figure
      label="How many navigation links reach the accessibility tree"
      caption={
        <>
          Measured on Insureon&rsquo;s desktop home page: <strong className="font-medium text-ink">{total}</strong>{' '}
          navigation links exist, <strong className="font-medium text-ink">{inTree}</strong> reach the
          list an agent reads. The other {lost} are, to an agent, not on the page at all.
        </>
      }
    >
      <svg
        viewBox={`0 0 780 ${height}`}
        role="img"
        aria-label={`Of ${total} navigation links on the Insureon desktop home page, ${inTree} reach the list an agent reads; ${lost} do not.`}
        className="h-auto w-full min-w-[600px] text-muted"
      >
        <defs>
          <marker id="tr-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0L10 5L0 10z" fill="currentColor" />
          </marker>
        </defs>

        <text x="0" y="13" className="fill-muted text-[12px]">On the page</text>
        <text x="0" y="34" className="fill-ink text-[21px] font-semibold">{total} links</text>
        {grid(total, 0, 50).map((c) => (
          <rect key={c.key} x={c.x} y={c.y} width={CELL} height={ROW} rx="2" className="fill-none stroke-rule" strokeWidth="1" />
        ))}

        <line x1="270" y1="108" x2="452" y2="108" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#tr-arrow)" opacity="0.7" />
        <text x="361" y="96" textAnchor="middle" className="fill-muted text-[11.5px]">the browser builds the list</text>
        <text x="361" y="130" textAnchor="middle" className="fill-critical text-[11.5px]">{lost} do not survive it</text>

        <text x="482" y="13" className="fill-muted text-[12px]">In the list an agent reads</text>
        <text x="482" y="34" className="fill-good text-[21px] font-semibold">{inTree} links</text>
        {grid(inTree, 482, 50).map((c) => (
          <rect key={c.key} x={c.x} y={c.y} width={CELL} height={ROW} rx="2" className="fill-good" opacity="0.9" />
        ))}
      </svg>
    </Figure>
  );
}
