# Test fixtures

Run files the unit tests assert against. **Not** scanned by the app — the
viewer only ever reads `data/runs/`.

`2026-08-07-0914.json` is the original production baseline from 7 Aug 2026. It
was retired from `data/runs/` on 10 Aug because it predates the probe rewrite
and because four of its ten page keys pointed at URLs the sites have since
retired, which made per-page comparison against it meaningless. Its numbers are
still the canonical figures from the investigation, so the maths tests keep
using it here, where nothing renders it.

Keeping it out of `data/runs/` is deliberate. A hand-built run file once lived
there to give the trend chart a second point and ended up on screen captioned
"Measured on production". Test data lives with the tests.
