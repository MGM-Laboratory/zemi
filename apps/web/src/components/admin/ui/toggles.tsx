'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Checkbox as RCheckbox, RadioGroup as RRadio, Switch as RSwitch } from 'radix-ui';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';
import { useFieldControlProps } from './field';

/* ------------------------------------------------------------------ Checkbox */

export interface CheckboxProps {
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  'aria-label'?: string;
}

/** Checkbox with an optional label and description. Checked = blue rounded square with a tick. */
export function Checkbox({ checked, onCheckedChange, label, description, disabled, id, name, className, 'aria-label': ariaLabel }: CheckboxProps) {
  const auto = useId();
  const aria = useFieldControlProps({ id: id ?? (label ? `cb${auto.replace(/:/g, '')}` : undefined), disabled });
  const box = (
    <RCheckbox.Root
      id={aria.id}
      name={name}
      checked={checked}
      onCheckedChange={(c) => onCheckedChange(c === true)}
      disabled={aria.disabled}
      aria-label={ariaLabel}
      aria-describedby={aria['aria-describedby']}
      aria-invalid={aria['aria-invalid']}
      className={cn(
        'peer flex size-5 shrink-0 items-center justify-center rounded-[6px] border-[1.5px] border-line-strong bg-white transition-[background-color,border-color,transform] duration-150',
        'hover:border-ink-4 active:scale-90 data-[state=checked]:border-blue data-[state=checked]:bg-blue data-[state=indeterminate]:border-blue data-[state=indeterminate]:bg-blue',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-45 aria-invalid:border-red-600',
        !label && className,
      )}
    >
      <RCheckbox.Indicator forceMount className="text-white data-[state=unchecked]:hidden">
        {checked === 'indeterminate' ? (
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
            <rect x="3.5" y="7.1" width="9" height="1.8" rx=".9" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
            <path d="M3.4 8.4 6.5 11.3 12.6 4.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="[stroke-dasharray:16] animate-[zemi-draw_220ms_var(--ease-out)]" />
          </svg>
        )}
      </RCheckbox.Indicator>
    </RCheckbox.Root>
  );
  if (!label) return box;
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <span className="pt-0.5">{box}</span>
      <label htmlFor={aria.id} className={cn('min-w-0 cursor-pointer select-none', disabled && 'cursor-not-allowed opacity-60')}>
        <span className="block text-[0.9375rem] leading-snug font-medium text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-3">{description}</span> : null}
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------ Switch */

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  size?: 'sm' | 'md';
  /** Put the switch on the right of the label (settings rows). Default false. */
  labelFirst?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** On/off switch. The thumb carries a tiny shape that turns into a green arch when on. */
export function Switch({ checked, onCheckedChange, label, description, disabled, id, size = 'md', labelFirst, className, 'aria-label': ariaLabel }: SwitchProps) {
  const auto = useId();
  const reduce = useReducedMotion();
  const aria = useFieldControlProps({ id: id ?? `sw${auto.replace(/:/g, '')}`, disabled });
  const dims = size === 'sm' ? { w: 34, h: 20, t: 14 } : { w: 44, h: 26, t: 20 };
  const control = (
    <RSwitch.Root
      id={aria.id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={aria.disabled}
      aria-label={ariaLabel}
      aria-describedby={aria['aria-describedby']}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-200',
        'bg-line-strong data-[state=checked]:bg-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-45',
      )}
      style={{ width: dims.w, height: dims.h }}
    >
      <RSwitch.Thumb asChild>
        <motion.span
          className="block rounded-full bg-white shadow-[0_1px_3px_rgba(14,17,22,0.25)]"
          style={{ width: dims.t, height: dims.t }}
          animate={{ x: checked ? dims.w - dims.t - 4 : 2 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 30 }}
        />
      </RSwitch.Thumb>
    </RSwitch.Root>
  );
  if (!label) return <span className={className}>{control}</span>;
  return (
    <div className={cn('flex items-start gap-3', labelFirst && 'flex-row-reverse justify-between', className)}>
      <span className="pt-px">{control}</span>
      <label htmlFor={aria.id} className={cn('min-w-0 cursor-pointer select-none', disabled && 'cursor-not-allowed opacity-60')}>
        <span className="block text-[0.9375rem] leading-snug font-medium text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-3">{description}</span> : null}
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------ RadioGroup */

export interface RadioOption<V extends string = string> {
  value: V;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
}

export interface RadioGroupProps<V extends string = string> {
  value: V | null | undefined;
  onValueChange: (value: V) => void;
  options: RadioOption<V>[];
  /** `list` = classic radios, `cards` = bordered option cards. */
  variant?: 'list' | 'cards';
  orientation?: 'vertical' | 'horizontal';
  disabled?: boolean;
  name?: string;
  className?: string;
  'aria-label'?: string;
}

export function RadioGroup<V extends string = string>({
  value,
  onValueChange,
  options,
  variant = 'list',
  orientation = 'vertical',
  disabled,
  name,
  className,
  'aria-label': ariaLabel,
}: RadioGroupProps<V>) {
  const auto = useId();
  const aria = useFieldControlProps({ disabled });
  return (
    <RRadio.Root
      value={value ?? ''}
      onValueChange={(v) => onValueChange(v as V)}
      disabled={aria.disabled}
      name={name}
      orientation={orientation}
      aria-label={ariaLabel}
      aria-describedby={aria['aria-describedby']}
      className={cn(
        variant === 'cards' ? 'grid gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]' : orientation === 'horizontal' ? 'flex flex-wrap gap-x-6 gap-y-3' : 'flex flex-col gap-3',
        className,
      )}
    >
      {options.map((o) => {
        const id = `rg${auto.replace(/:/g, '')}-${o.value}`;
        if (variant === 'cards') {
          return (
            <RRadio.Item
              key={o.value}
              id={id}
              value={o.value}
              disabled={o.disabled}
              className={cn(
                'group relative flex cursor-pointer items-start gap-3 rounded-2xl border border-line-strong bg-white p-3.5 text-left transition-[border-color,box-shadow,background-color] duration-150',
                'hover:border-ink-4 data-[state=checked]:border-blue data-[state=checked]:bg-blue-50/40 data-[state=checked]:shadow-[0_0_0_3px_rgba(58,109,197,0.14)]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-45',
              )}
            >
              <span className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-line-strong bg-white group-data-[state=checked]:border-blue">
                <RRadio.Indicator className="size-2.5 rounded-full bg-blue animate-[zemi-pop_160ms_var(--ease-out)]" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[0.9375rem] leading-snug font-semibold text-ink [&_svg]:size-4">
                  {o.icon}
                  {o.label}
                </span>
                {o.description ? <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-3">{o.description}</span> : null}
              </span>
            </RRadio.Item>
          );
        }
        return (
          <div key={o.value} className="flex items-start gap-3">
            <RRadio.Item
              id={id}
              value={o.value}
              disabled={o.disabled}
              className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line-strong bg-white transition-colors',
                'hover:border-ink-4 data-[state=checked]:border-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-45',
              )}
            >
              <RRadio.Indicator className="size-2.5 rounded-full bg-blue animate-[zemi-pop_160ms_var(--ease-out)]" />
            </RRadio.Item>
            <label htmlFor={id} className={cn('min-w-0 cursor-pointer select-none', o.disabled && 'cursor-not-allowed opacity-60')}>
              <span className="block text-[0.9375rem] leading-snug font-medium text-ink">{o.label}</span>
              {o.description ? <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-3">{o.description}</span> : null}
            </label>
          </div>
        );
      })}
    </RRadio.Root>
  );
}

/* ------------------------------------------------------------------ SegmentedControl */

export interface SegmentOption<V extends string = string> {
  value: V;
  label: ReactNode;
  icon?: ReactNode;
  /** Count bubble, like "12". */
  count?: number;
  disabled?: boolean;
}

export interface SegmentedControlProps<V extends string = string> {
  value: V;
  onValueChange: (value: V) => void;
  options: SegmentOption<V>[];
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
  'aria-label': string;
}

/**
 * Pill toggle between a few views (Upcoming / Past / All). The active pill slides.
 * Keyboard: arrow keys move between segments (radio group semantics).
 */
export function SegmentedControl<V extends string = string>({
  value,
  onValueChange,
  options,
  size = 'md',
  fullWidth,
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<V>) {
  const layoutId = useId();
  const reduce = useReducedMotion();
  return (
    <RRadio.Root
      value={value}
      onValueChange={(v) => onValueChange(v as V)}
      orientation="horizontal"
      loop
      aria-label={ariaLabel}
      className={cn(
        'relative inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-surface-muted p-1 no-scrollbar',
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <RRadio.Item
            key={o.value}
            value={o.value}
            disabled={o.disabled}
            className={cn(
              'relative flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors duration-150',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-40 [&_svg]:size-4',
              size === 'sm' ? 'h-7 px-3 text-[0.8125rem]' : 'h-8 px-3.5 text-sm',
              active ? 'text-ink' : 'text-ink-3 hover:text-ink',
              fullWidth && 'flex-1',
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgba(14,17,22,0.08),0_0_0_1px_rgba(14,17,22,0.05)]"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span className="relative flex items-center gap-1.5">
              {o.icon}
              {o.label}
              {o.count != null ? (
                <span className={cn('mono rounded-full px-1.5 text-[0.6875rem] tabular-nums', active ? 'bg-surface-muted text-ink-2' : 'bg-white/70 text-ink-3')}>{o.count}</span>
              ) : null}
            </span>
          </RRadio.Item>
        );
      })}
    </RRadio.Root>
  );
}
