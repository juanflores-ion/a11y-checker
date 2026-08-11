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
      <NeverTouches />
      <FromScanToNumber figures={figures} />
      <WhenItIsWrong />
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
/* 7. What it never does                                               */
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
          answered the same way every time. Two runs are always comparable, so a change in the
          numbers is a change in the site.
        </p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 8. From scan to number                                              */
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
          { k: 'One run file', v: 'Every count, plus which browser and rulebook version produced it.' },
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
        other run, and can never quietly change under you. Two runs are only ever compared at
        the same device profile — comparing a desktop reading to a mobile one would show a
        dramatic change that nobody made.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 9. When it is wrong                                                 */
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
