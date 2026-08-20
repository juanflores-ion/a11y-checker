/**
 * The frame every diagram on the explainer sits in.
 *
 * One figure, one claim: `caption` states what the picture shows, and the
 * drawing inside carries `role="img"` with the same claim as its label. In an
 * accessibility tool a diagram that a screen reader cannot read would be the
 * first thing a reviewer found, so the label is required rather than optional.
 *
 * The scroll container is focusable and named for the same reason the data
 * tables' is. These drawings hold their text at a legible size rather than
 * shrinking to fit a phone, so on a narrow screen they scroll sideways — and a
 * scrollable box that only a mouse or a finger can reach leaves everything past
 * the fold simply unavailable to a keyboard. `label` is the name that focusable
 * region needs; a focusable region without one is its own defect.
 */
export function Figure({
  label,
  caption,
  children,
}: {
  label: string;
  caption: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <figure className="mt-5 overflow-hidden rounded-lg border border-rule bg-card p-5 shadow-card">
      <div className="relative">
        <div tabIndex={0} role="region" aria-label={label} className="overflow-x-auto">
          {children}
        </div>
        {/* A hint that there is more to the right. Decorative, and it does not
            eat pointer events, so it cannot block the scroll it advertises. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent lg:hidden"
        />
      </div>
      <figcaption className="mt-4 max-w-[74ch] border-t border-rule pt-3 text-[13px] leading-relaxed text-muted">
        {caption}
      </figcaption>
    </figure>
  );
}

/**
 * What a diagram renders instead of itself when the run never recorded what it
 * needs. Absence is stated, never filled in with a plausible picture.
 */
export function NoFigure({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 rounded-card border border-dashed border-rule px-4 py-3 text-[13px] leading-relaxed text-faint">
      {children}
    </p>
  );
}
