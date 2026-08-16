/**
 * The one page frame. Title, one line, actions on the right, hairline. No page
 * opens with a hero or a paragraph — that was most of what made the previous
 * pass read as unfinished.
 */
export function PageHeader({
  title,
  description,
  aside,
}: {
  title: string;
  description?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-rule">
      <div className="pb-3">
        <h1 className="font-display text-xl font-bold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {aside ? <div className="flex items-end">{aside}</div> : null}
    </div>
  );
}
