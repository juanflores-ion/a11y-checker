import { Figure } from './Figure';

interface Cell {
  word: string;
  defect: boolean;
  body: string;
  column: string;
}

/** Row one is what an agent already has; row two is what it does not. */
const ROWS: Array<{ label: string; cells: [Cell, Cell] }> = [
  {
    label: 'In the list',
    cells: [
      {
        word: 'Working',
        defect: false,
        column: 'A person can see it',
        body: 'The person and the agent see the same thing.',
      },
      {
        word: 'Trapped',
        defect: true,
        column: 'A person cannot',
        body: 'Off screen, yet still handed to the agent and still reachable by Tab.',
      },
    ],
  },
  {
    label: 'Not in the list',
    cells: [
      {
        word: 'Hidden',
        defect: false,
        column: 'Something announces it',
        body: 'A closed menu behind a button that says it is there. This is what correct looks like.',
      },
      {
        word: 'Unfindable',
        defect: true,
        column: 'Nothing does',
        body: 'No way in, and nothing to say there is one. This is what the tool exists to count.',
      },
    ],
  },
];

/**
 * Two questions, four answers, on one plane.
 *
 * This replaced a decision tree that nested a bordered branch inside a bordered
 * branch inside a bordered box. The logic was right and unreadable: the four
 * outcomes it produced could not be compared with each other because no two of
 * them were ever on screen at the same depth. A matrix puts them side by side
 * and lets colour carry the only thing a reader needs — which two are defects.
 */
export function DefectMatrix() {
  return (
    <Figure
      label="Which of the four outcomes are defects"
      caption={
        <>
          Hidden is not the same as unfindable. A closed menu that a button announces is correct
          behaviour; the same menu with nothing pointing at it is the defect this tool exists to
          count.
        </>
      }
    >
      <div className="min-w-[560px]">
        {ROWS.map((row) => (
          <div key={row.label} className="mt-4 first:mt-0">
            <div className="grid grid-cols-[7.5rem_1fr_1fr] items-end gap-3">
              <span />
              {row.cells.map((cell) => (
                <span key={cell.word} className="text-eyebrow uppercase tracking-[0.07em] text-faint">
                  {cell.column}
                </span>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-[7.5rem_1fr_1fr] items-stretch gap-3">
              <span className="self-center text-eyebrow uppercase tracking-[0.07em] text-faint">
                {row.label}
              </span>
              {row.cells.map((cell) => (
                <div
                  key={cell.word}
                  className={`rounded-card border p-4 ${
                    cell.defect ? 'border-critical/30 bg-critical/[0.05]' : 'border-good/30 bg-good/[0.05]'
                  }`}
                >
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className={`font-display text-lg font-semibold ${cell.defect ? 'text-critical' : 'text-good'}`}>
                      {cell.word}
                    </span>
                    <span className={`text-eyebrow uppercase tracking-[0.06em] ${cell.defect ? 'text-critical' : 'text-faint'}`}>
                      {cell.defect ? 'Defect' : 'Not a defect'}
                    </span>
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{cell.body}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Figure>
  );
}
