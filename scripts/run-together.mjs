/**
 * Run several long-lived processes as one, with prefixed output and a single
 * Ctrl-C that stops all of them. Shared by `npm run dev` and `npm start`.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const COLOURS = { viewer: '\x1b[36m', scanner: '\x1b[35m', warn: '\x1b[33m', off: '\x1b[0m' };
export const paint = (name, text) => `${COLOURS[name] ?? ''}${text}${COLOURS.off}`;

const children = [];
let shuttingDown = false;

export function start(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });

  const label = paint(name, `[${name}]`);
  const forward = (stream, to) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) to.write(`${label} ${line}\n`);
    });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    process.stdout.write(`${label} exited (${signal ?? code})\n`);
    shutdown(code ?? 1);
  });

  children.push(child);
  return child;
}

export function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  // Don't hang on a child that ignores SIGTERM.
  setTimeout(() => {
    for (const child of children) if (!child.killed) child.kill('SIGKILL');
    process.exit(code);
  }, 2000).unref();
  setTimeout(() => process.exit(code), 300).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

