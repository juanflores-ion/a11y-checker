import { NON_DEFECT_METRICS, PAGE_DEFECTS } from '@/lib/model';

import { Eyebrow } from './Primitives';

/**
 * The explainer page.
 *
 * Written for someone who has never opened a dev tool. Every diagram here is
 * built from real markup rather than an image, for two reasons: it stays sharp
 * and responsive at any size, and — fittingly for this tool — a screen reader
 * or an agent can read the diagrams too. An accessibility tool that explained
 * itself in flat images would be a poor advertisement for its own argument.
 *
 * Any figure shown is passed in from the latest real run. Nothing here is
 * illustrative-but-invented; if there is no run on file, the figures are simply
 * omitted rather than filled in with plausible ones.
 */
export interface HowItWorksFigures {
  navTotal: number;
  navInTree: number;
  pages: number;
  profiles: number;
  /**
   * Provenance, from `RunMeta`. Optional because it is optional there, and it
   * is optional there because the three runs in `data/runs/` predate it — no
   * run file anywhere names the browser that produced it, and three different
   * Chromium majors were used to drive scans in a single working session.
   *
   * Absent renders as "not recorded". Never as a version number somebody
   * inferred, and never silently omitted: a missing stamp is the finding.
   */
  probeVersion?: string | null;
  browserVersion?: string | null;
}

export function HowItWorks({ figures }: { figures: HowItWorksFigures | null }) {
  return (
    <div className="space-y-16">
      <Hero />
      <TheBigIdea />
      <OneScan />
      <TwoDevices figures={figures} />
      <FiveQuestions />
      <HiddenVsUnfindable figures={figures} />
      <Definitions />
      <NotADefect figures={figures} />
      <NeverTouches />
      <FromScanToNumber figures={figures} />
      <Provenance figures={figures} />
      <WhenItIsWrong />
      <SolidGround />
      <CannotTell />
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
  lead?: string;
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
        ChatGPT, Gemini and Perplexity don&apos;t see your site the way you do. They can&apos;t
        see colour, layout or where a button sits. The browser hands them a plain list of the
        things on the page and what each one is for. If something is missing from that list, it
        doesn&apos;t exist as far as the agent is concerned.
      </p>
      <p className="mt-3 text-base leading-relaxed text-muted">
        This tool measures how much of our sites survives that translation.
      </p>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* 2. The big idea                                                     */
/* ------------------------------------------------------------------ */

function TheBigIdea() {
  return (
    <Section
      id="big-idea"
      title="The same page, two ways"
      lead="On the left, what a person sees. On the right, the list the browser hands an agent. They are not the same thing — and the gaps between them are what this tool counts."
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
              <div className="rounded-card bg-accent px-3 py-1.5 text-[10px] font-medium text-white">
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
            A heading, some text, a blue button, a menu icon and a small round icon. Obvious at
            a glance.
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
            The button came through fine. The menu icon and the round icon arrived as{' '}
            <span className="font-mono text-critical">???</span> — the agent can tell something
            is there, but not what it does or how to use it.
          </p>
        </Panel>
      </div>

      <p className="mt-5 max-w-measure text-sm leading-relaxed text-muted">
        That list is called the <strong className="font-medium text-ink">accessibility tree</strong>.
        Screen readers use it too, which is why the same fix helps blind users and AI agents at
        once. Everything below is about measuring what does and doesn&apos;t make it into that
        list.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 3. One scan, step by step                                           */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    n: 1,
    title: 'Open a real browser',
    body: 'Not a script that downloads the HTML — an actual Chrome, running the JavaScript, the way a visitor would.',
  },
  {
    n: 2,
    title: 'Pretend to be a specific device',
    body: 'Desktop or mobile. This matters more than it sounds — see the next section.',
  },
  {
    n: 3,
    title: 'Load the page and wait',
    body: 'Just over two seconds, so menus, banners and anything else that loads late has settled before anything is counted.',
  },
  {
    n: 4,
    title: 'Check it is really the page',
    body: 'A missing page often answers "200 OK" and shows a friendly error. Those tripped almost no checks and once made a broken run look like a 47% improvement. Anything that is not the real page is recorded as a failure and counts for nothing.',
  },
  {
    n: 5,
    title: 'Run the standard rulebook',
    body: 'axe-core, the same engine behind Google PageSpeed. It catches the well-known problems: buttons with no name, form fields with no label, poor contrast.',
  },
  {
    n: 6,
    title: 'Run our own checks',
    body: 'The rulebook has a blind spot: it can only check things that already look like controls. Ours ask a different question — see “The five questions” below.',
  },
  {
    n: 7,
    title: 'Ask the browser to confirm',
    body: 'For anything suspicious, we ask Chrome directly whether it really responds to a click, and which script attached that behaviour. A guess gets checked before it becomes a number.',
  },
  {
    n: 8,
    title: 'Write it down',
    body: 'Counts only — never “element #4 on row 3”. Class names change on every deploy, so anything tied to them would break constantly.',
  },
];

function OneScan() {
  return (
    <Section
      id="one-scan"
      title="What happens when one page is scanned"
      lead="Eight steps, about five seconds per page."
    >
      {/*
        The number and its connecting rail live in a real column rather than
        being absolutely positioned outside the list. Negative offsets clip on
        narrow screens, and this is a page about things that quietly disappear.
      */}
      <ol className="space-y-0">
        {STEPS.map((s, i) => (
          <li key={s.n} className="flex gap-4">
            <div className="flex shrink-0 flex-col items-center">
              <span
                aria-hidden="true"
                className="flex h-[26px] w-[26px] items-center justify-center rounded-pill border border-rule bg-card font-mono text-[11px] font-medium text-accent shadow-card"
              >
                {s.n}
              </span>
              {i < STEPS.length - 1 ? (
                <span aria-hidden="true" className="w-px flex-1 bg-rule" />
              ) : null}
            </div>
            <div className="max-w-measure pb-7 last:pb-0">
              <h3 className="font-display text-sm font-bold leading-[26px] text-ink">
                {s.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Two devices                                                      */
/* ------------------------------------------------------------------ */

function TwoDevices({ figures }: { figures: HowItWorksFigures | null }) {
  return (
    <Section
      id="two-devices"
      title="One address, two different pages"
      lead="Our sites decide what to send before the page is even built, based on what the visitor says it is. A phone and a laptop asking for the same address get genuinely different pages — not the same page at two widths."
    >
      <div className="rounded-lg border border-rule bg-card p-5 shadow-card">
        <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-card border border-rule bg-paper p-4 text-center">
            <div className="font-mono text-xs text-muted">insureon.com</div>
            <div className="mt-1 text-sm text-ink">One address</div>
          </div>

          <div aria-hidden="true" className="hidden justify-center sm:flex">
            <svg width="34" height="80" viewBox="0 0 34 80" fill="none">
              <path d="M1 40h12M13 40V14h20M13 40v26h20" stroke="#E6E9EE" strokeWidth="2" />
              <path d="M29 10l5 4-5 4M29 62l5 4-5 4" stroke="#8B95A3" strokeWidth="2" fill="none" />
            </svg>
          </div>

          <div className="space-y-3">
            <div className="rounded-card border border-accent/30 bg-accent/[0.04] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-pill bg-accent px-2 py-0.5 text-[11px] font-medium text-white">
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
                <span className="rounded-pill bg-ink/70 px-2 py-0.5 text-[11px] font-medium text-white">
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

      <div className="mt-5 max-w-measure space-y-3 text-sm leading-relaxed text-muted">
        <p>
          This caught us out. The scanner used to measure only the phone version — so every
          number it produced described the one page an agent never receives. It now measures
          both, every time, and every figure says which device it belongs to.
        </p>
        <p>
          They fail in opposite ways, so neither stands in for the other.
          {figures ? (
            <>
              {' '}
              On the desktop home page there are{' '}
              <strong className="font-medium text-ink tnum">{figures.navTotal}</strong>{' '}
              navigation links in the page, and an agent can find{' '}
              <strong className="font-medium text-ink tnum">{figures.navInTree}</strong> of them.
            </>
          ) : null}
        </p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 5. The five questions                                               */
/* ------------------------------------------------------------------ */

const QUESTIONS = [
  {
    q: 'Is it there at all?',
    body: 'Does it show up in the list as something you can use? A menu built from a plain <div> looks like a button but arrives as nothing.',
    fail: 'A hamburger icon that no audit ever mentions, because there is no button for a button rule to complain about.',
  },
  {
    q: 'Does it say what it does?',
    body: 'A control needs a name. “Get quotes” is a name. An icon with no label is not.',
    fail: 'Fifty back arrows that read as blank.',
  },
  {
    q: 'Can it actually be used?',
    body: 'Can you reach it with the Tab key and activate it? An agent has no mouse and cannot hover.',
    fail: 'A menu that only opens when a pointer moves over it.',
  },
  {
    q: 'Is anything pretending to be gone?',
    body: 'A closed menu should really be gone. If it is only pushed off-screen, its links are still in the list — invisible, but reachable by Tab.',
    fail: 'Tabbing into 68 links you cannot see.',
  },
  {
    q: 'Can hidden things still be found?',
    body: 'Hiding a closed menu is correct. But something visible has to say it exists, or nobody knows to open it.',
    fail: 'A menu hidden properly, with nothing anywhere saying it is there.',
  },
];

function FiveQuestions() {
  return (
    <Section
      id="questions"
      title="The five questions we ask about every control"
      lead="The standard rulebook checks question two, and only for things that already passed question one. That is the blind spot our own checks exist to cover."
    >
      <ol className="grid gap-4 sm:grid-cols-2">
        {QUESTIONS.map((item, i) => (
          <li
            key={item.q}
            className="rounded-card border border-rule bg-card p-4 shadow-card"
          >
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-xs text-faint">{i + 1}</span>
              <h3 className="font-display text-sm font-bold text-ink">{item.q}</h3>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.body}</p>
            <p className="mt-2 border-t border-rule pt-2 text-xs leading-relaxed text-critical">
              Fails as: {item.fail}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Hidden vs unfindable                                             */
/* ------------------------------------------------------------------ */

function HiddenVsUnfindable({ figures }: { figures: HowItWorksFigures | null }) {
  return (
    <Section
      id="hidden"
      title="The distinction everything turns on"
      lead="Hidden is not the same as unfindable. Only one of them is a problem, and getting this backwards is the single easiest way to make a fix look like a regression."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel label="Menu open" tone="good">
          <div className="rounded-card border border-rule bg-paper p-3">
            <TreeLine role="button" name="Products" note="expanded" tone="good" />
            <TreeLine depth={1} role="link" name="General liability" />
            <TreeLine depth={1} role="link" name="Professional liability" />
            <TreeLine depth={1} role="link" name="Workers’ comp" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Everything is in the list. Nothing to fix.
          </p>
        </Panel>

        <Panel label="Closed, and it says so" tone="good">
          <div className="rounded-card border border-rule bg-paper p-3">
            <TreeLine role="button" name="Products" note="collapsed" tone="good" />
            <div className="py-[3px] pl-[14px] font-mono text-xs text-faint">
              (3 links, hidden for now)
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            <strong className="font-medium text-ink">This is correct.</strong> The links are out
            of the list, but the button announces them. An agent knows to open it.
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
            <strong className="font-medium text-critical">This is the problem.</strong> The links
            exist in the page but nothing points to them. They open on hover, and an agent has
            no pointer.
          </p>
        </Panel>
      </div>

      <div className="mt-5 max-w-measure space-y-3 text-sm leading-relaxed text-muted">
        <p>
          So the number we report is <strong className="font-medium text-ink">links an agent
          cannot find</strong> — hidden <em>and</em> unannounced. Not simply &ldquo;hidden&rdquo;.
        </p>
        <p>
          That distinction is not academic. An early version of this tool counted everything
          hidden. When a team fixed a menu properly — hiding it and adding a button that
          announces it — the tool reported the fix as{' '}
          <strong className="font-medium text-critical">680 new problems</strong>. The real
          answer was 51, and the fix was right.
          {figures ? (
            <>
              {' '}The check was corrected; the same site now measures honestly.
            </>
          ) : null}
        </p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 7. The definitions                                                  */
/* ------------------------------------------------------------------ */

/**
 * The definitions, and the reason they are a section rather than a comment.
 *
 * Five classes of false positive have shipped from this scanner. Three were the
 * code being wrong about the browser — it kept a private list of the ways a
 * page can hide something, and browsers keep adding ways — and moving those
 * onto the browser's own answer fixes them. One is a proxy problem no layer of
 * the browser can settle: a real control and a div an analytics script happened
 * to bind a click to are the same node.
 *
 * The fifth was never a coding error at all. Counting *hidden* where the defect
 * is *unannounced* is a definition being wrong, and no amount of ground truth
 * settles what "unfindable" ought to mean. Somebody has to write it down — and
 * until somebody does, each layer quietly invents its own answer. That is not
 * hypothetical here: the same definition error had to be found and fixed twice,
 * once in the aggregation layer and again in the verdict layer above it,
 * because no two call sites shared a definition to be wrong about.
 *
 * So this section is not documentation of the code. It is the thing the code is
 * written against.
 */

interface Outcome {
  /** The condition, in the diagram's own shorthand. */
  condition: string;
  term: string;
  verdict: string;
  tone: 'good' | 'bad';
  body: string;
}

function Branch({
  question,
  then,
  outcomes,
}: {
  question: string;
  then: string;
  outcomes: Outcome[];
}) {
  return (
    <div className="rounded-card border border-rule bg-paper p-4">
      <h3 className="font-display text-sm font-bold text-ink">{question}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{then}</p>
      <ul className="mt-3 space-y-2">
        {outcomes.map((o) => (
          <li
            key={o.term}
            className={`rounded-card border p-3 ${
              o.tone === 'good'
                ? 'border-good/30 bg-good/[0.04]'
                : 'border-critical/30 bg-critical/[0.04]'
            }`}
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-mono text-[11px] text-faint">{o.condition}</span>
              <span
                className={`text-sm font-medium ${
                  o.tone === 'good' ? 'text-good' : 'text-critical'
                }`}
              >
                {o.term}
              </span>
              <span className="text-[11px] text-muted">{o.verdict}</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted">{o.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClassificationDiagram() {
  return (
    <div className="rounded-lg border border-rule bg-card p-5 shadow-card">
      <div className="flex justify-center">
        <span className="rounded-pill border border-rule bg-paper px-3 py-1 text-xs font-medium text-muted">
          Anything on the page
        </span>
      </div>
      {/*
        Decorative only — the branch headings carry the same information as
        text, so a reader who never sees the rule loses nothing.
      */}
      <div aria-hidden="true" className="mx-auto h-4 w-px bg-rule" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Branch
          question="It is in the list"
          then="An agent has it. The only thing left to ask is whether a person can see it."
          outcomes={[
            {
              condition: 'on screen',
              term: 'Working',
              verdict: 'not a defect',
              tone: 'good',
              body: 'The person and the agent are looking at the same thing. Nothing to report.',
            },
            {
              condition: 'off screen',
              term: 'Trapped',
              verdict: 'defect',
              tone: 'bad',
              body: 'Handed to the agent, still reachable by Tab, and invisible to the person sitting in front of it.',
            },
          ]}
        />
        <Branch
          question="It is not in the list"
          then="An agent does not have it. The only thing that matters is whether anything in the list points at it."
          outcomes={[
            {
              condition: 'something announces it',
              term: 'Hidden',
              verdict: 'not a defect',
              tone: 'good',
              body: 'A closed menu behind a button that says the menu is there. This is what correct looks like.',
            },
            {
              condition: 'nothing announces it',
              term: 'Unfindable',
              verdict: 'defect',
              tone: 'bad',
              body: 'No way in, and nothing to suggest there is one. This is what the tool exists to count.',
            },
          ]}
        />
      </div>
      <p className="mt-4 border-t border-rule pt-4 text-sm leading-relaxed text-muted">
        A <strong className="font-medium text-ink">ghost control</strong> never reaches this
        diagram. It behaves like a control but was never announced as one, so there is nothing in
        the list to classify — which is precisely why no rulebook has ever reported it.
      </p>
    </div>
  );
}

/** Two lines of markup that differ only in the thing that matters. */
function MarkupContrast({
  rows,
}: {
  rows: Array<{ code: string; verdict: string; tone: 'good' | 'bad' }>;
}) {
  return (
    <div className="mt-3 space-y-1.5">
      {rows.map((r) => (
        <div key={r.code} className="rounded-card border border-rule bg-paper px-3 py-2">
          {/*
            Rendered as text, never as markup. React escapes children by
            default and that is the whole point: an earlier findings export
            interpolated captured HTML into the page and the row went blank.
          */}
          <code className="block overflow-x-auto whitespace-pre font-mono text-[11px] leading-relaxed text-ink">
            {r.code}
          </code>
          <div
            className={`mt-1 text-[11px] font-medium ${
              r.tone === 'good' ? 'text-good' : 'text-critical'
            }`}
          >
            {r.verdict}
          </div>
        </div>
      ))}
    </div>
  );
}

interface Term {
  term: string;
  gloss: string;
  body: React.ReactNode;
  /**
   * The incident. Every one of these four definitions has already been got
   * wrong in production code, and the whole argument for writing them down is
   * what each mistake cost — so the incident is part of the definition, not a
   * footnote to it.
   */
  cost: string;
  /** Overrides the label above `cost` where "cost" is not the honest framing. */
  costLabel?: string;
  figure?: React.ReactNode;
}

const TERMS: Term[] = [
  {
    term: 'Unfindable',
    gloss: 'not the same as hidden',
    body: (
      <>
        <p>
          Something is unfindable when an agent has no route to it: it is not in the list, and
          nothing that <em>is</em> in the list mentions it. Hidden, on its own, is not a problem —
          a closed menu is <em>supposed</em> to be out of the list, and putting it back would be
          the bug. What turns hidden into unfindable is silence.
        </p>
        <p className="mt-2">
          So the question is never &ldquo;is this hidden?&rdquo; It is &ldquo;is there anything an
          agent could act on that leads here?&rdquo; If there is, it is hidden and it is fine. If
          there is not, it is unfindable, and that is what gets published.
        </p>
      </>
    ),
    cost:
      'An early version of this tool counted everything hidden. A team hid a menu properly and added a button announcing it — the correct fix, exactly what we had asked for — and the tool reported it as 680 new problems. The true figure was 51.',
  },
  {
    term: 'Announced',
    gloss: 'what makes a hidden region reachable',
    body: (
      <>
        <p>
          A hidden region counts as reachable when something an agent can find says the region
          exists. That means a control that is itself in the list and declares it opens something:
          a control whose markup <em>names the region it opens</em>:{' '}
          <span className="font-mono text-xs">aria-controls</span>,{' '}
          <span className="font-mono text-xs">aria-owns</span>,{' '}
          <span className="font-mono text-xs">popovertarget</span> or{' '}
          <span className="font-mono text-xs">commandfor</span> resolving to it, or a plain{' '}
          <span className="font-mono text-xs">&lt;summary&gt;</span>, where the spec names the
          region for you.
        </p>
        <p className="mt-2">
          <strong>Position is not a relationship.</strong> A button carrying only{' '}
          <span className="font-mono text-xs">aria-expanded</span> or{' '}
          <span className="font-mono text-xs">aria-haspopup</span> says that{' '}
          <em>something</em> opens. It never says what. A sighted person reads the answer off the
          layout; an agent cannot compute it, and this tool measures what an agent can do. So a
          hamburger sitting next to a hidden drawer does not announce it — not because the site is
          badly built, but because the connection was never written down.
        </p>
        <p className="mt-2">
          A <span className="font-mono text-xs">:hover</span> rule qualifies as none of those. It
          is a style rule, not an element — there is nothing in the list to name, nothing to
          activate, and an agent has no pointer to move over it. The menu it opens may be
          beautifully built and completely unreachable.
        </p>
      </>
    ),
    figure: (
      <MarkupContrast
        rows={[
          {
            code: '<button aria-expanded="false" aria-controls="mega">Products</button>',
            verdict: 'Announced. It names the region, so an agent knows what opens.',
            tone: 'good',
          },
          {
            code: '<button aria-expanded="false">Products</button>',
            verdict: 'Not announced. Something opens — but nothing says what.',
            tone: 'bad',
          },
          {
            code: '.nav-item:hover .mega-menu { display: block }',
            verdict: 'Not announced. Nothing to find, nothing to press.',
            tone: 'bad',
          },
        ]}
      />
    ),
    costLabel: 'What this rule costs, and why it is still the rule:',
    cost:
      'A disclosure that works perfectly for a person, but names no target, now reports as unfindable. That is a real cost and it is accepted, because the alternative is worse: pairing a trigger to a region by position is guesswork, and every false clean this scanner ever shipped on this metric came through some version of it — a <summary> three levels down an unrelated <details>, a cookie-preferences button five wrappers away, a chat button in a header. Each fix narrowed which neighbours counted and the next shape stayed open. The rule is fixed now and does not move to match a site: if a site disagrees with it, the site is what changes.',
  },
  {
    term: 'Trapped',
    gloss: 'in the list, but not operable',
    body: (
      <>
        <p>
          The opposite mistake. The region is in the list, so an agent is told it can go there,
          but it is not on screen — a drawer closed by being pushed past the edge of the window
          rather than by being removed. Every link inside it is still handed over. Tab still walks
          into it. Both our sites do this on the phone layout: the whole navigation stays in the
          tab order behind a closed drawer.
        </p>
        <p className="mt-2">
          A keyboard user watches focus vanish into somewhere they cannot see. An agent is offered
          destinations that a person looking at the same screen would swear are not there. In the
          list, announced, and operable by nobody.
        </p>
      </>
    ),
    cost:
      'Trapped and unfindable are different defects, and collapsing them into one is how a correct four-control accordion on Insureon’s desktop home page — off screen, but announced by a button that says so — came to be reported as a blocking dead end. Off screen is a lesser problem than no way in. It is not the same problem.',
  },
  {
    term: 'Ghost control',
    gloss: 'behaves like a control, declares no role',
    body: (
      <>
        <p>
          A ghost control responds to a click, has no role, no name, and is not in the tab order.
          No rulebook will ever mention it, because there is no button for a button rule to
          complain about — which is why a site can be full of them and come back clean. Insureon&apos;s
          menu back control is a <span className="font-mono text-xs">&lt;div&gt;</span>: still
          nameless, still not keyboard-operable, and <span className="font-mono text-xs">button-name</span>{' '}
          reports zero.
        </p>
        <p className="mt-2">
          What does <em>not</em> make something a control is a click handler that was attached to
          everything. Analytics scripts bind listeners indiscriminately, and a handler that is on
          most of the page says something about the tracker, not about the element. The scanner
          now asks the browser which script attached the behaviour and disqualifies the shared
          ones.
        </p>
      </>
    ),
    cost:
      'On Insureon every one of the 37 confirmed click listeners on the page resolved to a single line of one tracking file. The scanner read each as proof that a decorative icon was secretly a button, and reported fourteen defects against source files containing no handler at all.',
  },
];

function Definitions() {
  return (
    <Section
      id="definitions"
      title="Four words, used precisely"
      lead="Almost every argument about a finding turns out to be an argument about one of these four words. They are settled here, in plain English, and the code is written against these definitions rather than the other way round."
    >
      <ClassificationDiagram />

      <dl className="mt-6 grid gap-4 lg:grid-cols-2">
        {TERMS.map((t) => (
          <div key={t.term} className="rounded-card border border-rule bg-card p-4 shadow-card">
            <dt className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-base font-bold tracking-tight text-ink">
                {t.term}
              </span>
              <span className="text-xs text-faint">{t.gloss}</span>
            </dt>
            <dd className="mt-2 text-sm leading-relaxed text-muted">
              {t.body}
              {t.figure}
              <p className="mt-3 border-t border-rule pt-2 text-xs leading-relaxed text-muted">
                <strong className="font-medium text-critical">
                  {t.costLabel ?? 'What getting this wrong cost:'}
                </strong>{' '}
                {t.cost}
              </p>
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 max-w-measure text-sm leading-relaxed text-muted">
        One sentence carries most of it:{' '}
        <strong className="font-medium text-ink">
          hidden is not unfindable, and only unfindable is a defect.
        </strong>
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 8. What is deliberately not a defect                                */
/* ------------------------------------------------------------------ */

/**
 * Plain-English titles for the measurements that are *supposed* to be
 * non-zero. The list itself comes from `NON_DEFECT_METRICS` in model.ts so
 * this page cannot drift out of step with the code; only the wording is here.
 *
 * An unmapped key falls back to the key itself rather than being dropped. If
 * someone adds a fifth entry to the code and forgets this file, the right
 * failure is a row that looks unfinished — not a row that silently disappears
 * from the page whose entire subject is things that silently disappear.
 */
const NON_DEFECT_TITLE: Record<string, string> = {
  // Named exactly as the row reads under Runs → By check, so a reader who
  // arrived here from that table can find the same thing twice.
  clickableNoRole: 'Clickable elements with no role',
  'unreachableTotals.panels': 'Regions that are out of the list',
  unreachablePanels: 'The named list of those regions',
  'navLinks.inTree < navLinks.total': 'Nav links that are not in the list',
};

function NotADefect({ figures }: { figures: HowItWorksFigures | null }) {
  const gap = figures ? figures.navTotal - figures.navInTree : null;
  return (
    <Section
      id="not-a-defect"
      title="What is deliberately not a defect"
      lead="Some of the numbers here are supposed to be non-zero on a page with nothing whatsoever wrong with it. Each one has been mistaken for a fault at least once, so both lists are kept in the code and printed here from it."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel label="A correct page has all of these at zero" tone="bad">
          <ul className="space-y-2">
            {PAGE_DEFECTS.map((d) => (
              <li key={d.key} className="border-b border-rule pb-2 last:border-0 last:pb-0">
                <div className="text-sm font-medium text-ink">{d.label}</div>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{d.why}</p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel label="These are expected to be non-zero" tone="good">
          <ul className="space-y-2">
            {NON_DEFECT_METRICS.map((m) => (
              <li key={m.key} className="border-b border-rule pb-2 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-medium text-ink">
                    {NON_DEFECT_TITLE[m.key] ?? m.key}
                  </span>
                  <span className="font-mono text-[11px] text-faint">{m.key}</span>
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{m.why}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-5 max-w-measure space-y-3 text-sm leading-relaxed text-muted">
        <p>
          The right-hand column is the one that causes trouble. A page can legitimately hold
          dozens of blocks that are out of the list — that is what a closed menu, a collapsed
          accordion and a dialog that is not open all look like. Counting them would report every
          correctly built disclosure on the site as a fault, and the better the implementation,
          the more of them there would be.
        </p>
        <p>
          The same goes for navigation.{' '}
          {figures && gap !== null && gap > 0 ? (
            <>
              On Insureon&apos;s desktop home page the run on file counts{' '}
              <strong className="font-medium text-ink tnum">{figures.navTotal}</strong> navigation
              links and finds <strong className="font-medium text-ink tnum">{figures.navInTree}</strong>{' '}
              of them in the list. The gap of{' '}
              <strong className="font-medium text-ink tnum">{gap}</strong> is a description, not a
              score.
            </>
          ) : (
            <>The gap between links in the page and links in the list is a description, not a score.</>
          )}{' '}
          Put a working disclosure button in front of those menus and the gap stays exactly where
          it is while the defect goes to zero — which is the whole point, and the exact mistake
          that once turned a completed fix into 680 imaginary regressions.
        </p>
        <p className="rounded-card border border-rule bg-card px-4 py-3">
          <strong className="font-medium text-ink">Where these lists live:</strong> both are read
          straight out of the scanner&apos;s own definitions at build time. Nobody can quietly
          promote a description into a defect by editing this page, and nobody can fix a
          disagreement between the code and the explanation by rewording the explanation.
        </p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 9. What it never does                                               */
/* ------------------------------------------------------------------ */

function NeverTouches() {
  return (
    <Section
      id="never"
      title="It never touches the page"
      lead="No clicking, no hovering, no scrolling, no typing. It looks at the page exactly as delivered and writes down what it sees."
    >
      <div className="max-w-measure space-y-3 text-sm leading-relaxed text-muted">
        <p>
          This is a deliberate limit, and it costs us something: the tool cannot tell you what
          happens <em>after</em> a menu opens. We accept that, because the alternative is worse.
        </p>
        <p>
          The moment a scan starts clicking things, no two runs measure the same page. One run
          opens the menu, the next catches a cookie banner first and opens something else. Every
          comparison between runs — every &ldquo;did our fix work?&rdquo; — quietly stops meaning
          anything.
        </p>
        <p className="rounded-card border border-rule bg-card px-4 py-3">
          <strong className="font-medium text-ink">The trade:</strong> a narrower question,
          answered the same way every time — so a change in the numbers is a change in the site
          rather than a change in what we asked. That holds as long as both runs were taken with
          the same instrument, which is what the last section here is about.
        </p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 10. From scan to number                                             */
/* ------------------------------------------------------------------ */

function FromScanToNumber({ figures }: { figures: HowItWorksFigures | null }) {
  const pages = figures?.pages ?? 20;
  const profiles = figures?.profiles ?? 2;
  return (
    <Section
      id="run"
      title="How a scan becomes the numbers on this dashboard"
      lead="One run covers every tracked page on both sites, at both device profiles, in one sitting."
    >
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { k: `${pages} pages`, v: 'Ten page types per site — home, a policy page, a category, an article, and so on.' },
          { k: `× ${profiles} devices`, v: 'Desktop and mobile, each with the matching device identity.' },
          { k: 'One run file', v: 'Every count, plus the device profile, the rulebook version, and the engine that produced it.' },
          { k: 'This dashboard', v: 'Reads those files. It never scans anything itself.' },
        ].map((s, i) => (
          <div key={s.k} className="rounded-card border border-rule bg-card p-4 shadow-card">
            <div className="font-mono text-xs text-faint">Step {i + 1}</div>
            <div className="mt-1 font-display text-base font-bold tracking-tight text-ink">
              {s.k}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.v}</p>
          </div>
        ))}
      </div>
      <p className="mt-5 max-w-measure text-sm leading-relaxed text-muted">
        Because a run is just a file, the numbers can be checked later, compared against any
        other run, and can never quietly change under you. What makes two of those files
        comparable is the next section.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 11. What every figure is stamped with                               */
/* ------------------------------------------------------------------ */

/**
 * Provenance, and why it earned a section of its own.
 *
 * A count is not a measurement until you know the instrument. Two things in
 * this project's history make that concrete rather than pedantic: the scan
 * once measured only the phone layout, so every number described a page no
 * agent is ever served; and three different major versions of Chromium were
 * used to drive scans in a single working session while not one run file
 * recorded which. Both published runs were also produced by probe code that
 * has since been replaced, and nothing anywhere said so — meaning the existing
 * series joins readings taken with different instruments and presents them as
 * a trend.
 *
 * The stamp below is read from the run, not written here. A run that does not
 * carry it renders as "not recorded", which is the honest answer for every
 * file on disk today and must stay visible rather than being tidied away.
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
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule py-2.5 last:border-0">
      <div className="w-36 shrink-0 text-sm font-medium text-ink">{label}</div>
      {recorded ? (
        <div className="font-mono text-xs text-ink">{value}</div>
      ) : (
        <div className="font-mono text-xs text-faint" title="This run did not record it">
          not recorded
        </div>
      )}
      <p className="w-full text-sm leading-relaxed text-muted sm:w-auto sm:flex-1">{note}</p>
    </div>
  );
}

function Provenance({ figures }: { figures: HowItWorksFigures | null }) {
  return (
    <Section
      id="provenance"
      title="Every figure names the instrument that produced it"
      lead="A count on its own is not a measurement. It is a count taken on one device profile, by one version of the checks, in one browser — and comparing across any of those three is comparing two different things and calling the difference a result."
    >
      <div className="rounded-lg border border-rule bg-card p-5 shadow-card">
        <Eyebrow>{figures ? 'The latest run on file' : 'What a run records'}</Eyebrow>
        <div className="mt-3">
          <StampRow
            label="Device profile"
            value={figures ? `${figures.profiles} profiles` : null}
            note="Desktop and mobile are different pages, not one page at two widths. Every figure is reported against a named profile, and two runs are only comparable at the same profile."
          />
          <StampRow
            label="Probe version"
            value={figures?.probeVersion}
            note="Which version of our own checks ran. A change in the checks is not a change in the site, and without this the two are indistinguishable."
          />
          <StampRow
            label="Browser"
            value={figures?.browserVersion}
            note="Which browser, and which executable. Browsers differ on what they put in the list, so this is part of the measurement, not trivia about the machine."
          />
        </div>
        {figures ? null : (
          <p className="mt-3 text-sm leading-relaxed text-muted">
            There is no run on file to read a stamp from, so every row above is blank rather
            than filled in.
          </p>
        )}
      </div>

      <div className="mt-5 max-w-measure space-y-3 text-sm leading-relaxed text-muted">
        <p>
          The device profile has been recorded since the scan learned there were two of them.
          The trend chart plots one profile at a time and drops any run that never measured it,
          rather than joining a mobile reading to a desktop one and drawing a cliff that nobody
          caused.
        </p>
        <p>
          The other two rows are newer, and the runs already on file predate them — which is why
          they read <span className="font-mono text-xs">not recorded</span> rather than showing
          something plausible. That gap is worth stating plainly:{' '}
          <strong className="font-medium text-ink">
            three different major versions of Chromium were used to drive scans in a single
            working session, and no run file anywhere says which one produced it.
          </strong>{' '}
          Nothing about those numbers was wrong. But nobody can now prove which instrument took
          them.
        </p>
        <p className="rounded-card border border-rule bg-card px-4 py-3">
          <strong className="font-medium text-ink">The rule:</strong> a missing stamp renders as
          missing. Filling it in from what was probably used would turn a known gap into a
          confident-looking fact, which is the failure this whole page is written against.
        </p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 12. When it is wrong                                                */
/* ------------------------------------------------------------------ */

function WhenItIsWrong() {
  return (
    <Section
      id="wrong"
      title="When it gets things wrong"
      lead="It does, and pretending otherwise would make it less useful, not more."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-rule bg-card p-4 shadow-card">
          <Eyebrow className="text-critical">False alarm</Eyebrow>
          <h3 className="mt-1.5 font-display text-sm font-bold text-ink">
            Analytics scripts look like buttons
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            A tracking script attaches a click handler to almost everything on the page. The
            scanner read those as evidence that plain icons were secretly controls, and reported
            fourteen problems in a file that contained no such code. It now checks which script
            attached the behaviour, and ignores handlers that were applied to everything.
          </p>
        </div>
        <div className="rounded-card border border-rule bg-card p-4 shadow-card">
          <Eyebrow className="text-critical">False alarm</Eyebrow>
          <h3 className="mt-1.5 font-display text-sm font-bold text-ink">
            Not knowing every way to hide something
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            There are six ways to remove content from the list. The scanner knew four. A
            correctly built accordion used one of the two it did not know, so it was flagged as
            broken — and the better the implementation, the more confidently it got flagged.
          </p>
        </div>
      </div>

      <div className="mt-5 max-w-measure space-y-3 text-sm leading-relaxed text-muted">
        <p>
          Both were found by engineers reading the code and pushing back. That is the intended
          way to use this: the tool points at something, a person checks it, and if the tool was
          wrong, the check gets fixed so it cannot be wrong the same way twice.
        </p>
        <p className="rounded-card border border-rule bg-card px-4 py-3">
          <strong className="font-medium text-ink">The rule we hold to:</strong> a check that
          never ran is never reported as a pass. If something could not be measured, it says so
          — a blank is more useful than a confident zero.
        </p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 13. What is no longer a judgement call                              */
/* ------------------------------------------------------------------ */

/**
 * The good news section, and it has to be specific to be worth anything.
 *
 * Both false alarms in the section above have the same shape: the scanner kept
 * its own list of how a browser can hide, name or connect something, browsers
 * kept adding to the real list, and the gap between the two showed up as
 * confident findings against correct code. That is not a bug that gets fixed
 * once — it is a closed list over an open set, and it regenerates every time
 * the platform moves.
 *
 * So those four questions were handed to the engine that already runs the
 * standard rulebook on every page. This section says which four and what that
 * closes, because "we improved the checks" is the kind of claim this page
 * exists to refuse.
 */
const DELEGATED = [
  {
    q: 'Is it in the list at all?',
    a: 'Tree membership',
    was: 'A private list holding four of the six ways to hide something.',
  },
  {
    q: 'What is it called?',
    a: 'Accessible name',
    was: 'Reading the visible text, which counted glyphs a screen reader is told to skip.',
  },
  {
    q: 'Which element does this one point at?',
    a: 'Reference resolution',
    was: 'One attribute, where several can express the same relationship.',
  },
  {
    q: 'Is it where a person could see it?',
    a: 'On-screen visibility',
    was: 'Hand-written geometry that knew nothing about clipping or scrolling.',
  },
];

function SolidGround() {
  return (
    <Section
      id="solid"
      title="Four answers we stopped writing ourselves"
      lead="Both false alarms above came from the same habit: the scanner kept its own list of how a browser can hide something, name something, or connect one thing to another. Browsers keep adding to the real list. It no longer keeps a list — those four questions are answered by the same engine that runs the standard rulebook."
    >
      {/*
        Cards rather than a table, deliberately. Three columns of prose scroll
        sideways on a phone, and the column that falls off the edge would be
        "what it used to be" — the half that carries the argument.
      */}
      <ul className="grid gap-4 sm:grid-cols-2">
        {DELEGATED.map((d) => (
          <li key={d.q} className="rounded-card border border-rule bg-card p-4 shadow-card">
            <h3 className="font-display text-sm font-bold text-ink">{d.q}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-good">
              Answered by axe-core — {d.a}
            </p>
            <p className="mt-2 border-t border-rule pt-2 text-xs leading-relaxed text-muted">
              Used to be: {d.was}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-5 max-w-measure space-y-3 text-sm leading-relaxed text-muted">
        <p>
          The point is not that axe-core is infallible. It is that we stopped owning the list,
          and something with a test suite and an industry&apos;s worth of users owns it instead.
          Checked against the browser&apos;s own answer on a test page of 59 links, the
          hand-written membership test disagreed with the browser on{' '}
          <strong className="font-medium text-ink tnum">9</strong> of them and the delegated one
          on <strong className="font-medium text-ink tnum">0</strong>. The nine were two hiding
          mechanisms the private list had never heard of.
        </p>
        <p>
          So the fault where{' '}
          <strong className="font-medium text-ink">
            a correct, modern implementation gets flagged precisely because it is modern
          </strong>{' '}
          cannot happen in those four answers any more. That was the worst direction for a tool
          like this to fail in: it punished the teams doing the best work.
        </p>
        <p className="rounded-card border border-rule bg-card px-4 py-3">
          <strong className="font-medium text-ink">What this does not cover:</strong> one
          judgement is still ours, and it is the hard one — deciding that <em>this</em> control
          opens <em>that</em> region. Every problem found in the most recent round of testing was
          in that remaining judgement, and none was in the four answers above. That is why the
          next section is as long as it is.
        </p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 14. What it cannot tell you                                         */
/* ------------------------------------------------------------------ */

/**
 * The limits, written down.
 *
 * This section exists because of false-positive class 1: "hidden" is something
 * you can observe, "unfindable" is a decision somebody has to write down, and
 * for as long as nobody wrote it down each layer of the code quietly invented
 * its own answer. The same is true one level up. A limit that is known and
 * published is a caveat a reader can work with. A limit that is only known is
 * how a page full of stranded content comes back clean and nobody asks why.
 *
 * Two kinds are deliberately mixed here, and the badge is what separates them:
 *
 *   permanent — no version of this tool answers this, because the answer is
 *               not represented anywhere it can read. Do not let these be read
 *               as a backlog.
 *   open      — a real gap with a real closing move, not yet made.
 *
 * Rule for anything added here: name what it costs in the concrete, and never
 * imply a number is safer than it is.
 */
interface Limit {
  title: string;
  /** The one-word status. Its wording is the point; do not generalise it. */
  badge: string;
  kind: 'permanent' | 'open';
  body: React.ReactNode;
}

const LIMITS: Limit[] = [
  {
    title: 'Whether something was ever meant to be a control',
    badge: 'Permanent',
    kind: 'permanent',
    body: (
      <>
        <p>
          Nothing anywhere says &ldquo;this box is a button&rdquo;. Not the page, not the list the
          browser hands an agent, not any browser API. A real control, a decorative icon a
          tracking script happened to bind a click to, and a plain tracked region are the same
          thing to everything that can be read.
        </p>
        <p className="mt-2">
          So this one measurement rests on a <strong className="font-medium text-ink">proxy</strong> —
          something that stands in for an answer nobody can look up. The first proxy was{' '}
          <span className="font-mono text-xs">cursor: pointer</span>, and it was a bad one: it is
          inherited, so a decorative glyph inside a real button reads as a control on a signal it
          never carried. The proxy now is a click handler attached to this element and not to half
          the page. That is a better proxy. It is still a proxy, and no amount of work makes it
          stop being one.
        </p>
        <p className="mt-2">
          <strong className="font-medium text-critical">What the first proxy cost:</strong> on
          Insureon every one of the 37 confirmed click listeners on the page resolved to a single
          line of one tracking file. The tool read each as proof that a decorative icon was
          secretly a button, and reported fourteen defects against source files containing no
          handler at all.
        </p>
      </>
    ),
  },
  {
    title: 'A tracking script and a component library, told apart',
    badge: 'Permanent',
    kind: 'permanent',
    body: (
      <>
        <p>
          The guard against that incident is to disqualify a click handler that most of the page
          shares. But &ldquo;shared&rdquo; has two causes and the browser reports them identically.
          An analytics script binds one handler to everything, and none of those are controls. A
          component library binds one handler to every instance of a component, and{' '}
          <strong className="font-medium text-ink">six product cards sharing one callback are six
          real controls.</strong>
        </p>
        <p className="mt-2">
          Measured against the browser&apos;s own listener registry: elements sharing one named
          handler come back under a single identical key — byte for byte the shape a page-wide
          tracker produces. The one genuine difference is six separate lines of code naming six
          elements, against one line inside a loop, and that is not recorded anywhere the tool can
          reach.
        </p>
        <p className="mt-2">
          <strong className="font-medium text-ink">This is a failing test that stays failing.</strong>{' '}
          Our own suite asserts that six controls are six controls whether or not they share a
          handler, the tool currently answers otherwise, and the test was left red with its reason
          written down rather than quietly adjusted. In practice this makes the tool report{' '}
          <em>fewer</em> controls than exist on a page that also runs analytics.
        </p>
      </>
    ),
  },
  {
    title: 'A disclosure button standing next to an unrelated hover menu',
    badge: 'Unresolved',
    kind: 'open',
    body: (
      <>
        <p>
          Two things sit inside the same container: an accordion with a proper button that says it
          opens something, and — unrelated to it — a mega-menu that only appears when a pointer
          hovers. Does that button count as announcing the mega-menu?
        </p>
        <p className="mt-2">
          Both answers are defensible, and the tool&apos;s own tests demand both: one test family
          requires yes for markup that is, element for element, what another requires no for. That
          is not a bug in either test. It is the definition of &ldquo;this control opens that
          region&rdquo; not being precise enough to decide the case.
        </p>
        <p className="mt-2">
          <strong className="font-medium text-critical">How it currently resolves:</strong> yes —
          the button is accepted, and six links behind such a hover menu publish as{' '}
          <strong className="font-medium text-ink tnum">0</strong> links an agent cannot find. It
          under-reports, which is the wrong direction for a defect count. It is unresolved rather
          than decided, and the same shape is present in the version currently in production.
        </p>
      </>
    ),
  },
  {
    title: 'Content stranded by overflow: clip',
    badge: 'Not reported',
    kind: 'open',
    body: (
      <>
        <p>
          A container can cut off whatever does not fit inside it. Most ways of doing that leave
          the content scrollable, so a keyboard reaching it brings it back into view and nothing
          is lost. <span className="font-mono text-xs">overflow: clip</span> is the one that does
          not: measured across all five values of that property, it is the only one where the
          browser does <em>not</em> reveal the content when focus lands on it.
        </p>
        <p className="mt-2">
          It is also the one the tool says nothing about. That is true of this version and of the
          one before it. A page can be stranding content this way and come back clean — which
          makes it a gap in what the tool finds, not a wrong answer, and the only honest thing to
          do with it until it closes is print it here.
        </p>
      </>
    ),
  },
  {
    title: 'Anything inside an embedded frame',
    badge: 'Not measured',
    kind: 'open',
    body: (
      <>
        <p>
          Pages embed other pages — a chat widget, an embedded quote form, a video player. Every
          measurement here is taken in the outer page only. On the production home pages, roughly{' '}
          <strong className="font-medium text-ink">700 to 770</strong> of the entries in the list
          an agent reads live inside embedded frames, and nothing looks at a single one of them.
        </p>
        <p className="mt-2">
          The standard rulebook does report which frames it could not test, and the scanner
          currently discards that part of its output. So this is worse than a known blind spot: it
          is a blind spot the tool is told about and does not pass on.{' '}
          <strong className="font-medium text-ink">
            Zero problems inside a frame means nobody looked.
          </strong>
        </p>
      </>
    ),
  },
  {
    title: 'How many clickable elements Insureon has',
    badge: 'Not reproducible',
    kind: 'open',
    body: (
      <>
        <p>
          insureon.com does not serve the same page twice. Eight identical requests, no browser
          involved, returned three different documents — 394,816, 434,507 and 703,895 bytes.
          Across sixteen identical scans of its home page, clickable elements with no role came
          back <strong className="font-medium text-ink tnum">1</strong>, then{' '}
          <strong className="font-medium text-ink tnum">36</strong>, then{' '}
          <strong className="font-medium text-ink tnum">87</strong>, and the standard
          rulebook&apos;s failing-node total ranged from 28 to 68.
        </p>
        <p className="mt-2">
          In those same sixteen scans, links an agent cannot find came back{' '}
          <strong className="font-medium text-ink tnum">56</strong> every single time; navigation
          links <strong className="font-medium text-ink tnum">7 of 63</strong> every single time;
          regions out of the list <strong className="font-medium text-ink tnum">5</strong> every
          single time. techinsurance.com was byte-identical over six fetches, so this is the site,
          not the scanner.
        </p>
        <p className="mt-2">
          <strong className="font-medium text-ink">The split is sharp and it matters:</strong> the
          structural figures — the ones this tool leads on — are exact. The volume figures are not
          measurements yet. Every metric on the dashboard now carries what is known about its own
          repeatability, and a metric nobody has scanned twice says so rather than borrowing
          another metric&apos;s confidence.
        </p>
      </>
    ),
  },
  {
    title: 'Whether two older runs were taken with the same instrument',
    badge: 'Not recoverable',
    kind: 'open',
    body: (
      <>
        <p>
          Two runs are comparable only when they share a device profile, a version of the checks,
          and a browser. Every run from now on records all three, and the section above prints
          them. The runs already on file record none of them, and three different major versions
          of Chromium were used to drive scans in one working session.
        </p>
        <p className="mt-2">
          Nothing about those numbers is known to be wrong. But nobody can now prove which
          instrument produced them, so a difference between an old run and a new one cannot be
          attributed to the site with any confidence. That is not fixable in hindsight — it is
          fixable only from here.
        </p>
      </>
    ),
  },
];

function LimitCard({ limit }: { limit: Limit }) {
  const badgeTone =
    limit.kind === 'permanent'
      ? 'border-rule bg-paper text-muted'
      : 'border-serious/30 bg-serious/[0.06] text-serious';
  return (
    <li className="rounded-card border border-rule bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-display text-sm font-bold text-ink">{limit.title}</h3>
        <span
          className={`shrink-0 rounded-pill border px-2 py-0.5 text-[11px] font-medium ${badgeTone}`}
        >
          {limit.badge}
        </span>
      </div>
      <div className="mt-2 text-sm leading-relaxed text-muted">{limit.body}</div>
    </li>
  );
}

function CannotTell() {
  return (
    <Section
      id="limits"
      title="What it cannot tell you"
      lead="Every measurement has an edge. These are this one’s, written down so nobody has to find them by being surprised. Two of them will never close — they are marked, and they are not a backlog."
    >
      <ul className="space-y-4">
        {LIMITS.map((l) => (
          <LimitCard key={l.title} limit={l} />
        ))}
      </ul>

      <div className="mt-6 max-w-measure space-y-3 text-sm leading-relaxed text-muted">
        <p>
          None of this is a reason to distrust the figures that <em>are</em> here. The structural
          measurements — what is in the list, what is announced, what an agent cannot find — came
          back identical on every repeat scan, and they are what the headline numbers are built
          from.
        </p>
        <p className="rounded-card border border-rule bg-card px-4 py-3">
          <strong className="font-medium text-ink">Why this page exists at all:</strong> the worst
          thing this tool can do is report a clean page that is not clean, and it has done that
          twice. A limit you have been told about is a caveat you can work with. A limit nobody
          wrote down is how a page full of unreachable content comes back green and nobody thinks
          to ask.
        </p>
      </div>
    </Section>
  );
}
