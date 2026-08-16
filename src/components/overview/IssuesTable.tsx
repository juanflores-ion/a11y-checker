'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';

import type { ResolvedMetric } from '@/lib/aggregate';
import { cellTone, NOT_MEASURABLE_TITLE, NOT_MEASURED_TITLE } from '@/lib/format';
import { ISSUES, SEVERITY_LABEL, sortIssues, type Issue, type Severity } from '@/lib/issues';
import { BRAND_LABEL, BRANDS, type Brand } from '@/lib/model';
import { CodeSample } from '../Primitives';
import { SegmentedControl } from '../ui/SegmentedControl';
import { SiteChip } from '../ui/SiteChip';
import { StatusDot, type DotTone } from '../ui/StatusDot';
import { FIGURE_CLASS, Table, TBody, Td, Th, THead, GroupRow, ToggleCell } from '../ui/Table';
import { Tag } from '../ui/Tag';

type SiteFilter = Brand | 'both';

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
 * removed. Whether a fix landed is answered by Scan → Before / after.
 */
export function IssuesTable({
  metricsByBrand,
}: {
  metricsByBrand: Record<Brand, Record<string, ResolvedMetric[]>>;
}) {
  const [site, setSite] = useState<SiteFilter>('both');
  const [openId, setOpenId] = useState<string | null>(null);

  const { tracked, parked } = useMemo(() => {
    const sorted = sortIssues(ISSUES);
    return { tracked: sorted.filter((i) => i.inScope), parked: sorted.filter((i) => !i.inScope) };
  }, []);
  const visible = site === 'both' ? tracked : tracked.filter((i) => i.brands.includes(site));
  const brandsShown: Brand[] = site === 'both' ? [...BRANDS] : [site];

  return (
    <section aria-labelledby="issues">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="issues" className="text-sm font-semibold text-ink">
          What’s wrong, and what would fix it{' '}
          <span className="font-normal text-faint">
            · {visible.length} issue{visible.length === 1 ? '' : 's'}, hardest-blocking first
          </span>
        </h2>
        <SegmentedControl<SiteFilter>
          ariaLabel="Filter issues by site"
          value={site}
          onChange={setSite}
          options={[
            { value: 'both', label: 'Both sites' },
            ...BRANDS.map((b) => ({ value: b, label: BRAND_LABEL[b] })),
          ]}
        />
      </div>

      <Table label="Issues" className="[&>table]:min-w-[46rem]">
        <THead>
          <tr>
            <Th className="w-8">#</Th>
            <Th className="w-28">Severity</Th>
            <Th>Issue</Th>
            <Th className="w-28">Sites</Th>
            <Th align="right" className="w-40">
              Measured now
            </Th>
            <Th className="w-8">
              <span className="sr-only">Detail</span>
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
              open={openId === issue.id}
              onToggle={() => setOpenId(openId === issue.id ? null : issue.id)}
            />
          ))}
          {parked.length ? (
            <>
              <GroupRow colSpan={6}>
                Measured, but owned elsewhere — styling and brand-palette decisions, tracked here,
                not part of this workstream
              </GroupRow>
              {parked.map((issue) => (
                <IssueRows
                  key={issue.id}
                  index={null}
                  issue={issue}
                  brandsShown={brandsShown}
                  metricsByBrand={metricsByBrand}
                  open={openId === issue.id}
                  onToggle={() => setOpenId(openId === issue.id ? null : issue.id)}
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
      <tr className={open ? 'bg-paper/40' : undefined}>
        <Td className="font-mono text-xs text-faint tnum">{index ?? '·'}</Td>
        <Td>
          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-medium ${muted ? 'text-faint' : SEVERITY_TEXT[issue.severity]}`}>
            <StatusDot tone={muted ? 'na' : SEVERITY_DOT[issue.severity]} />
            {muted ? 'Owned elsewhere' : SEVERITY_LABEL[issue.severity]}
          </span>
        </Td>
        <Td className={muted ? 'text-muted' : ''}>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            className={`text-left hover:underline underline-offset-2 ${open ? 'font-medium text-ink' : ''}`}
          >
            {issue.title}
          </button>
          {issue.detection === 'manual' ? (
            <Tag tone="phantom" className="ml-2" title="No automated tool can detect this — found by reading the code and testing by hand">
              manual finding
            </Tag>
          ) : null}
        </Td>
        <Td>
          <span className="inline-flex gap-1">
            {issue.brands.map((b) => (
              <SiteChip key={b} brand={b} />
            ))}
          </span>
        </Td>
        <Td align="right" className="whitespace-nowrap font-mono text-xs tnum">
          <HeadlineFigure issue={issue} brands={brands} metricsByBrand={metricsByBrand} muted={muted} />
        </Td>
        <ToggleCell open={open} onToggle={onToggle} controls={panelId} />
      </tr>
      {open ? (
        <tr id={panelId}>
          <Td colSpan={6} className="h-auto bg-paper/40 py-4 pl-[3.25rem] pr-6">
            <IssueDetail issue={issue} brands={brands} metricsByBrand={metricsByBrand} muted={muted} />
          </Td>
        </tr>
      ) : null}
    </>
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
    <div className="grid max-w-5xl gap-x-8 gap-y-4 text-[12.5px] leading-relaxed sm:grid-cols-2">
      <Block title="What breaks">
        <p className="text-ink">{issue.whatBreaks}</p>
        {issue.metrics.length ? (
          <table className="mt-2 border-collapse text-xs">
            <tbody>
              {issue.metrics.map((ref, i) => (
                <tr key={i}>
                  <td className="pr-4 text-muted">{ref.label}</td>
                  {brands.map((b) => (
                    <td key={b} className="pr-3 text-right font-mono tnum">
                      <span className="mr-1 text-faint">{BRAND_LABEL[b]}</span>
                      <Figure m={metricsByBrand[b]?.[issue.id]?.[i]} muted={muted} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-1 text-muted">No automated measurement — found by reading the code and testing by hand.</p>
        )}
      </Block>
      <Block title="Why it matters">
        <p className="text-ink">{issue.whyItMatters}</p>
      </Block>
      <Block title="Technical">
        <p className="text-muted">{issue.technical}</p>
        {issue.sources?.length ? (
          <ul className="mt-1.5 space-y-0.5">
            {issue.sources.map((s) => (
              <li key={s} className="break-all font-mono text-[11px] text-faint">{s}</li>
            ))}
          </ul>
        ) : null}
      </Block>
      <Block title={<>Fix <Tag className="ml-1">{RISK_LABEL[issue.fix.riskLevel]}</Tag></>}>
        <p className="text-ink">{issue.fix.summary}</p>
        <p className="mt-1 text-muted">{issue.fix.technical}</p>
        <p className="mt-1 text-muted"><span className="text-faint">Risk:</span> {issue.fix.risk}</p>
      </Block>
      <Block title="Verify">
        <p className="text-muted">
          {issue.verify}{' '}
          <Link href="/scan?mode=compare" className="text-accent underline underline-offset-2">Scan → Before / after</Link>{' '}
          shows whether it moved.
        </p>
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
