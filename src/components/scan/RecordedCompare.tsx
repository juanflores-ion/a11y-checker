'use client';

import { useEffect, useState } from 'react';

import { diffPages, summariseDiff, type PageDiff } from '@/lib/compare';
import { ENVIRONMENT_LABEL, type Environment } from '@/lib/environment';
import {
  BRANDS,
  BRAND_LABEL,
  PAGE_LABEL,
  VIEWPORT_LABEL,
  type Brand,
  type BrandResults,
  type PageResult,
  type ViewportName,
} from '@/lib/model';
import { CompareCard } from '../CompareCard';

import { SectionHead } from '../ui/SectionHead';
import { Arrow } from '../Primitives';

interface RunIndexEntry {
  id: string;
  startedAt: string;
  label: string | null;
  environment: Environment;
  viewports: ViewportName[];
  primaryViewport: ViewportName;
  probeVersion: string | null;
  browserVersion: string | null;
}

interface FullRun extends RunIndexEntry {
  byViewport: Partial<Record<ViewportName, BrandResults>>;
}

/**
 * Compare two runs that were already recorded.
 *
 * The live Before/after answers "is staging different from production right
 * now", which on 18 Aug 2026 turned out to be the wrong question: with no
 * fixes deployed it still reported two checks "resolved", because cd-preview
 * serves different content from www. Environment differences and fixes were
 * indistinguishable.
 *
 * Two recorded runs of the *same* environment separate them: the only thing
 * that changed between staging-then and staging-now is the deploy. It also
 * works with no scanner running at all, because both sides are committed data.
 */
export function RecordedCompare() {
  const [index, setIndex] = useState<RunIndexEntry[] | null>(null);
  const [beforeId, setBeforeId] = useState('');
  const [afterId, setAfterId] = useState('');
  const [viewport, setViewport] = useState<ViewportName | ''>('');
  /**
   * One site at a time. Both brands together is twenty rows of two unrelated
   * websites, and the page name alone ("Home", "Policy") repeats down the list
   * with nothing to tell the two apart.
   */
  const [site, setSite] = useState<Brand>(BRANDS[0]);
  const [runs, setRuns] = useState<{ before: FullRun; after: FullRun } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/runs', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { runs?: RunIndexEntry[] } | null) => {
        const list = body?.runs ?? [];
        setIndex(list);
        /**
         * Default to the newest pair that shares an environment. Offering a
         * prod run against a staging one as the default would hand the reader
         * the exact comparison this view exists to stop them making.
         */
        for (let i = list.length - 1; i >= 0; i -= 1) {
          const mate = list.slice(0, i).reverse().find((r) => r.environment === list[i].environment);
          if (mate) {
            setAfterId(list[i].id);
            setBeforeId(mate.id);
            break;
          }
        }
      })
      .catch(() => setIndex([]));
  }, []);

  const before = index?.find((r) => r.id === beforeId) ?? null;
  const after = index?.find((r) => r.id === afterId) ?? null;
  const mismatch = before && after && before.environment !== after.environment;
  const shared = before && after ? before.viewports.filter((v) => after.viewports.includes(v)) : [];
  const chosenViewport = viewport && shared.includes(viewport as ViewportName) ? (viewport as ViewportName) : shared[0];

  async function load() {
    if (!before || !after) return;
    setBusy(true);
    setError(null);
    setRuns(null);
    try {
      const [b, a] = await Promise.all(
        [before.id, after.id].map((id) =>
          fetch(`/api/runs?id=${encodeURIComponent(id)}`, { cache: 'no-store' }).then((r) => {
            if (!r.ok) throw new Error(`Could not load run ${id}`);
            return r.json() as Promise<FullRun>;
          })
        )
      );
      setRuns({ before: b, after: a });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rows = runs && chosenViewport ? buildRows(runs.before, runs.after, chosenViewport, site) : [];

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-rule bg-card p-5 shadow-card">
        {/*
          Scope above the pair. Site and Device are filters, not halves of the
          comparison, and on one line with the two run pickers they read as
          equal partners in it: five controls at three widths, and their labels
          on two different baselines.
        */}
        <div className="flex flex-wrap items-end gap-3 border-b border-rule pb-4">
          <label className="text-xs text-muted">
            Site
            <select
              value={site}
              onChange={(e) => setSite(e.target.value as Brand)}
              className="mt-1 block appearance-none rounded-[7px] border border-rule bg-card py-1.5 pl-2.5 pr-7 font-mono text-xs text-ink hover:border-accent"
            >
              {BRANDS.map((b) => (
                <option key={b} value={b}>
                  {BRAND_LABEL[b]}
                </option>
              ))}
            </select>
          </label>
          {shared.length > 1 ? (
            <label className="text-xs text-muted">
              Device
              <select
                value={chosenViewport}
                onChange={(e) => setViewport(e.target.value as ViewportName)}
                className="mt-1 block appearance-none rounded-[7px] border border-rule bg-card py-1.5 pl-2.5 pr-7 font-mono text-xs text-ink hover:border-accent"
              >
                {shared.map((v) => (
                  <option key={v} value={v}>
                    {VIEWPORT_LABEL[v]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <RunPicker
            label="Before"
            value={beforeId}
            options={index ?? []}
            onChange={setBeforeId}
          />
          <RunPicker label="After" value={afterId} options={index ?? []} onChange={setAfterId} />
          <button
            type="button"
            onClick={load}
            disabled={busy || !before || !after || !!mismatch || !chosenViewport}
            className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-paper shadow-card hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? 'Loading…' : 'Compare'}
          </button>
        </div>

        {index !== null && index.length < 2 ? (
          <p className="mt-4 text-sm text-muted">
            Only {index.length} run on file. Record another with <strong>Full run</strong>. A
            staging run needs a scanner inside the network.
          </p>
        ) : null}

        {mismatch ? (
          <p role="alert" className="mt-4 rounded-card border border-critical/25 bg-critical/[0.05] px-3 py-2 text-sm text-critical">
            {ENVIRONMENT_LABEL[before!.environment]} against {ENVIRONMENT_LABEL[after!.environment]} is
            not a comparison. The two deployments serve different content, so every difference
            would read as a change somebody made. Pick two runs of the same environment.
          </p>
        ) : null}

        {/*
          Two runs a week apart can differ by the instrument as well as by the
          site. Both stamps are on every run precisely so this can be said out
          loud rather than discovered afterwards.
        */}
        {before && after && !mismatch && before.probeVersion !== after.probeVersion ? (
          <p className="mt-4 text-xs text-serious">
            Different scanner versions ({before.probeVersion ?? 'not recorded'}{' '}
            <Arrow className="mx-0.5" />{' '}
            {after.probeVersion ?? 'not recorded'}). Some movement may be the scanner, not the site.
          </p>
        ) : null}
        {before && after && !mismatch && before.browserVersion !== after.browserVersion ? (
          <p className="mt-2 text-xs text-serious">
            Different browsers ({before.browserVersion ?? 'not recorded'}{' '}
            <Arrow className="mx-0.5" />{' '}
            {after.browserVersion ?? 'not recorded'}). A browser upgrade can move counts on its own.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-4 text-sm text-critical">
            {error}
          </p>
        ) : null}
      </section>

      {rows.length > 0 ? (
        <section>
          <SectionHead
            chapter={false}
            title={`${BRAND_LABEL[site]} · ${rows.length} page${rows.length === 1 ? '' : 's'} compared`}
            note={`${ENVIRONMENT_LABEL[runs!.before.environment]} · ${stamp(runs!.before)} against ${stamp(runs!.after)} · ${VIEWPORT_LABEL[chosenViewport!]}. Click a row for the full comparison.`}
          />
          <div className="overflow-hidden rounded-lg border border-rule bg-card shadow-card">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-rule bg-paper/60 px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-faint">
              <span>Page</span>
              <span className="text-right">Before</span>
              <span className="text-right">After</span>
              <span className="w-24 text-right">Change</span>
            </div>
            {rows.map((row) => (
              <div key={row.key} className="border-b border-rule/70 last:border-b-0">
                <button
                  type="button"
                  onClick={() => setOpen(open === row.key ? null : row.key)}
                  aria-expanded={open === row.key}
                  className="grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <span className="text-sm text-ink">
                    {row.title}
                    <span className="ml-2 font-mono text-[11px] text-faint">{row.verdictWord}</span>
                  </span>
                  <span className="text-right font-mono text-xs text-muted tnum">{row.before}</span>
                  <span className="text-right font-mono text-xs text-muted tnum">{row.after}</span>
                  <span
                    className={`w-24 text-right font-mono text-xs tnum ${
                      row.change === null
                        ? 'text-faint'
                        : row.change < 0
                        ? 'text-good'
                        : row.change > 0
                        ? 'text-critical'
                        : 'text-faint'
                    }`}
                  >
                    {row.change === null
                      ? 'not comparable'
                      : row.change === 0
                      ? 'no change'
                      : `${row.change > 0 ? '+' : ''}${row.change}`}
                  </span>
                </button>
                {open === row.key ? (
                  <div className="border-t border-rule bg-paper/40 p-4">
                    <CompareCard diff={row.diff} title={row.title} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : runs ? (
        <p className="text-sm text-muted">
          Neither run measured a {BRAND_LABEL[site]} page at{' '}
          {VIEWPORT_LABEL[chosenViewport ?? 'desktop']}.
        </p>
      ) : null}
    </div>
  );
}

function stamp(run: FullRun): string {
  const when = new Date(run.startedAt).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return run.label ? `${when} (${run.label})` : when;
}

function RunPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: RunIndexEntry[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="block text-xs text-muted">
      <span className="font-medium text-ink">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full appearance-none rounded-card border border-rule bg-paper px-2.5 py-2 text-sm text-ink hover:border-accent"
      >
        <option value="">Pick a run…</option>
        {[...options].reverse().map((r) => (
          <option key={r.id} value={r.id}>
            {ENVIRONMENT_LABEL[r.environment]} · {new Date(r.startedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            {r.label ? ` · ${r.label}` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

interface Row {
  key: string;
  title: string;
  diff: PageDiff;
  before: string;
  after: string;
  change: number | null;
  verdictWord: string;
}

/** One row per page type of the chosen site that both runs measured at this viewport. */
function buildRows(before: FullRun, after: FullRun, viewport: ViewportName, site: Brand): Row[] {
  const rows: Row[] = [];
  const b = before.byViewport[viewport];
  const a = after.byViewport[viewport];
  if (!b || !a) return rows;

  const bPages: Record<string, PageResult> = b[site] ?? {};
  const aPages: Record<string, PageResult> = a[site] ?? {};
  const keys = [...new Set([...Object.keys(bPages), ...Object.keys(aPages)])];
  for (const key of keys) {
    const bp = bPages[key] ?? null;
    const ap = aPages[key] ?? null;
    if (!bp && !ap) continue;
    const diff = diffPages(bp?.url ?? '', ap?.url ?? '', bp, ap, {
      before: viewport,
      after: viewport,
    });
    const summary = summariseDiff(diff);
    rows.push({
      key: `${site}-${key}`,
      title: PAGE_LABEL[key] ?? key,
      diff,
      before: diff.totalBefore === null ? 'n/m' : String(diff.totalBefore),
      after: diff.totalAfter === null ? 'n/m' : String(diff.totalAfter),
      change: diff.totalChange,
      verdictWord:
        summary.verdict === 'better'
          ? 'better'
          : summary.verdict === 'worse'
          ? 'worse'
          : summary.verdict === 'same'
          ? ''
          : 'not comparable',
    });
  }
  // Biggest movement first; pages that did not move sink to the bottom.
  rows.sort((x, y) => Math.abs(y.change ?? 0) - Math.abs(x.change ?? 0));
  return rows;
}
