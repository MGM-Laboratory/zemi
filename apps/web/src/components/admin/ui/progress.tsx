'use client';

import { Check } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';

const TONE = { blue: 'var(--color-blue)', green: 'var(--color-green)', red: 'var(--color-red)', yellow: 'var(--color-yellow)', ink: 'var(--color-ink)' } as const;
type Tone = keyof typeof TONE;

export interface ProgressProps {
  /** 0 to 1. null = indeterminate. */
  value: number | null;
  tone?: Tone;
  size?: 'sm' | 'md';
  label?: string;
  /** Show the percentage on the right. */
  showValue?: boolean;
  className?: string;
}

/** Linear progress bar. Indeterminate when value is null. */
export function Progress({ value, tone = 'blue', size = 'md', label, showValue, className }: ProgressProps) {
  const pct = value == null ? null : Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={cn('w-full', className)}>
      {label || showValue ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[0.8125rem]">
          {label ? <span className="text-ink-2">{label}</span> : <span />}
          {showValue && pct != null ? <span className="mono text-ink-3 tabular-nums">{pct}%</span> : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-label={label ?? 'Progress'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        className={cn('relative w-full overflow-hidden rounded-full bg-surface-muted', size === 'sm' ? 'h-1.5' : 'h-2.5')}
      >
        {pct == null ? (
          <span className="absolute inset-y-0 w-1/3 animate-[zemi-indeterminate_1.2s_var(--ease-in-out)_infinite] rounded-full" style={{ background: TONE[tone] }} />
        ) : (
          <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-[var(--ease-out)]" style={{ width: `${pct}%`, background: TONE[tone] }} />
        )}
      </div>
    </div>
  );
}

export interface ProgressRingProps {
  value: number | null;
  size?: number;
  stroke?: number;
  tone?: Tone;
  /** Center content. Default: the percentage. */
  children?: ReactNode;
  label?: string;
  className?: string;
  /** Show a check when value reaches 1. */
  doneCheck?: boolean;
}

/** Circular progress (uploads). Indeterminate spins. */
export function ProgressRing({ value, size = 56, stroke = 5, tone = 'blue', children, label = 'Progress', className, doneCheck = true }: ProgressRingProps) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0.28 : Math.max(0, Math.min(1, value));
  const done = value != null && v >= 1 && doneCheck;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value == null ? undefined : Math.round(v * 100)}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className={cn('-rotate-90', value == null && !reduce && 'animate-spin [animation-duration:1.1s]')} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={done ? 'var(--color-green)' : TONE[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c * (1 - v) }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 24 }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        {done ? (
          <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-green">
            <Check className="size-5" strokeWidth={3} />
          </motion.span>
        ) : (
          (children ?? (value != null ? <span className="mono text-[0.6875rem] font-semibold text-ink-2 tabular-nums">{Math.round(v * 100)}%</span> : null))
        )}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ Stepper */

export interface StepperStep {
  key: string;
  label: ReactNode;
  description?: ReactNode;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Index of the current step. */
  current: number;
  /** Let people jump back to finished steps. */
  onStepClick?: (index: number) => void;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

const STEP_SHAPES = ['circle', 'triangle', 'square', 'arch'] as const;
const STEP_COLORS = ['bg-blue', 'bg-red', 'bg-yellow', 'bg-green'] as const;

/** Multi-step progress. Done steps get a check; the current one gets its brand color. */
export function Stepper({ steps, current, onStepClick, orientation = 'horizontal', className }: StepperProps) {
  return (
    <ol className={cn(orientation === 'horizontal' ? 'flex items-start gap-2 overflow-x-auto no-scrollbar' : 'flex flex-col gap-4', className)}>
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        const clickable = onStepClick && i < current;
        const content = (
          <>
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                state === 'done' && 'bg-ink text-white',
                state === 'current' && cn(STEP_COLORS[i % 4], i % 4 === 2 ? 'text-ink' : 'text-white'),
                state === 'todo' && 'border border-line-strong bg-white text-ink-4',
              )}
              data-shape={STEP_SHAPES[i % 4]}
            >
              {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : <span className="mono">{i + 1}</span>}
            </span>
            <span className="min-w-0 text-left">
              <span className={cn('block text-sm leading-tight font-semibold whitespace-nowrap', state === 'todo' ? 'text-ink-3' : 'text-ink')}>{s.label}</span>
              {s.description ? <span className="mt-0.5 block text-xs text-ink-3">{s.description}</span> : null}
            </span>
          </>
        );
        return (
          <li key={s.key} className={cn('flex items-center gap-2', orientation === 'horizontal' && 'shrink-0')} aria-current={state === 'current' ? 'step' : undefined}>
            {clickable ? (
              <button type="button" onClick={() => onStepClick!(i)} className="flex items-center gap-2.5 rounded-full pr-2 hover:opacity-80">
                {content}
              </button>
            ) : (
              <span className="flex items-center gap-2.5 pr-2">{content}</span>
            )}
            {orientation === 'horizontal' && i < steps.length - 1 ? (
              <span className={cn('h-px w-8 shrink-0 sm:w-12', i < current ? 'bg-ink' : 'bg-line-strong')} aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
