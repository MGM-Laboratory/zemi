'use client';

import { BarChart3, Table2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import dynamic from 'next/dynamic';
import { useId, useState, type ReactNode } from 'react';
import { Skeleton } from '@/components/admin/ui/feedback';
import { cn } from '@/lib/admin/cn';

/* ------------------------------------------------------------------ lazy recharts */

const chartLoading = () => <Skeleton className="size-full" rounded="lg" />;
export const TimelineChart = dynamic(() => import('./charts-impl').then((m) => m.TimelineChart), { ssr: false, loading: chartLoading });
export const HourChart = dynamic(() => import('./charts-impl').then((m) => m.HourChart), { ssr: false, loading: chartLoading });
export const ArrivalsChart = dynamic(() => import('./charts-impl').then((m) => m.ArrivalsChart), { ssr: false, loading: chartLoading });

/* ------------------------------------------------------------------ card */

export interface ChartTable {
  columns: string[];
  rows: Array<Array<ReactNode>>;
  /** Right-align these column indexes (numbers). */
  numeric?: number[];
}

/**
 * A chart card with a "table" twin (every chart can be read without color or hover), a
 * caption, an optional headline number, and the previous render held at reduced opacity
 * while it refetches (no skeleton flash).
 */
export function ChartCard({
  title,
  description,
  headline,
  children,
  table,
  height = 220,
  empty,
  fetching,
  className,
  actions,
  fluid,
}: {
  title: string;
  description?: ReactNode;
  headline?: ReactNode;
  children: ReactNode;
  table: ChartTable;
  /** Plot height in px (the axis band is inside it). */
  height?: number;
  /** Shown instead of the chart when there is nothing to plot. */
  empty?: ReactNode;
  fetching?: boolean;
  className?: string;
  actions?: ReactNode;
  /** HTML content (bar lists): grow with the content instead of a fixed plot height. */
  fluid?: boolean;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const id = useId();
  return (
    <section aria-labelledby={`${id}-t`} className={cn('flex min-w-0 flex-col rounded-[20px] border border-line bg-white p-4 sm:p-5', className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`${id}-t`} className="font-display text-[1.0625rem] leading-tight font-extrabold tracking-[-0.02em]">
            {title}
          </h3>
          {description ? <p className="mt-0.5 text-[0.8125rem] text-ink-3">{description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {!empty ? (
            <div className="flex rounded-full bg-surface-muted p-0.5" role="group" aria-label={`${title}: view`}>
              <ViewBtn active={view === 'chart'} onClick={() => setView('chart')} label="Chart">
                <BarChart3 className="size-3.5" />
              </ViewBtn>
              <ViewBtn active={view === 'table'} onClick={() => setView('table')} label="Table">
                <Table2 className="size-3.5" />
              </ViewBtn>
            </div>
          ) : null}
        </div>
      </header>
      {headline ? <div className="mb-3">{headline}</div> : null}
      <div className={cn('min-w-0 flex-1 transition-opacity duration-200', fetching && 'opacity-60')}>
        {empty ? (
          <div className="flex items-center justify-center" style={{ minHeight: height }}>
            {empty}
          </div>
        ) : view === 'chart' ? (
          <div
            style={fluid ? { minHeight: height } : { height }}
            className="min-w-0"
            role={fluid ? undefined : 'img'}
            aria-label={fluid ? undefined : `${title}. Switch to the table view for the numbers.`}
          >
            {children}
          </div>
        ) : (
          <div className="max-h-[22rem] overflow-auto rounded-xl border border-line" style={{ minHeight: Math.min(height, 160) }}>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{title}</caption>
              <thead className="sticky top-0 bg-surface-muted text-[0.75rem] text-ink-3">
                <tr>
                  {table.columns.map((c, i) => (
                    <th key={c} scope="col" className={cn('px-3 py-2 font-semibold', table.numeric?.includes(i) && 'text-right')}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, ri) => (
                  <tr key={ri} className="border-t border-line">
                    {r.map((cell, ci) => (
                      <td key={ci} className={cn('px-3 py-1.5 text-ink-2', table.numeric?.includes(ci) && 'mono text-right text-ink tabular-nums')}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function ViewBtn({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Show as ${label.toLowerCase()}`}
      title={label}
      className={cn(
        'flex h-7 w-8 items-center justify-center rounded-full transition focus-visible:outline-2 focus-visible:outline-focus',
        active ? 'bg-white text-ink shadow-[0_1px_2px_rgba(14,17,22,0.08)]' : 'text-ink-3 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ ranked bar list (HTML) */

/**
 * Horizontal bars for ranked categories with long names (email domains). One hue for every bar
 * (nominal categories, never colored by rank), value at the tip, hover lift, keyboard focusable.
 */
export function BarList({ items, color, total, formatValue = (n) => n.toLocaleString('en-US') }: { items: Array<{ key: string; label: ReactNode; value: number }>; color: string; total?: number; formatValue?: (n: number) => string }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => {
        const share = total ? Math.round((it.value / total) * 100) : null;
        return (
          <li
            key={it.key}
            tabIndex={0}
            className="group grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-1 py-1 outline-none transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]"
            title={share != null ? `${share}% of registrations` : undefined}
          >
            <span className="truncate text-sm text-ink-2">{it.label}</span>
            <span className="relative h-3.5 min-w-0">
              <motion.span
                className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[filter] group-hover:brightness-110"
                style={{ background: color }}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${Math.max(2, (it.value / max) * 100)}%` }}
                transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : i * 0.04, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
            <span className="mono min-w-[3.5rem] text-right text-sm font-semibold text-ink tabular-nums">
              {formatValue(it.value)}
              {share != null ? <span className="ml-1.5 font-normal text-ink-3">{share}%</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ part-to-whole (HTML) */

export interface SharePart {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * One horizontal stacked bar for part-to-whole (sources, splits). 2px surface gaps between
 * segments, a legend that also carries the numbers (identity is never color alone), and
 * values inside segments only when they fit.
 */
export function StackedShare({ parts, height = 14, legend = true, className }: { parts: SharePart[]; height?: number; legend?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const total = parts.reduce((a, p) => a + p.value, 0);
  const visible = parts.filter((p) => p.value > 0);
  return (
    <div className={className}>
      <div className="flex w-full gap-[2px] overflow-hidden rounded-[4px]" style={{ height }} role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
        {total === 0 ? <span className="h-full w-full rounded-[4px] bg-surface-muted" /> : null}
        {visible.map((p, i) => (
          <motion.span
            key={p.key}
            title={`${p.label}: ${p.value.toLocaleString('en-US')} (${Math.round((p.value / total) * 100)}%)`}
            className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{ background: p.color }}
            initial={reduce ? false : { flexGrow: 0 }}
            animate={{ flexGrow: p.value }}
            transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : i * 0.05, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </div>
      {legend ? (
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.8125rem]">
          {parts.map((p) => (
            <li key={p.key} className="flex items-center gap-1.5 text-ink-2">
              <span className="size-2.5 rounded-[3px]" style={{ background: p.color }} aria-hidden="true" />
              {p.label}
              <span className="mono font-semibold text-ink tabular-nums">{p.value.toLocaleString('en-US')}</span>
              {total ? <span className="text-ink-3">{Math.round((p.value / total) * 100)}%</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ meter */

/** Ratio against a limit: fill in blue (red once full), track a light step of the same hue. */
export function Meter({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const reduce = useReducedMotion();
  const frac = max > 0 ? Math.min(1, value / max) : 0;
  const full = max > 0 && value >= max;
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full', full ? 'bg-red-50' : 'bg-blue-50', className)}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
    >
      <motion.div
        className={cn('h-full rounded-full', full ? 'bg-red' : 'bg-blue')}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${frac * 100}%` }}
        transition={{ duration: reduce ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}
