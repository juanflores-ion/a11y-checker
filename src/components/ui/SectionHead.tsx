/**
 * The heading of a section, and the break that separates it from the one
 * before.
 *
 * Measured on the old Overview: section titles were 14px on a page whose body
 * text was 15px, their explanation was pushed to the right margin on the same
 * line, and a chapter break got 32px of air where the rows inside a section
 * got 9px. A heading smaller than its own paragraph cannot hold a boundary,
 * and a break the same size as a row break is not a break. So:
 *
 *   56px  from the previous section to the rule (the parent's `space-y-14`)
 *   24px  from the rule to the title (`pt-6` here)
 *   20px  display-face title, semibold — bigger than anything it heads
 *    6px  title to its note, which sits underneath, not out in the margin
 *   24px  title block to its content (`mt-6` on what follows, or the section's
 *         own `space-y-6`)
 *
 * `chapter` is false for the first section on a page: the PageHeader's own
 * hairline is already that break, and two rules 24px apart is a mistake.
 */
export function SectionHead({
  id,
  title,
  note,
  aside,
  chapter = true,
}: {
  id?: string;
  title: React.ReactNode;
  /** One line on how to read the section. Never the section's only content. */
  note?: React.ReactNode;
  /** A control that belongs to the section — a download, a toggle. */
  aside?: React.ReactNode;
  chapter?: boolean;
}) {
  return (
    <header className={`mb-6 ${chapter ? 'border-t border-rule pt-6' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id={id} className="font-display text-xl font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {aside ?? null}
      </div>
      {note ? <p className="mt-1.5 max-w-[78ch] text-[13px] leading-relaxed text-muted">{note}</p> : null}
    </header>
  );
}
