'use client';

import { createContext, useContext, useId, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';

/**
 * Field wiring. `<Field>` renders the label, hint, error and optional character counter, and
 * hands ids to the control inside through context, so `<Input>`, `<Textarea>`, `<Select>`,
 * `<Combobox>` and friends get `id`, `aria-describedby`, `aria-invalid` and `aria-required`
 * without any props.
 */
export interface FieldContextValue {
  id: string;
  labelId: string;
  /** True when the Field renders a <label> (so `labelId` points at a real element). */
  hasLabel: boolean;
  hintId: string;
  errorId: string;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  describedBy: string | undefined;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Set by `<ReadOnlyScope>` (fields/read-only.tsx). It lives here so every `<Field>` inside a
 * scope turns read-only too, unless the Field says otherwise with an explicit `readOnly`.
 */
export const ReadOnlyScopeContext = createContext(false);

export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

/**
 * Cuts the enclosing `<Field>` off for the controls inside. Composite editors (link rows, author
 * rows) use it so every row does not get the Field's one id and its invalid state; they wire
 * their own ids and errors per row. Resolve read-only (`useReadOnly`) before this boundary.
 */
export function FieldIsolate({ children }: { children: ReactNode }) {
  return <FieldContext.Provider value={null}>{children}</FieldContext.Provider>;
}

export interface ControlAriaProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
  'aria-required'?: boolean | 'true' | 'false';
  'aria-labelledby'?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
}

/** Merge Field ids and states into a control's props. Explicit props win. */
export function useFieldControlProps<T extends ControlAriaProps>(props: T): T & ControlAriaProps {
  const ctx = useFieldContext();
  if (!ctx) return props;
  return {
    ...props,
    id: props.id ?? ctx.id,
    'aria-describedby': [ctx.describedBy, props['aria-describedby']].filter(Boolean).join(' ') || undefined,
    'aria-invalid': props['aria-invalid'] ?? (ctx.invalid || undefined),
    'aria-required': props['aria-required'] ?? (ctx.required || undefined),
    disabled: props.disabled ?? (ctx.disabled || undefined),
    readOnly: props.readOnly ?? (ctx.readOnly || undefined),
  };
}

export interface FieldProps {
  label?: ReactNode;
  /** Short helper text under the label area. */
  hint?: ReactNode;
  /** Error message (string) or true to only mark invalid. */
  error?: ReactNode | boolean;
  required?: boolean;
  /** Shows "Optional" next to the label. */
  optional?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Character counter: pass the current length and the max. */
  count?: { value: number; max: number };
  /** Something on the right of the label row (a link, a toggle). */
  action?: ReactNode;
  /** Force an id for the control (otherwise generated). */
  id?: string;
  /** Hide the label visually but keep it for screen readers. */
  hideLabel?: boolean;
  /** Layout: label above (default) or label on the left for dense settings rows. */
  layout?: 'stack' | 'inline';
  className?: string;
  children: ReactNode;
}

/**
 * @example
 * <Field label="Title" required error={errors.title?.message} count={{ value: title.length, max: 200 }}>
 *   <Input {...register('title')} />
 * </Field>
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  optional = false,
  disabled = false,
  readOnly: readOnlyProp,
  count,
  action,
  id: forcedId,
  hideLabel = false,
  layout = 'stack',
  className,
  children,
}: FieldProps) {
  const auto = useId();
  const scopeReadOnly = useContext(ReadOnlyScopeContext);
  const readOnly = readOnlyProp ?? scopeReadOnly;
  const id = forcedId ?? `f${auto.replace(/:/g, '')}`;
  const hasError = Boolean(error);
  const errorText = typeof error === 'boolean' ? null : error;
  const over = count ? count.value > count.max : false;
  const ctx: FieldContextValue = {
    id,
    labelId: `${id}-label`,
    hasLabel: Boolean(label),
    hintId: `${id}-hint`,
    errorId: `${id}-error`,
    invalid: hasError || over,
    required,
    disabled,
    readOnly,
    describedBy: [hint ? `${id}-hint` : null, errorText ? `${id}-error` : null, count ? `${id}-count` : null].filter(Boolean).join(' ') || undefined,
  };

  return (
    <FieldContext.Provider value={ctx}>
      <div
        className={cn(
          'group/field min-w-0',
          layout === 'inline' ? 'grid gap-x-6 gap-y-1.5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-start' : 'flex flex-col gap-1.5',
          className,
        )}
        data-invalid={ctx.invalid || undefined}
        data-disabled={disabled || undefined}
      >
        {label || action ? (
          <div className={cn('flex min-h-5 items-baseline justify-between gap-3', hideLabel && !action && 'sr-only', layout === 'inline' && 'sm:pt-2.5')}>
            {label ? (
              <label id={ctx.labelId} htmlFor={id} className={cn('text-sm font-semibold text-ink', hideLabel && 'sr-only')}>
                {label}
                {required ? (
                  <span className="ml-0.5 text-red-600" aria-hidden="true">
                    *
                  </span>
                ) : null}
                {required ? <span className="sr-only"> (required)</span> : null}
                {optional && !required ? <span className="ml-1.5 text-xs font-normal text-ink-3">Optional</span> : null}
              </label>
            ) : (
              <span />
            )}
            {action ? <div className="shrink-0 text-sm">{action}</div> : null}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1.5">
          {children}
          {hint || errorText || count ? (
            <div className="flex items-start justify-between gap-3 text-[0.8125rem] leading-snug">
              <div className="min-w-0">
                {errorText ? (
                  <p id={ctx.errorId} className="flex items-start gap-1.5 font-medium text-red-600" role="alert">
                    <ErrorGlyph />
                    <span>{errorText}</span>
                  </p>
                ) : null}
                {hint ? (
                  <p id={ctx.hintId} className={cn('text-ink-3', errorText && 'mt-0.5')}>
                    {hint}
                  </p>
                ) : null}
              </div>
              {count ? (
                <span
                  id={`${id}-count`}
                  className={cn('mono shrink-0 text-xs tabular-nums', over ? 'font-semibold text-red-600' : count.value > count.max * 0.9 ? 'text-ink-2' : 'text-ink-3')}
                  aria-live={count.value > count.max * 0.9 ? 'polite' : 'off'}
                >
                  <span className="sr-only">Characters used: </span>
                  {count.value}/{count.max}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </FieldContext.Provider>
  );
}

function ErrorGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="mt-[0.2em] size-3.5 shrink-0" aria-hidden="true">
      <path d="M8 1.6 Q8.9 1.6 9.4 2.4 L14.7 12 Q15.3 13.4 13.8 13.4 H2.2 Q0.7 13.4 1.3 12 L6.6 2.4 Q7.1 1.6 8 1.6Z" fill="currentColor" />
      <rect x="7.25" y="5.2" width="1.5" height="4.4" rx=".75" fill="#fff" />
      <circle cx="8" cy="11.3" r=".9" fill="#fff" />
    </svg>
  );
}

/** A group of related fields with a small heading (for long forms). */
export function Fieldset({ legend, description, children, className }: { legend: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn('min-w-0 space-y-4', className)}>
      <legend className="mb-1 font-display text-base font-extrabold tracking-[-0.01em] [font-variation-settings:'CASL'_0.2]">{legend}</legend>
      {description ? <p className="-mt-2 text-sm text-ink-3">{description}</p> : null}
      {children}
    </fieldset>
  );
}
