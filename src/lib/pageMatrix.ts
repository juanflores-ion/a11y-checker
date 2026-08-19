import { isFailedPage, verdictForPage, type PageResult, type Verdict } from './model';

/** One cell of the By page matrix. Failure and absence are distinct, and neither is zero. */
export type MatrixCell =
  | {
      kind: 'scanned';
      nodes: number;
      rules: number;
      verdict: Verdict;
      /**
       * Which document this URL served, when the target declares how to tell.
       * Insureon's homepage is one Sitecore item under a content test serving
       * three: across two staging runs an hour apart it went
       * Homepage-Hero-Columns (47 failing) → Homepage-Hero-V2 (28), with
       * nothing deployed. A number from that page means nothing without this
       * beside it.
       */
      identity?: { key: string; value: string | null };
    }
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
    ...(page.identity ? { identity: { key: page.identity.key, value: page.identity.value } } : {}),
  };
}
