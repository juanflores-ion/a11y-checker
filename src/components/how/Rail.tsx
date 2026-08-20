'use client';

import { useEffect, useState } from 'react';

import { CHAPTERS, chapterGroups, chapterNumber } from './chapters';

/**
 * The contents rail.
 *
 * A ten-chapter document needs a way in that is not scrolling, and a way to
 * know where you are that is not counting headings. The rail is an ordinary
 * list of anchors — no scroll hijacking, no custom key handling — so it works
 * before the JavaScript that highlights the current chapter has loaded, and
 * keeps working if that never runs.
 *
 * Below `lg` there is no room beside the text, so the same list renders as a
 * closed disclosure above the first chapter rather than disappearing.
 */
export function Rail() {
  const active = useActiveChapter();

  return (
    <>
      <nav
        aria-label="Chapters"
        className="hidden lg:block lg:sticky lg:top-24 lg:self-start"
      >
        <ol className="flex flex-col gap-0.5">
          {chapterGroups().map(({ group, chapters }) => (
            <li key={group}>
              <p className="mb-1 mt-4 px-2.5 text-[10px] uppercase tracking-[0.09em] text-faint first:mt-0">
                {group}
              </p>
              <ol className="flex flex-col gap-0.5">
                {chapters.map((chapter) => (
                  <li key={chapter.id}>
                    <a
                      href={`#${chapter.id}`}
                      aria-current={active === chapter.id ? 'true' : undefined}
                      className={`block rounded-[7px] border-l-2 px-2.5 py-1.5 text-[12.5px] leading-snug transition-colors ${
                        active === chapter.id
                          ? 'border-accent bg-accent/10 text-ink'
                          : 'border-transparent text-muted hover:bg-white/[0.03] hover:text-ink'
                      }`}
                    >
                      <span className="font-mono text-[11px] text-faint">
                        {chapterNumber(chapter.id)}
                      </span>{' '}
                      {chapter.title}
                    </a>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </nav>

      <details className="mb-8 rounded-card border border-rule bg-card px-4 py-3 lg:hidden">
        <summary className="cursor-pointer list-none text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
          Contents · {CHAPTERS.length} chapters
        </summary>
        <ol className="mt-3 flex flex-col gap-2">
          {CHAPTERS.map((chapter) => (
            <li key={chapter.id} className="text-sm">
              <a href={`#${chapter.id}`} className="text-muted hover:text-ink">
                <span className="font-mono text-xs text-faint">{chapterNumber(chapter.id)}</span>{' '}
                {chapter.title}
              </a>
            </li>
          ))}
        </ol>
      </details>
    </>
  );
}

/**
 * Which chapter the reader is in.
 *
 * The topmost chapter whose heading has passed under the site header wins. A
 * plain "is it on screen" test picks the wrong one constantly on a page where
 * three short chapters fit in a viewport at once, and picking by scroll
 * position alone breaks the moment a chapter changes height.
 */
function useActiveChapter(): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const sections = CHAPTERS.map((c) => document.getElementById(c.id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (sections.length === 0) return;

    /** Header plus a little air; a heading level with the nav is not "current" yet. */
    const OFFSET = 120;

    const pick = () => {
      let current = sections[0].id;
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= OFFSET) current = section.id;
      }
      // The last chapter can be too short to ever reach the offset; at the
      // bottom of the page it is unambiguously the one being read.
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
      setActive(atBottom ? sections[sections.length - 1].id : current);
    };

    pick();
    window.addEventListener('scroll', pick, { passive: true });
    window.addEventListener('resize', pick);
    return () => {
      window.removeEventListener('scroll', pick);
      window.removeEventListener('resize', pick);
    };
  }, []);

  return active;
}
