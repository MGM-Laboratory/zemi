'use client';

import { AdminMark } from '../brand/admin-mark';
import { cn } from '@/lib/admin/cn';

export interface SpinnerProps {
  /** px. Default 18. */
  size?: number;
  /** `color` shows the brand shapes, `ink` follows currentColor, `paper` is white (dark buttons). */
  tone?: 'color' | 'ink' | 'paper';
  /** Screen reader text. Default "Loading". Pass null when a parent already announces it. */
  label?: string | null;
  className?: string;
}

/** The Zemi mark in its loading loop. Use for short waits (buttons, inline). */
export function Spinner({ size = 18, tone = 'color', label = 'Loading', className }: SpinnerProps) {
  return (
    <span className={cn('inline-flex items-center justify-center', className)} role={label ? 'status' : undefined}>
      <AdminMark size={size} variant="loading" tone={tone} />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

/** Centered block loader for a panel or page section. */
export function LoadingBlock({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex min-h-40 flex-col items-center justify-center gap-3 text-ink-3', className)} role="status">
      <AdminMark size={36} variant="loading" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
