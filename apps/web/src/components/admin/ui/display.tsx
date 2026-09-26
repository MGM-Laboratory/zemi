'use client';

import { formatJakarta, type JakartaFormat } from '@zemi/shared';
import { Check, Copy, Eye, EyeOff, TrendingDown, TrendingUp } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';
import { formatRelative } from '@/lib/admin/format';
import { useMounted } from '@/lib/admin/hooks';
import { ShapeGlyph } from './badge';
import { Tooltip } from './tooltip';

/* ------------------------------------------------------------------ DateText */

export interface DateTextProps {
  value: string | Date | number | null | undefined;
  /** Shared Jakarta format. Default 'datetime'. 'relative' shows "5 min ago". */
  format?: JakartaFormat | 'relative' | 'time-range';
  /** For 'time-range': the end instant. */
  end?: string | Date | number | null;
  /** Append " WIB" (default true for formats that show a time). */
  suffix?: boolean;
  /** Show the full date in a tooltip. Default true for 'relative'. */
  tooltip?: boolean;
  fallback?: ReactNode;
  className?: string;
}

/**
 * A date rendered in Asia/Jakarta with the shared helpers, inside a `<time>` element.
 * @example <DateText value={event.startsAt} format="date" />       Fri, 3 Oct 2026
 * @example <DateText value={event.startsAt} end={event.endsAt} format="time-range" />  13:15 to 15:15 WIB
 * @example <DateText value={row.createdAt} format="relative" />  5 min ago
 */
export function DateText({ value, format = 'datetime', end, suffix, tooltip, fallback = '', className }: DateTextProps) {
  const mounted = useMounted();
  if (value == null || value === '') return <>{fallback}</>;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return <>{fallback}</>;
  const iso = d.toISOString();
  const full = `${formatJakarta(d, 'datetime')} WIB`;
  let text: string;
  if (format === 'relative') {
    // Relative text depends on the clock; render the absolute date on the server to avoid mismatches.
    text = mounted ? formatRelative(d) : formatJakarta(d, 'date');
  } else if (format === 'time-range') {
    const e = end ? new Date(end) : null;
    text = `${formatJakarta(d, 'time')}${e ? ` to ${formatJakarta(e, 'time')}` : ''}${suffix === false ? '' : ' WIB'}`;
  } else {
    const hasTime = format === 'datetime' || format === 'time';
    text = `${formatJakarta(d, format)}${(suffix ?? hasTime) ? ' WIB' : ''}`;
  }
  const node = (
    <time dateTime={iso} className={cn('tabular-nums', className)} title={tooltip === false ? undefined : full} suppressHydrationWarning>
      {text}
    </time>
  );
  if (tooltip ?? format === 'relative') {
    return <Tooltip content={full}>{node}</Tooltip>;
  }
  return node;
}

/* ------------------------------------------------------------------ KeyValue */

export interface KeyValueItem {
  label: ReactNode;
  value: ReactNode;
  /** Mono value (codes, ids). */
  mono?: boolean;
  hint?: ReactNode;
}

/** Definition list for read-only details. `columns` lays items out in a grid on wide screens. */
export function KeyValue({ items, columns = 1, dense, className }: { items: KeyValueItem[]; columns?: 1 | 2 | 3; dense?: boolean; className?: string }) {
  return (
    <dl
      className={cn(
        'grid gap-x-8',
        dense ? 'gap-y-2.5' : 'gap-y-4',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {items.map((it, i) => (
        <div key={i} className={cn('min-w-0', columns === 1 && 'grid gap-1 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4')}>
          <dt className="text-sm text-ink-3">{it.label}</dt>
          <dd className={cn('min-w-0 text-[0.9375rem] break-words text-ink', it.mono && 'mono text-sm')}>
            {it.value ?? <span className="text-ink-3">Not set</span>}
            {it.hint ? <span className="mt-0.5 block text-[0.8125rem] text-ink-3">{it.hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ CopyField */

export interface CopyFieldProps {
  value: string;
  label?: string;
  /** Mask the value (stream keys, passphrases) with a reveal toggle. */
  secret?: boolean;
  /** Toast text after copying. */
  copiedLabel?: string;
  size?: 'sm' | 'md';
  className?: string;
  onCopy?: () => void;
}

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** Copy text to the clipboard. Returns [copy, copied]. */
export function useCopy(timeout = 1600): [(text: string) => Promise<boolean>, boolean] {
  const [copied, setCopied] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (t.current) clearTimeout(t.current);
  }, []);
  const copy = async (text: string) => {
    const ok = await writeClipboard(text);
    if (ok) {
      setCopied(true);
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => setCopied(false), timeout);
    }
    return ok;
  };
  return [copy, copied];
}

/**
 * Read-only value with a copy button. The button bursts four tiny shapes when it copies.
 * Secret mode masks the value until revealed (copying still works while masked).
 *
 * @example <CopyField label="Stream key" value={obs.obsStreamKey} secret />
 */
export function CopyField({ value, label, secret, size = 'md', className, onCopy }: CopyFieldProps) {
  const [copy, copied] = useCopy();
  const [revealed, setRevealed] = useState(false);
  const reduce = useReducedMotion();
  const masked = secret && !revealed;
  const display = masked ? '•'.repeat(Math.min(28, Math.max(10, value.length))) : value;
  return (
    <div className={cn('min-w-0', className)}>
      {label ? <div className="mb-1.5 text-sm font-semibold text-ink">{label}</div> : null}
      <div className={cn('group flex min-w-0 items-center gap-1 rounded-[var(--radius-input)] border border-line-strong bg-surface-muted pl-3.5', size === 'sm' ? 'h-9 pr-1' : 'h-11 pr-1.5')}>
        <code
          className={cn('mono min-w-0 flex-1 truncate text-ink select-all', size === 'sm' ? 'text-[0.8125rem]' : 'text-sm', masked && 'tracking-[0.12em] text-ink-3 select-none')}
          aria-label={masked ? `${label ?? 'Value'} hidden` : undefined}
        >
          {display}
        </code>
        {secret ? (
          <Tooltip content={revealed ? 'Hide' : 'Reveal'}>
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              aria-label={revealed ? `Hide ${label ?? 'value'}` : `Reveal ${label ?? 'value'}`}
              aria-pressed={revealed}
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-focus active:scale-90"
            >
              {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </Tooltip>
        ) : null}
        <button
          type="button"
          onClick={async () => {
            if (await copy(value)) onCopy?.();
          }}
          aria-label={copied ? 'Copied' : `Copy ${label ?? 'value'}`}
          className={cn(
            'relative flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-[background-color,color,transform] duration-150 active:scale-95',
            'focus-visible:outline-2 focus-visible:outline-focus',
            copied ? 'bg-green text-white' : 'bg-white text-ink shadow-[0_0_0_1px_var(--color-line-strong)] hover:shadow-[0_0_0_1px_var(--color-ink-4)]',
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.span key="ok" initial={{ scale: 0.3, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} className="flex">
                <Check className="size-4" strokeWidth={3} />
              </motion.span>
            ) : (
              <motion.span key="copy" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex">
                <Copy className="size-4" />
              </motion.span>
            )}
          </AnimatePresence>
          <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          {copied && !reduce ? <CopyBurst /> : null}
          <span className="sr-only" aria-live="polite">
            {copied ? 'Copied to clipboard' : ''}
          </span>
        </button>
      </div>
    </div>
  );
}

function CopyBurst() {
  const bits = [
    { shape: 'circle' as const, color: 'text-blue', x: -18, y: -16 },
    { shape: 'triangle' as const, color: 'text-red', x: 16, y: -18 },
    { shape: 'square' as const, color: 'text-yellow', x: -14, y: 16 },
    { shape: 'arch' as const, color: 'text-green', x: 18, y: 14 },
  ];
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className={cn('absolute', b.color)}
          initial={{ x: 0, y: 0, scale: 0.4, opacity: 1, rotate: 0 }}
          animate={{ x: b.x, y: b.y, scale: 1, opacity: 0, rotate: i % 2 ? 90 : -90 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <ShapeGlyph shape={b.shape} className="size-2.5" />
        </motion.span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ StatCard */

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Change vs previous period. Number (fraction, 0.12 = +12%) or preformatted text. */
  delta?: number | string | null;
  /** Invert delta colors (lower is better). */
  deltaInverse?: boolean;
  deltaLabel?: string;
  /** Sparkline or small chart. `<Sparkline data={[..]} />` fits. */
  chart?: ReactNode;
  icon?: ReactNode;
  accent?: 'blue' | 'yellow' | 'red' | 'green';
  hint?: ReactNode;
  className?: string;
}

const ACCENT_BG = { blue: 'bg-blue', yellow: 'bg-yellow', red: 'bg-red', green: 'bg-green' } as const;
const ACCENT_SHAPE = { blue: 'circle', red: 'triangle', yellow: 'square', green: 'arch' } as const;
const ACCENT_TEXT = { blue: 'text-blue', yellow: 'text-yellow', red: 'text-red', green: 'text-green' } as const;

/** Big number tile. */
export function StatCard({ label, value, delta, deltaInverse, deltaLabel, chart, icon, accent, hint, className }: StatCardProps) {
  const numeric = typeof delta === 'number' ? delta : null;
  const up = numeric != null ? numeric > 0 : null;
  const good = up == null ? null : deltaInverse ? !up : up;
  return (
    <div className={cn('relative flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-line bg-white p-4 sm:p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm text-ink-3">
          {accent ? <ShapeGlyph shape={ACCENT_SHAPE[accent]} className={cn('size-2.5', ACCENT_TEXT[accent])} /> : null}
          <span className="truncate">{label}</span>
        </span>
        {icon ? <span className="text-ink-4 [&_svg]:size-4">{icon}</span> : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="font-display text-[2rem] leading-none font-extrabold tracking-[-0.04em] tabular-nums [font-variation-settings:'CASL'_0.2]">{value}</span>
        {chart ? <div className="h-9 w-24 shrink-0 text-blue">{chart}</div> : null}
      </div>
      {delta != null || hint ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem]">
          {delta != null ? (
            <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold tabular-nums', good == null ? 'bg-surface-muted text-ink-2' : good ? 'bg-green-50 text-green-600' : 'bg-red-50 text-[#b42525]')}>
              {up == null ? null : up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
              {numeric != null ? `${numeric > 0 ? '+' : ''}${Math.round(numeric * 100)}%` : delta}
            </span>
          ) : null}
          {deltaLabel ? <span className="text-ink-3">{deltaLabel}</span> : null}
          {hint ? <span className="text-ink-3">{hint}</span> : null}
        </div>
      ) : null}
      {accent ? <span className={cn('absolute inset-x-0 bottom-0 h-1', ACCENT_BG[accent])} aria-hidden="true" /> : null}
    </div>
  );
}

/** Tiny line chart in currentColor. */
export function Sparkline({ data, className, fill = true, label }: { data: number[]; className?: string; fill?: boolean; label?: string }) {
  if (data.length < 2) return null;
  const w = 100;
  const h = 36;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const last = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn('size-full overflow-visible', className)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {fill ? <path d={area} fill="currentColor" opacity={0.1} /> : null}
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={2.6} fill="currentColor" />
    </svg>
  );
}

/* ------------------------------------------------------------------ Timeline */

export interface TimelineItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** ISO time; rendered relative with the full Jakarta time in a tooltip. */
  at?: string | null;
  /** Leading marker: an avatar/icon, or a shape tone. */
  icon?: ReactNode;
  tone?: 'blue' | 'yellow' | 'red' | 'green' | 'neutral';
}

/** Vertical activity feed (audit, check-ins, stream events). */
export function Timeline({ items, className, empty }: { items: TimelineItem[]; className?: string; empty?: ReactNode }) {
  if (!items.length) return <>{empty ?? null}</>;
  const toneCls = { blue: 'text-blue', yellow: 'text-yellow', red: 'text-red', green: 'text-green', neutral: 'text-ink-4' } as const;
  const toneShape = { blue: 'circle', red: 'triangle', yellow: 'square', green: 'arch', neutral: 'dot' } as const;
  return (
    <ol className={cn('relative', className)}>
      {items.map((it, i) => (
        <li key={it.id} className="relative flex gap-3 pb-5 last:pb-0">
          {i < items.length - 1 ? <span className="absolute top-7 bottom-0 left-[13px] w-px bg-line" aria-hidden="true" /> : null}
          <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-white">
            {it.icon ?? <ShapeGlyph shape={toneShape[it.tone ?? 'neutral']} className={cn('size-2.5', toneCls[it.tone ?? 'neutral'])} />}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <div className="min-w-0 text-[0.9375rem] leading-snug text-ink">{it.title}</div>
              {it.at ? <DateText value={it.at} format="relative" className="shrink-0 text-xs text-ink-3" /> : null}
            </div>
            {it.description ? <div className="mt-0.5 text-[0.8125rem] leading-snug text-ink-3">{it.description}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
