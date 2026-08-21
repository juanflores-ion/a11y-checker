/**
 * What a first-time reader is told, in order.
 *
 * One short sentence a step. The first draft explained why each thing was the
 * way it was, which is the explainer's job and not a tour's: someone who has
 * been on the page for ten seconds wants to know where to click.
 *
 * Anchored to real elements by `data-tour`, never to coordinates: the layout
 * reflows at three breakpoints and a tour pinned to pixels is wrong on two of
 * them. A step whose anchor is not on the page is dropped rather than pointing
 * at nothing, which is what a deployment with no runs on file would do.
 */
export interface TourStep {
  /** `data-tour` value of the element to spotlight. Null centres the card. */
  target: string | null;
  title: string;
  body: string;
  /** Preferred side. Flipped automatically when there is no room. */
  place?: 'top' | 'bottom';
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: null,
    title: 'Welcome',
    body: 'This checks how easily an AI agent, a screen reader or a keyboard can use our sites. Quick look around? You can skip it.',
  },
  {
    target: 'nav',
    title: 'Three pages',
    body: 'Overview is what is wrong. Runs is the numbers. Scan takes a new measurement.',
    place: 'bottom',
  },
  {
    target: 'context',
    title: 'What you are looking at',
    body: 'Pick a run, a device and a site. Every figure below changes with it.',
    place: 'bottom',
  },
  {
    target: 'readiness',
    title: 'The score',
    body: 'How many targets each site passes, and how many blocking problems are left.',
  },
  {
    target: 'scorecard',
    title: 'The eight targets',
    body: 'Red means a target was missed. Nothing else is coloured.',
  },
  {
    target: 'issues',
    title: 'The issues',
    body: 'Each row is one problem and how to fix it. Click a row to open it.',
  },
  {
    target: 'help',
    title: 'Want more detail?',
    body: 'How it works explains what the scanner does. Reopen this tour with the ? button.',
    place: 'bottom',
  },
];
