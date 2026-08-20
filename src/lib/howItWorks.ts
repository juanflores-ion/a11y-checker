/**
 * The figures the explainer draws, read out of real runs.
 *
 * The explainer's standing rule is that nothing on it is
 * illustrative-but-invented: every number in a diagram comes from a run on
 * file, and anything the runs do not carry renders as absence rather than as a
 * plausible value. That rule is easy to state and easy to break once diagrams
 * want tidy inputs, so the extraction lives here where it can be tested, and
 * every function returns `null` for "no answer" instead of a zero.
 */
import { environmentOfUrl } from './environment';
import { isScannedPage, type Run, type ScannedPage } from './model';

/** One document a single URL served, and what it was worth. */
export interface VariantFigure {
  name: string;
  /** Failing elements across every rule on that document. */
  failing: number;
  rules: number;
  /** The one the run's figures were taken from; the others are reference copies. */
  ofRecord: boolean;
}

export interface EnvironmentSide {
  runId: string;
  /** The variant that side served, or null where the page declares no identity. */
  variant: string | null;
  failing: number;
}

export interface EnvironmentPair {
  production: EnvironmentSide | null;
  staging: EnvironmentSide | null;
}

export interface HowItWorksFigures {
  navTotal: number;
  navInTree: number;
  /** Human labels of the profiles the run measured, e.g. ["Desktop", "Mobile"]. */
  profiles: string[];
  /**
   * Provenance, from `RunMeta`. Optional there because older runs predate the
   * fields. Absent renders as "not recorded" — never as a version number
   * somebody inferred, and never silently omitted: a missing stamp is the
   * finding.
   */
  axeVersion?: string | null;
  probeVersion?: string | null;
  browserVersion?: string | null;
  /** Every document the tracked homepage served, or null if it served one it could not name. */
  variants: VariantFigure[] | null;
  /** How many loads it took to land on the recorded variant. */
  identityAttempts: number | null;
  /** The two deployments on file, for the chapter on why they are not diffed. */
  environments: EnvironmentPair | null;
}

function totalFailing(page: ScannedPage): number {
  return (page.violations ?? []).reduce((sum, v) => sum + v.n, 0);
}

/**
 * Every document one URL served on this run, page of record first.
 *
 * `null` — not an empty list — when the page never declared an identity, or
 * declared one and could not answer it. A page that served exactly one document
 * and could name it still returns that one: "this URL served one document" is a
 * finding worth drawing, and it is not the same as "we never asked".
 */
export function variantFigures(page: ScannedPage): VariantFigure[] | null {
  const recorded = page.identity?.value;
  if (!recorded) return null;

  const figures: VariantFigure[] = [
    {
      name: recorded,
      failing: totalFailing(page),
      rules: (page.violations ?? []).length,
      ofRecord: true,
    },
  ];

  for (const [name, variant] of Object.entries(page.variants ?? {})) {
    figures.push({
      name,
      failing: totalFailing(variant),
      rules: (variant.violations ?? []).length,
      ofRecord: false,
    });
  }

  figures.sort((a, b) => a.name.localeCompare(b.name));
  return figures;
}

/** The tracked homepage of one run, at the profile an agent is served. */
function homepageOf(run: Run): ScannedPage | null {
  const desktop = run.byViewport?.desktop?.insureon?.home ?? run.insureon?.home;
  return isScannedPage(desktop) ? desktop : null;
}

function sideOf(run: Run): EnvironmentSide | null {
  const home = homepageOf(run);
  if (!home) return null;
  return {
    runId: run.id,
    variant: home.identity?.value ?? null,
    failing: totalFailing(home),
  };
}

/**
 * The latest run of each deployment, for the chapter explaining why the two are
 * never diffed against each other.
 *
 * A side with no run on file, or whose homepage failed to scan, is `null`, and
 * the diagram states that rather than drawing a zero. `null` overall means
 * neither side could be read at all — there is no picture to draw.
 *
 * The environment is taken from the URL actually measured rather than from the
 * run's own label, so a mislabelled file cannot put a staging figure under a
 * production heading.
 */
export function environmentPair(runs: Run[]): EnvironmentPair | null {
  let production: EnvironmentSide | null = null;
  let staging: EnvironmentSide | null = null;

  for (const run of runs) {
    const home = homepageOf(run);
    if (!home) continue;
    const environment = environmentOfUrl(home.url);
    if (environment === 'production') production = sideOf(run) ?? production;
    else if (environment === 'staging') staging = sideOf(run) ?? staging;
  }

  return production || staging ? { production, staging } : null;
}
