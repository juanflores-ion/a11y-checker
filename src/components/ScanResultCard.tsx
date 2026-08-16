import { verdictForPage, VERDICT_LABEL, type PageResult, type Verdict } from '@/lib/model';
import { IMPACT_RANK, IMPACT_TEXT, ruleMeta, sortRuleIds } from '@/lib/rules';
import { PhantomPanel } from './PhantomPanel';
import { CodeSample, Eyebrow, ImpactDot, Notice } from './Primitives';

const VERDICT_STYLE: Record<Verdict, { bar: string; text: string; blurb: string }> = {
  clear: {
    bar: 'bg-good',
    text: 'text-good',
    blurb: 'No critical or serious blockers found on this page.',
  },
  'needs-work': {
    bar: 'bg-serious',
    text: 'text-serious',
    blurb: 'Nothing fully blocking, but serious issues will degrade the experience.',
  },
  blocking: {
    bar: 'bg-critical',
    text: 'text-critical',
    blurb: 'An agent or keyboard user will hit a dead end on this page.',
  },
};

/**
 * Everything measured on one already-scanned page. Used by the landing-page
 * scan, the compare view, and the historical Pages view — one card, so a page
 * looks the same however you arrived at it.
 */
export function ScanResultCard({
  page,
  brandPhantomPages,
  compact = false,
}: {
  page: Exclude<PageResult, { error: string }>;
  brandPhantomPages?: number;
  compact?: boolean;
}) {
  const violations = [...(page.violations ?? [])].sort((a, b) => {
    const order = sortRuleIds([a.id, b.id]);
    return order[0] === a.id ? -1 : 1;
  });
  const totalNodes = violations.reduce((sum, v) => sum + v.n, 0);
  const verdict = verdictForPage(page);
  const style = VERDICT_STYLE[verdict];
  const topFixes = priorityFixes(page);

  return (
    <article className={compact ? '' : 'overflow-hidden rounded-lg border border-rule bg-card shadow-card'}>
      <div className={compact ? '' : 'p-5'}>
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="truncate font-mono text-xs text-muted">{page.url}</p>
          <p className={`inline-flex items-center gap-2 text-sm font-medium ${style.text}`}>
            <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${style.bar}`} />
            {VERDICT_LABEL[verdict]}
            <span className="font-normal text-muted">— {style.blurb}</span>
          </p>
        </header>

        <dl className="mt-4 grid grid-cols-3 gap-x-6 gap-y-3 border-t border-rule pt-3 sm:grid-cols-6">
          <Metric label="Failing elements" value={totalNodes} emphasis />
          <Metric label="Rules failing" value={violations.length} />
          <Metric label="Main landmark" text={page.hasMain ? 'Present' : 'Missing'} tone={page.hasMain ? 'text-ink' : 'text-critical'} />
          <Metric label="Unnamed buttons" value={page.namelessButtons?.length ?? 0} />
          <Metric label="Unnamed links" value={page.namelessLinks?.length ?? 0} />
          <Metric label="Empty links" value={page.emptyHref?.length ?? 0} />
        </dl>

        {topFixes.length > 0 ? (
          <section className="mt-4 rounded-card bg-paper p-4">
            <Eyebrow>Start here</Eyebrow>
            <ol className="mt-2.5 space-y-2">
              {topFixes.map((fix) => (
                <li key={fix.key} className="flex items-baseline gap-2.5 text-sm">
                  <ImpactDot impact={fix.impact} className="translate-y-[5px]" />
                  <span className="flex-1 text-ink">{fix.label}</span>
                  <span className="tnum font-medium text-muted">{fix.count}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <div className="mt-4">
          <PhantomPanel phantom={page.phantomMenu} pagesWithMenu={brandPhantomPages} />
        </div>

        <details className="group mt-6 border-t border-rule pt-5">
          <summary className="cursor-pointer list-none text-sm font-medium text-accent hover:underline [&::-webkit-details-marker]:hidden">
            {violations.length > 0
              ? `All ${violations.length} findings and sample markup`
              : 'Detail'}
            <span aria-hidden="true" className="ml-1 inline-block transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>

          <div className="mt-4 space-y-5">
            {violations.length === 0 ? (
              <Notice tone="good" title="No rule failures on this page">
                Every automated rule passed. That covers what a scanner can see — it isn’t a
                substitute for testing with a real screen reader.
              </Notice>
            ) : (
              <ul className="space-y-4">
                {violations.map((v) => {
                  const meta = ruleMeta(v.id);
                  return (
                    <li key={v.id} className="rounded-card border border-rule p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h4 className="flex items-center gap-2 font-medium text-ink">
                          <ImpactDot impact={meta.impact} />
                          {meta.label}
                        </h4>
                        <div className="flex items-baseline gap-3">
                          <span className={`text-xs font-medium ${IMPACT_TEXT[meta.impact]}`}>
                            {meta.impact}
                          </span>
                          <span className="text-base font-semibold tnum">{v.n}</span>
                        </div>
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-faint">{v.id}</p>

                      {v.sample && v.sample.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          <Eyebrow>
                            {v.sample.length === 1 ? 'Example' : `${v.sample.length} examples`} of{' '}
                            {v.n}
                          </Eyebrow>
                          {v.sample.map((s, i) => (
                            <div key={i}>
                              {s.t?.length ? (
                                <p className="mb-1 break-all font-mono text-xs text-muted">
                                  {s.t.join(' ')}
                                </p>
                              ) : null}
                              <CodeSample html={s.h} />
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            {page.namelessButtons?.length ||
            page.namelessLinks?.length ||
            page.emptyHref?.length ? (
              <section>
                <h4 className="font-medium text-ink">Controls with no accessible name</h4>
                <p className="mt-1 max-w-measure text-sm leading-relaxed text-muted">
                  Measured directly rather than through a rule, so these show up even where no
                  rule covers them. Name resolution order: aria-label, aria-labelledby, text,
                  title, child image alt.
                </p>
                <div className="mt-3 grid gap-5 lg:grid-cols-3">
                  <MarkupList title="Buttons" items={page.namelessButtons ?? []} />
                  <MarkupList title="Links" items={page.namelessLinks ?? []} />
                  <MarkupList title="Empty links" items={page.emptyHref ?? []} />
                </div>
              </section>
            ) : null}
          </div>
        </details>
      </div>
    </article>
  );
}

interface PriorityFix {
  key: string;
  label: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  count: number;
}

/** Highest-impact, highest-count issues first, capped at three. The phantom
 * menu isn't a rule, so it's folded in here rather than left invisible. */
function priorityFixes(page: Exclude<PageResult, { error: string }>): PriorityFix[] {
  const fixes: PriorityFix[] = (page.violations ?? []).map((v) => {
    const meta = ruleMeta(v.id);
    return { key: v.id, label: meta.label, impact: meta.impact, count: v.n };
  });

  const phantomCount = page.phantomMenu?.focusable ?? 0;
  if (phantomCount > 0) {
    fixes.push({
      key: '__phantom',
      label: 'Closed menu still reachable by agents and keyboard',
      impact: 'critical',
      count: phantomCount,
    });
  }

  return fixes
    .sort((a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || b.count - a.count)
    .slice(0, 3);
}

function MarkupList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <Eyebrow>
        {title} · <span className="tnum">{items.length}</span>
      </Eyebrow>
      {items.length === 0 ? (
        <p className="mt-1.5 text-sm text-good">None</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {items.map((html, i) => (
            <li key={i}>
              <CodeSample html={html} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  text,
  tone = 'text-ink',
  emphasis = false,
}: {
  label: string;
  value?: number;
  text?: string;
  tone?: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <dt className="text-eyebrow text-muted">{label}</dt>
      <dd
        className={`mt-0.5 font-mono text-sm tnum ${emphasis ? 'font-medium text-ink' : ''} ${tone}`}
      >
        {text ?? value?.toLocaleString()}
      </dd>
    </div>
  );
}
