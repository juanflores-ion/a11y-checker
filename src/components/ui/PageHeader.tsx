/**
 * The one page frame: title, one line under it, actions on the right, hairline.
 *
 * The title is the largest thing on the page and the hairline under it is the
 * page's first chapter break — which is why the first section on every page
 * passes `chapter={false}` to SectionHead rather than drawing a second rule
 * 24px below this one. Tabs sit on this hairline, so its position is load
 * bearing: `Tabs` pulls itself down by a pixel to meet it.
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
    <div className="mb-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-rule">
      <div className="pb-4">
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-[78ch] text-sm text-muted">{description}</p> : null}
      </div>
      {aside ? <div className="flex items-end">{aside}</div> : null}
    </div>
  );
}
