'use client';

import { useState } from 'react';

import type { Finding } from '@/lib/findings';
import { IMPACT_TEXT } from '@/lib/rules';
import { FindingsPanel } from './FindingsPanel';
import { ImpactDot } from './Primitives';
import { Eyebrow } from './Primitives';

/**
 * The findings for one page, each row opening the evidence in a panel.
 *
 * This replaced a `<details>` holding every sample inline. The list is always
 * visible now — it is five short rows, not 1,200px of markup — and the markup
 * itself moved to `FindingsPanel`, where it gets the width to be readable and
 * a Copy button worth having.
 */
export function FindingsList({ findings, pageUrl }: { findings: Finding[]; pageUrl?: string }) {
  const [open, setOpen] = useState<number | null>(null);

  if (findings.length === 0) return null;

  return (
    <section>
      <Eyebrow className="mb-2.5">
        {findings.length === 1 ? '1 finding' : `All ${findings.length} findings`}
      </Eyebrow>
      <ul className="overflow-hidden rounded-card border border-rule">
        {findings.map((finding, i) => (
          <li key={finding.key} className="border-b border-rule/70 last:border-b-0">
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
            >
              <ImpactDot impact={finding.impact} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{finding.label}</span>
              <span className={`hidden text-eyebrow sm:inline ${IMPACT_TEXT[finding.impact]}`}>
                {finding.impact}
              </span>
              <span className="font-mono text-xs text-ink tnum">{countOf(finding)}</span>
              <Chevron />
            </button>
          </li>
        ))}
      </ul>

      <FindingsPanel
        findings={findings}
        index={open}
        onIndexChange={setOpen}
        onClose={() => setOpen(null)}
        pageUrl={pageUrl}
      />
    </section>
  );
}

/** A single scan always has a count; this list is never built from a pair. */
function countOf(finding: Finding): number {
  return finding.sides.kind === 'single' ? finding.sides.only.count : 0;
}

export function Chevron() {
  return (
    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 12 12" className="shrink-0 text-faint">
      <path
        d="M4.5 3L8 6l-3.5 3"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
