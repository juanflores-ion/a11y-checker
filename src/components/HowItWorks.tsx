import { NON_DEFECT_METRICS, PAGE_DEFECTS } from '@/lib/model';
import type { HowItWorksFigures } from '@/lib/howItWorks';

import { Chapter } from './how/Chapter';
import { DefectMatrix } from './how/DefectMatrix';
import { EnvironmentRefusal } from './how/EnvironmentRefusal';
import { Rail } from './how/Rail';
import { TreeReach } from './how/TreeReach';
import { VariantSplit } from './how/VariantSplit';
import { Arrow, Eyebrow } from './Primitives';

export type { HowItWorksFigures };

/**
 * The explainer.
 *
 * Ten chapters in three groups, written for someone who has never opened a dev
 * tool, with a contents rail because it is referred back to out of order far
 * more often than it is read start to finish.
 *
 * Two rules hold the page together. **Every diagram is markup or hand-authored
 * SVG, never an image** — it stays sharp at any size, it survives a restyle, and
 * a screen reader or an agent can read it, which on this page of all pages is
 * not optional. And **every figure is passed in from a real run**: if there is
 * no run on file the diagrams say so rather than drawing a plausible number.
 *
 * The incident history that used to live here — what each false positive cost,
 * which checks were rewritten and why — was cut deliberately. It is in git and
 * in the code comments, and on this page it buried what a reader actually needs.
 */
export function HowItWorks({ figures }: { figures: HowItWorksFigures | null }) {
  return (
    <div>
      <Hero />
      <div className="mt-12 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-12">
        <Rail />
        <div className="min-w-0 space-y-14">
          <TheList figures={figures} />
          <TwoDevices figures={figures} />
          <HowScanned />
          <WhatCounts />
          <ExactLists />
          <Environments figures={figures} />
          <Variants figures={figures} />
          <Stamp figures={figures} />
          <Limits />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

/** A line in an accessibility-tree diagram. */
function TreeLine({
  depth = 0,
  role,
  name,
  tone = 'normal',
  note,
}: {
  depth?: number;
  role: string;
  name?: string;
  tone?: 'normal' | 'bad' | 'good';
  note?: string;
}) {
  const toneClass = tone === 'bad' ? 'text-critical' : tone === 'good' ? 'text-good' : 'text-ink';
  return (
    <div className="flex items-baseline gap-2 py-[3px] font-mono text-xs leading-relaxed">
      <span aria-hidden="true" style={{ width: `${depth * 14}px` }} className="shrink-0" />
      <span className={`font-medium ${toneClass}`}>{role}</span>
      {name ? <span className="text-muted">&ldquo;{name}&rdquo;</span> : null}
      {note ? <span className={`text-[11px] ${toneClass}`}>{note}</span> : null}
    </div>
  );
}

function Panel({
  label,
  tone = 'neutral',
  children,
}: {
  label: string;
  tone?: 'neutral' | 'good' | 'bad';
  children: React.ReactNode;
}) {
  const ring =
    tone === 'good'
      ? 'border-good/30 bg-good/[0.03]'
      : tone === 'bad'
        ? 'border-critical/30 bg-critical/[0.03]'
        : 'border-rule bg-card';
  const labelTone = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-critical' : 'text-muted';
  return (
    <div className={`rounded-card border p-4 ${ring}`}>
      <Eyebrow className={labelTone}>{label}</Eyebrow>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <header className="max-w-measure">
      <Eyebrow>How it works</Eyebrow>
      <h1 className="mt-2 font-display text-[2rem] font-bold leading-[1.08] tracking-tight text-ink sm:text-hero">
        An agent doesn&apos;t look at the page. It reads a list.
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">
        ChatGPT, Gemini and Perplexity can&apos;t see colour, layout or where a button sits. The
        browser hands them a plain list of what is on the page and what each thing is for. If
        something is missing from that list, it doesn&apos;t exist as far as the agent is concerned.
      </p>
      <p className="mt-3 text-base leading-relaxed text-muted">
        This tool measures how much of our sites survives that translation. Everything below is read
        from real runs. No figure on this page is an illustration.
      </p>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* 1. The list, not the page                                           */
/* ------------------------------------------------------------------ */

function TheList({ figures }: { figures: HowItWorksFigures | null }) {
  return (
    <Chapter
      id="the-list"
      lead="Left, what a person sees. Right, the list the browser hands an agent. The gaps between them are what this tool counts."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel label="What a person sees">
          {/* A deliberately crude mock. It only has to read as "a web page". */}
          <div className="rounded-card border border-rule bg-paper p-3" aria-hidden="true">
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 rounded-pill bg-ink/70" />
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-10 rounded-pill bg-ink/20" />
                <div className="h-2.5 w-10 rounded-pill bg-ink/20" />
                <div className="flex flex-col gap-[3px]">
                  <div className="h-[2px] w-4 rounded-pill bg-ink/60" />
                  <div className="h-[2px] w-4 rounded-pill bg-ink/60" />
                  <div className="h-[2px] w-4 rounded-pill bg-ink/60" />
                </div>
              </div>
            </div>
            <div className="mt-4 h-2.5 w-3/4 rounded-pill bg-ink/25" />
            <div className="mt-2 h-2 w-full rounded-pill bg-ink/10" />
            <div className="mt-1.5 h-2 w-5/6 rounded-pill bg-ink/10" />
            <div className="mt-4 flex items-center gap-2">
              <div className="rounded-card bg-accent px-3 py-1.5 text-[10px] font-medium text-paper">
                Get quotes
              </div>
              <div className="h-7 w-7 rounded-pill bg-ink/10" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-card border border-rule bg-card p-2">
                  <div className="h-5 w-5 rounded-pill bg-ink/10" />
                  <div className="mt-2 h-1.5 w-full rounded-pill bg-ink/15" />
                  <div className="mt-1 h-1.5 w-2/3 rounded-pill bg-ink/10" />
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            A heading, some text, a blue button, a menu icon and a round icon.
          </p>
        </Panel>

        <Panel label="What an agent reads">
          <div className="rounded-card border border-rule bg-paper p-3">
            <TreeLine role="banner" />
            <TreeLine depth={1} role="link" name="Insureon" />
            <TreeLine depth={1} role="link" name="Small business insurance" />
            <TreeLine depth={1} role="???" tone="bad" note="no name, the menu icon" />
            <TreeLine role="heading" name="Insurance for your business" />
            <TreeLine role="text" name="Cover that fits what you do…" />
            <TreeLine role="button" name="Get quotes" tone="good" />
            <TreeLine role="???" tone="bad" note="no name, the round icon" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The button came through. The two icons arrived as{' '}
            <span className="font-mono text-critical">???</span>. Something is there, but not what
            it does.
          </p>
        </Panel>
      </div>

      <p className="mt-5 max-w-measure text-sm leading-relaxed text-muted">
        That list is the <strong className="font-medium text-ink">accessibility tree</strong>. Screen
        readers use it too, so the same fix helps blind users and AI agents at once.
      </p>

      <TreeReach figures={figures} />
    </Chapter>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Two devices, two pages                                           */
/* ------------------------------------------------------------------ */

function TwoDevices({ figures }: { figures: HowItWorksFigures | null }) {
  return (
    <Chapter
      id="two-devices"
      lead="Our sites send a phone a genuinely different page from a laptop, not the same page at two widths. Agents get the laptop one."
    >
      <div className="rounded-lg border border-rule bg-card p-5 shadow-card">
        <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-card border border-rule bg-paper p-4 text-center">
            <div className="font-mono text-xs text-muted">insureon.com</div>
            <div className="mt-1 text-sm text-ink">One address</div>
          </div>

          <div aria-hidden="true" className="hidden justify-center sm:flex">
            {/* Decorative: both branches it joins are named in text beside it. */}
            <svg aria-hidden="true" width="34" height="80" viewBox="0 0 34 80" fill="none">
              <path d="M1 40h12M13 40V14h20M13 40v26h20" className="stroke-rule" strokeWidth="1.5" />
              <path d="M29 10l5 4-5 4M29 62l5 4-5 4" className="stroke-faint" strokeWidth="1.5" fill="none" />
            </svg>
          </div>

          <div className="space-y-3">
            <div className="rounded-card border border-accent/30 bg-accent/[0.04] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-pill bg-accent px-2 py-0.5 text-[11px] font-medium text-paper">
                  Desktop
                </span>
                <span className="text-sm font-medium text-ink">What agents get</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                A laptop, a search bot, or anything the server doesn&apos;t recognise. Menus open on
                hover.
              </p>
            </div>
            <div className="rounded-card border border-rule bg-paper p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-pill bg-ink/70 px-2 py-0.5 text-[11px] font-medium text-paper">
                  Mobile
                </span>
                <span className="text-sm font-medium text-ink">What most people get</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                A recognised phone. Menus live behind a hamburger drawer.
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-5 max-w-measure text-sm leading-relaxed text-muted">
        The scanner measures both, every time, and every figure says which device it belongs to.
        {figures && figures.profiles.length > 0 ? (
          <> This run measured {figures.profiles.join(' and ')}.</>
        ) : null}
      </p>
    </Chapter>
  );
}

/* ------------------------------------------------------------------ */
/* 3. How a page is scanned                                            */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    title: 'Open a real browser',
    body: 'A real Chrome running the page’s JavaScript, once as a laptop and once as a phone.',
  },
  {
    title: 'Load it, then check it',
    body: 'Wait for menus and banners to settle, then confirm it is the real page and not a friendly error.',
  },
  {
    title: 'Run the standard rulebook',
    body: 'axe-core, the engine behind Google PageSpeed: buttons with no name, fields with no label, poor contrast.',
  },
  {
    title: 'Run the scanner’s own checks',
    body: 'Is it in the list? Is it announced? Can it be reached by keyboard? Anything doubtful is confirmed with the browser first.',
  },
  {
    title: 'Write down the counts',
    body: 'One file per run. This dashboard only reads those files. It never scans anything itself.',
  },
];

/**
 * Five rows, not five columns.
 *
 * This was a five-column row whose text blocks ended at wildly different
 * heights — one ran six lines against its neighbours' three, leaving about
 * 200px of rag and dead space under the short ones. Steps are a sequence, and a
 * sequence reads down.
 */
function HowScanned() {
  return (
    <Chapter
      id="how-scanned"
      lead="Five steps, about five seconds a page. It never clicks, hovers, scrolls or types, so the page is measured exactly as delivered and two runs always measure the same thing."
    >
      <ol className="overflow-hidden rounded-lg border border-rule bg-card shadow-card">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="grid gap-x-4 gap-y-1 border-b border-rule px-5 py-4 last:border-b-0 sm:grid-cols-[2.5rem_13rem_1fr] sm:items-baseline"
          >
            <span className="font-mono text-xs text-accent tnum">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="text-sm font-medium text-ink">{step.title}</span>
            <p className="text-sm leading-relaxed text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </Chapter>
  );
}

/* ------------------------------------------------------------------ */
/* 4. What counts as a defect                                          */
/* ------------------------------------------------------------------ */

function WhatCounts() {
  return (
    <Chapter
      id="what-counts"
      lead="Two questions decide it. Hidden is not the same as unfindable, and only one of them is a problem."
    >
      <DefectMatrix />

      {/*
        One worked example, not three.
        
        The matrix above already names all four outcomes. What markup adds is the
        one thing prose cannot show: what "something announces it" actually looks
        like in the tree. That needs the contrast, so the example carries both
        states rather than one — and the third card, a fully open menu, went: it
        is the trivial case and the matrix covers it.
      */}
      <section className="mt-8">
        <Eyebrow>The same closed menu, two ways</Eyebrow>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="rounded-card border border-good/30 bg-paper p-3">
              <TreeLine role="button" name="Products" note="collapsed" tone="good" />
              <div className="py-[3px] pl-[14px] font-mono text-xs text-faint">
                (3 links, hidden for now)
              </div>
            </div>
            <p className="mt-2.5 text-sm leading-relaxed text-muted">
              The role is <span className="font-mono text-xs text-good">button</span>, so the list
              still carries something that points at the three links.
            </p>
          </div>
          <div>
            <div className="rounded-card border border-critical/30 bg-paper p-3">
              <TreeLine role="text" name="Products" note="not a button" tone="bad" />
              <div className="py-[3px] pl-[14px] font-mono text-xs text-faint">
                (3 links, hidden, nothing mentions them)
              </div>
            </div>
            <p className="mt-2.5 text-sm leading-relaxed text-muted">
              The role is <span className="font-mono text-xs text-critical">text</span>. It opens on
              hover, so nothing in the list mentions the links at all.
            </p>
          </div>
        </div>
      </section>

      <div className="mt-5 max-w-measure space-y-3 text-sm leading-relaxed text-muted">
        <p>
          One thing never reaches the list at all: a{' '}
          <strong className="font-medium text-ink">ghost control</strong>, something that responds
          to a click but was never marked as a button. No standard rulebook can see it. Ours counts
          it.
        </p>
        <p>
          Most of the defects lived in a handful of shared building blocks: the navigation, the link
          and image primitives, the expandable panels. They were fixed at the source. That is why
          the counts fall on every page at once rather than one page at a time.
        </p>
      </div>
    </Chapter>
  );
}

/* ------------------------------------------------------------------ */
/* 5. The exact lists                                                  */
/* ------------------------------------------------------------------ */

const NON_DEFECT_TITLE: Record<string, string> = {
  // Named as the row reads under Runs → By check, so a reader who arrived
  // here from that table can find the same thing twice.
  clickableNoRole: 'Clickable elements with no role',
  'unreachableTotals.panels': 'Regions that are out of the list',
  unreachablePanels: 'The named list of those regions',
  'navLinks.inTree < navLinks.total': 'Nav links that are not in the list',
};

/**
 * Its own chapter, because it is reference material.
 *
 * It used to sit at the foot of "What counts as a defect", which made that one
 * section 1,747px — a third of the page — and buried the decision it was there
 * to explain under two long catalogues nobody reads end to end.
 */
function ExactLists() {
  return (
    <Chapter
      id="exact-lists"
      lead="Both lists are printed from the scanner’s own definitions, so this page cannot drift from what it measures."
    >
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Panel label="Counted as defects. A correct page has all of these at zero" tone="bad">
          <ul className="space-y-2">
            {PAGE_DEFECTS.map((d) => (
              <li key={d.key} className="border-b border-rule pb-2 last:border-0 last:pb-0">
                <div className="text-sm font-medium text-ink">{d.label}</div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{d.why}</p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel label="Expected to be non-zero. Descriptions, not scores" tone="good">
          <ul className="space-y-2">
            {NON_DEFECT_METRICS.map((m) => (
              <li key={m.key} className="border-b border-rule pb-2 last:border-0 last:pb-0">
                <div className="text-sm font-medium text-ink">
                  {NON_DEFECT_TITLE[m.key] ?? m.key}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{m.why}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </Chapter>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Production and staging                                           */
/* ------------------------------------------------------------------ */

function Environments({ figures }: { figures: HowItWorksFigures | null }) {
  return (
    <Chapter
      id="environments"
      lead="Every run records which deployment it measured. The two are never diffed against each other, and that is a deliberate refusal rather than a missing feature."
    >
      <EnvironmentRefusal pair={figures?.environments ?? null} />

      <div className="mt-5 max-w-measure space-y-3 text-sm leading-relaxed text-muted">
        <p>
          <strong className="font-medium text-ink">The comparison that does work</strong> is two runs
          of the same deployment: staging before the fix against staging after it. Only the deploy
          changed in between, so only the deploy can explain the movement. That is what{' '}
          <strong className="font-medium text-ink">Scan <Arrow className="mx-0.5 text-muted" /> Compare runs</strong> is for, and why it
          refuses a pair whose environments differ.
        </p>
      </div>
    </Chapter>
  );
}

/* ------------------------------------------------------------------ */
/* 7. One URL, three homepages                                         */
/* ------------------------------------------------------------------ */

function Variants({ figures }: { figures: HowItWorksFigures | null }) {
  return (
    <Chapter
      id="variants"
      lead="A URL is assumed to name a page, and one of ours does not. Insureon’s homepage is a single item under a content test that returns one of several different documents."
    >
      <VariantSplit figures={figures} />

      <div className="mt-5 max-w-measure space-y-3 text-sm leading-relaxed text-muted">
        <p>
          The scanner asks each homepage which document it served and records the answer beside the
          figures. Where a target declares no identity, which is every page we track but this one, nothing
          is asked and nothing is recorded.
        </p>
        <p>
          A page that is asked and <em>cannot tell</em> records{' '}
          <strong className="font-medium text-ink">null</strong>, never a guess. Two pages that both
          failed to identify themselves are not treated as the same page: that is how a comparison of
          one variant against another would render as a confident delta, and it is guarded the same
          way a cross-device comparison is.
        </p>
        <p>
          This is why the homepage figure can move between runs with nobody having touched it, and
          why a homepage comparison is the one most likely to be declined.
        </p>
      </div>
    </Chapter>
  );
}

/* ------------------------------------------------------------------ */
/* 8. Every figure’s stamp                                             */
/* ------------------------------------------------------------------ */

/**
 * The stamp is read from the run, not written here. A run that does not carry
 * a field renders it as "not recorded" — the honest answer, and one that must
 * stay visible rather than being tidied away or filled in from what was
 * probably used.
 */
function StampRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string | null | undefined;
  note: string;
}) {
  const recorded = typeof value === 'string' && value.length > 0;
  return (
    <div className="grid gap-x-4 gap-y-1 border-b border-rule py-3 last:border-0 sm:grid-cols-[9rem_12rem_1fr]">
      <div className="text-sm font-medium text-ink">{label}</div>
      {recorded ? (
        <div className="font-mono text-xs leading-5 text-ink">{value}</div>
      ) : (
        <div className="font-mono text-xs leading-5 text-faint" title="This run did not record it">
          not recorded
        </div>
      )}
      <p className="text-sm leading-relaxed text-muted">{note}</p>
    </div>
  );
}

function Stamp({ figures }: { figures: HowItWorksFigures | null }) {
  return (
    <Chapter
      id="stamp"
      lead="A count only means something next to the instrument that took it. Two runs are only comparable when all of these match."
    >
      <div className="rounded-lg border border-rule bg-card px-5 py-2 shadow-card">
        <StampRow
          label="Device profile"
          value={figures ? figures.profiles.join(' · ') : null}
          note="Two different pages, so every figure names its profile."
        />
        <StampRow
          label="Rulebook"
          value={figures?.axeVersion ? `axe-core ${figures.axeVersion}` : null}
          note="Which version of the standard rule engine ran."
        />
        <StampRow
          label="Scanner"
          value={
            figures?.probeVersion
              ? `${figures.probeVersion}${figures.probeVersionInferred ? ' · inferred' : ''}`
              : figures?.probeVersion
          }
          note="Which version of the scanner’s own checks ran. A change in the checks is not a change in the site. “Inferred” means the run did not record it and the version was worked out from what the scanner directory held at the time."
        />
        <StampRow
          label="Browser"
          value={figures?.browserVersion}
          note="Browsers differ on what goes in the list, so this is part of the measurement."
        />
      </div>
      {figures ? (
        <p className="mt-3 text-xs text-faint">From the run this page reads from.</p>
      ) : (
        <p className="mt-3 text-xs text-faint">
          No run on file, so every row is blank rather than filled in.
        </p>
      )}
    </Chapter>
  );
}

/* ------------------------------------------------------------------ */
/* 9. What it cannot tell you                                         */
/* ------------------------------------------------------------------ */

interface Limit {
  title: string;
  /** The one-word status. Its wording is the point; do not generalise it. */
  badge: string;
  kind: 'permanent' | 'open';
  body: string;
}

const LIMITS: Limit[] = [
  {
    title: 'Whether something was ever meant to be a control',
    badge: 'Permanent',
    kind: 'permanent',
    body: 'Nothing on a page says “this box is a button”. The scanner uses a click handler as a stand-in, and a stand-in is all it can ever be.',
  },
  {
    title: 'A tracking script and a component library, told apart',
    badge: 'Permanent',
    kind: 'permanent',
    body: 'Both attach one handler to many elements. The scanner ignores shared handlers, so a page that also runs analytics can report fewer controls than it has.',
  },
  {
    title: 'Anything that only exists after an interaction',
    badge: 'Not measured',
    kind: 'open',
    body: 'Modals, wizard steps and panels built on click are outside every number here, because the scanner never clicks.',
  },
  {
    title: 'Content cut off by overflow: clip',
    badge: 'Not reported',
    kind: 'open',
    body: 'The one kind of clipping the browser will not scroll back into view when focus lands on it. The scanner says nothing about it yet.',
  },
  {
    title: 'Anything inside an embedded frame',
    badge: 'Not measured',
    kind: 'open',
    body: 'Chat widgets, embedded forms and video players are never looked at. Zero problems inside a frame means nobody looked.',
  },
];

function Limits() {
  return (
    <Chapter
      id="limits"
      lead="Every measurement has an edge. These are this one’s, written down so nobody has to find them by being surprised."
    >
      <ul className="divide-y divide-rule rounded-lg border border-rule bg-card px-5 shadow-card">
        {LIMITS.map((l) => (
          <li key={l.title} className="py-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="font-display text-sm font-bold text-ink">{l.title}</h3>
              <span
                className={`shrink-0 rounded-pill border px-2 py-0.5 text-[11px] font-medium ${
                  l.kind === 'permanent'
                    ? 'border-rule bg-paper text-muted'
                    : 'border-serious/30 bg-serious/[0.06] text-serious'
                }`}
              >
                {l.badge}
              </span>
            </div>
            <p className="mt-1 max-w-measure text-sm leading-relaxed text-muted">{l.body}</p>
          </li>
        ))}
      </ul>

      <p className="mt-5 max-w-measure text-sm leading-relaxed text-muted">
        <strong className="font-medium text-ink">
          A check that never ran is never reported as a pass.
        </strong>{' '}
        If something could not be measured, the dashboard says so rather than showing a zero.
      </p>
    </Chapter>
  );
}
