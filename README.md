# Agent Readiness

Internal tool for measuring how well AI browsing agents — ChatGPT, Gemini,
Perplexity — can operate our sites, and for tracking what we're fixing.

Agents don't read pixels. They walk the browser's accessibility tree, where
every control needs a role and an accessible name. A button with no name is a
dead end, and the journey stops there. The same barriers hit anyone using a
screen reader or navigating by keyboard.

## Four sections

| Route | Who it's for | What it does |
|---|---|---|
| `/` — **Overview** | Product · SEO · QA | Where both sites stand against target, then every known problem in plain English: what breaks, what it costs, the technical detail, and what would fix it. The context bar picks the run and device profile. |
| `/runs/` — **Runs** | QA · Engineering | Every figure of a measurement: By check (rules and probes, with per-page breakdown), and By page (a matrix, then the detail with sample markup). |
| `/scan/` — **Scan** | QA · Engineering | Measure a URL now, diff a fix before and after, or record a full run — three modes of one page. Old `/measure` and `/compare` URLs redirect here. |
| `/how-it-works/` — **How it works** | Anyone | What the scanner does, in plain English: what an agent sees, how a page is scanned, what counts as a defect, what every figure is stamped with, and what the tool cannot tell you. |

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

The viewer and the scanner share no code and no dependencies. A full scheduled
scan takes 3–5 minutes, so it could never live behind a request — that is why
`scan.mjs` stays a CLI, and why **Scan → Full run** drives the browser
through the target list three URLs at a time instead of asking for all twenty
at once.

A *single-page* scan is fast enough to serve on demand, and there are two ways
to get one: `/api/scan` on the host, and `scanner/server.mjs` on your own
machine. Both exist on purpose. The hosted route makes Scan work for anyone who
opens the dashboard; the local server exists because that route is capped at
three URLs and can only reach the public internet, which is right for a public
endpoint and useless for a staging box behind the VPN. Run inside the network
and shared through a tunnel, the local server is how staging gets scanned —
see "Reach staging through a tunnel" under Live scan.

What keeps "static" and "live" from becoming two different measurements that
quietly drift apart is that **both call `scanPage()` in `core.mjs`.** Nothing
about what's measured changes based on how the scan was triggered.

## Viewer

```bash
npm install
cd scanner && npm install && cd ..   # once — also downloads Chromium

npm run dev         # viewer on :3000 AND the scan server on :4790, one Ctrl-C stops both
npm test            # the aggregate and compare maths, against frozen fixtures — no browser
npm run metamorphic # the probes, against generated markup — needs Chromium, ~3 minutes
npm run build       # production build into .next/
npm start           # serves that build, scan server alongside, same one-command shape
```

`npm run build` is a Node build, not a folder of files: every page is
prerendered at build time, but `/api/scan` is a real route and needs a host that
can run it. Static export was dropped deliberately — the reasoning is at the top
of `next.config.js`, and the short version is that it cost Scan its entire
audience, since a static build has no server and a scan could only
run on a machine where someone had cloned the repo.

### Why it's two processes and not one

Not because a scan cannot live behind a route — it does, at `/api/scan`. The
local server exists because that route is capped at three URLs per request and
restricted to an allowlist of our own domains. Both caps are correct for an
endpoint that fetches a URL it is handed on a public host, and both are in the
way when you are scanning a staging box from your own machine. Point the Scanner
control on Scan at `localhost:4790` and neither applies.

What it does *not* need to be is a separate thing you remember to start.
`scripts/dev.mjs` runs both, prefixes their output, and shuts both down
together; if the scanner's dependencies are missing the viewer still starts and
Scan explains what to install. `npm run dev:viewer` and
`npm run scan-server` still run them individually when you want that.

All the logic is in `src/lib/`. Components are deliberately dumb.

- `model.ts` — types, constants, pure helpers, brand/chart colours. Safe to import from client code.
- `loadRuns.ts` — reads and sorts `data/runs/*.json`. Server only; it imports `node:fs`.
- `aggregate.ts` — totals, per-page rollups, deltas, the target scorecard, and `resolveMetric`.
- `rules.ts` — rule id → label, impact, in-scope flag.
- `issues.ts` — **the issue catalogue.** Prose, severity, and what would fix each one.
- `compare.ts` — current/fixed diffing for Scan's Before / after mode.
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

**It never contains a number.** Every figure the issue catalogue cites — the
issues table on Overview — is resolved from the current run through
`resolveMetric`, so the catalogue can't drift out of step with the
measurements. What it does contain is judgement: severity, plain-English
framing, what would fix it, and the risk of making that change.

**It deliberately tracks no progress state.** There is no "fixed / in progress /
shipped" field, no progress bar and no open-blocker count. That existed briefly
and was removed: it had to be hand-maintained, went stale immediately, and a
green bar telling Product something was fixed when it wasn't is worse than
showing nothing. Whether a fix landed is answered by *measuring* — scan staging
from **Scan**, or diff it against production with **Scan → Before / after**.
Never by an assertion stored in a file.

So the catalogue describes what production has today. `inScope: false` marks a
finding that is a brand-palette decision owned elsewhere; such findings render
in a separate section rather than being hidden. None today — contrast and
colour-only links carried that flag until design decided the fix in Aug 2026,
and now sit in the main list like everything else.

**`detection: 'manual'` is load-bearing.** It marks findings no scanner can
catch, and the UI badges them so a green automated report never reads as done.
The hover-only desktop menu used to be one; it is now filed against the
scanner's "menu panels nothing announces" figure, which is the mark a hover-only
menu leaves — the hand check (Tab, Enter) stays in its verify step because the
scanner never presses keys.

## Deploying

Vercel, one click. Import the repo; Next.js is auto-detected and there is
nothing to configure.

Everything except the scan is prerendered at build time — `loadRuns()` runs
during the build, never on a request — so the deployment serves static HTML for
every page and spins up a function only for `/api/scan`.

### Live scans work for everyone

`/api/scan` runs the scan on the host, so Scan works for whoever
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
  a UI on top. It scans our own domains and their subdomains only — the rule
  lives in `scanner/allowlist.mjs`, shared with the standalone server. Add
  hosts with `SCAN_ALLOWED_HOSTS` (comma-separated). Matching is on dot
  boundaries, so `insureon.com` allows `staging.insureon.com` and never
  `insureon.com.evil.test`.

Point the Scanner control on Scan at a scanner running inside the network to
reach staging and raise the cap — see "Reach staging through a tunnel".

### Recording a full run without installing anything

A 20-page scan takes ~100 seconds and has to write a file, so it cannot run as
one request against a host that allows far less and has a read-only filesystem.
Both objections dissolve if the browser drives it: **Scan → Full run**
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
| `unreachablePanels` | The mirror: regions genuinely out of the tree that nothing in the tree announces. See the rule below for what "announces" means. |
| `navLinks` | Of everywhere the page says you can go, how much of it is in the tree at all. |
| `phantomMenu` | Kept for continuity — now derived as the largest `hiddenPanel` rather than a hardcoded `[class*="megaMenu"]`. |

#### The measurement standard

Two rules define what this tool is. Both are deliberate, both are frozen, and
neither moves to accommodate a site.

**1. The page is measured as delivered. Nothing is touched.** No clicking, no
hovering, no typing, no scrolling, no focusing. Every probe is a read of the DOM
and computed style exactly as the server sent it.

That is what makes a number mean something. Two runs are comparable because
neither one did anything to the page; a scheduled scan and a live scan are the
same measurement because the same `scanPage()` reads the same delivered state.
It also means a scan can never create a real enquiry, a real quote or a real
lead in a live system, which is why it is safe to point at production.

The cost is stated in **Known limitations**: anything that only exists after an
interaction is not measured. That is a real gap, and it is the honest price of
the property above. The way to close it is a written, checked-in script of steps
— never the tool exploring on its own.

**2. A relationship an agent cannot compute does not exist.** Spelled out below.

#### The rule: what "announced" means

**A hidden region counts as findable only when the markup names the control
that opens it.** One of:

- `aria-controls` or `aria-owns` resolving to the region
- `popovertarget` or `commandfor` resolving to the region
- a native `<summary>`, where the spec names its `<details>` for you

**`aria-expanded` and `aria-haspopup` are not enough on their own.** They are
*state*: they say something opens, never *what*. Pairing one with a region means
reading the layout — which a sighted person does instantly and an agent cannot
compute at all. This tool measures what an agent can do, so a relationship
nobody wrote down does not exist here.

This rule is **derived, not tuned, and it does not move to accommodate a site.**
It replaced a heuristic that inferred the relationship from adjacency, and that
heuristic produced every measured false clean this metric ever had: a
`<summary>` three levels down an unrelated `<details>`, a "Manage cookie
preferences" button five wrappers away in a sibling branch, an `aria-haspopup`
chat button in a header. Each fix narrowed which neighbours counted and the next
shape stayed open, because the evidence itself was the problem.

What it costs, stated plainly: a disclosure that works perfectly for a person
but names no target now reports as unfindable. That is accepted. It
over-reports, which is the direction this file is allowed to be wrong in, and
the fix on a site is one `id` and one attribute.

Both directions are asserted by the metamorphic suite —
`declared-relationship` (five ways of writing the edge, all announced) and
`undeclared-relationship` (three placements of a trigger that names nothing,
none of them rescuing anything).

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

Two runs are only comparable at the same profile. The compare picker offers
one profile at a time and never joins a mobile reading to a desktop one, which
would draw a cliff nobody caused. Runs recorded before profiles existed are
normalised as mobile-only, because that is what they were.

### A page the server refused is not a page with no problems

Playwright resolves `goto` on a 404 exactly as on a 200. Ten target URLs had
gone stale by 10 Aug 2026 and the scanner measured the error pages: thin shells
tripping almost no rules, which read as a 47% improvement across the run.
`scanPage` now rejects any non-OK response, and any soft 404 (a 200 whose title
says otherwise), as an explicit failure contributing zero. If a run reports
failed pages, check `targets.mjs` first — a URL has usually moved.

**The scanner never interacts with the page.** No clicking, no hovering, no
scrolling. This mirrors what Lighthouse does. The moment it opens the menu, the
counts stop being comparable and every earlier run is void as a baseline.

## Live scan

For a URL that isn't one of the fixed 20 — a staging domain, a redesign
preview, a one-off page a stakeholder is asking about — use the dashboard's
**Scan** page. It sends the URLs to a scanner and shows the results; which
scanner is a setting on the page (**Scanner · change**):

- **This site's scanner** (the default, address blank) runs on the host as
  `/api/scan`. Nothing to install, but it can only reach the public internet
  and only scans our own domains, three URLs at a time.
- **A scanner inside the network** — `npm run scan-server` on a machine that
  can reach staging — takes any address you give the page: `http://localhost:4790`
  on your own machine, or a tunnel URL when a colleague is running it for you.
  Up to ten URLs at a time.

### Staging runs, and comparing two of them

A before/after between production and staging cannot tell a fix from a
difference between the two deployments. On 18 Aug 2026, with nothing
deployed, such a comparison of Insureon's home page reported `label 2 → 0`
and `label-title-only 2 → 0` as **resolved** — cd-preview simply serves
different content. Two other pages in the same export were byte-identical
across environments, so the gap is not even a constant you could subtract.

So a fix is measured against an earlier run of *the same* environment:

0. **A baseline is a pair.** Record production *and* staging in the same
   sitting. Production is what the dashboard shows; staging is what a later
   deploy gets compared against. One without the other leaves you unable to
   answer either "where are we" or "did the fix work".
1. **Record a staging baseline before deploying.** Scan → Full run → set
   **Measure** to *Staging*, point **Scanner** at one inside the network, run
   it, drop the file in `data/runs/` and commit. The URLs are the tracked
   targets' paths on each site's `staging` origin (`src/lib/sites.ts`).
2. **Deploy.**
3. **Record another staging run**, then Scan → **Compare runs**, pick the two,
   and read the per-page table.

Every run carries its environment, and the app derives it from the URLs the
run actually recorded rather than from a declared field — a claim in `meta`
can drift from what was scanned, and this value decides whether two runs may
be compared at all. **Compare runs refuses a production/staging pair**, the
same way a pair measured at two device profiles or two homepage variants is
refused.

### Hosting the scanner for everybody else

Staging only answers inside the org network, so a before/after against it runs
through a scanner on a machine that is on the VPN, exposed by a tunnel. Quick
tunnels take a new random hostname on every start, which used to make this a
hand-off: the host had to message QA a fresh URL and token each time.

One command does the whole thing now:

```bash
SCAN_PUBLISH_SECRET=<same value as the deployment> \
SCAN_ALLOWED_HOSTS=staging.forsureon.com \
PLAYWRIGHT_CHROMIUM_PATH="/path/to/chrome" \
npm run scan-server:share
```

It mints a fresh token, starts the scanner, opens the tunnel, and POSTs the
address and token to `<dashboard>/api/scanner`. Anyone opening the Scan page
with no scanner of their own gets both filled in, labelled with when they were
published. Ctrl-C un-publishes. A new token every run means a value someone
saved last week stops working the moment the scanner restarts.

Two things the deployment needs, once:

- `SCAN_PUBLISH_SECRET` — the value `/api/scanner` checks before accepting a
  publish. Reading is open; writing is not, because whoever can write chooses
  where every reader's browser sends its scans. A published address is also
  checked against a host allowlist (`*.trycloudflare.com`, our own domains,
  loopback), so a leaked secret still cannot point QA at an arbitrary host.
- **A KV store** (Vercel → Storage → connect to the project). Serverless
  functions are stateless, so without one the published value is forgotten
  between requests; `/api/scanner` says so in a `warning` field rather than
  failing quietly.

QA who can run Node don't need any of this: `npm run scan-server` on their own
machine, and the address is `http://localhost:4790` with no token at all.

**Scan → Before / after** is the one QA wants once fixes reach staging, and it
is where the page opens. Nobody types URLs for it: pick a site, tick the page
types you want (all ten are ticked to begin with), and each one becomes a pair
— the tracked production URL on the Before side, the same path on that site's
staging origin on the After side, derived from `staging` in `src/lib/sites.ts`.
Both sides are scanned in the same session, at one device profile, and diffed
check by check. The card leads with the answer — **Better / Worse / No
change**, and by how many failing elements — then lists what moved and what is
still there afterwards, each check appearing exactly once. Raw per-side counts,
the rule-by-rule table and the phantom-focusable caveat live behind Details. Ten pages is twenty URLs, which no scanner takes at once, so
the page splits the work into batches the chosen scanner accepts and counts
them off as they land. Anything off the list — a preview build, one page
mid-fix — goes under **Other URLs**, paired line by line and added to whatever
is ticked, up to twelve pairs in a run.

Both scanners call the identical `scanPage()` the scheduled scan uses, so a
live scan of one of the ten tracked URLs should land on the same numbers that
day's scheduled run would have put there. What a live scan does *not* do is
feed into history: nothing is written to `data/runs/`, so Runs and Overview
never see it. Download the JSON from the results if you want a record —
folding it into the tracked history is a manual step, on purpose, because an
arbitrary URL doesn't have an obvious `pageKey` in the fixed
home/policy/major/… taxonomy the rest of this dashboard assumes.

### Reach staging through a tunnel

Staging is only reachable from inside the org's network, and the hosted
dashboard is not. The way round it: one person on the VPN runs the scanner on
their laptop and exposes it through a Cloudflare tunnel; everyone else keeps
using the hosted dashboard and points **Scanner** at the tunnel URL.

On the laptop, two terminals. First the scanner, in **shared mode** — a token
and an allowlist, both required before this server is safe to expose:

```bash
SCAN_TOKEN=$(openssl rand -hex 16) \
SCAN_ALLOWED_HOSTS=staging.forsureon.com \
npm run scan-server
# prints the mode it is in and the hosts it will scan; the token is $SCAN_TOKEN
```

Then the tunnel, from the terminal (the `cloudflared` CLI, no account needed
for a quick tunnel):

```bash
cloudflared tunnel --url http://127.0.0.1:4790
# prints https://<random-words>.trycloudflare.com
```

Hand QA two things: that URL and the token. On the dashboard's Scan page they
open **Scanner · change**, paste the URL into *Scanner address* and the token
into *Token*, and *Check again* should read "Your scanner ready". Everything
else — Before / after, the device picker, the results — works exactly as
before. Quick tunnels get a fresh URL every time `cloudflared` restarts, so
re-share it when you restart; the token can stay the same for as long as you
like.

**Why both guards, every time.** The scanner opens a real browser and visits
the URLs it is handed. Tunnelled without them, anyone who has the link can make
your VPN-connected laptop fetch internal hosts and read back the page. With
them: the token gates every request (`Authorization: Bearer`, checked in
constant time), and the allowlist — the tracked sites plus whatever
`SCAN_ALLOWED_HOSTS` names, matched on dot boundaries — is enforced by the same
`scanner/allowlist.mjs` the hosted `/api/scan` uses. Setting `SCAN_TOKEN`
turns the allowlist on automatically. In **local mode** (no token) the server
scans any URL, which is right for a preview build on `localhost:8080` and is
why local mode binds to `127.0.0.1` and must never be tunnelled or proxied.

The scanner also needs a Chromium that can start. On a fresh WSL/Ubuntu machine
that means the system libraries Playwright's build links against, once:
`sudo apt-get install -y libnspr4 libnss3 libasound2t64` (or
`sudo npx playwright install-deps chromium`).

## Reading the numbers

**`data/runs/` holds current, comparable scans only.** The 7 Aug 2026 baseline
was retired from it on 10 Aug: it predates the probe rewrite, and four of its
ten page keys pointed at URLs the sites have since retired, so per-page
comparison against it compared different pages. It now lives in
`src/lib/fixtures/`, where the maths tests still assert against its canonical
figures and nothing renders it.

**`data/runs/` holds real scans only.** No hand-built, projected or
placeholder run files, ever. One existed briefly to give a since-removed trend
chart a second point, and it rendered on screen captioned "Measured on
production".
`npm test` now fails on any future-dated run. Fixtures needed to test the delta
maths are constructed inside `aggregate.test.ts` instead — test data belongs in
the test, not in the directory the UI reads.

**There is no trend view.** Two scans are a before and an after, and the
scorecard already states that with delta chips; a line through a handful of
points reads as a trajectory it cannot support. This tool measures a baseline
and verifies fixes against it. If a standing regression watch is ever wanted,
that is a separate report, not a tab here.

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

**Anything that only exists after an interaction is outside every number
here.** The scanner reads a page as delivered and never clicks, hovers, types
or scrolls. That is what makes two runs comparable, and it is what guarantees a
scan can never create a real enquiry in a live system — but it means a modal, a
wizard step or a panel constructed on click is not measured at all. Measured on
both brands: the "Get Quotes" modal renders nothing into the page until the
button is pressed — zero dialog elements before the click, one after. Three
real defects were found inside that modal by hand, all three were fixed, and no
figure on this dashboard moved, because no figure was looking.

Closing it does *not* mean teaching the scanner to explore. Measured on one
page, a version that searched for its own path answered between 2.5 and 3.6
times apart depending only on which keys it pressed and how far it tabbed —
hiding mechanisms are a finite set the browser defines, action sequences are an
open set nobody does. What it means is a written, checked-in script of steps,
authored by a person and identical every run, with the same read-only probe run
on the state it reaches. That is what Lighthouse's user-flow mode and TPGi's
scripted journeys do. **Never let the tool decide the interaction.** It is real
work and it is parked, not refused.

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
