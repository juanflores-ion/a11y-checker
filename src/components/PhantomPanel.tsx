import type { PhantomMenu } from '@/lib/model';
import { Eyebrow } from './Primitives';

/** Which properties would actually take the menu out of the accessibility tree. */
function hidingMechanisms(pm: PhantomMenu) {
  const applied: string[] = [];
  const missing: string[] = [];

  const push = (active: boolean, name: string) => (active ? applied : missing).push(name);

  push(pm.transform !== null && pm.transform !== 'none', 'transform');
  push(pm.display === 'none', 'display:none');
  push(pm.visibility === 'hidden', 'visibility:hidden');
  push(pm.ariaHidden === 'true', 'aria-hidden');
  push(pm.inert === true, 'inert');

  return { applied, missing };
}

/**
 * The single most important diagnostic in the whole audit: a closed menu that
 * is still announced to agents and still keyboard-reachable, while
 * pointer-events:none makes every one of those controls unusable.
 */
export function PhantomPanel({
  phantom,
  pagesWithMenu,
  className = '',
}: {
  phantom: PhantomMenu | null;
  pagesWithMenu?: number;
  className?: string;
}) {
  if (!phantom) {
    return (
      <p className={`text-xs text-faint ${className}`}>
        Closed mobile menu: no mega-menu element on this page, so nothing to measure.
      </p>
    );
  }

  const clean = phantom.focusable === 0;
  const { applied, missing } = hidingMechanisms(phantom);
  const unclickable = phantom.pointerEvents === 'none';

  if (clean) {
    return (
      <div className={`rounded-card border border-good/40 bg-good/5 p-4 ${className}`}>
        <Eyebrow className="text-good">Phantom menu · cleared</Eyebrow>
        <p className="mt-1.5 font-display text-lg font-semibold text-good">
          The closed menu is no longer reachable
        </p>
        <p className="mt-1 text-sm text-muted">
          Zero focusable controls inside the closed mega-menu. Agents and keyboard users now walk
          straight past it.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-card border border-phantom/35 bg-phantom/[0.04] p-4 ${className}`}>
      <Eyebrow className="text-phantom">Phantom menu · exposed</Eyebrow>

      <p className="mt-1.5 font-display text-lg font-semibold leading-snug text-ink">
        Closed menu is exposed to agents
      </p>

      <p className="mt-2 text-sm leading-relaxed text-ink">
        <strong className="tnum font-semibold">{phantom.focusable}</strong> controls{' '}
        <span className="text-muted">
          ({phantom.links} links, {phantom.buttons} buttons)
        </span>{' '}
        are announced to AI agents and screen readers, and reachable by keyboard
        {unclickable ? (
          <>
            {' '}
            , but <code className="font-mono text-xs">pointer-events: none</code> makes all of them
            unclickable.
          </>
        ) : (
          '.'
        )}
      </p>

      <NodeGrid count={phantom.focusable} tabbable={phantom.tabbable} />

      <p className="mt-3 text-sm leading-relaxed text-muted">
        Hidden by: {applied.length ? <strong className="text-ink">{applied.join(', ')}</strong> : 'nothing'}
        {applied.length ? ' only' : ''}.{' '}
        {missing.length ? `No ${missing.join(', no ')}.` : 'Every hiding mechanism is applied.'}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-rule pt-3 text-xs sm:grid-cols-3">
        <Field label="transform" value={phantom.transform ?? 'none'} mono />
        <Field label="display" value={phantom.display ?? '—'} mono />
        <Field label="visibility" value={phantom.visibility ?? '—'} mono />
        <Field label="aria-hidden" value={phantom.ariaHidden ?? 'not set'} mono />
        <Field label="inert" value={phantom.inert ? 'true' : 'false'} mono />
        <Field label="pointer-events" value={phantom.pointerEvents ?? '—'} mono />
        <Field label="in accessibility tree" value={phantom.exposedInTree ? 'yes' : 'no'} />
        <Field label="focusable" value={String(phantom.focusable)} />
        <Field label="tabbable" value={String(phantom.tabbable)} />
      </dl>

      {pagesWithMenu && pagesWithMenu > 1 ? (
        <p className="mt-3 text-xs text-muted">
          Identical on all {pagesWithMenu} scanned pages of this brand, because it&apos;s one shared
          component, so one fix clears every page.
        </p>
      ) : null}
    </div>
  );
}

/**
 * One square per exposed control. The count is the point: a paragraph saying
 * "69 controls" reads as a statistic, sixty-nine squares reads as a problem.
 */
function NodeGrid({ count, tabbable }: { count: number; tabbable: number }) {
  const capped = Math.min(count, 200);
  return (
    <div
      className="mt-3 flex flex-wrap gap-[3px]"
      role="img"
      aria-label={`${count} focusable controls, ${tabbable} of them in the tab order`}
    >
      {Array.from({ length: capped }, (_, i) => (
        <span
          key={i}
          className={`h-2 w-2 ${i < tabbable ? 'bg-phantom' : 'bg-phantom/30'}`}
        />
      ))}
      {count > capped ? (
        <span className="ml-1 font-mono text-xs text-phantom tnum">+{count - capped}</span>
      ) : null}
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-eyebrow font-medium text-faint">{label}</dt>
      <dd className={`mt-0.5 text-ink ${mono ? 'font-mono text-xs break-all' : 'text-sm'}`}>
        {value}
      </dd>
    </div>
  );
}
