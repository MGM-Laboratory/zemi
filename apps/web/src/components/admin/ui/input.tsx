'use client';

import { Minus, Plus } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/admin/cn';
import { useFieldControlProps } from './field';

/** Shared control chrome: 14px radius, hairline border, blue focus ring, red when invalid. */
export const controlClass = cn(
  'w-full min-w-0 rounded-[var(--radius-input)] border border-line-strong bg-white text-ink',
  'placeholder:text-ink-4 transition-[border-color,box-shadow,background-color] duration-150',
  'hover:border-ink-4 focus-visible:outline-none focus-visible:border-blue focus-visible:ring-4 focus-visible:ring-blue/15',
  'aria-invalid:border-red-600 aria-invalid:focus-visible:ring-red/15',
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-3',
  '[&[readonly]]:bg-surface-muted [&[readonly]]:hover:border-line-strong [&[readonly]]:focus-visible:border-line-strong [&[readonly]]:focus-visible:ring-0',
);

export const controlSizes = {
  sm: 'h-9 px-3 text-sm rounded-xl',
  md: 'h-11 px-3.5 text-[0.9375rem]',
  lg: 'h-14 px-4 text-lg',
} as const;
export type ControlSize = keyof typeof controlSizes;

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: ControlSize;
  /** Inline content before the text (an icon or "https://"). */
  leading?: ReactNode;
  /** Inline content after the text (a unit, a button). */
  trailing?: ReactNode;
  /** Mono font (codes, slugs, times). */
  mono?: boolean;
  wrapperClassName?: string;
}

/** Text input. Inside a `<Field>` it picks up id, aria and invalid state automatically. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', leading, trailing, mono, className, wrapperClassName, ...rest },
  ref,
) {
  const props = useFieldControlProps(rest);
  if (!leading && !trailing) {
    // No wrapper element: layout classes meant for the wrapper go on the input itself.
    return <input ref={ref} className={cn(controlClass, controlSizes[size], mono && 'mono', wrapperClassName, className)} {...props} />;
  }
  return (
    <div className={cn('relative flex items-center', wrapperClassName)}>
      {leading ? (
        <span className="pointer-events-none absolute left-3.5 flex items-center text-ink-4 [&_svg]:size-[18px]">{leading}</span>
      ) : null}
      <input
        ref={ref}
        className={cn(controlClass, controlSizes[size], mono && 'mono', leading ? 'pl-10' : null, trailing ? 'pr-11' : null, className)}
        {...props}
      />
      {trailing ? <span className="absolute right-1.5 flex items-center text-ink-3">{trailing}</span> : null}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grow with the content. Default true. */
  autosize?: boolean;
  minRows?: number;
  maxRows?: number;
  mono?: boolean;
}

/** Multi-line text that grows with its content (up to `maxRows`, then scrolls). */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { autosize = true, minRows = 3, maxRows = 14, mono, className, onChange, ...rest },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement);
  const props = useFieldControlProps(rest);

  const resize = useCallback(() => {
    const el = inner.current;
    if (!el || !autosize) return;
    const cs = window.getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 22;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = 'auto';
    const min = line * minRows + pad;
    const max = line * maxRows + pad;
    const next = Math.min(max, Math.max(min, el.scrollHeight + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)));
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight + 2 > max ? 'auto' : 'hidden';
  }, [autosize, minRows, maxRows]);

  useLayoutEffect(resize, [resize, props.value]);
  useEffect(() => {
    if (!autosize) return;
    const el = inner.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth;
        resize();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [autosize, resize]);

  return (
    <textarea
      ref={inner}
      rows={minRows}
      className={cn(controlClass, 'block resize-none px-3.5 py-2.5 text-[0.9375rem] leading-[1.55]', !autosize && 'resize-y', mono && 'mono', className)}
      onChange={(e) => {
        onChange?.(e);
        resize();
      }}
      {...props}
    />
  );
});

export interface NumberInputProps extends Omit<InputProps, 'type' | 'value' | 'defaultValue' | 'onChange' | 'trailing'> {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Unit after the number, like "seats" or "min". */
  unit?: string;
  /** Show the -/+ steppers. Default true. */
  steppers?: boolean;
}

/**
 * Integer/decimal input with -/+ steppers and keyboard arrows. Empty means null.
 * @example <NumberInput value={capacity} onChange={setCapacity} min={1} unit="seats" />
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onChange, min, max, step = 1, unit, steppers = true, size = 'md', className, disabled, readOnly, onBlur, onKeyDown, wrapperClassName, ...rest },
  ref,
) {
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const bump = (dir: 1 | -1) => {
    const base = value ?? (dir === 1 ? (min ?? 0) - step : (max ?? 0) + step);
    onChange(clamp(Number((base + dir * step).toFixed(6))));
  };
  const locked = disabled || readOnly;
  return (
    <div className={cn('relative flex items-center', wrapperClassName)}>
      <Input
        {...rest}
        ref={ref}
        size={size}
        inputMode={Number.isInteger(step) ? 'numeric' : 'decimal'}
        className={cn('tabular-nums', steppers && 'pr-[5.5rem]', unit && !steppers && 'pr-16', className)}
        value={value ?? ''}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(e) => {
          const raw = e.target.value.replace(',', '.').trim();
          if (raw === '') return onChange(null);
          if (!/^-?\d*\.?\d*$/.test(raw)) return;
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={(e) => {
          if (value != null) onChange(clamp(value));
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            bump(1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            bump(-1);
          }
          onKeyDown?.(e);
        }}
        role="spinbutton"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
      />
      <div className="absolute right-1.5 flex items-center gap-0.5">
        {unit ? <span className="pointer-events-none mr-1 text-sm text-ink-4">{unit}</span> : null}
        {steppers && !locked ? (
          <>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="flex size-7 items-center justify-center rounded-full text-ink-3 transition hover:bg-surface-muted hover:text-ink active:scale-90 disabled:opacity-30"
              onClick={() => bump(-1)}
              disabled={min != null && value != null && value <= min}
            >
              <Minus className="size-3.5" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="flex size-7 items-center justify-center rounded-full text-ink-3 transition hover:bg-surface-muted hover:text-ink active:scale-90 disabled:opacity-30"
              onClick={() => bump(1)}
              disabled={max != null && value != null && value >= max}
            >
              <Plus className="size-3.5" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
});
