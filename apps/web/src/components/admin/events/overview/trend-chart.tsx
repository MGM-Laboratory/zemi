'use client';

import { formatJakarta, type AdminOverview } from '@zemi/shared';
import { TREND_COLORS } from './colors';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';

type Row = AdminOverview['trend'][number];

function TrendTooltip({ active, payload }: TooltipContentProps<number, string>) {
  const row = payload?.[0]?.payload as Row | undefined;
  if (!active || !row) return null;
  const rate = row.registrations ? Math.round((row.checkedIn / row.registrations) * 100) : null;
  return (
    <div className="min-w-[11rem] rounded-2xl border border-line bg-white px-3.5 py-2.5 text-[0.8125rem] shadow-[var(--shadow-3)]">
      <p className="font-semibold text-ink">{row.label}</p>
      <p className="mb-2 text-ink-3">{formatJakarta(row.startsAt, 'date')}</p>
      <p className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-2 text-ink-2">
          <span
            className="size-2.5 rounded-[3px]"
            style={{ background: TREND_COLORS.registrations }}
          />
          Registered
        </span>
        <span className="mono font-semibold text-ink tabular-nums">
          {row.registrations.toLocaleString('en-US')}
        </span>
      </p>
      <p className="mt-1 flex items-center justify-between gap-4">
        <span className="flex items-center gap-2 text-ink-2">
          <span className="size-2.5 rounded-[3px]" style={{ background: TREND_COLORS.checkedIn }} />
          Checked in
        </span>
        <span className="mono font-semibold text-ink tabular-nums">
          {row.checkedIn.toLocaleString('en-US')}
        </span>
      </p>
      {rate != null ? (
        <p className="mt-1.5 border-t border-line pt-1.5 text-ink-3">{rate}% showed up</p>
      ) : null}
    </div>
  );
}

/**
 * Registrations vs check-ins for recent events: grouped columns on one axis (both are people),
 * thin bars, rounded data ends, hairline grid, hover tooltip. Loaded client-side only.
 */
export default function TrendChart({
  data,
  animate = true,
}: {
  data: AdminOverview['trend'];
  animate?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart
        data={data}
        barGap={2}
        barCategoryGap="24%"
        margin={{ top: 8, right: 4, left: -18, bottom: 0 }}
        accessibilityLayer
      >
        <CartesianGrid vertical={false} stroke="var(--color-line)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: 'var(--color-line-strong)' }}
          tick={{ fill: 'var(--color-ink-3)', fontSize: 11 }}
          interval="preserveStartEnd"
          minTickGap={8}
        />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={44}
          tick={{ fill: 'var(--color-ink-4)', fontSize: 11 }}
        />
        <Tooltip
          cursor={{ fill: 'var(--color-surface-muted)', radius: 8 }}
          content={(props) => <TrendTooltip {...(props as TooltipContentProps<number, string>)} />}
        />
        <Bar
          dataKey="registrations"
          name="Registered"
          fill={TREND_COLORS.registrations}
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          isAnimationActive={animate}
        />
        <Bar
          dataKey="checkedIn"
          name="Checked in"
          fill={TREND_COLORS.checkedIn}
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          isAnimationActive={animate}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
