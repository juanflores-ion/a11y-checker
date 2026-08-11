'use client';

import Link from 'next/link';
import { useState } from 'react';

import { makeDelta, PROBE_CHECKS } from '@/lib/aggregate';
import { BRAND_LABEL, BRANDS, PAGE_LABEL, type Brand } from '@/lib/model';
import { IMPACT_TEXT, ruleMeta } from '@/lib/rules';
import { DeltaChip, ImpactDot } from './Primitives';
import { useRuns } from './RunContext';

export interface RulesRunData {
  totals: Record<string, Record<string, number>>;
  perPage: Record<string, Record<string, Record<string, number>>>;
  pageKeys: Record<string, string[]>;
  probeTotals: Record<string, Record<string, number>>;
  probePerPage: Record<string, Record<string, Record<string, number>>>;
  hasProbes: boolean;
}

export function RulesClient({
  byRun,
  ruleIds,
  pageOrder,
}: {
  byRun: Record<string, RulesRunData>;
  ruleIds: string[];
  pageOrder: string[];
}) {
  const { currentKey, compareKey, current, compare } = useRuns();
  const [open, setOpen] = useState<string | null>(null);

  const now = byRun[currentKey];
  const before = compareKey ? byRun[compareKey] : null;
  if (!now) return <p className="text-sm text-muted">No scan data for this run.</p>;

  const renderGroup = (ids: string[]) =>
    ids.map((id) => {
      const expanded = open === id;
      return (
        <RuleRows
          key={id}
          id={id}
          expanded={expanded}
          onToggle={() => setOpen(expanded ? null : id)}
          now={now}
          before={before}
          pageOrder={pageOrder}
        />
      );
    });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">Rule breakdown</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          Total failing nodes per rule for {current?.display}
          {compare ? `, against ${compare.display}` : ' — no comparison selected'}. Colour is by
          impact, not by count: one critical rule outranks sixty moderate nodes. Select a rule to
          see which page types carry it.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink/25">
              <th scope="col" className="w-1/2 py-2 pr-4 text-left text-eyebrow font-medium text-muted">
                Rule
              </th>
              {BRANDS.map((b) => (
                <th
                  key={b}
                  scope="col"
                  colSpan={2}
                  className="py-2 pr-4 text-right text-eyebrow font-medium text-muted"
                >
                  {BRAND_LABEL[b]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{renderGroup(ruleIds)}</tbody>
        </table>
      </div>

      <div>
        <h3 className="font-display text-base font-bold tracking-tight text-ink">
          Checks only this scanner performs
        </h3>
        <p className="mt-1 max-w-measure text-sm leading-relaxed text-muted">
          A rule engine can only test elements that declare what they are. These measure the
          properties directly, which is how a menu button built from a{' '}
          <code className="font-mono text-xs">&lt;div&gt;</code> gets counted at all — it is
          invisible to every check in the table above.
        </p>

        {!now.hasProbes ? (
          <p className="mt-3 rounded-card border border-dashed border-rule bg-card p-4 text-sm text-muted">
            This run predates these checks, so there is nothing to show. Their absence here is
            not a zero — take a new scan from Measure.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/25">
                  <th scope="col" className="w-1/2 py-2 pr-4 text-left text-eyebrow font-medium text-muted">
                    Check
                  </th>
                  {BRANDS.map((b) => (
                    <th
                      key={b}
                      scope="col"
                      colSpan={2}
                      className="py-2 pr-4 text-right text-eyebrow font-medium text-muted"
                    >
                      {BRAND_LABEL[b]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PROBE_CHECKS.map((check) => {
                  const expanded = open === check.id;
                  return (
                    <ProbeRows
                      key={check.id}
                      check={check}
                      expanded={expanded}
                      onToggle={() => setOpen(expanded ? null : check.id)}
                      now={now}
                      before={before?.hasProbes ? before : null}
                      pageOrder={pageOrder}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="max-w-measure text-xs leading-relaxed text-muted">
        <span className="font-mono">†</span> A zero the scanner can&apos;t be trusted on.
        Insureon&apos;s equivalent controls are <code className="font-mono">&lt;div&gt;</code>s
        rather than buttons or links, so these rules structurally cannot fire on them — the
        controls are still nameless. Read those zeros as &ldquo;not measurable&rdquo;, never as
        &ldquo;fixed&rdquo;.
      </p>
    </div>
  );
}

function ProbeRows({
  check,
  expanded,
  onToggle,
  now,
  before,
  pageOrder,
}: {
  check: (typeof PROBE_CHECKS)[number];
  expanded: boolean;
  onToggle: () => void;
  now: RulesRunData;
  before: RulesRunData | null;
  pageOrder: string[];
}) {
  return (
    <>
      <tr className="border-b border-rule">
        <th scope="row" className="py-2.5 pr-4 text-left align-top font-normal">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="group flex items-start gap-2 text-left"
          >
            <span className="mt-[7px] font-mono text-xs text-faint">{expanded ? '−' : '+'}</span>
            <span>
              <span className="flex items-center gap-2">
                <ImpactDot impact={check.impact} />
                <span className="text-ink group-hover:underline underline-offset-2">
                  {check.label}
                </span>
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-2">
                <span className={`text-eyebrow font-medium ${IMPACT_TEXT[check.impact]}`}>
                  {check.impact}
                </span>
                <span className="text-eyebrow font-medium text-phantom">our probe</span>
              </span>
            </span>
          </button>
        </th>

        {BRANDS.map((brand) => {
          const value = now.probeTotals[brand]?.[check.id] ?? 0;
          const prev = before ? before.probeTotals[brand]?.[check.id] ?? 0 : null;
          return (
            <RuleCells
              key={brand}
              value={value}
              previous={prev}
              exact
              impactClass={value > 0 ? IMPACT_TEXT[check.impact] : 'text-good'}
              misleading={false}
            />
          );
        })}
      </tr>

      {expanded ? (
        <tr className="border-b border-rule bg-paper/60">
          <td colSpan={5} className="px-0 py-4">
            <div className="px-1">
              <p className="mb-3 max-w-measure text-xs leading-relaxed text-muted">{check.note}</p>
              <table className="w-full border-collapse text-xs">
                <caption className="pb-2 text-left text-eyebrow font-medium text-muted">
                  Count by page type
                </caption>
                <thead>
                  <tr className="border-b border-rule">
                    <th scope="col" className="py-1.5 pr-3 text-left text-eyebrow font-medium text-faint">
                      Brand
                    </th>
                    {pageOrder.map((key) => (
                      <th
                        key={key}
                        scope="col"
                        className="py-1.5 pr-3 text-right text-eyebrow font-medium text-faint"
                      >
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {BRANDS.map((brand) => (
                    <tr key={brand} className="border-b border-rule/60 last:border-0">
                      <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">
                        {BRAND_LABEL[brand]}
                      </th>
                      {pageOrder.map((key) => {
                        const n = now.probePerPage[brand]?.[check.id]?.[key];
                        return (
                          <td key={key} className="py-1.5 pr-3 text-right font-mono tnum">
                            {n ? (
                              <Link
                                href={`/runs/pages/${brand as Brand}/${key}`}
                                className="text-ink underline decoration-rule underline-offset-2 hover:decoration-accent"
                                title={`${PAGE_LABEL[key] ?? key} — open page detail`}
                              >
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
          </td>
        </tr>
      ) : null}
    </>
  );
}

function RuleRows({
  id,
  expanded,
  onToggle,
  now,
  before,
  pageOrder,
}: {
  id: string;
  expanded: boolean;
  onToggle: () => void;
  now: RulesRunData;
  before: RulesRunData | null;
  pageOrder: string[];
}) {
  const meta = ruleMeta(id);

  return (
    <>
      <tr className="border-b border-rule">
        <th scope="row" className="py-2.5 pr-4 text-left font-normal align-top">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="group flex items-start gap-2 text-left"
          >
            <span className="mt-[7px] font-mono text-xs text-faint">{expanded ? '−' : '+'}</span>
            <span>
              <span className="flex items-center gap-2">
                <ImpactDot impact={meta.impact} />
                <span className="text-ink group-hover:underline underline-offset-2">
                  {meta.label}
                </span>
              </span>
              <span className="mt-0.5 flex items-center gap-2">
                <code className="font-mono text-xs text-faint">{id}</code>
                <span className={`text-eyebrow font-medium ${IMPACT_TEXT[meta.impact]}`}>
                  {meta.impact}
                </span>
                {!meta.exact ? (
                  <span className="text-eyebrow font-medium text-faint" title="Small run-to-run drift on this rule is content churn, not a regression">
                    drifts
                  </span>
                ) : null}
              </span>
            </span>
          </button>
        </th>

        {BRANDS.map((brand) => {
          const value = now.totals[brand]?.[id] ?? 0;
          const prev = before ? before.totals[brand]?.[id] ?? 0 : null;
          const misleading = (meta.misleadingZeroOn ?? []).includes(brand) && value === 0;
          return (
            <RuleCells
              key={brand}
              value={value}
              previous={prev}
              exact={meta.exact}
              impactClass={value > 0 ? IMPACT_TEXT[meta.impact] : 'text-good'}
              misleading={misleading}
            />
          );
        })}
      </tr>

      {expanded ? (
        <tr className="border-b border-rule bg-paper/60">
          <td colSpan={5} className="px-0 py-4">
            <PerPageTable id={id} now={now} pageOrder={pageOrder} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function RuleCells({
  value,
  previous,
  exact,
  impactClass,
  misleading,
}: {
  value: number;
  previous: number | null;
  exact: boolean;
  impactClass: string;
  misleading: boolean;
}) {
  return (
    <>
      <td
        className={`py-2.5 pr-1 text-right align-top font-mono font-semibold tnum ${
          misleading ? 'text-muted' : impactClass
        }`}
        title={
          misleading
            ? "Zero here means the rule can't measure this control, not that it's fixed"
            : undefined
        }
      >
        {value.toLocaleString()}
        {misleading ? <span className="text-faint"> †</span> : null}
      </td>
      <td className="py-2.5 pr-4 text-right align-top">
        <DeltaChip delta={makeDelta(value, previous, exact)} />
      </td>
    </>
  );
}

function PerPageTable({
  id,
  now,
  pageOrder,
}: {
  id: string;
  now: RulesRunData;
  pageOrder: string[];
}) {
  return (
    <div className="overflow-x-auto px-1">
      <table className="w-full border-collapse text-xs">
        <caption className="pb-2 text-left text-eyebrow font-medium text-muted">
          Nodes by page type
        </caption>
        <thead>
          <tr className="border-b border-rule">
            <th scope="col" className="py-1.5 pr-3 text-left text-eyebrow font-medium text-faint">
              Brand
            </th>
            {pageOrder.map((key) => (
              <th
                key={key}
                scope="col"
                className="py-1.5 pr-3 text-right text-eyebrow font-medium text-faint"
              >
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BRANDS.map((brand) => (
            <tr key={brand} className="border-b border-rule/60 last:border-0">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">
                {BRAND_LABEL[brand]}
              </th>
              {pageOrder.map((key) => {
                const scanned = now.pageKeys[brand]?.includes(key);
                const n = now.perPage[brand]?.[id]?.[key];
                return (
                  <td key={key} className="py-1.5 pr-3 text-right font-mono tnum">
                    {!scanned ? (
                      <span className="text-faint" title="Page not present in this run">
                        n/a
                      </span>
                    ) : n ? (
                      <Link
                        href={`/runs/pages/${brand as Brand}/${key}`}
                        className="text-ink underline decoration-rule underline-offset-2 hover:decoration-accent"
                        title={`${PAGE_LABEL[key] ?? key} — open page detail`}
                      >
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
      <p className="mt-2 px-1 text-xs text-faint">
        A dot means the rule did not fire on that page. Node counts are aggregated by rule and page
        type only — class-name hashes change on every deploy, so individual elements can&apos;t be
        tracked between runs.
      </p>
    </div>
  );
}
