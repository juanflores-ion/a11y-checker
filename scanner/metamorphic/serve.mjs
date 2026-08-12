/**
 * A throwaway HTTP server for the generated fixtures.
 *
 * ── Why not file:// ──────────────────────────────────────────────────────
 *
 * Two reasons, and the second is the one that would have been found the hard
 * way. Chromium gives a `file://` document an opaque origin, which changes how
 * scripts, subresources and the injected axe bundle are treated and would make
 * the fixtures measure something no production page ever is. And the analytics
 * families need `sgtracker.js` to be a *separate script with its own script id*:
 * `confirmClickListeners` in core.mjs keys a handler on
 * `scriptId:lineNumber:columnNumber`, so an inlined tracker would share a script
 * with the component that binds the real handlers and the guard under test would
 * be keying on the wrong thing.
 *
 * ── Why an ephemeral port ────────────────────────────────────────────────
 *
 * `listen(0)` and let the OS choose. A fixed port collides with whatever the
 * developer already has running — the viewer is on 3000 and the live scan server
 * on 4790 — and a suite that fails because a port was busy teaches people to
 * ignore it failing. Bound to 127.0.0.1: this serves attacker-shaped markup by
 * design and has no business being reachable.
 *
 * Every variant gets its own directory, so `component.js` and `sgtracker.js` are
 * distinct URLs per variant and one variant's parsed script can never be reused
 * for another's.
 */

import http from 'node:http';

/**
 * @param {Map<string, {body: string|Buffer, type: string}>} routes
 *   Absolute paths, e.g. '/f/icon-technique/svg-title/'.
 */
export async function serveFixtures(routes) {
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    } catch {
      pathname = req.url;
    }
    const hit = routes.get(pathname);
    if (!hit) {
      /**
       * A 404 here is a fault in the generator, not in the page under test, and
       * it must not be quiet: scanPage rejects any non-OK response as an
       * explicit failure, metrics.mjs reads a failed page as null on every
       * metric, and the runner fails the family rather than comparing zeros.
       * That chain exists because ten stale target URLs once read as a 47%
       * improvement across a run.
       */
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`No fixture at ${pathname}`);
      return;
    }
    res.writeHead(200, {
      'Content-Type': hit.type,
      // Two variants can differ only in a script's contents at sibling URLs.
      // Nothing here should ever be served from a cache.
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end(hit.body);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
