# Agent Readiness

Internal tool for measuring how well AI browsing agents — ChatGPT, Gemini,
Perplexity — can operate our sites, and for tracking what we're fixing.

Agents don't read pixels. They walk the browser's accessibility tree, where
every control needs a role and an accessible name. A button with no name is a
dead end, and the journey stops there. The same barriers hit anyone using a
screen reader or navigating by keyboard.

## Five sections

| Route | Who it's for | What it does |
|---|---|---|
| `/` — **Overview** | Product · SEO · QA | Where both sites stand, then every known problem in plain English: what breaks, what it costs, the technical detail, and what would fix it. |
| `/runs/` — **Runs** | QA · Engineering | Scans already taken: Summary, By check, By page, and Over time once there are two runs. The run picker lives here and nowhere else. |
| `/measure/` — **Measure** | QA · Engineering | Scan any URL on demand — production, staging, a preview build. |
| `/compare/` — **Compare** | QA | Current vs fixed, scanned in one session and diffed check by check. The "did my fix land" workflow. |
| `/how-it-works/` — **How it works** | Anyone | What the scanner does, in plain English: the five questions, the four words used precisely, what every figure is stamped with, and what the tool cannot determine at all. |

Issues had a route of its own until the scanner learned to measure what only
prose could describe. Once every figure it quoted also appeared under Runs → By
check, it stopped being a destination and became a section of Overview.

## Four moving parts

| | What it is | Where |
|---|---|---|
| **Scan engine** | `scanPage()` — Playwright + axe-core against one URL. Everything else calls this. | `scanner/core.mjs` |
| **Scheduled scan** | CLI. Loops the fixed 20-URL target list, writes a timestamped JSON file. | `scanner/scan.mjs` |
| **Live scan server** | Small HTTP server. Runs the same engine on demand, against whatever URL you give it. | `scanner/server.mjs` |
| **Viewer** | Next.js app. Only ever *reads* run files — plus one page that talks to the live scan server directly from the browser. | `src/` |

The viewer and the scanner share no code and no dependencies — a full
scheduled scan takes 3–5 minutes, so it could never live in an API route, and
keeping them apart is what makes the viewer a pure static export you can host
anywhere or hand over as a folder. The live scan server is the one exception
to "the viewer only reads files": its `/scan` endpoint is a real request that
takes real time, so it's a small standalone server, not a Next.js route —
static export and on-demand server-side browser automation genuinely can't
live in the same build.

What keeps "static" and "live" from becoming two different measurements that
quietly drift apart is that **both call `scanPage()` in `core.mjs`.** Nothing
about what's measured changes based on how the scan was triggered.

## Viewer

```bash
npm install
cd scanner && npm install && cd ..   # once — also downloads Chromium

npm run dev      # viewer on :3000 AND the scan server on :4790, one Ctrl-C stops both
npm test         # asserts the baseline numbers — run after touching aggregate.ts or the fixtures
npm run build    # static export into out/
```

`out/` works from any static host, or opened straight off the filesystem.
`npm start` serves it with the scan server alongside, same one-command shape.

### Why it's two processes and not one

A scan drives a real browser for ~100 seconds. That can't live inside a
statically exported site, and it can't live behind a Next API route while
`output: 'export'` is set — a static build has no server to run one. So the
scan server stays a separate process.

What it does *not* need to be is a separate thing you remember to start.
`scripts/dev.mjs` runs both, prefixes their output, and shuts both down
together; if the scanner's dependencies are missing the viewer still starts and
Measure/Compare explain what to install. `npm run dev:viewer` and
`npm run scan-server` still run them individually when you want that.

Dropping `output: 'export'` would collapse this to a single process with the
scanner behind an API route. The trade is that the built artefact stops being a
folder you can host anywhere or hand over as files, and starts needing a Node
host. That's a deployment decision, not a code one.

All the logic is in `src/lib/`. Components are deliberately dumb.

- `model.ts` — types, constants, pure helpers, brand/chart colours. Safe to import from client code.
- `loadRuns.ts` — reads and sorts `data/runs/*.json`. Server only; it imports `node:fs`.
- `aggregate.ts` — totals, per-page rollups, deltas, the target scorecard, and `resolveMetric`.
- `rules.ts` — rule id → label, impact, in-scope flag.
- `issues.ts` — **the issue catalogue.** Prose, severity, and what would fix each one.
- `compare.ts` — current/fixed diffing for the Compare page.
- `sites.ts` — the tracked sites: production origin, host, staging origin when there is one.
- `fixtures/` — run files the tests assert against. Never read by the app.

`npm test` pins the measured baseline as fixtures and runs both `aggregate` and
`compare` suites. If those tests fail, the maths changed, not the websites. Two
of the tests are structural rather than numeric: they assert the fixtures the
rest of the file depends on still exist, and that no two run files carry
identical measurements — a duplicated fixture makes the default
latest-vs-previous comparison read "no change" on every metric, which is
indistinguishable from a genuinely flat result.

## The issue catalogue — `src/lib/issues.ts`

The scanner answers "how many nodes failed check X". Nobody outside engineering
can act on that. `issues.ts` is the layer that turns measurements into
something a Product or SEO reader can act on.

**It never contains a number.** Every figure on the Issues page is resolved
from the current run through `resolveMetric`, so the catalogue can't drift out
of step with the measurements. What it does contain is judgement: severity,
plain-English framing, what would fix it, and the risk of making that change.

**It deliberately tracks no progress state.** There is no "fixed / in progress /
shipped" field, no progress bar and no open-blocker count. That existed briefly
and was removed: it had to be hand-maintained, went stale immediately, and a
green bar telling Product something was fixed when it wasn't is worse than
showing nothing. Whether a fix landed is answered by *measuring* — scan staging
from **Measure**, or diff it against production from **Compare**. Never by an
assertion stored in a file.

So the catalogue describes what production has today. `inScope: false` marks
the two findings (contrast, colour-only links) that are brand-palette decisions
owned elsewhere; they render in a separate section rather than being hidden.

**`detection: 'manual'` is load-bearing.** It marks findings no scanner can
catch — the hamburger `<div>`, the hover-only desktop menu — and the UI badges
them so a green automated report never reads as done.

## Deploying

Vercel, one click. Import the repo; Next.js is auto-detected and there is
nothing to configure.

Everything except the scan is prerendered at build time — `loadRuns()` runs
during the build, never on a request — so the deployment serves static HTML for
every page and spins up a function only for `/api/scan`.

### Live scans work for everyone

`/api/scan` runs the scan on the host, so Measure and Compare work for whoever
opens the dashboard. No install, nothing to start. It calls the same
`scanPage()` the CLI calls, so the numbers are directly comparable — verified
by scanning the same page both ways and diffing: identical rules, identical
counts, identical probe results.

The only difference is which Chromium launches. The CLI uses the full
Playwright download; the route uses `@sparticuz/chromium`, a build small enough
to fit in a function, which also ships the Amazon Linux shared libraries Lambda
needs. **On a local machine those libraries come from your OS** — on WSL, where
they're missing, export `LD_LIBRARY_PATH` before `npm run dev` (the same
libraries the CLI needs for `PLAYWRIGHT_CHROMIUM_PATH`).

Two limits, both deliberate:

- **Three URLs per request**, against the standalone server's ten. A function
  has an execution ceiling and a request that hits it returns nothing at all,
  so it is capped honestly rather than optimistically.
- **An allowlist.** This endpoint fetches a URL it is handed and reports what
  it found; left open on a public host that is server-side request forgery with
  a UI on top. It scans our own domains and their subdomains only. Add staging
  hosts with `SCAN_ALLOWED_HOSTS` (comma-separated), or run the scanner locally
  to scan anything at all. Matching is on dot boundaries, so `insureon.com`
  allows `staging.insureon.com` and never `insureon.com.evil.test`.

Point the Scanner control on Measure or Compare at a local address to bypass
both limits.

### Recording a full run without installing anything

A 20-page scan takes ~100 seconds and has to write a file, so it cannot run as
one request against a host that allows far less and has a read-only filesystem.
Both objections dissolve if the browser drives it: **Measure → Run full scan**
walks the tracked pages three at a time, each request comfortably inside the
limit, assembles the run file client-side and hands it back as a download.

Drop it in `data/runs/`, commit, push. The push redeploys with the new numbers,
and every measurement gets a commit and a diff for free.

`npm run scan` still does the same thing from the CLI in one process, which is
what you would wire into CI. Neither path is privileged — same engine, same
device profile, same file.

## Scanner

```bash
cd scanner && npm install          # also downloads Chromium
cd .. && node scanner/scan.mjs --out data/runs --label "after phase 1"
npm run build                      # viewer picks up the new file
```

A full run is ~100 seconds for 20 pages. If Playwright's bundled headless shell
is missing shared libraries (some Linux and WSL setups fail on `libnspr4.so`),
point it at a working Chromium rather than patching the code:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome node scanner/scan.mjs --out data/runs
```

`--only techinsurance:home` scans a subset for debugging. It produces a partial
run — don't commit one, because missing pages make every total look better than
it is.

### What it measures, and why those things

An agent operates a page through the accessibility tree. For every element a
person could interact with, three things must hold — it **appears** in the tree
with an interactive role, it **says** what it does, and it can be **operated**
(reached by keyboard, actually activatable). And one thing must not: anything
that looks closed must be genuinely out of the tree, not merely out of sight.
There is a fifth, the mirror of the fourth: content that *is* out of the tree
must still be **findable**, because something in the tree announces it.

axe, and this scanner's original probes, only tested the second — and only for
elements that already satisfied the first. That is a real blind spot: a
hamburger built from `<div onClick>` fails the first and third outright, so no
name check ever runs on it and every audit comes back clean, while it is the
only way into mobile navigation.

`probes.mjs` measures those properties directly:

| Field | What it is |
|---|---|
| `ghostControls` | Confirmed click listener, no role, no name, not in the tab order. An agent can neither identify nor operate these, and no rule will ever mention them. |
| `clickableNoRole` | Magnitude: everything responding to a click without a role. Mostly harmless cards — context for the above. |
| `hiddenPanels` | Any region still in the tree, still full of tabbable controls, that isn't on screen. Found by property, not by selector. |
| `unreachablePanels` | The mirror: regions genuinely out of the tree that nothing in the tree announces. A closed dialog with an `aria-expanded` trigger is fine; a `:hover` mega-menu is not. |
| `navLinks` | Of everywhere the page says you can go, how much of it is in the tree at all. |
| `phantomMenu` | Kept for continuity — now derived as the largest `hiddenPanel` rather than a hardcoded `[class*="megaMenu"]`. |

Listeners are confirmed over CDP against the browser's own registry, because
`cursor: pointer` is a hint and hints can be wrong. If CDP is unavailable the
finding still reports, flagged unconfirmed, rather than being dropped.

Validated on the first production run: the generalised panel probe reproduced
the hardcoded mega-menu figures exactly (68 / 69) and independently found the
three collapsed `RelatedTopics` panels on `/blog` carrying 7 + 12 + 9 = 28
tabbable links — a count that previously took a person to establish. It also
put a number on Insureon's misleading zero: axe reports `button-name: 0`, while
the site has **50** `<div>` back controls an agent cannot identify.

`unreachablePanels` and `navLinks` are cross-checked against each other: on
Insureon's desktop home page the panel probe finds five `display: none`
mega-menu blocks holding 56 links between them, and the nav probe independently
reports 63 navigation links with 7 in the tree. Two separate measurements, same
56.

**One probe was written and withdrawn**, and it is worth keeping the record. A
check for the mobile mega-menu in server-rendered HTML flagged both brands, but
verification showed the servers genuinely do vary by device, so it was matching
legitimate desktop markup — it measured something real and concluded something
false. Re-checking it properly is what turned up the viewport problem below.

### Where the answers come from

Five things `probes.mjs` used to compute by hand — accessibility-tree
membership, the accessible name algorithm, focusability, ARIA IDREF resolution
and on-screen visibility — are now read from `axe.commons`, the primitives
axe-core's own rules are built on, in the copy of axe already injected for
`axe.run`.

| Question | Answered by |
|---|---|
| Is it in the tree? | `axe.commons.dom.isVisibleToScreenReaders` |
| Is it on screen? | `axe.commons.dom.isVisibleOnScreen` |
| What is it called? | `axe.commons.text.accessibleText` |
| Can it be tabbed to? | `axe.commons.dom.isInTabOrder` / `getTabbableElements` |
| What does this attribute point at? | `axe.commons.aria.getAccessibleRefs` |

Every hand-written version was a closed list over an open set of browser
mechanisms, which is exactly why the false positives concentrated on modern,
*correct* code: a well-built collapsible reaches for the newest hiding
mechanism, and the newest one is the one missing from the list. Scored against
Chromium's own tree over CDP on a 59-link fixture, the hand-written membership
test disagreed with the browser on 9 of 59 links and `isVisibleToScreenReaders`
on 0 of 59 — the nine were `visibility: collapse` and closed `<details>`.

The point is not that axe is infallible. It is that this file stops owning the
enumeration. Because `axe.commons` is an exposed internal rather than a
documented API, axe-core is pinned to an exact version, `meta.axeVersion` is
recorded on every run, and `core.mjs` fails a scan loudly when the helpers are
missing rather than returning a clean page.

**What is still hand-written is the relationship judgement** — does *this*
control operate *that* region, does this signal originate here, does this
trigger announce that panel. That is where the remaining risk lives, and it is
measured rather than assumed: across two rounds of adversarial review, eight
regressions against `main` were found, all eight in a hand-written relationship
heuristic and none in the five delegated primitives. Where the scanner stopped
owning the enumeration, the bugs stopped. So those heuristics are held at
parity with what production already ships rather than refined further, and the
rule any surviving suppression has to satisfy is written down:

> A finding may be suppressed only when the thing it defers to is itself
> published, or is a control an agent can demonstrably use. A suppression that
> leaves nothing behind is not a refinement, it is a false clean.

All eight had that one shape: a candidate or a defect found by a probe,
suppressed by a heuristic, and nothing published in its place. The page reads
clean. That is the incident this project has shipped twice, and it is what the
rule above exists to prevent.

### The test suite that states no expected values

```bash
npm run metamorphic                                   # every family
node scanner/metamorphic/run.mjs --family icon-technique --verbose
```

A hand-written fixture benchmark was the plan until somebody ran the
counterfactual: the fixtures a competent engineer would plausibly have written
*before* each fault was known, scored against the real pre-fix probe code. The
textbook-correct accordion and the textbook-correct mega-menu both came back
silent — best case one of five faults caught. The reason is structural rather
than a matter of writing better fixtures: the fixture's label and the probe's
rule come from the same head, and every one of those faults *was* a gap in that
head.

So this suite asserts no values. It builds the same component several ways —
behaviourally identical, structurally different — and requires the scanner to
return the same numbers. Nobody has to know the right answer; the disagreement
is the bug. That is not a slogan: it is the only technique in the whole
investigation that found an unknown fault with no human label, when five
hamburgers differing only in icon technique scored 0, 0, 1, 1, 1.

Exit codes are 0 (every family agreed), 1 (a family disagreed, or a page went
unmeasured) and 2 (the suite is misconfigured). Two and one are separate
because "the suite could not run" must never be reachable from the same code
path as "the suite passed". One family — `handler-identity` — is red on
purpose; see **Known limitations** below.

### Device profiles: the scan measures two different pages

These sites resolve their layout **on the server** from the user-agent, and the
React tree branches on the result. The profile is therefore not how the page is
framed — it decides which page exists.

Measured against production, both brands:

| Client | Layout served |
|---|---|
| Desktop Chrome | `desktop` |
| iPhone Safari | `mobile` |
| ClaudeBot | `desktop` |
| No user-agent at all | `desktop` |

**Agents get desktop.** Anything the server doesn't recognise as mobile does.
The scan used to run only a 390×844 iPhone profile, which means every number it
produced described the one variant no agent ever receives.

The two fail in opposite ways, so neither substitutes for the other:

| | Insureon | TechInsurance |
|---|--:|--:|
| Nav links in the DOM, desktop | 63 | 60 |
| **Reachable in the tree, desktop** | **7** | **6** |
| Nav links reachable, mobile | 70 / 70 | 66 / 66 |

On mobile the links are all in the tree, merely trapped off-screen in the closed
drawer — that is the `phantomMenu` figure of 68/69. On desktop they are
`display: none` until hover, so they are gone from the tree entirely and nothing
announces them. One number cannot say both, so a run records both, and every
figure in the dashboard is reported against a named profile.

Two runs are only comparable at the same profile. The trend chart plots one
profile at a time and drops runs that never measured it, rather than joining a
mobile reading to a desktop one and drawing a cliff nobody caused. Runs recorded
before profiles existed are normalised as mobile-only, because that is what they
were.

### A page the server refused is not a page with no problems

Playwright resolves `goto` on a 404 exactly as on a 200. Ten target URLs had
gone stale by 10 Aug 2026 and the scanner measured the error pages: thin shells
tripping almost no rules, which read as a 47% improvement across the run.
`scanPage` now rejects any non-OK response, and any soft 404 (a 200 whose title
says otherwise), as an explicit failure contributing zero. If a run reports
failed pages, check `targets.mjs` first — a URL has usually moved.

**The scanner never interacts with the page.** No clicking, no hovering, no
scrolling. This mirrors what Lighthouse does. The moment it opens the menu, the
counts stop being comparable and every historical trend line is void.

## Live scan

For a URL that isn't one of the fixed 20 — a staging domain, a redesign
preview, a one-off page a stakeholder is asking about — use the live scan
server and the dashboard's **Measure** tab instead of the CLI.

`npm run dev` already starts it. To run it on its own:

```bash
npm run scan-server             # http://127.0.0.1:4790
```

Then open the viewer and go to **Measure**. Paste in up to 10 URLs, one per line, and run it. The page shows
whether it can reach the server, and gives you the exact command above if not.

**Compare** is the one QA wants once fixes reach staging: current on the left,
fixed on the right, both scanned in the same session and diffed check by check.

This calls the identical `scanPage()` the scheduled scan uses, so if you point
it at one of the ten tracked URLs, the numbers should land in the same place
that day's scheduled run would have put them. What it does *not* do is feed
into history: nothing from a live scan is written to `data/runs/`, so
Runs, Overview and Issues never see it. Download the JSON from the
results if you want a record — folding it into the tracked history is a
manual step, on purpose, because an arbitrary URL doesn't have an obvious
`pageKey` in the fixed home/policy/major/… taxonomy the rest of this dashboard
assumes.

**Security note.** The live scan server will open a real headless browser and
visit *any* URL it's handed — that's the point, it's how you reach a staging
environment, but it also means anyone who can reach that port can make your
machine issue requests to wherever they choose. It binds to `127.0.0.1` by
default and caps a request to 10 URLs, scanned one at a time. Don't put it
behind a public port, a reverse proxy, or a tunnel without adding real
authentication in front of it.

## Reading the numbers

**`data/runs/` holds current, comparable scans only.** The 7 Aug 2026 baseline
was retired from it on 10 Aug: it predates the probe rewrite, and four of its
ten page keys pointed at URLs the sites have since retired, so per-page
comparison against it compared different pages. It now lives in
`src/lib/fixtures/`, where the maths tests still assert against its canonical
figures and nothing renders it.

**`data/runs/` holds real scans only.** No hand-built, projected or
placeholder run files, ever. One existed briefly to give the trend chart a
second point, and it rendered on screen captioned "Measured on production".
`npm test` now fails on any future-dated run. Fixtures needed to test the delta
maths are constructed inside `aggregate.test.ts` instead — test data belongs in
the test, not in the directory the UI reads.

**The trend view needs two runs.** With a single scan on file, "Over time" is
hidden from the sub-nav and the run picker doesn't render at all: there is
nothing to switch between and nothing to compare against. Both appear once a
second scan lands.

**Insureon's zeros on `button-name` and `link-name` are misleading.** Its menu
back control is a `<div>`, not a `<button>`, so the axe rule structurally
cannot fire on it. The control is still nameless and still not
keyboard-operable. The UI marks these with `†` wherever they appear. Insureon
is not the healthier of the two sites. The UI marks these with `†` and a
footnote in the scorecard, the rule table and the Findings metric tables.

**Contrast and colour-only links are out of scope**, not forgotten. They're
brand and design decisions with a different owner. Shown greyed and separated
so nobody reads them as failures being ignored.

**Some counts drift, some shouldn't.** `region` and `color-contrast` move by a
node or two between runs from content changes — the UI labels small moves as
drift rather than alarming. `button-name`, `link-name`, `label` and
`phantomMenu.focusable` should be exact; any movement there is real and is
shown in full weight.

**Don't track individual elements.** Class-name hashes like `backButton--CYYVi`
change on every deploy. Everything aggregates on rule id + page type only.

**A failed page scan is not a pass.** It renders as an explicit error state and
contributes zero to every total, so treat that run's totals as incomplete.

## Known limitations

The worst thing this tool can do is report a clean page that is not clean, and
it has done that twice. The surest way to do it a third time is a limit nobody
wrote down — false-positive class 1 was exactly that shape, where "hidden" is
observable and "unfindable" is a decision somebody has to write down, and until
somebody did, each layer quietly invented its own answer.

So the list is here, and the plain-English version of it is on the dashboard
under **How it works → What it cannot tell you**, where each entry carries a
badge saying which kind it is. The first two below will never close — they rest
on a proxy for a fact that has no representation anywhere the scanner can read.
They are limits, not a backlog. The rest are real gaps with real closing moves,
not yet made.

**Ghost controls rest on a proxy, permanently.** "Is this element intended to
be a control" has no representation in the DOM, in the accessibility tree, or
anywhere else — a real ghost control, a `div` a tracker bound a click to, and a
plain tracked region are identical nodes to everything that can be read.
`cursor: pointer` was a bad proxy because it inherits, so a decorative glyph
inside a real button reads as a control on a signal it never carried. A
non-shared click listener is a better proxy. Both are proxies, and no amount of
work makes either stop being one. What the bad one cost: on Insureon every one
of the 37 confirmed click listeners on the page resolved to a single line of
one tracking file, producing 37 phantom controls and fourteen defects reported
against source files containing no handler at all.

**The shared-handler test cannot tell a tracker from a component library.**
`SHARED_HANDLER_SHARE` in `core.mjs` disqualifies a handler key carried by most
candidates, on the premise that a real control's handler is attached for that
control. A component library attaches one handler to every instance of a
component, which breaks the premise on every React or Sitecore site — which is
every site this scanner points at. Six instances of one component sharing one
callback are six real controls, and over CDP they produce the same single key a
page-wide tracker does: `DOMDebugger.getEventListeners` locates the handler
*function*, not the `addEventListener` call. The metamorphic `handler-identity`
family is red for exactly this and stays red; the full reasoning, including a
homogeneity guard that was built, run and rejected because it manufactured six
controls on a page whose elements do nothing when clicked, is in
`scanner/metamorphic/families.mjs`. Practical effect: on any page that also
runs analytics, the tool reports *fewer* controls than exist.

**A disclosure trigger sharing a parent with an unrelated hover menu is
undecidable as the metric is currently defined.** A `<button aria-expanded>`
accordion beside a `:hover` mega-menu currently publishes six unfindable links
as **0** — the trigger is accepted as announcing the menu. The metamorphic
`trigger-placement` family's `sibling-expanded` variant requires the opposite
answer for markup that is, element for element, the same. Both demands are
reasonable; the definition of "announces" does not separate them. It resolves
permissively today, which under-reports, and it resolves the same way on `main`
— so this is a limitation, not a regression. Closing it means sharpening the
definition, not patching a heuristic, and until somebody sharpens it this stays
written down rather than implied.

**`overflow: clip` is a false negative, on this version and the one before
it.** Measured across the five values of `overflow` on a two-slide carousel,
`clip` is the only one where the browser does *not* scroll the content into
view when focus reaches it — and it is the one value axe's `isVisibleOnScreen`
calls visible, so nothing reports it. The evidence table is in `probes.mjs`
beside `scrollRevealable`. Content really is stranded there. Closing it widens
what the probe finds rather than correcting what it answers.

**Child frames are not measured at all.** Both `getFullAXTree` and
`page.evaluate` are main-frame only, and roughly 700–770 accessibility nodes
per production page live in child frames. `shapeViolations()` in `core.mjs` also
keeps only axe's `violations` and discards its `incomplete` bucket — which is
where axe reports the frames it could not test. So this is worse than a blind
spot: it is a blind spot the tool is told about and does not pass on. Zero
findings inside a frame means nobody looked.

**Volume metrics are not reproducible on one of the two sites.** insureon.com
served three different documents to eight identical `curl` requests — 394,816 /
434,507 / 703,895 bytes. Across sixteen identical scans of its desktop home
page, `clickableNoRole` came back 1, 36 and 87, and axe failing-node totals
ranged 28–68. In those same sixteen scans `unfindableLinks` (56), `navLinks`
(7/63) and `unreachablePanels` (5) were identical every time, and
techinsurance.com was byte-identical over six fetches — so this is the site,
not the harness. **The tree-structural figures are exact; the volume figures
are not measurements yet.** `metricStability()` in `aggregate.ts` carries that
evidence per metric, and a metric nobody has repeat-scanned reports
`repeatability: 'unknown'` against a placeholder tolerance of 2 rather than
borrowing another metric's confidence.

**Two runs are comparable only at the same device profile *and* the same probe
version.** Every run now records `probeVersion`, `browserVersion` and
`browserPath` in `meta` — `null` where provenance could not be established,
never a plausible-looking guess. The runs already on file record none of them,
and three different Chromium majors were used to drive scans in a single
working session. Nothing about those numbers is known to be wrong, but nobody
can now prove which instrument produced them, so a difference between an old
run and a new one cannot be attributed to the site. A missing stamp renders as
"not recorded" and must stay that way — filling it in from what was probably
used turns a known gap into a confident-looking fact.

## Data contract

One file per run in `data/runs/`, named `YYYY-MM-DD-HHmm.json`. Top level is
`meta`, `insureon`, `techinsurance`; the two brand keys hold `pageKey ->
PageResult`. Page keys: `home`, `policy`, `major`, `minor`, `article`,
`resources`, `about`, `contact`, `legal`, `a11y-stmt`.

Three things the viewer handles that are easy to get wrong:

- `phantomMenu` is `null` when a page has no mega-menu element.
- A page that failed to load is `{ url, error }` and nothing else.
- `violations` lists only rules that **failed**. Absence means zero, not unknown.

## Known discrepancy in the original spec

§3's per-page table lists `link-in-text-block` / policy for TechInsurance as
**65**, which makes that row sum to 178 — but the totals table above it says
**179**. The run file has **66**, which reconciles the two. The tests treat the
totals table as authoritative. Worth correcting in the source document.
