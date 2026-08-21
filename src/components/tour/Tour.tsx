'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { TOUR_STEPS, type TourStep } from './steps';

const PAD = 8;
const CARD_W = 340;
const GAP = 14;
const CARD_H = 190;

interface Rect { top: number; left: number; width: number; height: number }

function rectOf(target: string | null): Rect | null {
  if (!target) return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

const same = (a: Rect | null, b: Rect | null) =>
  a === b ||
  (!!a && !!b &&
    Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);

/**
 * The tour: dim the page, light up one thing at a time, say what it is.
 *
 * Rendered through a portal onto `document.body`, for the reason the findings
 * panel is: a fixed overlay inside a `space-y-*` parent inherits a top margin
 * from Tailwind's sibling selector and lands 20px down the viewport, which is
 * an afternoon to diagnose from the symptom.
 *
 * It is an overlay on an accessibility tool, so it is held to what the tool
 * reports on: a real dialog with a name, focus moved into it and kept there,
 * Escape to leave, arrows to move, and the step count announced rather than
 * only drawn as dots.
 */
export function Tour({ onClose }: { onClose: () => void }) {
  /**
   * Steps whose anchor is actually on the page.
   *
   * Resolved once, on open. A deployment with no runs has no context bar and
   * no scorecard, and a tour that lights up nothing while saying "the eight
   * targets" is worse than a shorter tour.
   */
  const steps = useMemo<TourStep[]>(
    () => TOUR_STEPS.filter((s) => s.target === null || rectOf(s.target) !== null),
    []
  );

  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  const close = useCallback(() => onClose(), [onClose]);
  const next = useCallback(() => setI((n) => Math.min(n + 1, steps.length - 1)), [steps.length]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  /**
   * Bring the anchor into view before measuring, or the card is drawn off
   * screen.
   *
   * Centring only works for something that fits. Centring the issues section,
   * which is about 1950px tall, puts its middle at the middle of the screen
   * and its top hundreds of pixels above it — so the lit area, which is the
   * top of the block, was off screen and the reader had to scroll up to find
   * what the step was pointing at.
   *
   * Anything taller than the room available is aligned by its top instead,
   * just under the sticky header rather than flush with the viewport, which
   * would put it behind the header.
   */
  useEffect(() => {
    if (!step?.target) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const room = window.innerHeight - CARD_H - GAP * 4;
    if (r.height <= room) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const header = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
    window.scrollTo({ top: window.scrollY + r.top - header - GAP * 2, behavior: 'smooth' });
  }, [step?.target]);

  /**
   * Follow the anchor every frame while the tour is open.
   *
   * Cheaper than it sounds and far more robust than scroll and resize
   * listeners: the smooth scroll above, the sticky header, and a font finally
   * loading all move the target, and only a per-frame read catches every one.
   * State is set only when the rect actually changes, so React re-renders on
   * movement rather than on frames.
   */
  useLayoutEffect(() => {
    let raf = 0;
    let current: Rect | null = null;
    const tick = () => {
      const r = rectOf(step?.target ?? null);
      if (!same(r, current)) { current = r; setRect(r); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step?.target]);

  /** Focus lands in the card on every step, so the keyboard follows the tour. */
  useEffect(() => { cardRef.current?.focus(); }, [i]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); if (last) close(); else next(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); back(); return; }
      if (e.key !== 'Tab') return;
      // The tour covers the page, so Tab must not walk off into it.
      const focusable = cardRef.current?.querySelectorAll<HTMLElement>('button');
      if (!focusable?.length) return;
      const first = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [close, next, back, last]);

  if (!step) return null;

  /**
   * The lit area, clamped to what a screen can hold.
   *
   * The issues section is ~1950px tall and the scorecard ~770px. Lighting a
   * section whole means the hole is the entire viewport and nothing is
   * highlighted at all: the reader sees an undimmed page and a floating card.
   * Showing the top of a long block says "this thing, starting here", which is
   * what the step means anyway. The room left over is what the card needs.
   */
  const hole = (() => {
    if (!rect) return null;
    const vh = typeof window === 'undefined' ? 900 : window.innerHeight;
    const top = rect.top - PAD;
    const height = Math.min(rect.height + PAD * 2, vh - CARD_H - GAP * 4);
    return { top, left: rect.left - PAD, width: rect.width + PAD * 2, height };
  })();

  /**
   * Card placement: under the anchor, above it when there is no room below,
   * clamped so it never hangs off an edge. Centred when a step has no anchor.
   */
  let card: { top: number; left: number } | undefined;
  if (hole && typeof window !== 'undefined') {
    const roomBelow = window.innerHeight - (hole.top + hole.height) > CARD_H + GAP;
    const below = step.place === 'top' ? false : step.place === 'bottom' ? roomBelow : roomBelow;
    card = {
      top: below ? hole.top + hole.height + GAP : Math.max(GAP, hole.top - GAP - CARD_H),
      left: Math.min(
        Math.max(GAP, hole.left + hole.width / 2 - CARD_W / 2),
        window.innerWidth - CARD_W - GAP
      ),
    };
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="tour-title" className="fixed inset-0 z-50">
      {/* The dim and the light are one element: a box over the anchor with an
          enormous spread shadow, so the hole is the anchor and everything
          around it darkens. A separate scrim with a mask costs another paint. */}
      {hole ? (
        <div
          aria-hidden="true"
          className="tour-spot pointer-events-none absolute rounded-[10px]"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
        />
      ) : (
        <div aria-hidden="true" className="tour-scrim absolute inset-0" onClick={close} />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        className="absolute w-[340px] max-w-[calc(100vw-1.75rem)] rounded-lg border border-rule bg-card p-4 shadow-pop outline-none"
        style={card ?? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.09em] text-faint">
          Step {i + 1} of {steps.length}
        </p>
        <h2 id="tour-title" className="mt-1.5 font-display text-[17px] font-bold leading-tight tracking-tight text-ink">
          {step.title}
        </h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{step.body}</p>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            {steps.map((_, n) => (
              <span key={n} className={`h-1.5 w-1.5 rounded-pill ${n === i ? 'bg-accent' : 'bg-rule'}`} />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={close} className="rounded-card px-2 py-1.5 text-[12.5px] text-muted hover:text-ink">
              {last ? 'Close' : 'Skip'}
            </button>
            {i > 0 ? (
              <button type="button" onClick={back} className="rounded-card border border-rule px-2.5 py-1.5 text-[12.5px] text-muted hover:border-accent hover:text-ink">
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={last ? close : next}
              className="rounded-card bg-accent px-3 py-1.5 text-[12.5px] font-medium text-paper hover:bg-accent/90"
            >
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>

      {/* Drawn as dots above, announced here: a dot row and a moving card tell
          a screen reader nothing about where it is. */}
      <p aria-live="polite" className="sr-only">{`Step ${i + 1} of ${steps.length}. ${step.title}.`}</p>
    </div>,
    document.body
  );
}
