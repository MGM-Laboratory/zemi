'use client';

import { formatJakarta, fromJakartaInput } from '@zemi/shared';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { CHART } from './lib';

/**
 * Recharts pieces for the people area. Loaded client-side only (next/dynamic, ssr false).
 * Mark specs (dataviz skill): bars at most 24px with 4px rounded data ends, 2px lines,
 * a 10% area wash, hairline solid grid, recessive axes, text in ink tokens, a hover
 * tooltip on every chart (the value leads, the label follows) and a table twin in the card.
 */

const tickStyle = { fill: CHART.tick, fontSize: 11 } as const;

function TipShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[9.5rem] rounded-2xl border border-line bg-white px-3.5 py-2.5 text-[0.8125rem] shadow-[var(--shadow-3)]">
      <p className="mb-1.5 text-ink-3">{title}</p>
      {children}
    </div>
  );
}

function TipRow({ color, value, label, line }: { color: string; value: string; label: string; line?: boolean }) {
  return (
    <p className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-ink-2">
        <span className={line ? 'h-0.5 w-3 rounded-full' : 'size-2.5 rounded-[3px]'} style={{ background: color }} aria-hidden="true" />
        {label}
      </span>
      <span className="mono font-semibold text-ink tabular-nums">{value}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ cumulative timeline */

export interface TimelinePoint {
  date: string;
  count: number;
  cumulative: number;
}

function dayLabel(date: string) {
  return formatJakarta(fromJakartaInput(date, '12:00'), 'date-short');
}

export function TimelineChart({ data, capacity, eventDay, animate = true }: { data: TimelinePoint[]; capacity: number | null; eventDay: string | null; animate?: boolean }) {
  const last = data[data.length - 1];
  const showCapacity = capacity != null && capacity > 0;
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <AreaChart data={data} margin={{ top: 18, right: 12, left: -14, bottom: 0 }} accessibilityLayer>
        <defs>
          <linearGradient id="zemi-reg-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.blue} stopOpacity={0.16} />
            <stop offset="100%" stopColor={CHART.blue} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis
          dataKey="date"
          tickFormatter={dayLabel}
          tickLine={false}
          axisLine={{ stroke: CHART.axis }}
          tick={tickStyle}
          minTickGap={24}
          interval="preserveStartEnd"
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44} tick={{ ...tickStyle, fill: 'var(--color-ink-3)' }} />
        {showCapacity ? (
          <ReferenceLine
            y={capacity}
            stroke="var(--color-ink-4)"
            strokeWidth={1}
            ifOverflow="extendDomain"
            label={{ value: `${capacity} seats`, position: 'insideTopLeft', fill: 'var(--color-ink-3)', fontSize: 11, dy: -14 }}
          />
        ) : null}
        {eventDay && data.some((d) => d.date === eventDay) && data[data.length - 1]?.date !== eventDay ? (
          <ReferenceLine x={eventDay} stroke="var(--color-ink-4)" strokeDasharray="3 3" label={{ value: 'Event day', position: 'insideBottomRight', fill: 'var(--color-ink-3)', fontSize: 11, dy: -4 }} />
        ) : null}
        <Tooltip
          cursor={{ stroke: 'var(--color-ink-4)', strokeWidth: 1 }}
          content={(props) => {
            const p = props as TooltipContentProps<number, string>;
            const row = p.payload?.[0]?.payload as TimelinePoint | undefined;
            if (!p.active || !row) return null;
            return (
              <TipShell title={formatJakarta(fromJakartaInput(row.date, '12:00'), 'date')}>
                <TipRow color={CHART.blue} value={row.cumulative.toLocaleString('en-US')} label="Total so far" line />
                <p className="mt-1 text-ink-3">+{row.count.toLocaleString('en-US')} that day</p>
              </TipShell>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="cumulative"
          name="Total so far"
          stroke={CHART.blue}
          strokeWidth={2}
          fill="url(#zemi-reg-wash)"
          dot={false}
          activeDot={{ r: 5, fill: CHART.blue, stroke: '#ffffff', strokeWidth: 2 }}
          isAnimationActive={animate}
        >
          {last ? (
            <LabelList
              dataKey="cumulative"
              content={(props) => {
                const { x, y, index } = props as { x?: number; y?: number; index?: number };
                if (index !== data.length - 1 || x == null || y == null) return null;
                return (
                  <g>
                    <circle cx={x} cy={y} r={5} fill={CHART.blue} stroke="#ffffff" strokeWidth={2} />
                    <text x={x - 8} y={y - 10} textAnchor="end" className="mono" fontSize={12} fontWeight={600} fill="var(--color-ink)">
                      {last.cumulative.toLocaleString('en-US')}
                    </text>
                  </g>
                );
              }}
            />
          ) : null}
        </Area>
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ by hour */

export function HourChart({ data, animate = true }: { data: Array<{ hour: number; count: number }>; animate?: boolean }) {
  const max = Math.max(0, ...data.map((d) => d.count));
  const peak = data.find((d) => d.count === max && max > 0)?.hour ?? null;
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={data} margin={{ top: 18, right: 4, left: -22, bottom: 0 }} barCategoryGap={2} accessibilityLayer>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis
          dataKey="hour"
          tickFormatter={(h: number) => String(h).padStart(2, '0')}
          ticks={[0, 3, 6, 9, 12, 15, 18, 21]}
          tickLine={false}
          axisLine={{ stroke: CHART.axis }}
          tick={tickStyle}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tick={{ ...tickStyle, fill: 'var(--color-ink-3)' }} />
        <Tooltip
          cursor={{ fill: 'var(--color-surface-muted)', radius: 6 }}
          content={(props) => {
            const p = props as TooltipContentProps<number, string>;
            const row = p.payload?.[0]?.payload as { hour: number; count: number } | undefined;
            if (!p.active || !row) return null;
            const h = String(row.hour).padStart(2, '0');
            return (
              <TipShell title={`${h}:00 to ${h}:59 WIB`}>
                <TipRow color={CHART.blue} value={row.count.toLocaleString('en-US')} label="Sign-ups" />
              </TipShell>
            );
          }}
        />
        <Bar dataKey="count" name="Sign-ups" fill={CHART.blue} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={animate}>
          <LabelList
            dataKey="count"
            content={(props) => {
              const { x, y, width, value } = props as { x?: number; y?: number; width?: number; value?: number | string };
              if (peak == null || Number(value) !== max || x == null || y == null || width == null) return null;
              return (
                <text x={x + width / 2} y={y - 6} textAnchor="middle" className="mono" fontSize={11} fontWeight={600} fill="var(--color-ink)">
                  {max}
                </text>
              );
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ arrivals */

export function ArrivalsChart({
  data,
  startTime,
  animate = true,
  highlight,
}: {
  data: Array<{ time: string; count: number }>;
  startTime: string | null;
  animate?: boolean;
  /** Bucket that just got a new arrival (live board): drawn a touch darker for a moment. */
  highlight?: string | null;
}) {
  const startBucket = startTime && data.length ? nearestBucket(data.map((d) => d.time), startTime) : null;
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={data} margin={{ top: 18, right: 4, left: -22, bottom: 0 }} barCategoryGap={2} accessibilityLayer>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="time" tickLine={false} axisLine={{ stroke: CHART.axis }} tick={tickStyle} minTickGap={18} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tick={{ ...tickStyle, fill: 'var(--color-ink-3)' }} />
        {startBucket ? (
          <ReferenceLine x={startBucket} stroke="var(--color-ink-3)" label={{ value: `Starts ${startTime}`, position: 'insideTopLeft', fill: 'var(--color-ink-3)', fontSize: 11, dy: -16, dx: 4 }} />
        ) : null}
        <Tooltip
          cursor={{ fill: 'var(--color-surface-muted)', radius: 6 }}
          content={(props) => {
            const p = props as TooltipContentProps<number, string>;
            const row = p.payload?.[0]?.payload as { time: string; count: number } | undefined;
            if (!p.active || !row) return null;
            return (
              <TipShell title={`${row.time} to ${addMinutes(row.time, 4)} WIB`}>
                <TipRow color={CHART.green} value={row.count.toLocaleString('en-US')} label="Arrived" />
              </TipShell>
            );
          }}
        />
        <Bar dataKey="count" name="Arrived" fill={CHART.green} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={animate}>
          {data.map((d) => (
            <Cell key={d.time} fill={d.time === highlight ? '#0b6b45' : CHART.green} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function toMin(t: string) {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
function addMinutes(t: string, add: number) {
  const v = (toMin(t) + add + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}
function nearestBucket(buckets: string[], t: string): string | null {
  const target = toMin(t);
  let best: string | null = null;
  let bestD = Infinity;
  for (const b of buckets) {
    const d = Math.abs(toMin(b) - target);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return bestD <= 5 ? best : null;
}
