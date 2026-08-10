#!/usr/bin/env node
/**
 * One command, both processes.
 *
 *   npm run dev
 *
 * The viewer and the scan server stay separate *processes* for a reason: a
 * full scan takes ~100 seconds and drives a real browser, which cannot live
 * inside a statically exported site. But that is an implementation detail, and
 * it was leaking into everyone's terminal as "run these two things, in two
 * tabs, in the right order". It should never have been anyone's problem but
 * this file's.
 *
 * If the scanner's dependencies aren't installed the viewer still starts —
 * reading existing runs needs no browser, and half a dashboard beats a crash.
 */
import fs from 'node:fs';
import path from 'node:path';

import { paint, root, start } from './run-together.mjs';

const scannerReady = fs.existsSync(path.join(root, 'scanner', 'node_modules', 'playwright'));

start('viewer', process.execPath, [
  path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'),
  'dev',
]);

if (scannerReady) {
  start('scanner', process.execPath, [path.join(root, 'scanner', 'server.mjs')]);
} else {
  process.stdout.write(
    paint('warn', '[scanner] not installed — Measure and Compare will be unavailable.\n') +
      paint('warn', '[scanner] run: cd scanner && npm install\n')
  );
}
