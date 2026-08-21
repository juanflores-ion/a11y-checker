'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';

import { issueOpensByDefault, type ResolvedMetric } from '@/lib/aggregate';
import { cellTone, NOT_MEASURABLE_TITLE, NOT_MEASURED_TITLE } from '@/lib/format';
import { ISSUES, SEVERITY_LABEL, sortIssues, type Issue, type Severity } from '@/lib/issues';
import type { Brand } from '@/lib/model';
import { Arrow, CodeSample } from '../Primitives';
import { useRuns } from '../RunContext';
import { StatusDot, type DotTone } from '../ui/StatusDot';
import { FIGURE_CLASS, Table, TBody, Td, Th, THead, GroupRow } from '../ui/Table';
import { Tag } from '../ui/Tag';
import { SectionHead } from '../ui/SectionHead';
import { IssuePicture } from './IssuePicture';

const SEVERITY_DOT: Record<Severity, DotTone> = {
  blocking: 'bad',
  serious: 'serious',
  moderate: 'moderate',
};
const SEVERITY_TEXT: Record<Severity, string> = {
  blocking: 'text-critical',
  serious: 'text-serious',
  moderate: 'text-moderate',
};

const RISK_LABEL = { 'very-low': 'very low risk', low: 'low risk', medium: 'medium risk' } as const;

/**
 * The issue catalogue as rows, not cards. Severity, title, sites, the live
 * figure, and a chevron; one row open at a time, inline, with everything the
 * old card carried: what breaks, why it matters, the mechanism, the fix, how
 * to verify, sample markup and every live metric.
 *
 * Carries no notion of whether anything has been fixed — that was tried and
 * removed. Whether a fix landed is answered by Scan → Compare runs.
 */
export function IssuesTable({
  metricsByBrand,
}: {
  metricsByBrand: Record<Brand, Record<string, ResolvedMetric[]>>;
}) {
  /** The context bar's Site control decides which brands' issues and figures show. */
  const { site, brands: brandsShown } = useRuns();
  /**
   * The blocking issues this run still finds start open; everything else
   * starts folded.
   *
   * The row's whole point is the picture and the plain sentence inside it, so
   * arriving on sixteen collapsed titles asks the reader to guess that
   * anything is there — but sixteen open cards is a page nobody can scan.
   * `issueOpensByDefault` holds the rule and the reasoning behind it.
   *
   * What the reader chose is tracked per row and absolutely, rather than as a
   * set of "rows toggled away from the default": the default now moves with
   * the Site and Device controls, so a delta would fold a row the reader had
   * opened the moment they switched device.
   */
  const [chosen, setChosen] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const isOpen = (issue: Issue) =>
    chosen.get(issue.id) ?? issueOpensByDefault(issue, brandsShown, metricsByBrand);
  const toggle = (issue: Issue) =>
    setChosen((prev) => new Map(prev).set(issue.id, !isOpen(issue)));

  const { tracked, parked } = useMemo(() => {
    const sorted = sortIssues(ISSUES);
    return { tracked: sorted.filter((i) => i.inScope), parked: sorted.filter((i) => !i.inScope) };
  }, []);
  const visible = tracked.filter((i) => i.brands.includes(site));

  return (
    <section aria-labelledby="issues" data-tour="issues">
      <SectionHead
        id="issues"
        title="What’s wrong, and what would fix it"
        note={
          <>
            {visible.length} issue{visible.length === 1 ? '' : 's'}
            {parked.length ? `, ${parked.length} owned elsewhere` : ''}, hardest-blocking first.
            The blocking ones this run still finds are open; click any row to open or fold it.
          </>
        }
      />

      <Table label="Issues" className="[&>table]:min-w-[46rem]">
        <THead>
          <tr>
            <Th className="w-14">#</Th>
            <Th className="w-28">Severity</Th>
            <Th>Issue</Th>
            <Th align="right" className="w-40">
              Measured now
            </Th>

          </tr>
        </THead>
        <TBody>
          {visible.map((issue, i) => (
            <IssueRows
              key={issue.id}
              index={i + 1}
              issue={issue}
              brandsShown={brandsShown}
              metricsByBrand={metricsByBrand}
              open={isOpen(issue)}
              onToggle={() => toggle(issue)}
            />
          ))}
          {parked.length ? (
            <>
              <GroupRow colSpan={4} variant="note">
                Measured, but owned elsewhere: styling and brand-palette decisions, tracked here,
                not part of this workstream
              </GroupRow>
              {parked.map((issue) => (
                <IssueRows
                  key={issue.id}
                  index={null}
                  issue={issue}
                  brandsShown={brandsShown}
                  metricsByBrand={metricsByBrand}
                  open={isOpen(issue)}
                  onToggle={() => toggle(issue)}
                  muted
                />
              ))}
            </>
          ) : null}
        </TBody>
      </Table>
    </section>
  );
}

function IssueRows({
  index,
  issue,
  brandsShown,
  metricsByBrand,
  open,
  onToggle,
  muted = false,
}: {
  index: number | null;
  issue: Issue;
  brandsShown: Brand[];
  metricsByBrand: Record<Brand, Record<string, ResolvedMetric[]>>;
  open: boolean;
  onToggle: () => void;
  muted?: boolean;
}) {
  const brands = brandsShown.filter((b) => issue.brands.includes(b));
  const panelId = `issue-${issue.id}`;
  return (
    <>
      {/**
        * Every row is open by default, so without a heavier boundary the page
        * reads as one long run of text and nobody can see where an issue ends.
        * Each issue is drawn as a card: a 2px rule above its header, a tinted
        * header strip, and the detail sharing the header's tint below it.
        */}
      <tr
        onClick={onToggle}
        className={`cursor-pointer border-t-[3px] border-rule transition-colors ${
          open ? 'bg-tint/[0.045] hover:bg-tint/[0.06]' : 'hover:bg-paper/60'
        }`}
      >
        <Td className={`pr-0 font-mono text-xs text-faint tnum ${open ? 'h-11 border-b-0' : ''}`}>
          <span className="inline-flex items-center gap-1.5">
            <Caret open={open} />
            {index ?? '·'}
          </span>
        </Td>
        <Td className={open ? 'border-b-0' : ''}>
          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-medium ${muted ? 'text-faint' : SEVERITY_TEXT[issue.severity]}`}>
            <StatusDot tone={muted ? 'na' : SEVERITY_DOT[issue.severity]} />
            {muted ? 'Owned elsewhere' : SEVERITY_LABEL[issue.severity]}
          </span>
        </Td>
        <Td className={`${muted ? 'text-muted' : ''} ${open ? 'border-b-0' : ''}`}>
          <button
            type="button"
            onClick={(e) => {
              // The row already toggles; without this the click counts twice
              // and the row reopens as fast as it closes.
              e.stopPropagation();
              onToggle();
            }}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            className={`text-left text-[13.5px] font-semibold tracking-tight hover:underline underline-offset-2 ${
              open ? 'text-ink' : 'text-ink/90'
            }`}
          >
            {issue.title}
          </button>
          {issue.detection === 'manual' ? (
            <Tag tone="phantom" className="ml-2" title="No automated tool can detect this. Found by reading the code and testing by hand">
              manual finding
            </Tag>
          ) : null}
        </Td>
        <Td align="right" className={`whitespace-nowrap font-mono text-xs tnum ${open ? 'border-b-0' : ''}`}>
          <HeadlineFigure issue={issue} brands={brands} metricsByBrand={metricsByBrand} muted={muted} />
        </Td>
      </tr>
      {open ? (
        <tr id={panelId}>
          {/* Equal top and bottom: measured 20px over 32px before this, which
              reads as the content sitting low in its own block. */}
          <Td colSpan={4} className="h-auto border-b-0 bg-paper/50 py-7 pl-[3.25rem] pr-6">
            <IssueDetail issue={issue} brands={brands} metricsByBrand={metricsByBrand} muted={muted} />
          </Td>
        </tr>
      ) : null}
    </>
  );
}

/** The disclosure marker, on the left where a reader expects to find one. */
function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      aria-hidden="true"
      className={`transition-transform ${open ? 'rotate-90' : ''}`}
    >
      <path d="M2 1l4 3-4 3z" fill="currentColor" />
    </svg>
  );
}

/** First metric per shown brand, joined with ·. Colour by target; n/m and — as the number rules say. */
function HeadlineFigure({
  issue,
  brands,
  metricsByBrand,
  muted = false,
}: {
  issue: Issue;
  brands: Brand[];
  metricsByBrand: Record<Brand, Record<string, ResolvedMetric[]>>;
  muted?: boolean;
}) {
  if (issue.metrics.length === 0) return <span className="text-faint">—</span>;
  return (
    <>
      {brands.map((b, i) => {
        const m = metricsByBrand[b]?.[issue.id]?.[0];
        return (
          <Fragment key={b}>
            {i > 0 ? <span className="text-faint"> · </span> : null}
            <Figure m={m} muted={muted} />
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * One figure, coloured the way every other figure on the dashboard is: by
 * whether it missed its target, not by whether it is non-zero.
 *
 * `nav-links-in-tree` counts the links an agent *can* reach and
 * `clickable-no-role` is a magnitude nobody has set a target for; both were
 * printed red, which reads as a defect on the half of the catalogue that is
 * describing the site rather than accusing it.
 */
function Figure({ m, muted = false }: { m: ResolvedMetric | undefined; muted?: boolean }) {
  if (!m) return <span className="text-faint" title={NOT_MEASURED_TITLE}>—</span>;
  const tone = cellTone({
    value: m.value,
    target: m.target,
    higherIsBetter: m.higherIsBetter,
    notMeasured: m.notMeasured,
    misleadingZero: m.misleadingZero,
  });
  if (tone === 'na') return <span className="text-faint" title={NOT_MEASURED_TITLE}>—</span>;
  if (tone === 'nm') return <span className="text-faint" title={NOT_MEASURABLE_TITLE}>n/m</span>;
  return (
    <span className={muted ? 'text-muted' : FIGURE_CLASS[tone]}>{m.value.toLocaleString()}</span>
  );
}

/**
 * The expanded row, for someone who is not going to read a page of prose:
 * one plain sentence, the Now → After picture, the fix in a line with its risk,
 * the live figures — and one "Details" disclosure holding everything that used
 * to be six paragraphs (why it matters, mechanism, sources, verify, samples).
 */
function IssueDetail({
  issue,
  brands,
  metricsByBrand,
  muted = false,
}: {
  issue: Issue;
  brands: Brand[];
  metricsByBrand: Record<Brand, Record<string, ResolvedMetric[]>>;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="grid max-w-6xl items-start gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div>
          <p className="mb-3 text-[14px] leading-snug text-ink">{issue.plain}</p>
          <IssuePicture picture={issue.picture} />
        </div>
        <div className="text-[12.5px] leading-relaxed">
          <p className="text-[13px] text-ink">
            <span className="font-medium">Fix:</span> {issue.fix.summary}{' '}
            <Tag className="ml-1 align-[1px]">{RISK_LABEL[issue.fix.riskLevel]}</Tag>
          </p>
          <Figures issue={issue} brands={brands} metricsByBrand={metricsByBrand} muted={muted} />
        </div>
      </div>
      {/* Below both columns, so an open Details gets the whole row rather than
          the right-hand half: two columns of its own on wide screens, prose on
          the left and the technical material and samples on the right. */}
      <details className="group mt-4 text-[12.5px] leading-relaxed">
        <summary className="inline-flex cursor-pointer list-none items-center text-[12px] text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
          Details
        </summary>
        <div className="mt-3 grid gap-x-10 gap-y-3 border-l border-rule pl-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Block title="Why it matters">
              <p className="text-ink">{issue.whyItMatters}</p>
            </Block>
            <Block title="What breaks, exactly">
              <p className="text-muted">{issue.whatBreaks}</p>
            </Block>
            <Block title="Verify">
              <p className="text-muted">
                {issue.verify}{' '}
                <Link href="/scan" className="text-accent underline underline-offset-2">Scan <Arrow className="mx-0.5" /> Compare runs</Link>{' '}
                shows whether it moved.
              </p>
            </Block>
          </div>
          <div className="space-y-3">
            <Block title="Technical">
              <p className="text-muted">{issue.technical}</p>
              <p className="mt-1 text-muted">{issue.fix.technical}</p>
              <p className="mt-1 text-muted"><span className="text-faint">Risk:</span> {issue.fix.risk}</p>
              {issue.sources?.length ? (
                <ul className="mt-1.5 space-y-0.5">
                  {issue.sources.map((s) => (
                    <li key={s} className="break-all font-mono text-[11px] text-faint">{s}</li>
                  ))}
                </ul>
              ) : null}
            </Block>
            {issue.samples?.length ? (
              <Block title="Sample markup, captured by the scanner">
                <div className="space-y-2">
                  {issue.samples.map((s, i) => (
                    <div key={i}>
                      <p className="mb-1 text-[11px] text-faint">{s.caption}</p>
                      <CodeSample html={s.code} />
                    </div>
                  ))}
                </div>
              </Block>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}

/** The live figures, one line per metric: label, then a figure per site shown. */
function Figures({
  issue,
  brands,
  metricsByBrand,
  muted,
}: {
  issue: Issue;
  brands: Brand[];
  metricsByBrand: Record<Brand, Record<string, ResolvedMetric[]>>;
  muted: boolean;
}) {
  if (!issue.metrics.length) return null;
  return (
    <table className="mt-2 border-collapse font-mono text-[11.5px] tnum">
      <tbody>
        {issue.metrics.map((ref, i) => (
          <tr key={i}>
            <td className="pr-4 text-muted">{ref.label}</td>
            {brands.map((b) => (
              <td key={b} className="pr-3 text-right">
                <Figure m={metricsByBrand[b]?.[issue.id]?.[i]} muted={muted} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Block({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-0.5 text-[11.5px] font-medium text-faint">{title}</h4>
      {children}
    </div>
  );
}
