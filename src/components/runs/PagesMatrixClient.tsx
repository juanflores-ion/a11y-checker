'use client';

import Link from 'next/link';

import type { MatrixCell } from '@/lib/pageMatrix';
import { BRAND_LABEL, PAGE_LABEL, type Brand, type Verdict } from '@/lib/model';
import { useRuns } from '../RunContext';
import { StatusDot, type DotTone } from '../ui/StatusDot';
import { SectionHead } from '../ui/SectionHead';
import { Table, TBody, Td, Th, THead } from '../ui/Table';

const VERDICT_DOT: Record<Verdict, DotTone> = { blocking: 'bad', 'needs-work': 'serious', clear: 'ok' };
const VERDICT_TEXT: Record<Verdict, string> = { blocking: 'blocking', 'needs-work': 'needs work', clear: 'clear' };

/** Page type × site. Each cell: verdict dot · failing elements · rules firing; the cell is the link to the detail. */
export function PagesMatrixClient({
  byRun,
  pageOrder,
}: {
  byRun: Record<string, Record<Brand, Record<string, MatrixCell>>>;
  pageOrder: string[];
}) {
  const { currentKey, brands: BRANDS } = useRuns();
  const now = byRun[currentKey];
  if (!now) return <p className="text-sm text-muted">No scan data for this run.</p>;

  return (
    <section aria-labelledby="by-page">
      <SectionHead
        chapter={false}
        id="by-page"
        title={`${pageOrder.length} page types per site`}
        note="Failing elements · rules firing · a dot is the page’s verdict. Click a cell for the detail with sample markup. A variant tag means the URL serves more than one document, so its numbers move between runs on their own."
      />
      <Table label="Failing elements by page type">
        <THead>
          <tr>
            <Th className="w-[34%]">Page type</Th>
            {BRANDS.map((b) => (
              <Th key={b} align="right">{BRAND_LABEL[b]}</Th>
            ))}
          </tr>
        </THead>
        <TBody>
          {pageOrder.map((key) => (
            <tr key={key}>
              <th scope="row" className="h-9 border-b border-rule px-3 text-left align-middle font-normal">
                {PAGE_LABEL[key] ?? key} <span className="ml-1.5 font-mono text-[11px] text-faint">{key}</span>
              </th>
              {BRANDS.map((brand) => (
                <Td key={brand} align="right" className="font-mono text-xs tnum">
                  <Cell cell={now[brand]?.[key] ?? { kind: 'absent' }} href={`/runs/pages/${brand}/${key}`} brand={brand} pageKey={key} />
                </Td>
              ))}
            </tr>
          ))}
        </TBody>
      </Table>
      <p className="mt-2 flex flex-wrap gap-4 px-1 text-[11.5px] text-muted">
        <span><StatusDot tone="bad" className="mr-1.5" />blocking</span>
        <span><StatusDot tone="serious" className="mr-1.5" />needs work</span>
        <span><StatusDot tone="ok" className="mr-1.5" />clear</span>
        <span><StatusDot tone="na" className="mr-1.5" />failed / not in this run</span>
      </p>
    </section>
  );
}

function Cell({
  cell,
  href,
  brand,
  pageKey,
}: {
  cell: MatrixCell;
  href: string;
  brand: Brand;
  pageKey: string;
}) {
  if (cell.kind === 'absent') return <span className="text-faint" title="Not part of this run">—</span>;
  if (cell.kind === 'failed') {
    return (
      <Link
        href={href}
        className="text-faint hover:underline"
        title={cell.error}
        aria-label={`${BRAND_LABEL[brand]} ${PAGE_LABEL[pageKey] ?? pageKey}: failed to load — ${cell.error}`}
      >
        <StatusDot tone="na" className="mr-2" />failed to load
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 hover:underline underline-offset-2"
      title={`${VERDICT_TEXT[cell.verdict]} — open page detail`}
      aria-label={`${BRAND_LABEL[brand]} ${PAGE_LABEL[pageKey] ?? pageKey}: ${cell.nodes} failing elements, ${cell.rules} rule${cell.rules === 1 ? '' : 's'}, ${VERDICT_TEXT[cell.verdict]} — open page detail`}
    >
      <StatusDot tone={VERDICT_DOT[cell.verdict]} />
      <span className={cell.verdict === 'blocking' ? 'font-medium text-critical' : 'text-ink'}>{cell.nodes}</span>
      <span className="text-[11px] text-faint">{cell.rules} rule{cell.rules === 1 ? '' : 's'}</span>
      {/*
        This URL serves more than one document, so the figure beside it is
        only meaningful with the variant attached. Shown, not footnoted: two
        staging runs an hour apart read 47 and 28 on this page with nothing
        deployed, purely because the content test served a different hero.
      */}
      {cell.identity ? (
        <span
          title={`${cell.identity.key}: ${cell.identity.value ?? 'could not be identified'} — this URL serves more than one document, so its figures move between runs on their own.`}
          className="rounded-[5px] border border-serious/35 bg-serious/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-serious"
        >
          {cell.identity.value ?? 'variant unknown'}
        </span>
      ) : null}
    </Link>
  );
}
