'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Finding, FindingSide } from '@/lib/findings';
import { IMPACT_TEXT } from '@/lib/rules';
import { CodeSample, ImpactDot } from './Primitives';

/**
 * One finding's evidence, in a panel over the page.
 *
 * It replaced an inline disclosure, and the reason is measurable: opening the
 * findings list on a page detail took the card from 408px to 1,642px and moved
 * everything below it down by 1,234px, so the reader lost their place to read
 * markup that — inside a comparison's two columns — only had 430px to render
 * in. The panel gives the markup the width and takes the movement away.
 *
 * This is an accessibility tool, so the dialog itself has to be exemplary:
 * labelled, modal, focus moved in and trapped, focus returned to the row that
 * opened it, Esc and scrim to close, its own scroll with the page behind it
 * locked. Anything less is the first thing a reviewer would find.
 *
 * **It renders through a portal onto `document.body`, and that is load-bearing.**
 * Rendered in place it is still a child in its parent's layout: `CompareDetails`
 * lays its blocks out with `space-y-5`, which sets `margin-top: 1.25rem` on every
 * child but the first — including this one. A `position: fixed; inset: 0` element
 * with a 20px top margin sits 20px down the viewport, and the sticky site header
 * showed through the gap above it. A portal takes the panel out of every
 * ancestor's layout, stacking context and containing block at once, so no utility
 * class anywhere up the tree can move it again.
 */
export function FindingsPanel({
  findings,
  index,
  onIndexChange,
  onClose,
  pageUrl,
}: {
  findings: Finding[];
  /** Which finding is open. The panel is closed when this is null. */
  index: number | null;
  onIndexChange: (next: number) => void;
  onClose: () => void;
  /** Shown in the header so a panel is never ambiguous about what it measured. */
  pageUrl?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  /** The element to hand focus back to — whatever had it when the panel opened. */
  const openerRef = useRef<HTMLElement | null>(null);
  const [side, setSide] = useState<'before' | 'after'>('before');

  const open = index !== null && index >= 0 && index < findings.length;
  const live = open ? findings[index] : null;
  /**
   * Kept so the panel still has something to draw while it slides out. Without
   * it the contents vanish on the first frame of the exit and the animation
   * plays over an empty box.
   */
  const lastRef = useRef<Finding | null>(null);
  if (live) lastRef.current = live;
  const finding = live ?? lastRef.current;

  /** `mounted` = in the DOM. `shown` = in its open position. */
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      /**
       * Two frames, not one. React commits the mount and a single rAF callback
       * inside the same frame, so the browser never paints the panel in its
       * closed position and there is nothing to transition from — measured: the
       * dialog's first observed state was already `translate-x-0`. Waiting for a
       * second frame guarantees the closed state has been painted.
       */
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
    const still = reducedMotion() ? 0 : EXIT_MS;
    const timer = setTimeout(() => setMounted(false), still);
    return () => clearTimeout(timer);
  }, [open]);

  /** A new finding is a new comparison; start it on the side that has the fix. */
  useEffect(() => {
    setSide('before');
  }, [index]);

  useEffect(() => {
    if (!mounted) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    /**
     * The page behind must not scroll — the whole point is that it keeps its
     * place. Padding replaces the scrollbar so the layout does not jump.
     */
    const { body } = document;
    const previous = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = `${gap}px`;

    // Move focus in, rather than leaving it on a row behind the scrim.
    panelRef.current?.focus();

    return () => {
      body.style.overflow = previous.overflow;
      body.style.paddingRight = previous.paddingRight;
      openerRef.current?.focus?.();
    };
  }, [mounted]);

  const step = useCallback(
    (delta: number) => {
      if (index === null) return;
      const next = index + delta;
      if (next >= 0 && next < findings.length) onIndexChange(next);
    },
    [index, findings.length, onIndexChange]
  );

  /**
   * Esc closes; Tab cycles inside the panel. The trap is a wrap on the first
   * and last tabbable element rather than a library — the panel's contents are
   * a handful of buttons, and a dependency here would be the only one.
   */
  useEffect(() => {
    if (!mounted) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = panelRef.current;
      if (!root) return;
      const tabbable = [...root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (tabbable.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = tabbable[0];
      const last = tabbable[tabbable.length - 1];
      const active = document.activeElement;
      if (!event.shiftKey && (active === last || active === root)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || active === root)) {
        event.preventDefault();
        last.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mounted, onClose]);

  if (!mounted || !finding) return null;

  // Bound to a local so TypeScript narrows the union across the JSX below.
  const sides = finding.sides;
  const pair = sides.kind === 'pair' ? sides : null;
  const single = sides.kind === 'single' ? sides.only : null;
  const shownSide: FindingSide | null = pair ? pair[side] : single;

  const body = (
    /*
      `m-0` is not decoration: it defends the fixed overlay against a parent's
      `space-y-*` margin, which is the bug that put the panel 20px down the page.
      The portal already prevents it; the reset makes the intent local.
    */
    <div className="fixed inset-0 z-[60] m-0 flex justify-end">
      {/* Decorative: Esc and the labelled close button are the real controls. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 bg-paper/80 backdrop-blur-sm transition-opacity duration-200 ease-out ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex h-full w-full flex-col border-l border-rule bg-card shadow-pop outline-none transition-transform duration-200 ease-out sm:w-[560px] ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex flex-col gap-3 border-b border-rule p-5">
          <div className="flex items-start gap-3">
            <h2 id={titleId} className="flex-1 font-display text-lg font-semibold leading-snug tracking-tight text-ink">
              <ImpactDot impact={finding.impact} className="mr-2 align-middle" />
              {finding.label}
            </h2>
            <span className={`whitespace-nowrap rounded-pill border border-rule px-2.5 py-1 text-eyebrow font-medium ${IMPACT_TEXT[finding.impact]}`}>
              {finding.impact}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-card border border-rule text-muted hover:border-accent hover:text-ink"
            >
              <span className="sr-only">Close</span>
              <svg aria-hidden="true" width="11" height="11" viewBox="0 0 12 12">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-faint">
            <span>{finding.ruleId}</span>
            {pageUrl ? <span className="truncate">{pageUrl}</span> : null}
          </p>

          {pair ? (
            <div className="flex w-max overflow-hidden rounded-card border border-rule" role="group" aria-label="Which side to show">
              <SideTab name="Before" active={side === 'before'} side={pair.before} onClick={() => setSide('before')} />
              <SideTab name="After" active={side === 'after'} side={pair.after} onClick={() => setSide('after')} />
            </div>
          ) : (
            <p className="text-sm text-muted">
              <span className="font-medium text-ink tnum">{single?.count ?? 0}</span> failing{' '}
              {single?.count === 1 ? 'element' : 'elements'}
            </p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <Evidence side={shownSide} />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-5 py-3">
          <p className="font-mono text-xs text-faint tnum">
            {(index ?? 0) + 1} of {findings.length}
          </p>
          <div className="flex items-center gap-2">
            <StepButton label="Previous" onClick={() => step(-1)} disabled={index === 0} />
            <StepButton label="Next" onClick={() => step(1)} disabled={index === findings.length - 1} />
          </div>
        </footer>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}

/** Exit needs a timer, and that timer has to agree with the CSS. */
const EXIT_MS = 200;

/**
 * `globals.css` already collapses every transition under `prefers-reduced-motion`,
 * so the panel snaps rather than slides. The unmount timer has to agree, or the
 * panel would linger for 200ms after it stopped being visible.
 */
function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A side, or the fact that it was never measured.
 *
 * "Nothing to show" and "we never looked" are different answers, and the tab
 * that leads here says which — but the body has to say it too, because that is
 * the pane someone screenshots.
 */
function Evidence({ side }: { side: FindingSide | null }) {
  if (!side) {
    return (
      <p className="text-sm text-faint">
        This side was not measured — no scan, or a scan that failed. That is absence, not a clean
        result.
      </p>
    );
  }
  if (side.count === 0) {
    return <p className="text-sm text-good">Nothing failing this check on this side.</p>;
  }
  if (side.samples.length === 0) {
    return (
      <p className="text-sm text-muted">
        <span className="font-medium text-ink tnum">{side.count}</span> failing elements. The scan
        recorded no sample markup for them.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-faint">
        {side.samples.length === 1 ? '1 example' : `${side.samples.length} examples`} of{' '}
        <span className="tnum">{side.count}</span>
      </p>
      {side.samples.map((s, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 flex-1 break-all font-mono text-[11px] text-muted">
              {s.selector ?? 'no selector recorded'}
            </p>
            <CopyButton html={s.html} />
          </div>
          <CodeSample html={s.html} />
        </div>
      ))}
    </div>
  );
}

/** QA pastes this markup into tickets — the whole reason the panel has width. */
function CopyButton({ html }: { html: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(html).then(
          () => setCopied(true),
          () => setCopied(false)
        );
      }}
      className="shrink-0 rounded-card border border-rule px-2 py-0.5 text-[11px] font-medium text-accent hover:border-accent"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function SideTab({
  name,
  active,
  side,
  onClick,
}: {
  name: string;
  active: boolean;
  side: FindingSide | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3.5 py-1.5 text-xs ${active ? 'bg-accent/15 font-medium text-ink' : 'text-muted hover:text-ink'}`}
    >
      {name}
      <span className="ml-1.5 font-mono text-[11px] text-faint tnum">
        {side ? side.count : 'n/m'}
      </span>
    </button>
  );
}

function StepButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-card border border-rule px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-rule disabled:hover:text-muted"
    >
      {label}
    </button>
  );
}
