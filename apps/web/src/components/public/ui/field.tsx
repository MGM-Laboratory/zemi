'use client';

import {
  createContext,
  type AriaAttributes,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { cn } from '@/lib/utils';
import styles from './ui.module.css';

interface FieldCtx {
  id: string;
  hintId?: string;
  errorId?: string;
  invalid: boolean;
  required?: boolean;
}
const FieldContext = createContext<FieldCtx | null>(null);

export interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  /** Error message (string from zod / ApiError.fieldErrors()). */
  error?: string | null;
  required?: boolean;
  /** Shown after the label when not required. */
  optionalLabel?: string;
  className?: string;
  /** Use your own id for the control. */
  id?: string;
}

/**
 * Label + control + hint + error, wired for screen readers. The control inside (Input, Textarea,
 * Select) picks up id, aria-describedby and aria-invalid automatically.
 *
 * @example
 * <Field label="Email" hint="We send your ticket here." error={errors.email?.message} required>
 *   <Input type="email" autoComplete="email" {...register('email')} />
 * </Field>
 */
export function Field({ label, children, hint, error, required, optionalLabel = 'optional', className, id }: FieldProps) {
  const auto = useId();
  const fid = id ?? `f${auto}`;
  const hintId = hint ? `${fid}-hint` : undefined;
  const errorId = error ? `${fid}-error` : undefined;
  return (
    <FieldContext.Provider value={{ id: fid, hintId, errorId, invalid: !!error, required }}>
      <div className={cn('flex flex-col gap-2', className)}>
        <label htmlFor={fid} className="flex items-baseline justify-between gap-3 text-[0.9375rem] font-bold text-ink">
          <span>{label}</span>
          {!required && optionalLabel ? <span className="label font-normal text-ink-3">{optionalLabel}</span> : null}
        </label>
        {children}
        {error ? (
          <p id={errorId} className="flex items-start gap-2 text-[0.9375rem] font-semibold text-red-600" role="alert">
            <ShapeIcon shape="triangle" size="0.8em" className="mt-[0.3em]" />
            <span>{error}</span>
          </p>
        ) : hint ? (
          <p id={hintId} className="text-[0.9375rem] text-ink-3">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

function useFieldProps(p: { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: AriaAttributes['aria-invalid']; required?: boolean }) {
  const ctx = useContext(FieldContext);
  const describedBy = [p['aria-describedby'], ctx?.errorId ?? ctx?.hintId].filter(Boolean).join(' ') || undefined;
  return {
    id: p.id ?? ctx?.id,
    'aria-describedby': describedBy,
    'aria-invalid': p['aria-invalid'] ?? (ctx?.invalid ? true : undefined),
    required: p.required ?? ctx?.required,
  };
}

const controlBase =
  'w-full rounded-[14px] border border-line-strong bg-white px-4 text-[1.0625rem] text-ink placeholder:text-ink-4 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-3';

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  ref?: Ref<HTMLInputElement>;
  /** 'lg' = 56px (default, public forms), 'md' = 48px. */
  size?: 'md' | 'lg';
};

export function Input({ className, size = 'lg', ref, ...rest }: InputProps) {
  const a11y = useFieldProps(rest);
  return (
    <input
      ref={ref}
      className={cn(styles.control, controlBase, size === 'lg' ? 'h-14' : 'h-12', className)}
      {...rest}
      {...a11y}
    />
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> };

export function Textarea({ className, rows = 5, ref, ...rest }: TextareaProps) {
  const a11y = useFieldProps(rest);
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(styles.control, controlBase, 'min-h-32 resize-y py-3.5 leading-relaxed', className)}
      {...rest}
      {...a11y}
    />
  );
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> };

/** Native select, styled. Native is the most usable picker on phones. */
export function Select({ className, children, ref, ...rest }: SelectProps) {
  const a11y = useFieldProps(rest);
  return (
    <span className="relative block">
      <select
        ref={ref}
        className={cn(styles.control, controlBase, 'h-14 cursor-pointer appearance-none pr-12', className)}
        {...rest}
        {...a11y}
      >
        {children}
      </select>
      <ShapeIcon
        shape="triangle"
        size={12}
        color="current"
        className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 rotate-180 text-ink-3"
      />
    </span>
  );
}

export interface ChoiceProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
  type?: 'radio' | 'checkbox';
  ref?: Ref<HTMLInputElement>;
}

/** Big tappable radio/checkbox card (attendance mode: in person / online). */
export function Choice({ label, description, type = 'radio', className, ref, ...rest }: ChoiceProps) {
  return (
    <label
      className={cn(
        'group/choice relative flex cursor-pointer items-start gap-3 rounded-[14px] border border-line-strong bg-white p-4 transition-colors',
        'hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-surface-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-focus',
        className,
      )}
    >
      <input ref={ref} type={type} className="peer sr-only" {...rest} />
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid size-5 flex-none place-items-center border-2 border-line-strong bg-white transition-colors peer-checked:border-ink peer-checked:bg-ink',
          type === 'radio' ? 'rounded-full' : 'rounded-[6px]',
        )}
      >
        <span className="size-2 scale-0 rounded-full bg-white transition-transform group-has-[:checked]/choice:scale-100" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-bold text-ink">{label}</span>
        {description ? <span className="text-[0.9375rem] text-ink-3">{description}</span> : null}
      </span>
    </label>
  );
}

export interface FormCardProps {
  children: ReactNode;
  className?: string;
  /** Graph paper background (register form, ticket). Default true. */
  graph?: boolean;
}

/** The "work in progress" surface for public forms. */
export function FormCard({ children, className, graph = true }: FormCardProps) {
  return (
    <div className={cn('rounded-[28px] border border-line p-5 sm:p-8 md:p-10', graph ? styles.graph : 'bg-white', className)}>
      {children}
    </div>
  );
}
