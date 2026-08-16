import { isFailedPage, verdictForPage, type PageResult, type Verdict } from './model';

/** One cell of the By page matrix. Failure and absence are distinct, and neither is zero. */
export type MatrixCell =
  | { kind: 'scanned'; nodes: number; rules: number; verdict: Verdict }
  | { kind: 'failed'; error: string }
  | { kind: 'absent' };

export function matrixCell(page: PageResult | undefined): MatrixCell {
  if (!page) return { kind: 'absent' };
  if (isFailedPage(page)) return { kind: 'failed', error: page.error };
  const violations = page.violations ?? [];
  return {
    kind: 'scanned',
    nodes: violations.reduce((sum, v) => sum + v.n, 0),
    rules: violations.length,
    verdict: verdictForPage(page),
  };
}
