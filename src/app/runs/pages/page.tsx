import Link from 'next/link';

import { BRAND_LABEL, BRANDS, PAGE_LABEL, loadRuns, pageKeysUnion } from '@/lib/loadRuns';

export default function PageDetailIndex() {
  const keys = pageKeysUnion(loadRuns());

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">By page</h2>
        <p className="mt-1 max-w-measure text-sm leading-relaxed text-muted">
          Everything measured on one page of one site: which checks failed, the real markup of
          the elements that failed them, whether the page marks its main content, and the full
          reading on the closed mobile menu.
        </p>
      </div>

      {keys.length === 0 ? (
        <p className="text-sm text-muted">No scans loaded, so there are no pages to open.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {BRANDS.map((brand) => (
            <section key={brand}>
              <h3 className="text-eyebrow font-medium text-muted">{BRAND_LABEL[brand]}</h3>
              <ul className="mt-2 divide-y divide-rule border-y border-rule">
                {keys.map((key) => (
                  <li key={key}>
                    <Link
                      href={`/runs/pages/${brand}/${key}`}
                      className="flex items-baseline justify-between gap-4 py-2.5 hover:bg-ink/[0.03]"
                    >
                      <span className="text-sm text-ink">{PAGE_LABEL[key] ?? key}</span>
                      <code className="font-mono text-xs text-faint">{key}</code>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
