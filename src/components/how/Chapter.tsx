import { CHAPTERS, chapterNumber } from './chapters';

/**
 * One chapter of the explainer.
 *
 * The number is not decoration: this page is read in order by someone new and
 * referred back to out of order by everyone else, so a chapter needs a name you
 * can say out loud ("chapter seven") as well as a link. The rule above the
 * number is the same chapter break the rest of the app uses.
 *
 * `scroll-mt` keeps the heading clear of the sticky site header when the rail
 * jumps to it — without it the thing you clicked lands underneath the nav.
 */
export function Chapter({
  id,
  lead,
  children,
}: {
  id: string;
  /** One line on what the chapter settles. Never the chapter's only content. */
  lead?: React.ReactNode;
  children: React.ReactNode;
}) {
  const meta = CHAPTERS.find((c) => c.id === id);
  const n = chapterNumber(id);
  const headingId = `${id}-title`;

  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-28">
      <header className="border-t border-rule pt-5">
        <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.09em] text-faint">
          Chapter {n}
        </p>
        <h2
          id={headingId}
          className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight text-ink"
        >
          {meta?.title ?? id}
        </h2>
        {lead ? (
          <p className="mt-2 max-w-[74ch] text-[15px] leading-relaxed text-muted">{lead}</p>
        ) : null}
      </header>
      <div className="mt-5">{children}</div>
    </section>
  );
}
