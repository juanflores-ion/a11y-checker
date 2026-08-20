/**
 * The explainer's table of contents, in one place.
 *
 * The rail, the small-screen contents list and the chapter headings all read
 * from this, so a chapter cannot appear in the navigation and not on the page,
 * or arrive with a different name in each.
 */
export interface ChapterMeta {
  id: string;
  title: string;
  /** Which question the reader arrived with. */
  group: string;
}

export const CHAPTERS: ChapterMeta[] = [
  { id: 'the-list', title: 'The list, not the page', group: 'What an agent sees' },
  { id: 'two-devices', title: 'Two devices, two pages', group: 'What an agent sees' },
  { id: 'how-scanned', title: 'How a page is scanned', group: 'How we measure' },
  { id: 'what-counts', title: 'What counts as a defect', group: 'How we measure' },
  { id: 'exact-lists', title: 'The exact lists', group: 'How we measure' },
  { id: 'environments', title: 'Production and staging', group: 'Reading the numbers' },
  { id: 'variants', title: 'One URL, three homepages', group: 'Reading the numbers' },
  { id: 'baseline', title: 'What a baseline is', group: 'Reading the numbers' },
  { id: 'stamp', title: 'Every figure’s stamp', group: 'Reading the numbers' },
  { id: 'limits', title: 'What it cannot tell you', group: 'Reading the numbers' },
];

/** Chapter number, 1-based, as the headings print it. */
export function chapterNumber(id: string): number {
  return CHAPTERS.findIndex((c) => c.id === id) + 1;
}

/** The chapters grouped in order, without repeating a group heading. */
export function chapterGroups(): Array<{ group: string; chapters: ChapterMeta[] }> {
  const groups: Array<{ group: string; chapters: ChapterMeta[] }> = [];
  for (const chapter of CHAPTERS) {
    const last = groups[groups.length - 1];
    if (last && last.group === chapter.group) last.chapters.push(chapter);
    else groups.push({ group: chapter.group, chapters: [chapter] });
  }
  return groups;
}
