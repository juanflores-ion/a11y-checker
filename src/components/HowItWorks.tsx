import { NON_DEFECT_METRICS, PAGE_DEFECTS } from '@/lib/model';

import { Eyebrow } from './Primitives';

/**
 * The explainer page.
 *
 * Seven sections, one visual each, written for someone who has never opened a
 * dev tool. Every diagram is built from real markup rather than an image: it
 * stays sharp at any size, and — fittingly for this tool — a screen reader or
 * an agent can read the diagrams too.
 *
 * Any figure shown is passed in from the latest real run. Nothing here is
 * illustrative-but-invented; if there is no run on file, the figures are simply
 * omitted rather than filled in with plausible ones.
 *
 * The incident history that used to live here — what each false positive cost,
 * which checks were rewritten and why — was cut deliberately. It is in git and
 * in the code comments, and on this page it buried the four things a reader
 * actually needs: what an agent sees, how a page is scanned, what counts as a
 * defect, and what the tool cannot tell you.
 */
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
}

export function HowItWorks({ figures }: { figures: HowItWorksFigures | null }) {
  return (
    <div className="space-y-16">
      <Hero />
      <TwoWays />
      <TwoDevices figures={figures} />
      <OneScan />
      <WhatCounts />
      <Stamp figures={figures} />
      <Limits />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                 */
/* ------------------------------------------------------------------ */

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
        {title}
      </h2>
      {lead ? (
        <p className="mt-2 max-w-measure text-base leading-relaxed text-muted">{lead}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

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
  const toneClass =
    tone === 'bad' ? 'text-critical' : tone === 'good' ? 'text-good' : 'text-ink';
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
  const labelTone =
    tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-critical' : 'text-muted';
  return (
    <div className={`rounded-card border p-4 ${ring}`}>
      <Eyebrow className={labelTone}>{label}</Eyebrow>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** "Defect" / "Not a defect", coloured the only two ways this page allows. */
function Verdict({ defect }: { defect: boolean }) {
  return (
    <span
      className={`inline-flex rounded-pill px-2 py-0.5 text-[11px] font-medium ${
        defect ? 'bg-critical/[0.08] text-critical' : 'bg-good/[0.08] text-good'
      }`}
    >
      {defect ? 'Defect' : 'Not a defect'}
    </span>
  );
}

/**
 * A one-into-two connector that stretches to whatever it sits above. The two
 * legs land at 25% and 75%, i.e. the centres of a two-column grid beneath.
 * Decorative only: every branch it joins is labelled in text.
 */
function Fork({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className={`block h-6 w-full ${className}`}
    >
      <path
        d="M50 0v11M25 11h50M25 11v13M75 11v13"
        fill="none"
        stroke="#2F3A4B"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Hero                                                             */
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
        something is missing from that list, it doesn&apos;t exist as far as the agent is
        concerned.
      </p>
      <p className="mt-3 text-base leading-relaxed text-muted">
        This tool measures how much of our sites survives that translation.
      </p>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* 2. The same page, two ways                                          */
/* ------------------------------------------------------------------ */

function TwoWays() {
  return (
    <Section
      id="two-ways"
      title="The same page, two ways"
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
            <TreeLine depth={1} role="???" tone="bad" note="no name — the menu icon" />
            <TreeLine role="heading" name="Insurance for your business" />
            <TreeLine role="text" name="Cover that fits what you do…" />
            <TreeLine role="button" name="Get quotes" tone="good" />
            <TreeLine role="???" tone="bad" note="no name — the round icon" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The button came through. The two icons arrived as{' '}
            <span className="font-mono text-critical">???</span> — something is there, but not
            what it does.
          </p>
        </Panel>
      </div>

      <p className="mt-5 max-w-measure text-sm leading-relaxed text-muted">
        That list is the <strong className="font-medium text-ink">accessibility tree</strong>.
        Screen readers use it too, so the same fix helps blind users and AI agents at once.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 3. One address, two pages                                           */
/* ------------------------------------------------------------------ */

function TwoDevices({ figures }: { figures: HowItWorksFigures | null }) {
  return (
    <Section
      id="two-devices"
      title="One address, two different pages"
      lead="Our sites send a phone a genuinely different page from a laptop — not the same page at two widths. Agents get the laptop one."
    >
      <div className="rounded-lg border border-rule bg-card p-5 shadow-card">
        <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-card border border-rule bg-paper p-4 text-center">
            <div className="font-mono text-xs text-muted">insureon.com</div>
            <div className="mt-1 text-sm text-ink">One address</div>
          </div>

          <div aria-hidden="true" className="hidden justify-center sm:flex">
            <svg width="34" height="80" viewBox="0 0 34 80" fill="none">
              <path d="M1 40h12M13 40V14h20M13 40v26h20" stroke="#2F3A4B" strokeWidth="1.5" />
              <path d="M29 10l5 4-5 4M29 62l5 4-5 4" stroke="#5F6B7A" strokeWidth="1.5" fill="none" />
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
                A laptop, a search bot, or anything the server doesn&apos;t recognise. Menus open
                on hover.
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
        {figures ? (
          <>
            {' '}
            On Insureon&apos;s desktop home page,{' '}
            <strong className="font-medium text-ink tnum">{figures.navInTree}</strong> of{' '}
            <strong className="font-medium text-ink tnum">{figures.navTotal}</strong> navigation
            links are in the list an agent reads.
          </>
        ) : null}
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 4. How a page is scanned                                            */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    title: 'Open a real browser',
    body: 'A real Chrome running the page’s JavaScript — once as a laptop, once as a phone.',
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
    body: 'One file per run. This dashboard only reads those files — it never scans anything itself.',
  },
];

function OneScan() {
  return (
    <Section id="one-scan" title="How a page is scanned" lead="Five steps, about five seconds a page.">
      {/*
        A rail with numbered nodes rather than a stack of cards: the shape says
        "in this order" before a word is read. Columns abut so the rail runs
        unbroken; the text gets its breathing room from padding instead.
      */}
      <ol className="grid gap-y-6 sm:grid-cols-5 sm:gap-y-0">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 sm:block">
            <div className="flex shrink-0 flex-col items-center sm:flex-row">
              <span
                aria-hidden="true"
                className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-pill border border-rule bg-card font-mono text-[11px] font-medium text-accent shadow-card"
              >
                {i + 1}
              </span>
              {i < STEPS.length - 1 ? (
                <span aria-hidden="true" className="w-px flex-1 bg-rule sm:h-px sm:w-auto" />
              ) : null}
            </div>
            <div className="pb-1 sm:mt-3 sm:pr-5">
              <h3 className="font-display text-sm font-bold leading-[26px] text-ink sm:leading-snug">
                {s.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-6 max-w-measure text-sm leading-relaxed text-muted">
        <strong className="font-medium text-ink">It never clicks, hovers, scrolls or types.</strong>{' '}
        The page is measured exactly as delivered, so two runs always measure the same thing.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 5. What counts as a defect                                          */
/* ------------------------------------------------------------------ */

/**
 * The classification, and the reason it is a diagram rather than a paragraph.
 *
 * "Hidden" is something you can observe. "Unfindable" is a decision somebody
 * has to write down, and until it is written down every layer of the code
 * quietly invents its own answer — that exact mistake once turned a correct
 * fix into hundreds of imaginary regressions. This diagram is the thing the
 * code is written against, not documentation of it.
 */
interface Leaf {
  answer: 'Yes' | 'No';
  term: string;
  defect: boolean;
  body: string;
}

function BranchCard({
  label,
  then,
  question,
  leaves,
}: {
  label: string;
  then: string;
  question: string;
  leaves: [Leaf, Leaf];
}) {
  return (
    <div className="rounded-card border border-rule bg-paper p-4">
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-1 text-sm leading-relaxed text-muted">{then}</p>
      <h3 className="mt-3 text-center font-display text-sm font-bold text-ink">{question}</h3>
      <Fork className="mt-1" />
      <div className="grid grid-cols-2 gap-3">
        {leaves.map((leaf) => (
          <div
            key={leaf.term}
            className={`rounded-card border p-3 ${
              leaf.defect
                ? 'border-critical/30 bg-critical/[0.04]'
                : 'border-good/30 bg-good/[0.04]'
            }`}
          >
            <div className="font-mono text-[11px] text-faint">{leaf.answer}</div>
            <div
              className={`mt-0.5 font-display text-base font-bold tracking-tight ${
                leaf.defect ? 'text-critical' : 'text-good'
              }`}
            >
              {leaf.term}
            </div>
            <div className="mt-1.5">
              <Verdict defect={leaf.defect} />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{leaf.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DecisionTree() {
  return (
    <div className="rounded-lg border border-rule bg-card p-5 shadow-card">
      <div className="flex justify-center">
        <span className="rounded-pill border border-rule bg-paper px-3 py-1 text-xs font-medium text-ink">
          Anything on the page
        </span>
      </div>
      <h3 className="mt-3 text-center font-display text-sm font-bold text-ink">
        Is it in the list an agent reads?
      </h3>
      {/* Two-column fork above two columns; on a phone the branches stack, so a plain stub. */}
      <Fork className="mt-1 hidden sm:block" />
      <div aria-hidden="true" className="mx-auto mt-1 h-4 w-px bg-rule sm:hidden" />
      <div className="grid gap-4 sm:grid-cols-2">
        <BranchCard
          label="Yes — it is in the list"
          then="An agent has it. The only question left is whether a person can see it."
          question="Is it on screen?"
          leaves={[
            {
              answer: 'Yes',
              term: 'Working',
              defect: false,
              body: 'The person and the agent see the same thing.',
            },
            {
              answer: 'No',
              term: 'Trapped',
              defect: true,
              body: 'Off screen, yet still handed to the agent and still reachable by Tab.',
            },
          ]}
        />
        <BranchCard
          label="No — it is not in the list"
          then="An agent does not have it. The only question is whether anything in the list points at it."
          question="Does anything announce it?"
          leaves={[
            {
              answer: 'Yes',
              term: 'Hidden',
              defect: false,
              body: 'A closed menu behind a button that says it is there. This is what correct looks like.',
            },
            {
              answer: 'No',
              term: 'Unfindable',
              defect: true,
              body: 'No way in, and nothing to say there is one. This is what the tool exists to count.',
            },
          ]}
        />
      </div>
    </div>
  );
}

/**
 * Plain-English titles for the measurements that are *supposed* to be
 * non-zero. The list itself comes from `NON_DEFECT_METRICS` in model.ts so
 * this page cannot drift out of step with the code; only the wording is here.
 *
 * An unmapped key falls back to the key itself rather than being dropped: the
 * right failure is a row that looks unfinished, not a row that silently
 * disappears from the page whose subject is things that silently disappear.
 */
const NON_DEFECT_TITLE: Record<string, string> = {
  // Named as the row reads under Runs → By check, so a reader who arrived
  // here from that table can find the same thing twice.
  clickableNoRole: 'Clickable elements with no role',
  'unreachableTotals.panels': 'Regions that are out of the list',
  unreachablePanels: 'The named list of those regions',
  'navLinks.inTree < navLinks.total': 'Nav links that are not in the list',
};

function WhatCounts() {
  return (
    <Section
      id="what-counts"
      title="What counts as a defect"
      lead="Two questions decide it. Hidden is not the same as unfindable, and only one of them is a problem."
    >
      <DecisionTree />

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel label="Menu open" tone="good">
          <div className="rounded-card border border-rule bg-paper p-3">
            <TreeLine role="button" name="Products" note="expanded" tone="good" />
            <TreeLine depth={1} role="link" name="General liability" />
            <TreeLine depth={1} role="link" name="Professional liability" />
            <TreeLine depth={1} role="link" name="Workers’ comp" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">Everything is in the list.</p>
        </Panel>

        <Panel label="Closed, and it says so" tone="good">
          <div className="rounded-card border border-rule bg-paper p-3">
            <TreeLine role="button" name="Products" note="collapsed" tone="good" />
            <div className="py-[3px] pl-[14px] font-mono text-xs text-faint">
              (3 links, hidden for now)
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            <strong className="font-medium text-ink">Hidden.</strong> The links are out of the
            list, but the button announces them. An agent knows to open it.
          </p>
        </Panel>

        <Panel label="Closed, and silent" tone="bad">
          <div className="rounded-card border border-rule bg-paper p-3">
            <TreeLine role="text" name="Products" note="not a button" tone="bad" />
            <div className="py-[3px] pl-[14px] font-mono text-xs text-faint">
              (3 links, hidden — nothing mentions them)
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            <strong className="font-medium text-critical">Unfindable.</strong> The links exist,
            but nothing in the list points to them. They open on hover, and an agent has no
            pointer.
          </p>
        </Panel>
      </div>

      <div className="mt-6 max-w-measure space-y-3 text-sm leading-relaxed text-muted">
        <p className="font-display text-base font-bold tracking-tight text-ink">
          Hidden is not unfindable. Only unfindable is a defect.
        </p>
        <p>
          One thing never reaches the list at all: a{' '}
          <strong className="font-medium text-ink">ghost control</strong> — something that
          responds to a click but was never marked as a button. No standard rulebook can see it.
          Ours counts it.
        </p>
        <p>
          Most of the defects lived in a handful of shared building blocks — the navigation, the
          link and image primitives, the expandable panels — so they were fixed at the source.
          That is why the counts fall on every page at once rather than one page at a time.
        </p>
      </div>

      <div className="mt-8">
        <h3 className="font-display text-base font-bold tracking-tight text-ink">
          The exact lists
        </h3>
        <p className="mt-1 max-w-measure text-sm leading-relaxed text-muted">
          Both are printed from the scanner&apos;s own definitions, so this page cannot drift from
          what it measures.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
          <Panel label="Counted as defects — a correct page has all of these at zero" tone="bad">
            <ul className="space-y-2">
              {PAGE_DEFECTS.map((d) => (
                <li key={d.key} className="border-b border-rule pb-2 last:border-0 last:pb-0">
                  <div className="text-sm font-medium text-ink">{d.label}</div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{d.why}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel label="Expected to be non-zero — descriptions, not scores" tone="good">
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
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 6. What every figure is stamped with                                */
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
    <Section
      id="stamp"
      title="What every figure is stamped with"
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
          value={figures?.probeVersion}
          note="Which version of the scanner’s own checks ran. A change in the checks is not a change in the site."
        />
        <StampRow
          label="Browser"
          value={figures?.browserVersion}
          note="Browsers differ on what goes in the list, so this is part of the measurement."
        />
      </div>
      {figures ? (
        <p className="mt-3 text-xs text-faint">From the latest run on file.</p>
      ) : (
        <p className="mt-3 text-xs text-faint">
          No run on file, so every row is blank rather than filled in.
        </p>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 7. What it cannot tell you                                          */
/* ------------------------------------------------------------------ */

/**
 * The limits, written down. A limit that is known and published is a caveat
 * a reader can work with; a limit that is only known is how a page full of
 * stranded content comes back clean and nobody asks why.
 *
 * Two kinds are mixed here, and the badge is what separates them:
 *
 *   permanent — no version of this tool answers this, because the answer is
 *               not represented anywhere it can read. Not a backlog.
 *   open      — a real gap with a real closing move, not yet made.
 *
 * Rule for anything added here: one sentence, in the concrete, and never
 * imply a number is safer than it is.
 */
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
  {
    title: 'How many clickable elements Insureon has',
    badge: 'Not reproducible',
    kind: 'open',
    body: 'insureon.com serves different markup to identical requests, so its volume figures move between scans. Its structural figures — what is in the list, what is announced — do not.',
  },
];

function Limits() {
  return (
    <Section
      id="limits"
      title="What it cannot tell you"
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
        <strong className="font-medium text-ink">A check that never ran is never reported as a
        pass.</strong>{' '}
        If something could not be measured, the dashboard says so rather than showing a zero.
      </p>
    </Section>
  );
}
