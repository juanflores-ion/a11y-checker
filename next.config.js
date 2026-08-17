/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export is gone, deliberately.
  //
  // It was in the original brief ("the viewer must be a portable folder of
  // files") and it cost Measure and Compare their audience: a static build has
  // no server, so a scan could only run on a machine where someone had cloned
  // the repo and started one by hand. Those two tabs were features for exactly
  // one person.
  //
  // The app is hosted now, so /api/scan runs the scan on the host and everyone
  // gets them. Every page that isn't that route is still fully prerendered —
  // `loadRuns()` runs at build time, never per request — so the deployment
  // still serves static HTML for everything except the scan itself.
  /**
   * Old routes, kept alive as redirects. Measure and Compare merged into Scan
   * (one form, one engine, a mode switch); Runs → Summary folded into Overview
   * once the context bar gave every page a run picker and a compare picker.
   * Temporary (307) on purpose: nothing external should cache these.
   */
  async redirects() {
    return [
      { source: '/runs/rules', destination: '/runs', permanent: false },
      { source: '/measure', destination: '/scan', permanent: false },
      { source: '/compare', destination: '/scan?mode=compare', permanent: false },
    ];
  },
  images: { unoptimized: true },
  // Don't let the build reach out to Google Fonts. The stylesheet is a plain
  // <link>, fetched by the browser, so builds stay offline-safe.
  optimizeFonts: false,
  experimental: {
    // These three must be required at runtime, not bundled.
    //
    // Chromium and Playwright ship real binaries and native bindings a bundler
    // will happily mangle. axe-core is subtler and cost real debugging time: it
    // exposes its entire engine as a multi-megabyte `source` string, which does
    // not survive the bundler's CJS interop. The route launched a browser,
    // loaded the page, injected nothing, and reported zero violations — a
    // perfectly clean scan of a site with hundreds of problems. A silent
    // false-negative is the worst failure this tool can produce.
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'playwright-core', 'axe-core'],
    /**
     * Everything the scan function needs that static analysis cannot find.
     *
     * The tracer follows `import`/`require` it can see. These four are all
     * resolved in ways it can't:
     *
     *   scanner/*.mjs   live outside src/ so the CLI and the route share one
     *                   definition of what gets measured
     *   axe-core        loaded through createRequire, which is deliberately
     *                   opaque to bundlers — that is why it works, and why the
     *                   tracer misses it
     *   chromium bin/   @sparticuz/chromium resolves its compressed Chromium
     *                   and Amazon Linux libraries relative to its own package
     *                   directory at runtime
     *
     * Verified by inspecting route.js.nft.json after a build: without these,
     * the trace contained 0 axe-core files and no .br payloads, so a deploy
     * would have shipped a function that cannot import axe and has no browser
     * to launch. It builds and typechecks perfectly either way.
     */
    outputFileTracingIncludes: {
      '/api/scan': [
        './scanner/core.mjs',
        './scanner/probes.mjs',
        './scanner/allowlist.mjs',
        './scanner/targets.mjs',
        './node_modules/axe-core/axe.js',
        './node_modules/axe-core/package.json',
        './node_modules/@sparticuz/chromium/bin/**',
      ],
    },
  },
};

module.exports = nextConfig;
