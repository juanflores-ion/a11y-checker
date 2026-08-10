import { isFailedPage } from '@/lib/model';
import type { PageDiff, RuleDiffStatus } from '@/lib/compare';
import { ruleMeta } from '@/lib/rules';
import { Eyebrow, ImpactDot, Notice } from './Primitives';
import { ScanResultCard } from './ScanResultCard';

const STATUS_LABEL: Record<RuleDiffStatus, string> = {
  resolved: 'Resolved',
  new: 'New',
  worsened: 'Worse',
  improved: 'Better',
  unchanged: 'Unchanged',
};

const STATUS_TONE: Record<RuleDiffStatus, string> = {
  resolved: 'text-good',
  new: 'text-critical',
  worsened: 'text-serious',
  improved: 'text-good',
  unchanged: 'text-faint',
};

/** One before/after pair: headline numbers, rule-by-rule status, full detail on request. */
export function CompareCard({ diff }: { diff: PageDiff }) {
  const beforeFailed = diff.before && isFailedPage(diff.before);
  const afterFailed = diff.after && isFailedPage(diff.after);
  const beforeMissing = diff.beforeUrl === '';
  const afterMissing = diff.afterUrl === '';

  return (
    <div className="space-y-5 rounded-card border border-rule bg-card p-5 shadow-card">
      <div className="grid gap-3 sm:grid-cols-2">
        <UrlLabel label="Before" url={diff.beforeUrl} />
        <UrlLabel label="After" url={diff.afterUrl} />
      </div>

      {beforeMissing || afterMissing ? (
        <Notice tone="neutral" title="Only one side given">
          {beforeMissing ? 'No Before URL on this line — showing After only.' : null}
          {afterMissing ? 'No After URL on this line — showing Before only.' : null}
        </Notice>
      ) : null}

      {beforeFailed || afterFailed ? (
        <Notice tone="error" title="Scan failed on one side">
          {beforeFailed && diff.before && isFailedPage(diff.before) ? (
            <p>Before: {diff.before.error}</p>
          ) : null}
          {afterFailed && diff.after && isFailedPage(diff.after) ? (
            <p>After: {diff.after.error}</p>
          ) : null}
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 border-y border-rule py-4">
        <BigDelta label="Failing nodes" before={diff.totalBefore} after={diff.totalAfter} />
        <BigDelta label="Phantom focusable" before={diff.phantomBefore} after={diff.phantomAfter} />
        <div className="ml-auto flex gap-5">
          {diff.resolvedCount > 0 ? (
            <span className="font-mono text-sm text-good">
              {diff.resolvedCount} resolved
            </span>
          ) : null}
          {diff.newCount > 0 ? (
            <span className="font-mono text-sm text-critical">{diff.newCount} new</span>
          ) : null}
          {diff.resolvedCount === 0 && diff.newCount === 0 && diff.rules.length > 0 ? (
            <span className="font-mono text-sm text-faint">no rules resolved or new</span>
          ) : null}
        </div>
      </div>

      {diff.rules.length === 0 ? (
        <p className="text-sm text-good">No axe findings on either side.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-left">
              <th scope="col" className="py-1.5 pr-3 text-eyebrow font-medium text-faint">
                Rule
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right text-eyebrow font-medium text-faint">
                Before
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right text-eyebrow font-medium text-faint">
                After
              </th>
              <th scope="col" className="py-1.5 text-right text-eyebrow font-medium text-faint">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {diff.rules.map((r) => {
              const meta = ruleMeta(r.id);
              return (
                <tr key={r.id} className="border-b border-rule/60 last:border-0">
                  <td className="py-1.5 pr-3">
                    <span className="flex items-center gap-2">
                      <ImpactDot impact={meta.impact} />
                      {meta.label}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tnum text-muted">{r.before}</td>
                  <td className="py-1.5 pr-3 text-right font-mono tnum text-ink">{r.after}</td>
                  <td className={`py-1.5 text-right text-xs font-medium ${STATUS_TONE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <details className="group">
        <summary className="cursor-pointer text-eyebrow font-medium text-accent [&::-webkit-details-marker]:hidden">
          Full detail, both sides ▾
        </summary>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <Eyebrow className="mb-2">Before</Eyebrow>
            {diff.before && !isFailedPage(diff.before) ? (
              <ScanResultCard page={diff.before} />
            ) : (
              <p className="text-sm text-faint">Nothing to show.</p>
            )}
          </div>
          <div>
            <Eyebrow className="mb-2">After</Eyebrow>
            {diff.after && !isFailedPage(diff.after) ? (
              <ScanResultCard page={diff.after} />
            ) : (
              <p className="text-sm text-faint">Nothing to show.</p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

function UrlLabel({ label, url }: { label: string; url: string }) {
  return (
    <div className="min-w-0">
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-0.5 truncate font-mono text-xs text-muted">{url || '—'}</p>
    </div>
  );
}

function BigDelta({ label, before, after }: { label: string; before: number; after: number }) {
  const change = after - before;
  const improving = change < 0;

  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-sm tnum text-faint">{before}</span>
        <span aria-hidden="true" className="text-faint">
          →
        </span>
        <span className="font-mono text-xl font-bold tnum text-ink">{after}</span>
        {change !== 0 ? (
          <span
            className={`font-mono text-xs tnum ${improving ? 'text-good' : 'text-critical'}`}
          >
            {improving ? '−' : '+'}
            {Math.abs(change)}
          </span>
        ) : (
          <span className="font-mono text-xs text-faint">no change</span>
        )}
      </div>
    </div>
  );
}
