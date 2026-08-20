import { redirect } from 'next/navigation';

/**
 * Runs lands on By page.
 *
 * By page answers the question people arrive with — "which pages are bad" —
 * and By check is the drill-down for someone who already knows which rule they
 * are chasing. `/runs` stays a live URL rather than moving to `/runs/pages` in
 * the nav, so every link, bookmark and older share of it still opens the view
 * the reader wanted.
 */
export default function RunsIndex() {
  redirect('/runs/pages');
}
