import { findingsForPage } from '@/lib/findings';
import { verdictForPage, VERDICT_LABEL, type PageResult, type Verdict } from '@/lib/model';
import { FindingsList } from './FindingsList';
import { PhantomPanel } from './PhantomPanel';
import { CodeSample, Eyebrow, Notice } from './Primitives';

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
  const findings = findingsForPage(page);
  const totalNodes = (page.violations ?? []).reduce((sum, v) => sum + v.n, 0);
  const verdict = verdictForPage(page);
  const style = VERDICT_STYLE[verdict];

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
          <Metric label="Rules failing" value={findings.length} />
          <Metric label="Main landmark" text={page.hasMain ? 'Present' : 'Missing'} tone={page.hasMain ? 'text-ink' : 'text-critical'} />
          <Metric label="Unnamed buttons" value={page.namelessButtons?.length ?? 0} />
          <Metric label="Unnamed links" value={page.namelessLinks?.length ?? 0} />
          <Metric label="Empty links" value={page.emptyHref?.length ?? 0} />
        </dl>

        <div className="mt-4">
          <PhantomPanel phantom={page.phantomMenu} pagesWithMenu={brandPhantomPages} />
        </div>

        {/*
          Findings, and the markup behind them.

          This was a `<details>` that expanded every sample in place — 408px of
          card became 1,642px, and inside a comparison's two columns the markup
          had 430px to render in. The list stays; the evidence opens in a panel.
        */}
        <div className="mt-6 border-t border-rule pt-5">
          {findings.length === 0 ? (
            <Notice tone="good" title="No rule failures on this page">
              Every automated rule passed. That covers what a scanner can see — it isn’t a
              substitute for testing with a real screen reader.
            </Notice>
          ) : (
            <FindingsList findings={findings} pageUrl={page.url} />
          )}

          {page.namelessButtons?.length || page.namelessLinks?.length || page.emptyHref?.length ? (
            <details className="group mt-5">
              <summary className="cursor-pointer list-none text-sm font-medium text-accent hover:underline [&::-webkit-details-marker]:hidden">
                Controls with no accessible name
                <span aria-hidden="true" className="ml-1 inline-block transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <p className="mt-2 max-w-measure text-sm leading-relaxed text-muted">
                Measured directly rather than through a rule, so these show up even where no rule
                covers them. Name resolution order: aria-label, aria-labelledby, text, title, child
                image alt.
              </p>
              <div className="mt-3 grid gap-5 lg:grid-cols-3">
                <MarkupList title="Buttons" items={page.namelessButtons ?? []} />
                <MarkupList title="Links" items={page.namelessLinks ?? []} />
                <MarkupList title="Empty links" items={page.emptyHref ?? []} />
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </article>
  );
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
