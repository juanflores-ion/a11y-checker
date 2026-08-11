'use client';

import Link from 'next/link';

import { makeDelta, type ScorecardRow } from '@/lib/aggregate';
import { BRAND_LABEL, BRANDS, type Brand, type PhantomMenu } from '@/lib/model';
import { ruleMeta } from '@/lib/rules';
import { PhantomPanel } from './PhantomPanel';
import { DeltaChip, Eyebrow, Sparkline } from './Primitives';
import { useRuns } from './RunContext';

export interface BrandSnapshot {
  totalNodes: number;
  inScopeNodes: number;
  impacts: { critical: number; serious: number; moderate: number; minor: number };
  ruleTotals: Record<string, number>;
  phantom: PhantomMenu | null;
  pagesWithMenu: number;
  scorecard: ScorecardRow[];
  passRatio: { passed: number; total: number };
  mainCoverage: { withMain: number; scanned: number };
  nameless: { buttons: number; links: number; emptyHref: number };
  navReach: { total: number; inTree: number; hidden: number };
  failed: Array<{ key: string; url: string; error: string }>;
}

type Snapshots = Record<string, Record<string, BrandSnapshot>>;

export function OverviewClient({
  snapshots,
  runOrder,
}: {
  snapshots: Snapshots;
  runOrder: string[];
}) {
  const { currentId, currentKey, compareKey, current, compare, runs } = useRuns();

  if (runs.length === 0) {
    return <EmptyState />;
  }

  const now = snapshots[currentKey];
  const before = compareKey ? snapshots[compareKey] : null;
  if (!now) return <EmptyState />;

  // Sparkline covers every run up to and including the one being viewed.
  const upTo = runOrder.slice(0, runOrder.indexOf(currentId) + 1);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
          Measurements already taken
        </h1>
        <p className="mt-1 max-w-measure text-sm leading-relaxed text-muted">
          Every figure the scanner produced, run over run. For what these numbers mean and
          what&apos;s being done about them, see{' '}
          <Link href="/" className="text-accent underline underline-offset-2">
            Overview
          </Link>
          . To take a new measurement, use{' '}
          <Link href="/measure" className="text-accent underline underline-offset-2">
            Measure
          </Link>
          .
        </p>
      </div>

      <section>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-xl font-semibold tracking-tight">Where we are</h2>
          <p className="text-sm text-muted">
            {current?.display}
            {current?.label ? ` · ${current.label}` : ''}
            {compare ? ` · compared to ${compare.display}${compare.label ? ` (${compare.label})` : ''}` : ' · no comparison selected'}
          </p>
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {BRANDS.map((brand) => (
            <BrandCard
              key={brand}
              brand={brand}
              snapshot={now[brand]}
              previous={before?.[brand] ?? null}
              series={upTo.map((id) => snapshots[id]?.[brand]?.inScopeNodes ?? 0)}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold tracking-tight">
          The closed mobile menu
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          One shared component per brand, and the single finding that most directly blocks an
          agent. It is counted once per brand, not summed across pages.
        </p>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {BRANDS.map((brand) => (
            <div key={brand}>
              <Eyebrow className="mb-2">{BRAND_LABEL[brand]}</Eyebrow>
              <PhantomPanel
                phantom={now[brand].phantom}
                pagesWithMenu={now[brand].pagesWithMenu}
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold tracking-tight">Against target</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          Every measured metric, side by side, with the change since the comparison run.
        </p>
        <ScorecardTable now={now} before={before} />
        <p className="mt-3 max-w-measure text-xs leading-relaxed text-muted">
          <span className="font-mono">†</span> A zero the scanner can&apos;t be trusted on.
          Insureon&apos;s equivalent controls are <code className="font-mono">&lt;div&gt;</code>s
          rather than buttons or links, so these rules structurally cannot fire on them. The
          controls are still nameless and still not keyboard-operable — Insureon is not the
          healthier of the two sites.
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BrandCard({
  brand,
  snapshot,
  previous,
  series,
}: {
  brand: Brand;
  snapshot: BrandSnapshot;
  previous: BrandSnapshot | null;
  series: number[];
}) {
  const totalDelta = makeDelta(
    snapshot.inScopeNodes,
    previous ? previous.inScopeNodes : null,
    false
  );
  const phantomNow = snapshot.phantom?.focusable ?? 0;
  const phantomDelta = makeDelta(
    phantomNow,
    previous ? previous.phantom?.focusable ?? 0 : null,
    true
  );
  const { passed, total } = snapshot.passRatio;
  const allClear = passed === total;

  return (
    <article className="rounded-card border border-rule bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>{BRAND_LABEL[brand]}</Eyebrow>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-display text-figure font-bold tnum">
              {snapshot.inScopeNodes.toLocaleString()}
            </span>
            <DeltaChip delta={totalDelta} className="text-sm" />
          </div>
          <p className="mt-1 text-sm text-muted">
            failing elements, in-scope rules
            <span className="text-faint"> · {snapshot.totalNodes.toLocaleString()} total across every rule</span>
          </p>
        </div>
        <Sparkline values={series} className="mt-1 shrink-0" />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-rule pt-4 sm:grid-cols-4">
        <Stat
          label="Critical rules"
          value={snapshot.impacts.critical}
          delta={makeDelta(snapshot.impacts.critical, previous ? previous.impacts.critical : null, true)}
          tone={snapshot.impacts.critical > 0 ? 'text-critical' : 'text-good'}
        />
        <Stat
          label="Serious rules"
          value={snapshot.impacts.serious}
          delta={makeDelta(snapshot.impacts.serious, previous ? previous.impacts.serious : null, true)}
          tone={snapshot.impacts.serious > 0 ? 'text-serious' : 'text-good'}
        />
        <Stat
          label="Dead menu controls"
          value={phantomNow}
          delta={phantomDelta}
          tone={phantomNow > 0 ? 'text-phantom' : 'text-good'}
        />
        <div>
          <Eyebrow>Targets met</Eyebrow>
          <p
            className={`mt-1 font-mono text-lg font-semibold tnum ${
              allClear ? 'text-good' : 'text-ink'
            }`}
          >
            {passed}/{total}
          </p>
          <div className="mt-1.5 flex gap-[3px]" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 w-4 ${i < passed ? 'bg-good' : 'bg-rule'}`}
              />
            ))}
          </div>
        </div>
      </div>

      {snapshot.failed.length > 0 ? (
        <div className="mt-4 rounded-card border border-critical/40 bg-critical/5 p-3">
          <Eyebrow className="text-critical">Scan failed</Eyebrow>
          <ul className="mt-1 space-y-1 text-xs text-ink">
            {snapshot.failed.map((f) => (
              <li key={f.key}>
                <span className="font-mono">{f.key}</span> — {f.error}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted">
            These pages contributed nothing to the counts above. Treat the totals as incomplete,
            not as an improvement.
          </p>
        </div>
      ) : null}

      <p className="mt-4 text-xs">
        <Link
          href={`/runs/pages/${brand}/home`}
          className="text-eyebrow font-medium text-accent underline underline-offset-2"
        >
          Page-by-page detail →
        </Link>
      </p>
    </article>
  );
}

function Stat({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: number;
  delta: ReturnType<typeof makeDelta>;
  tone: string;
}) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <p className={`mt-1 font-mono text-lg font-semibold tnum ${tone}`}>{value}</p>
      <DeltaChip delta={delta} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ScorecardTable({
  now,
  before,
}: {
  now: Record<string, BrandSnapshot>;
  before: Record<string, BrandSnapshot> | null;
}) {
  // Row shape is identical across brands, so the first brand present defines
  // the rows. A run that somehow carries neither brand renders nothing rather
  // than throwing the whole page away.
  const rows = BRANDS.map((b) => now[b]?.scorecard).find((r) => r && r.length > 0);
  if (!rows) {
    return <p className="mt-4 text-sm text-muted">No brand data in this run.</p>;
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Current value per brand against the target state, with change since the comparison run
        </caption>
        <thead>
          <tr className="border-b border-ink/25">
            <th scope="col" className="py-2 pr-4 text-left text-eyebrow font-medium text-muted">
              Metric
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
            <th scope="col" className="py-2 text-right text-eyebrow font-medium text-muted">
              Target
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-rule">
              <th scope="row" className="py-2.5 pr-4 text-left font-normal text-ink">
                {row.label}
              </th>

              {BRANDS.map((brand) => {
                const cell = now[brand].scorecard.find((r) => r.key === row.key)!;
                const prev = before
                  ? before[brand].scorecard.find((r) => r.key === row.key) ?? null
                  : null;
                return (
                  <BrandCells key={brand} cell={cell} previousValue={prev ? prev.value : null} />
                );
              })}

              <td className="py-2.5 text-right font-mono text-xs text-muted tnum">
                {row.target === null ? '—' : row.higherIsBetter ? `${row.target}` : '0'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BrandCells({
  cell,
  previousValue,
}: {
  cell: ScorecardRow;
  previousValue: number | null;
}) {
  const exact = cell.key !== 'region' && cell.key !== 'color-contrast' && cell.key !== 'link-in-text-block';
  const delta = makeDelta(cell.value, previousValue, exact);
  const meta = ruleMeta(cell.key);
  const tone =
    cell.met === true
      ? 'text-good'
      : cell.met === false
      ? meta.impact === 'critical'
        ? 'text-critical'
        : 'text-ink'
      : 'text-muted';

  return (
    <>
      <td
        className={`py-2.5 pr-1 text-right font-mono font-semibold tnum ${
          cell.misleadingZero ? 'text-muted' : tone
        }`}
        title={
          cell.misleadingZero
            ? "Zero here means the rule can't measure this control, not that it's fixed"
            : undefined
        }
      >
        {cell.notMeasured ? (
          <span
            className="text-faint"
            title="This run predates this check — not measured, not zero"
          >
            not measured
          </span>
        ) : (
          <>
            {cell.higherIsBetter ? `${cell.value}/${cell.target}` : cell.value.toLocaleString()}
            {cell.misleadingZero ? <span className="text-faint"> †</span> : null}
          </>
        )}
      </td>
      <td className="py-2.5 pr-4 text-right">
        <DeltaChip delta={delta} higherIsBetter={cell.higherIsBetter} />
      </td>
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-card border border-dashed border-rule bg-card p-8 text-center">
      <h2 className="font-display text-lg font-semibold">No scans yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
        Run the scanner and rebuild:
      </p>
      <code className="mt-3 inline-block rounded-card border border-rule bg-paper px-3 py-2 font-mono text-xs">
        node scanner/scan.mjs --out data/runs --label baseline
      </code>
    </div>
  );
}
