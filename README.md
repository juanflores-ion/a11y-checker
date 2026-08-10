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
| `/` — **Overview** | Product · SEO · QA | Where both sites stand, then every known problem in plain English: what breaks, what it costs, the technical detail, and what would fix it. |
| `/runs/` — **Runs** | QA · Engineering | Scans already taken: Summary, By check, By page, and Over time once there are two runs. The run picker lives here and nowhere else. |
| `/measure/` — **Measure** | QA · Engineering | Scan any URL on demand — production, staging, a preview build. |
| `/compare/` — **Compare** | QA | Current vs fixed, scanned in one session and diffed check by check. The "did my fix land" workflow. |

Issues was a fifth section until the scanner learned to measure what only prose
could describe. Once every figure it quoted also appeared under Runs → By
check, it stopped being a destination and became a section of Overview.

## Three moving parts## Three moving parts

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

### What still doesn't run there

Scheduled scans. A 20-page run takes ~100 seconds and has to write a file, and
the filesystem is read-only. Run `npm run scan` locally or in CI, commit the
run file, and the push redeploys the dashboard with the new numbers — which
also gives every measurement a commit and a diff for free.

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

**One probe was written and withdrawn.** A check for the mobile mega-menu in
server-rendered HTML flagged both brands — but verification showed the servers
do vary by device (desktop receives 4–5 mega-menu panels, mobile 1), so it was
matching legitimate desktop markup. It measured something real and concluded
something false, so it was removed rather than shipped.

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
