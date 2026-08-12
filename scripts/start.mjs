#!/usr/bin/env node
/**
 * Serve the production build, with the local scan server alongside it.
 *
 *   npm run build && npm start
 *
 * Same shape as `npm run dev`: one command, one Ctrl-C. The difference is that
 * this runs the built app rather than Next in dev mode, so it is what you would
 * run on an internal host.
 *
 * ── Why this stopped serving a folder ────────────────────────────────────
 *
 * It used to run `serve out`, because the viewer was a static export. Static
 * export is gone — see the comment at the top of next.config.js — and `next
 * build` has not written an `out/` directory since. This file kept checking for
 * `out/index.html` and exiting with "No build found. Run: npm run build", which
 * was advice that could never work: the build it recommends is the build that
 * stopped producing the file it was looking for. `npm start` was broken from
 * the moment the export was dropped, and said so in a way that read like the
 * user's fault.
 *
 * `next start` needs `.next/`, which is what `npm run build` actually writes.
 *
 * The scan server stays a separate process even though `/api/scan` now exists,
 * and that is deliberate rather than left over: the hosted route caps a request
 * at three URLs and enforces a host allowlist, both of which are right for a
 * public endpoint and wrong for someone scanning a staging box from their own
 * machine. Point the Scanner control on Measure or Compare at this local server
 * to bypass both. Read the security note in scanner/server.mjs before exposing
 * that port anywhere.
 */
import fs from 'node:fs';
import path from 'node:path';

import { paint, root, start } from './run-together.mjs';

if (!fs.existsSync(path.join(root, '.next', 'BUILD_ID'))) {
  process.stdout.write(paint('warn', 'No build found. Run: npm run build\n'));
  process.exit(1);
}

start('viewer', process.execPath, [
  path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'),
  'start',
]);

if (fs.existsSync(path.join(root, 'scanner', 'node_modules', 'playwright'))) {
  start('scanner', process.execPath, [path.join(root, 'scanner', 'server.mjs')]);
} else {
  process.stdout.write(
    paint('warn', '[scanner] not installed — Measure and Compare will be unavailable.\n') +
      paint('warn', '[scanner] run: cd scanner && npm install\n')
  );
}
