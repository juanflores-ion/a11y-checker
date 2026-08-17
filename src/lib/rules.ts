export type Impact = 'critical' | 'serious' | 'moderate' | 'minor';

export interface RuleMeta {
  id: string;
  label: string;
  impact: Impact;
  /**
   * false = a brand/design decision with a different owner, not part of this
   * workstream. None today: the two styling rules joined it in Aug 2026 once
   * design decided the fix.
   */
  inScope: boolean;
  /**
   * true = the count must be exact. Any movement is signal.
   * false = content churn can shift this by a node or two between runs.
   */
  exact: boolean;
  /** Insureon reads 0 here for a structural reason, not a healthy one. */
  misleadingZeroOn?: string[];
}

const KNOWN: Record<string, Omit<RuleMeta, 'id'>> = {
  'button-name': {
    label: 'Buttons with no name',
    impact: 'critical',
    inScope: true,
    exact: true,
    misleadingZeroOn: ['insureon'],
  },
  label: {
    label: 'Form fields with no label',
    impact: 'critical',
    inScope: true,
    exact: true,
  },
  'link-name': {
    label: 'Links with no name',
    impact: 'serious',
    inScope: true,
    exact: true,
    misleadingZeroOn: ['insureon'],
  },
  'aria-hidden-focus': {
    label: "Hidden content that's still focusable",
    impact: 'serious',
    inScope: true,
    exact: true,
  },
  'landmark-one-main': {
    label: 'No "main content" marker',
    impact: 'moderate',
    inScope: true,
    exact: true,
  },
  region: {
    label: 'Content outside any landmark',
    impact: 'moderate',
    inScope: true,
    exact: false,
  },
  'heading-order': {
    label: 'Heading levels skipped',
    impact: 'moderate',
    inScope: true,
    exact: true,
  },
  'link-in-text-block': {
    label: 'Links identified by colour only',
    impact: 'serious',
    inScope: true,
    exact: false,
  },
  'color-contrast': {
    label: 'Text contrast too low',
    impact: 'serious',
    inScope: true,
    exact: false,
  },
};

/** Display order: in-scope first, hardest impact first. Unknown rules append. */
export const RULE_ORDER = [
  'button-name',
  'label',
  'link-name',
  'aria-hidden-focus',
  'landmark-one-main',
  'region',
  'heading-order',
  'link-in-text-block',
  'color-contrast',
];

/**
 * Never assume the nine known rules are the only ones. A new axe rule that
 * starts firing must still render, using its raw id as the label.
 */
export function ruleMeta(id: string): RuleMeta {
  const known = KNOWN[id];
  if (known) return { id, ...known };
  return { id, label: id, impact: 'moderate', inScope: true, exact: false };
}

/** Sort rule ids into display order, with unknown ids after the known set. */
export function sortRuleIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const ai = RULE_ORDER.indexOf(a);
    const bi = RULE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export const IMPACT_RANK: Record<Impact, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

export const IMPACT_TEXT: Record<Impact, string> = {
  critical: 'text-critical',
  serious: 'text-serious',
  moderate: 'text-moderate',
  minor: 'text-minor',
};

export const IMPACT_BG: Record<Impact, string> = {
  critical: 'bg-critical',
  serious: 'bg-serious',
  moderate: 'bg-moderate',
  minor: 'bg-minor',
};
