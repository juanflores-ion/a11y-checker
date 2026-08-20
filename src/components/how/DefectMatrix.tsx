interface Outcome {
  word: string;
  /** The answer this cell represents, in two or three words. */
  answer: string;
  defect: boolean;
  body: string;
}

interface Row {
  /** The condition that puts something in this row. */
  condition: string;
  /** The question the two cells answer. */
  question: string;
  cells: [Outcome, Outcome];
}

/** Row one is what an agent already has; row two is what it does not. */
const ROWS: Row[] = [
  {
    condition: 'In the list an agent reads',
    question: 'can a person see it?',
    cells: [
      {
        word: 'Working',
        answer: 'on screen',
        defect: false,
        body: 'The person and the agent see the same thing.',
      },
      {
        word: 'Trapped',
        answer: 'off screen',
        defect: true,
        body: 'Still handed to the agent, and still reachable by Tab.',
      },
    ],
  },
  {
    condition: 'Not in the list',
    question: 'does anything announce it?',
    cells: [
      {
        word: 'Hidden',
        answer: 'announced',
        defect: false,
        body: 'A closed menu behind a button that says it is there. Correct.',
      },
      {
        word: 'Unfindable',
        answer: 'nothing announces it',
        defect: true,
        body: 'No way in, and nothing to say there is one.',
      },
    ],
  },
];

/**
 * Two questions, four answers, on one plane.
 *
 * This replaced a decision tree that nested a bordered branch inside a bordered
 * branch inside a bordered box. The logic was right and unreadable: the four
 * outcomes could not be compared with each other because no two of them were
 * ever on screen at the same depth.
 *
 * The first matrix was still too heavy, and for two reasons worth recording.
 * It sat inside a bordered figure, so four bordered cells lived inside a
 * bordered card — the same nesting, one level shallower. And it carried six
 * small-caps labels: a row label in a column that was otherwise empty, and a
 * column label above each cell. The condition and the question now share one
 * plain line per row, the answer moved inside the cell beside the word it
 * names, and the card around the whole thing went. No caption either: it said
 * what the chapter's own lead already says.
 */
export function DefectMatrix() {
  return (
    <div className="mt-5 flex flex-col gap-6">
      {ROWS.map((row) => (
        <div key={row.condition}>
          <p className="text-[13px] leading-relaxed">
            <span className="font-medium text-ink">{row.condition}</span>
            <span className="text-muted">: {row.question}</span>
          </p>
          <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
            {row.cells.map((cell) => (
              <div
                key={cell.word}
                className={`rounded-card border p-4 ${
                  cell.defect
                    ? 'border-critical/30 bg-critical/[0.05]'
                    : 'border-good/30 bg-good/[0.05]'
                }`}
              >
                <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span
                    className={`font-display text-lg font-semibold ${
                      cell.defect ? 'text-critical' : 'text-good'
                    }`}
                  >
                    {cell.word}
                  </span>
                  <span className="text-[12.5px] text-faint">{cell.answer}</span>
                  <span
                    className={`ml-auto text-eyebrow uppercase tracking-[0.06em] ${
                      cell.defect ? 'text-critical' : 'text-faint'
                    }`}
                  >
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
  );
}
