# Test fixtures

Run files the unit tests assert against. **Not** scanned by the app — the
viewer only ever reads `data/runs/`.

Both files here are real scans, copied verbatim. Nothing in this directory is
hand-built: a fabricated run file once lived in `data/runs/` to give the trend
chart a second point and ended up on screen captioned "Measured on production".
Test data lives with the tests, and it is still measurement.

## What the tests are actually testing

`aggregate.ts` arithmetic, over frozen input. **Not the probes.** No assertion
in this repo can fail because `scanner/probes.mjs` regressed — a run file is
frozen JSON, and changing a probe does not retroactively alter one. Probe
correctness is what the metamorphic suite is for (assert that behaviourally
identical variants return the same number); this directory is the aggregator's
regression corpus and nothing more.

## The files

`2026-08-07-0914.json` — the original production baseline. Retired from
`data/runs/` on 10 Aug because it predates the probe rewrite and four of its ten
page keys pointed at URLs the sites have since retired, which made per-page
comparison against it meaningless. Its figures are still the canonical ones from
the investigation, so the §3/§4 maths tests keep asserting against them here,
where nothing renders them. It carries no probe fields at all, which makes it
the corpus for the other half of the job: what the aggregator does with a check
that did not exist when the run was recorded.

`2026-08-11-1412.json` — a byte-for-byte copy of the run of the same name in
`data/runs/`, frozen on 12 Aug 2026. The probe assertions used to read
`latestRun(loadRuns())`, taking their expected values from whatever the scanner
last produced. That is backwards twice over: it cannot fail for a probe bug, and
it *will* fail the day ION's fix lands and a better run becomes the latest —
turning the thing the tool exists to achieve into a red build. Frozen here, the
same assertions keep testing the arithmetic and stop depending on what
production looks like this week.

A test asserts this copy still deep-equals its source in `data/runs/` for as
long as the source is there, so it cannot be quietly edited into agreement with
the code. If the run is ever retired from `data/runs/` the way the 7 Aug one
was, that check skips and this stays the record of it.

## Adding one

Copy a real run file in whole. Do not trim it to the pages an assertion touches
and do not edit a number: the moment a fixture stops being a measurement, a test
passing against it stops being evidence of anything. Synthetic shapes — the
delta maths, an empty brand, a control the listener registry disproved — are
constructed inline in the test file instead, where they are visibly synthetic.
