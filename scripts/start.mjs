#!/usr/bin/env node
/**
 * Serve the built export, with the scan server alongside it.
 *
 *   npm run build && npm start
 *
 * Same shape as `npm run dev`: one command, one Ctrl-C. The difference is that
 * this serves the static files in `out/` rather than running Next in dev mode,
 * so it is what you would run on an internal host.
 *
 * Note that Measure and Compare talk to the scan server directly from the
 * browser. If you serve `out/` from somewhere other than this machine, the
 * scan server has to be reachable from the viewer's browser too — set its
 * address from the Scanner control on either page. Read the security note in
 * scanner/server.mjs before exposing that port anywhere.
 */
import fs from 'node:fs';
import path from 'node:path';

import { paint, root, start } from './run-together.mjs';

if (!fs.existsSync(path.join(root, 'out', 'index.html'))) {
  process.stdout.write(paint('warn', 'No build found. Run: npm run build\n'));
  process.exit(1);
}

start('viewer', 'npx', ['--yes', 'serve', 'out', '-l', '3000']);

if (fs.existsSync(path.join(root, 'scanner', 'node_modules', 'playwright'))) {
  start('scanner', process.execPath, [path.join(root, 'scanner', 'server.mjs')]);
} else {
  process.stdout.write(
    paint('warn', '[scanner] not installed — Measure and Compare will be unavailable.\n') +
      paint('warn', '[scanner] run: cd scanner && npm install\n')
  );
}
