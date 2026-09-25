'use client';

import { Slider as RSlider } from 'radix-ui';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: ReactNode;
  /** Formatted value on the right of the label, like "120%". */
  display?: ReactNode;
  /** Double-click the track or press Home... resets to this. */
  defaultValue?: number;
  disabled?: boolean;
  /** Center-origin fill (for -x..+x ranges like hue or rotation). */
  centered?: boolean;
  className?: string;
  hideLabel?: boolean;
}

/** Labeled range slider (Radix): arrow keys, Page Up/Down, Home/End. Double-click resets. */
export function Slider({ value, onChange, min = 0, max = 100, step = 1, label, display, defaultValue, disabled, centered, className, hideLabel }: SliderProps) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  const mid = centered ? ((0 - min) / (max - min)) * 100 : 0;
  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn('flex items-baseline justify-between gap-3 text-sm', hideLabel && 'sr-only')}>
        <span id={`${id}-label`} className="font-medium text-ink-2">
          {label}
        </span>
        {display != null ? (
          <button
            type="button"
            className="mono rounded px-1 text-xs text-ink-3 tabular-nums hover:text-ink disabled:hover:text-ink-3"
            onClick={() => defaultValue != null && onChange(defaultValue)}
            disabled={defaultValue == null || value === defaultValue}
            title={defaultValue != null ? 'Reset' : undefined}
          >
            {display}
          </button>
        ) : null}
      </div>
      <RSlider.Root
        value={[value]}
        onValueChange={([v]) => onChange(v!)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-labelledby={`${id}-label`}
        onDoubleClick={() => defaultValue != null && onChange(defaultValue)}
        className="relative flex h-5 w-full touch-none items-center select-none data-[disabled]:opacity-45"
      >
        <RSlider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-line">
          {centered ? (
            <span
              className="absolute inset-y-0 bg-ink"
              style={{ left: `${Math.min(mid, pct)}%`, width: `${Math.abs(pct - mid)}%` }}
            />
          ) : (
            <RSlider.Range className="absolute h-full rounded-full bg-ink" />
          )}
        </RSlider.Track>
        <RSlider.Thumb
          className="block size-[18px] cursor-grab rounded-full border-2 border-ink bg-white shadow-[0_1px_3px_rgba(14,17,22,0.2)] transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:cursor-grabbing"
          aria-label={typeof label === 'string' ? label : undefined}
        />
      </RSlider.Root>
    </div>
  );
}
