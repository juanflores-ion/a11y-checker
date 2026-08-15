'use client';

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { BRAND_COLOR, BRAND_LABEL, BRANDS, CHART, VIEWPORT_LABEL, type ViewportName } from '@/lib/model';
import { ruleMeta } from '@/lib/rules';
import { Eyebrow } from './Primitives';
import { useRuns } from './RunContext';

export interface TrendPoint {
  runId: string;
  key: string;
  viewport: ViewportName;
  short: string;
  startedAt: string;
  label: string | null;
  values: Record<string, Record<string, number>>;
}

export function TrendClient({ points, ruleIds }: { points: TrendPoint[]; ruleIds: string[] }) {
  const [metric, setMetric] = useState('in-scope');
  const { viewport } = useRuns();

  /**
   * One viewport at a time, always. Joining a mobile reading to a desktop one
   * would draw a cliff that no code change caused — the two profiles differ by
   * roughly 56 nav links on their own.
   */
  const series = useMemo(
    () => points.filter((p) => p.viewport === viewport),
    [points, viewport]
  );

  const data = useMemo(
    () =>
      series.map((p) => ({
        name: p.short,
        runId: p.runId,
        label: p.label,
        insureon: p.values['insureon']?.[metric] ?? 0,
        techinsurance: p.values['techinsurance']?.[metric] ?? 0,
      })),
    [series, metric]
  );

  const metricLabel = describeMetric(metric);
  const labelled = data.filter((d) => d.label);
  const otherProfileRuns = points.filter((p) => p.viewport !== viewport).length;

  // Reachable by direct URL even though the tab is hidden below three runs.
  // The threshold here is 2 rather than 3 on purpose: this guard is about what
  // can be DRAWN, and two points can be. RUN_VIEWS decides what is worth
  // drawing, and holds that two points are a delta the Summary tab already
  // states better. Somebody who types the URL with two runs on file gets the
  // chart rather than a message telling them their data does not exist.
  if (series.length < 2) {
    return (
      <div className="rounded-card border border-dashed border-rule bg-card p-8 text-center">
        <h2 className="font-display text-lg font-semibold">Nothing to plot yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          A trend needs at least two scans of the same device profile to draw a line between, and
          three before it is worth reading as a direction.{' '}
          {series.length === 1
            ? `One run measured ${VIEWPORT_LABEL[viewport]} so far.`
            : `No run measured ${VIEWPORT_LABEL[viewport]}.`}{' '}
          {otherProfileRuns > 0
            ? 'Other runs measured a different profile, and joining the two would draw a change nobody made.'
            : 'Take another and rebuild, and this fills in.'}
        </p>
        <code className="mt-3 inline-block rounded-card border border-rule bg-paper px-3 py-2 font-mono text-xs">
          node scanner/scan.mjs --out data/runs
        </code>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">Trend</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
            Every run, oldest to newest. Down is better on every metric here. Runs carrying a
            label are marked on the axis, so it&apos;s clear which drop belongs to which phase
            of work.
          </p>
        </div>

        <label className="flex items-center gap-2">
          <span className="text-eyebrow font-medium text-muted">Metric</span>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="max-w-[18rem] truncate rounded-card border border-rule bg-card px-2 py-1.5 font-mono text-sm hover:border-accent"
          >
            <optgroup label="Rollups">
              <option value="in-scope">Failing elements — in scope</option>
              <option value="total">Failing elements — all rules</option>
              <option value="phantom">Dead controls in the closed menu</option>
              <option value="unfindable-links">Links an agent cannot find</option>
            </optgroup>
            <optgroup label="Individual rules">
              {ruleIds.map((id) => (
                <option key={id} value={`rule:${id}`}>
                  {ruleMeta(id).label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>

      <div className="rounded-card border border-rule bg-card p-4 shadow-card">
        <Eyebrow>{metricLabel}</Eyebrow>
        <div className="mt-3 h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 24, right: 40, bottom: 28, left: 0 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: CHART.axis, fontFamily: CHART.mono }}
                tickLine={false}
                axisLine={{ stroke: CHART.grid }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: CHART.axis, fontFamily: CHART.mono }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip
                contentStyle={{
                  border: `1px solid ${CHART.grid}`,
                  borderRadius: 10,
                  boxShadow: '0 12px 32px -8px rgba(13,17,23,0.18)',
                  fontFamily: CHART.mono,
                  fontSize: 12,
                }}
                labelFormatter={(name: string) => {
                  const point = data.find((d) => d.name === name);
                  return point?.label ? `${name} — ${point.label}` : name;
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={28}
                formatter={(value: string) => (
                  <span style={{ fontSize: 12, color: '#0D1117' }}>
                    {BRAND_LABEL[value as keyof typeof BRAND_LABEL] ?? value}
                  </span>
                )}
              />
              {labelled.map((d) => (
                <ReferenceLine
                  key={d.runId}
                  x={d.name}
                  stroke={CHART.marker}
                  strokeDasharray="3 3"
                  label={{
                    value: d.label ?? '',
                    position: 'top',
                    fill: CHART.marker,
                    fontSize: 11,
                    fontFamily: CHART.mono,
                  }}
                />
              ))}
              {BRANDS.map((brand) => (
                <Line
                  key={brand}
                  type="linear"
                  dataKey={brand}
                  stroke={BRAND_COLOR[brand]}
                  strokeWidth={2}
                  dot={{ r: 3, fill: BRAND_COLOR[brand] }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <table className="w-full border-collapse text-sm">
        <caption className="pb-2 text-left text-eyebrow font-medium text-muted">
          Same figures, as a table
        </caption>
        <thead>
          <tr className="border-b border-ink/25">
            <th scope="col" className="py-2 pr-4 text-left text-eyebrow font-medium text-muted">
              Run
            </th>
            {BRANDS.map((b) => (
              <th key={b} scope="col" className="py-2 pr-4 text-right text-eyebrow font-medium text-muted">
                {BRAND_LABEL[b]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.runId} className="border-b border-rule">
              <th scope="row" className="py-2 pr-4 text-left font-normal">
                <span className="font-mono text-xs">{d.runId}</span>
                {d.label ? <span className="ml-2 text-xs text-phantom">{d.label}</span> : null}
              </th>
              <td className="py-2 pr-4 text-right font-mono tnum">{d.insureon.toLocaleString()}</td>
              <td className="py-2 pr-4 text-right font-mono tnum">
                {d.techinsurance.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function describeMetric(metric: string): string {
  if (metric === 'in-scope') return 'Failing elements across in-scope rules';
  if (metric === 'total') return 'Failing elements across all rules';
  if (metric === 'phantom') return 'Focusable controls inside the closed mobile menu';
  if (metric === 'unfindable-links') {
    return 'Links out of the accessibility tree with nothing announcing them';
  }
  return ruleMeta(metric.slice('rule:'.length)).label;
}
