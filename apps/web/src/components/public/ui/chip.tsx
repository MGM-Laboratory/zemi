import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Accent, EventStatus, ShapeName } from '@zemi/shared';
import { EVENT_STATUS_LABEL } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { cn } from '@/lib/utils';
import styles from './ui.module.css';

export type ChipTone = 'neutral' | 'ink' | 'outline' | Accent;

const TONE: Record<ChipTone, string> = {
  neutral: 'bg-surface-muted text-ink-2',
  ink: 'bg-ink text-white',
  outline: 'bg-white text-ink-2 border border-line-strong',
  blue: 'bg-blue-50 text-blue-600',
  red: 'bg-red-50 text-red-600',
  // Yellow never carries text color: ink on a yellow tint.
  yellow: 'bg-yellow-50 text-ink',
  green: 'bg-green-50 text-green-600',
};

const ACCENT_SHAPE: Record<Accent, ShapeName> = { blue: 'circle', red: 'triangle', yellow: 'square', green: 'arch' };

export interface ChipProps {
  children: ReactNode;
  tone?: ChipTone;
  size?: 'sm' | 'md';
  /** Leading brand shape. `true` picks the tone's shape. */
  shape?: ShapeName | boolean;
  className?: string;
  /** Mono uppercase label style (metadata). */
  mono?: boolean;
}

const base = 'inline-flex w-fit max-w-full flex-none items-center gap-1.5 rounded-full font-body font-semibold leading-none whitespace-nowrap';
const sizes = { sm: 'h-7 px-2.5 text-[0.8125rem]', md: 'h-9 px-3.5 text-[0.9375rem]' };

function lead(shape: ChipProps['shape'], tone: ChipTone) {
  if (!shape) return null;
  const s = shape === true ? (tone in ACCENT_SHAPE ? ACCENT_SHAPE[tone as Accent] : 'circle') : shape;
  return <ShapeIcon shape={s} size="0.8em" color={tone === 'ink' ? 'current' : 'brand'} />;
}

/**
 * Static tag / chip. Use `ChipLink` or `ChipButton` for interactive ones.
 * @example <Chip tone="green" shape>Hybrid</Chip>
 */
export function Chip({ children, tone = 'neutral', size = 'sm', shape, className, mono }: ChipProps) {
  return (
    <span className={cn(base, sizes[size], TONE[tone], mono && 'label h-6 px-2.5', className)}>
      {lead(shape, tone)}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function ChipLink({ href, ...p }: ChipProps & { href: string }) {
  return (
    <Link
      href={href}
      className={cn(
        base,
        sizes[p.size ?? 'sm'],
        TONE[p.tone ?? 'outline'],
        'transition-[transform,background-color,border-color] duration-200 hover:border-ink active:scale-[0.96]',
        p.className,
      )}
    >
      {lead(p.shape, p.tone ?? 'outline')}
      <span className="truncate">{p.children}</span>
    </Link>
  );
}

export interface ChipButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>, Omit<ChipProps, 'className'> {
  /** Toggle state for filters (sets aria-pressed). */
  selected?: boolean;
}

/** Filter chip. `selected` flips it to ink and sets aria-pressed. */
export function ChipButton({ children, tone = 'outline', size = 'md', shape, selected, className, mono, type, ...rest }: ChipButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-pressed={selected}
      className={cn(
        base,
        sizes[size],
        selected ? TONE.ink : TONE[tone],
        mono && 'label',
        'cursor-pointer transition-[transform,background-color,border-color,color] duration-200 hover:border-ink active:scale-[0.96]',
        className,
      )}
      {...rest}
    >
      {lead(shape, selected ? 'ink' : tone)}
      <span className="truncate">{children}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ status */

export interface StatusBadgeProps {
  status: EventStatus;
  size?: 'sm' | 'md';
  className?: string;
  /** Override the label (defaults: Coming up / Happening now / Wrapped / Cancelled). */
  label?: string;
}

const STATUS_CLS: Record<EventStatus, string> = {
  scheduled: 'bg-blue-50 text-blue-600',
  // red-600, not brand red: white text on #f94141 is 3.6:1 and fails AA at this size.
  ongoing: 'bg-red-600 text-white',
  past: 'bg-surface-muted text-ink-3',
  cancelled: 'bg-white text-red-600 border border-red/40',
};

/**
 * Event status pill. "Happening now" pulses red.
 * Pair with useEventStatus() so it flips without a reload.
 */
export function StatusBadge({ status, size = 'sm', className, label }: StatusBadgeProps) {
  return (
    <span className={cn(base, sizes[size], STATUS_CLS[status], className)}>
      {status === 'ongoing' ? (
        <span className={styles.pulse} aria-hidden="true" />
      ) : status === 'scheduled' ? (
        <ShapeIcon shape="circle" size="0.6em" color="current" />
      ) : status === 'cancelled' ? (
        <span aria-hidden="true" className="inline-block h-[2px] w-2.5 rounded bg-current" />
      ) : (
        <ShapeIcon shape="square" size="0.6em" color="current" />
      )}
      <span>{label ?? EVENT_STATUS_LABEL[status]}</span>
    </span>
  );
}

/** Compact pulsing LIVE badge (nav pill, player). */
export function LiveBadge({ className, label = 'Live' }: { className?: string; label?: string }) {
  return (
    <span className={cn('label inline-flex h-6 items-center gap-1.5 rounded-full bg-red-600 px-2.5 font-bold text-white', className)}>
      <span className={cn(styles.pulse, 'size-1.5')} aria-hidden="true" />
      {label}
    </span>
  );
}
