'use client';

import Link from 'next/link';
import { Fragment } from 'react';

import { makeDelta, SCORECARD_GROUPS, type ScorecardRow } from '@/lib/aggregate';
import { cellTone, formatCount } from '@/lib/format';
import { BRAND_LABEL, BRANDS, type Brand } from '@/lib/model';
import { DeltaChip } from '../Primitives';
import { StatusDot } from '../ui/StatusDot';
import { GroupRow, NumCell, Table, TBody, Td, Th, THead } from '../ui/Table';
import type { OverviewBrandSnapshot } from './types';

/**
 * Metric × site, against target. One table, two groups, colour only where a
 * target is missed. Delta chips appear only when the context bar has a
 * comparison run selected — never a column of dashes.
 */
export function Scorecard({
  now,
  before,
}: {
  now: Record<Brand, OverviewBrandSnapshot>;
  before: Record<Brand, OverviewBrandSnapshot> | null;
}) {
  const rows = now[BRANDS[0]].scorecard.filter((r) => r.inScope);
  const groups = groupRows(rows);
  const cols = 2 + BRANDS.length;
  const failed = BRANDS.reduce((n, b) => n + now[b].failed.length, 0);

  return (
    <section aria-labelledby="against-target">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="against-target" className="text-sm font-semibold text-ink">
          Against target
        </h2>
        <p className="text-xs text-faint">
          Colour only where a target is missed · n/m = the check can’t fire on this site’s markup
        </p>
      </div>

      <Table label="Against target">
        <THead>
          <tr>
            <Th className="w-[44%]">Metric</Th>
            {BRANDS.map((b) => (
              <Th key={b} align="right">
                {BRAND_LABEL[b]}
              </Th>
            ))}
            <Th align="right" className="w-24">
              Target
            </Th>
          </tr>
        </THead>
        <TBody>
          {groups.map((g) => (
            <Fragment key={g.title}>
              <GroupRow colSpan={cols}>{g.title}</GroupRow>
              {g.rows.map((row) => (
                <tr key={row.key}>
                  <Td>{row.label}</Td>
                  {BRANDS.map((brand) => {
                    const cell = now[brand].scorecard.find((r) => r.key === row.key) ?? row;
                    const prev =
                      before?.[brand]?.scorecard.find((r) => r.key === row.key)?.value ?? null;
                    return (
                      <BrandCell key={brand} cell={cell} previous={prev} showDelta={before !== null} />
                    );
                  })}
                  <Td align="right" className="font-mono text-xs text-faint tnum">
                    {row.target === null ? '–' : row.higherIsBetter ? 'all' : row.target}
                  </Td>
                </tr>
              ))}
            </Fragment>
          ))}
        </TBody>
      </Table>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 px-1 text-xs text-muted">
        <span>
          Targets met:{' '}
          {BRANDS.map((b, i) => (
            <Fragment key={b}>
              {i > 0 ? ' · ' : ''}
              <span className="font-medium text-ink">
                {BRAND_LABEL[b]} {now[b].passRatio.passed} of {now[b].passRatio.total}
              </span>
            </Fragment>
          ))}
        </span>
        <span>
          Failing elements, in-scope rules:{' '}
          {BRANDS.map((b, i) => (
            <Fragment key={b}>
              {i > 0 ? ' · ' : ''}
              <span className="font-medium text-ink tnum">{now[b].inScopeNodes}</span>
            </Fragment>
          ))}{' '}
          <span className="text-faint">(volume — moves between scans)</span>
        </span>
        {failed > 0 ? (
          <span className="text-muted">
            <StatusDot tone="bad" className="mr-1.5" />
            {failed} page{failed === 1 ? '' : 's'} failed to load —{' '}
            <Link href="/runs/pages" className="underline underline-offset-2">
              By page
            </Link>
          </span>
        ) : null}
      </div>
    </section>
  );
}

function groupRows(rows: ScorecardRow[]): Array<{ title: string; rows: ScorecardRow[] }> {
  const filed = new Set<string>();
  const groups = SCORECARD_GROUPS.map((g) => ({
    title: g.title,
    rows: g.keys
      .map((k) => rows.find((r) => r.key === k))
      .filter((r): r is ScorecardRow => {
        if (!r) return false;
        filed.add(r.key);
        return true;
      }),
  })).filter((g) => g.rows.length > 0);
  const other = rows.filter((r) => !filed.has(r.key));
  if (other.length) groups.push({ title: 'Other', rows: other });
  return groups;
}

function BrandCell({
  cell,
  previous,
  showDelta,
}: {
  cell: ScorecardRow;
  previous: number | null;
  showDelta: boolean;
}) {
  const tone = cellTone({
    value: cell.value,
    target: cell.target,
    higherIsBetter: cell.higherIsBetter,
    notMeasured: cell.notMeasured,
    misleadingZero: cell.misleadingZero,
  });
  // Rows with a target count discrete defects, so any movement is signal; the
  // no-target rows (region, contrast) drift with content churn.
  const exact = cell.target !== null;
  const delta = showDelta ? makeDelta(cell.value, previous, exact, cell.key) : null;
  return (
    <NumCell tone={tone} text={formatCount(cell.value, cell.target, cell.higherIsBetter)}>
      {delta ? (
        <DeltaChip delta={delta} higherIsBetter={cell.higherIsBetter} className="ml-2" />
      ) : null}
    </NumCell>
  );
}
