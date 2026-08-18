'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';

import { makeDelta, PROBE_CHECKS } from '@/lib/aggregate';
import { impactTone } from '@/lib/format';
import { BRAND_LABEL, BRAND_SHORT, PAGE_LABEL, type Brand } from '@/lib/model';
import { ruleMeta, type Impact } from '@/lib/rules';
import { DeltaChip } from './Primitives';
import { useRuns } from './RunContext';
import { SectionHead } from './ui/SectionHead';
import { StatusDot, type DotTone } from './ui/StatusDot';
import { GroupRow, NumCell, Table, TBody, Td, Th, THead } from './ui/Table';
import { Tag } from './ui/Tag';

export interface RulesRunData {
  totals: Record<Brand, Record<string, number>>;
  perPage: Record<Brand, Record<string, Record<string, number>>>;
  pageKeys: Record<Brand, string[]>;
  probeTotals: Record<Brand, Record<string, number>>;
  probePerPage: Record<Brand, Record<string, Record<string, number>>>;
  hasProbes: boolean;
}

const IMPACT_DOT: Record<Impact, DotTone> = {
  critical: 'bad',
  serious: 'serious',
  moderate: 'moderate',
  minor: 'na',
};

/**
 * One table, two groups: the standard rulebook and the checks only this scanner
 * performs. Colour is by impact, not by count. Expand a row for the page types
 * that carry it.
 */
export function RulesClient({
  byRun,
  ruleIds,
  pageOrder,
}: {
  byRun: Record<string, RulesRunData>;
  ruleIds: string[];
  pageOrder: string[];
}) {
  const { currentKey, compareKey, current, brands: BRANDS } = useRuns();
  /**
   * The first check is open on landing and the rest are closed.
   *
   * Sixteen open panels is what the issues table wants — each one is an
   * argument someone should read. This table is a list of figures, and one
   * opened panel is enough to show that a row has a per-page breakdown behind
   * it without burying the list it belongs to.
   */
  const [open, setOpen] = useState<string | null>(ruleIds[0] ?? null);

  const now = byRun[currentKey];
  const before = compareKey ? byRun[compareKey] ?? null : null;
  if (!now) return <p className="text-sm text-muted">No scan data for this run.</p>;

  const cols = 1 + BRANDS.length;

  return (
    <section aria-labelledby="by-check">
      <SectionHead
        chapter={false}
        id="by-check"
        title="Failing elements per check"
        note="Colour is by impact, not by count. Click a row for the page types that carry it · drifts = small movement between scans is normal."
      />

      <Table label="Failing elements per check">
        <THead>
          <tr>
            <Th className="w-[56%]">Check</Th>
            {BRANDS.map((b) => (
              <Th key={b} align="right">
                {BRAND_LABEL[b]}
              </Th>
            ))}

          </tr>
        </THead>
        <TBody>
          <GroupRow colSpan={cols} variant="note">
            Standard rulebook — axe-core
          </GroupRow>
          {ruleIds.map((id) => {
            const meta = ruleMeta(id);
            return (
              <Fragment key={id}>
                <tr
                  onClick={() => setOpen(open === id ? null : id)}
                  className={`cursor-pointer border-t-[3px] border-rule transition-colors ${
                    open === id ? 'bg-white/[0.045] hover:bg-white/[0.06]' : 'hover:bg-paper/60'
                  }`}
                >
                  <Td className={open === id ? 'h-11 border-b-0' : ''}>
                    <span className="mr-1.5 inline-flex w-3 justify-center text-faint">
                      <Caret open={open === id} />
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(open === id ? null : id);
                      }}
                      aria-expanded={open === id}
                      aria-controls={open === id ? `rule-panel-${id}` : undefined}
                      className="text-left font-medium hover:underline underline-offset-2"
                    >
                      <StatusDot tone={IMPACT_DOT[meta.impact]} className="mr-2" />
                      {meta.label}
                    </button>
                    <span className="ml-2 font-mono text-[11px] text-faint">{id}</span>
                    {!meta.exact ? <Tag className="ml-1.5" title="Small run-to-run drift on this rule is content churn, not a regression">drifts</Tag> : null}
                  </Td>
                  {BRANDS.map((brand) => {
                    const value = now.totals[brand]?.[id] ?? 0;
                    const prev = before ? before.totals[brand]?.[id] ?? 0 : null;
                    const misleading = (meta.misleadingZeroOn ?? []).includes(brand) && value === 0;
                    return (
                      <NumCell
                        key={brand}
                        tone={impactTone(meta.impact, value, misleading)}
                        text={value.toLocaleString()}
                        className={open === id ? 'border-b-0' : ''}
                      >
                        {before ? <DeltaChip delta={makeDelta(value, prev, meta.exact, id)} className="ml-2" /> : null}
                      </NumCell>
                    );
                  })}
                </tr>
                {open === id ? (
                  <PerPageRow
                    id={`rule-panel-${id}`}
                    cols={cols}
                    perPage={(brand) => now.perPage[brand]?.[id] ?? {}}
                    scanned={(brand, key) => now.pageKeys[brand]?.includes(key) ?? false}
                    pageOrder={pageOrder}
                    note="A dot means the rule did not fire on that page. Counts aggregate by rule and page type only — class-name hashes change on every deploy, so individual elements aren't tracked between runs."
                  />
                ) : null}
              </Fragment>
            );
          })}

          <GroupRow colSpan={cols} variant="note">
            Scanner checks — controls and links checked directly in the browser; no standard rule covers these
          </GroupRow>
          {!now.hasProbes ? (
            <tr>
              <Td colSpan={cols} className="text-muted">
                This run predates these checks. Their absence is not a zero — take a new scan.
              </Td>
            </tr>
          ) : (
            PROBE_CHECKS.map((check) => (
              <Fragment key={check.id}>
                <tr
                  onClick={() => setOpen(open === check.id ? null : check.id)}
                  className={`cursor-pointer border-t-[3px] border-rule transition-colors ${
                    open === check.id ? 'bg-white/[0.045] hover:bg-white/[0.06]' : 'hover:bg-paper/60'
                  }`}
                >
                  <Td className={open === check.id ? 'h-11 border-b-0' : ''}>
                    <span className="mr-1.5 inline-flex w-3 justify-center text-faint">
                      <Caret open={open === check.id} />
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(open === check.id ? null : check.id);
                      }}
                      aria-expanded={open === check.id}
                      aria-controls={open === check.id ? `probe-panel-${check.id}` : undefined}
                      className="text-left font-medium hover:underline underline-offset-2"
                    >
                      <StatusDot tone={IMPACT_DOT[check.impact]} className="mr-2" />
                      {check.label}
                    </button>
                    {check.id === 'clickable-no-role' ? <Tag className="ml-1.5" title={check.note}>not a target</Tag> : null}
                  </Td>
                  {BRANDS.map((brand) => {
                    const value = now.probeTotals[brand]?.[check.id] ?? 0;
                    const prev = before?.hasProbes ? before.probeTotals[brand]?.[check.id] ?? 0 : null;
                    return (
                      <NumCell
                        key={brand}
                        tone={impactTone(check.impact, value, false)}
                        text={value.toLocaleString()}
                        className={open === check.id ? 'border-b-0' : ''}
                      >
                        {before?.hasProbes ? <DeltaChip delta={makeDelta(value, prev, true, check.id)} className="ml-2" /> : null}
                      </NumCell>
                    );
                  })}
                </tr>
                {open === check.id ? (
                  <PerPageRow
                    id={`probe-panel-${check.id}`}
                    cols={cols}
                    perPage={(brand) => now.probePerPage[brand]?.[check.id] ?? {}}
                    scanned={(brand, key) => now.pageKeys[brand]?.includes(key) ?? false}
                    pageOrder={pageOrder}
                    note={check.note}
                  />
                ) : null}
              </Fragment>
            ))
          )}
        </TBody>
      </Table>
    </section>
  );
}

/** The per-page breakdown under an expanded row: brands down, page types across, cells link to the page detail. */
/** Same marker as the issues table: on the left, pointing down when open. */
function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      aria-hidden="true"
      className={`transition-transform ${open ? 'rotate-90' : ''}`}
    >
      <path d="M2 1l4 3-4 3z" fill="currentColor" />
    </svg>
  );
}

function PerPageRow({
  id,
  cols,
  perPage,
  scanned,
  pageOrder,
  note,
}: {
  /** What the row's toggle points `aria-controls` at. */
  id: string;
  cols: number;
  perPage: (brand: Brand) => Record<string, number>;
  scanned: (brand: Brand, key: string) => boolean;
  pageOrder: string[];
  note: string;
}) {
  const { brands: BRANDS } = useRuns();
  return (
    <tr id={id}>
      {/* Same equal top/bottom as the issues table — see IssuesTable. */}
      <Td colSpan={cols} className="h-auto border-b-0 bg-paper/50 py-6 pl-9 pr-4">
        <div className="overflow-x-auto rounded-card border border-rule bg-card">
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr>
                <th scope="col" className="border-b border-rule px-2.5 py-1.5 text-left font-medium text-faint" />
                {pageOrder.map((key) => (
                  <th key={key} scope="col" className="border-b border-rule px-2.5 py-1.5 text-right font-medium text-faint" title={PAGE_LABEL[key] ?? key}>
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BRANDS.map((brand) => (
                <tr key={brand}>
                  <th scope="row" className="px-2.5 py-1.5 text-left font-normal text-ink">{BRAND_LABEL[brand]}</th>
                  {pageOrder.map((key) => {
                    const n = perPage(brand)[key];
                    return (
                      <td key={key} className="px-2.5 py-1.5 text-right font-mono tnum">
                        {!scanned(brand, key) ? (
                          <span className="text-faint" title="Page not present in this run">n/a</span>
                        ) : n ? (
                          <Link href={`/runs/pages/${brand}/${key}`} className="text-ink underline decoration-rule underline-offset-2 hover:decoration-accent" title={`${PAGE_LABEL[key] ?? key} — open page detail`}>
                            {n}
                          </Link>
                        ) : (
                          <span className="text-faint">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[11.5px] text-faint">{note}</p>
      </Td>
    </tr>
  );
}
