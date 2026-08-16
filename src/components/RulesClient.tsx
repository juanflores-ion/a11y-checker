'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';

import { makeDelta, PROBE_CHECKS } from '@/lib/aggregate';
import { impactTone } from '@/lib/format';
import { BRAND_LABEL, BRAND_SHORT, BRANDS, PAGE_LABEL, type Brand } from '@/lib/model';
import { ruleMeta, type Impact } from '@/lib/rules';
import { DeltaChip } from './Primitives';
import { useRuns } from './RunContext';
import { StatusDot, type DotTone } from './ui/StatusDot';
import { GroupRow, NumCell, Table, TBody, Td, Th, THead } from './ui/Table';
import { Tag } from './ui/Tag';

export interface RulesRunData {
  totals: Record<string, Record<string, number>>;
  perPage: Record<string, Record<string, Record<string, number>>>;
  pageKeys: Record<string, string[]>;
  probeTotals: Record<string, Record<string, number>>;
  probePerPage: Record<string, Record<string, Record<string, number>>>;
  impacts: Record<string, Record<Impact, number>>;
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
  const { currentKey, compareKey, current } = useRuns();
  const [open, setOpen] = useState<string | null>(null);

  const now = byRun[currentKey];
  const before = compareKey ? byRun[compareKey] ?? null : null;
  if (!now) return <p className="text-sm text-muted">No scan data for this run.</p>;

  const cols = 2 + BRANDS.length;
  const firing = BRANDS.map(
    (b) =>
      `${BRAND_SHORT[b]} ${now.impacts[b].critical} critical · ${now.impacts[b].serious} serious · ${now.impacts[b].moderate} moderate`
  ).join(' — ');

  return (
    <section aria-labelledby="by-check">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="by-check" className="text-sm font-semibold text-ink">
          Failing elements per check
        </h2>
        <p className="text-xs text-faint">
          Colour is by impact, not by count · expand a row for the page types that carry it · drifts = small movement between scans is normal
        </p>
      </div>

      <Table>
        <THead>
          <tr>
            <Th className="w-[52%]">Check</Th>
            {BRANDS.map((b) => (
              <Th key={b} align="right">
                {BRAND_LABEL[b]}
              </Th>
            ))}
            <Th className="w-8">
              <span className="sr-only">Detail</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <GroupRow colSpan={cols}>
            Standard rulebook — axe-core {current?.axeVersion ?? 'version not recorded'} · rules firing: {firing}
          </GroupRow>
          {ruleIds.map((id) => {
            const meta = ruleMeta(id);
            return (
              <Fragment key={id}>
                <tr>
                  <Td>
                    <button type="button" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id} className="text-left hover:underline underline-offset-2">
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
                      <NumCell key={brand} tone={impactTone(meta.impact, value, misleading)} text={value.toLocaleString()}>
                        {before ? <DeltaChip delta={makeDelta(value, prev, meta.exact, id)} className="ml-2" /> : null}
                      </NumCell>
                    );
                  })}
                  <Chevron open={open === id} onClick={() => setOpen(open === id ? null : id)} />
                </tr>
                {open === id ? (
                  <PerPageRow
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

          <GroupRow colSpan={cols}>
            Our checks — properties a rule engine can’t see, measured directly · probe {current?.probeVersion ?? 'version not recorded'}
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
                <tr>
                  <Td>
                    <button type="button" onClick={() => setOpen(open === check.id ? null : check.id)} aria-expanded={open === check.id} className="text-left hover:underline underline-offset-2">
                      <StatusDot tone={IMPACT_DOT[check.impact]} className="mr-2" />
                      {check.label}
                    </button>
                    <Tag tone="phantom" className="ml-2">our probe</Tag>
                    {check.id === 'clickable-no-role' ? <Tag className="ml-1.5" title={check.note}>not a target</Tag> : null}
                  </Td>
                  {BRANDS.map((brand) => {
                    const value = now.probeTotals[brand]?.[check.id] ?? 0;
                    const prev = before?.hasProbes ? before.probeTotals[brand]?.[check.id] ?? 0 : null;
                    return (
                      <NumCell key={brand} tone={impactTone(check.impact, value, false)} text={value.toLocaleString()}>
                        {before?.hasProbes ? <DeltaChip delta={makeDelta(value, prev, true, check.id)} className="ml-2" /> : null}
                      </NumCell>
                    );
                  })}
                  <Chevron open={open === check.id} onClick={() => setOpen(open === check.id ? null : check.id)} />
                </tr>
                {open === check.id ? (
                  <PerPageRow
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

function Chevron({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <Td align="right" className="text-faint">
      <button type="button" onClick={onClick} aria-label={open ? 'Collapse' : 'Expand'} tabIndex={-1}>
        <span aria-hidden="true" className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
    </Td>
  );
}

/** The per-page breakdown under an expanded row: brands down, page types across, cells link to the page detail. */
function PerPageRow({
  cols,
  perPage,
  scanned,
  pageOrder,
  note,
}: {
  cols: number;
  perPage: (brand: Brand) => Record<string, number>;
  scanned: (brand: Brand, key: string) => boolean;
  pageOrder: string[];
  note: string;
}) {
  return (
    <tr>
      <Td colSpan={cols} className="h-auto bg-paper/40 py-3 pl-9 pr-4">
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
