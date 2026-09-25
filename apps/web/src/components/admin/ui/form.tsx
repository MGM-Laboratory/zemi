'use client';

import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import {
  Controller,
  get,
  type Control,
  type ControllerFieldState,
  type ControllerRenderProps,
  type FieldErrors,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';
import { cn } from '@/lib/admin/cn';
import { useHotkeys } from '@/lib/admin/hooks';
import { Button } from './button';
import { Callout } from './feedback';
import { Field, type FieldProps } from './field';

export interface FormFieldProps<TValues extends FieldValues, TName extends FieldPath<TValues>>
  extends Omit<FieldProps, 'children' | 'error' | 'count'> {
  control: Control<TValues, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  name: TName;
  /** Show a character counter against this max (reads the string length of the value). */
  maxLength?: number;
  /** Render the control. Spread `field` onto inputs; custom fields use value/onChange. */
  children: (field: ControllerRenderProps<TValues, TName>, state: ControllerFieldState) => ReactNode;
}

/**
 * react-hook-form Controller + `<Field>`: label, hint, error message and ids wired together.
 * Server errors applied with `applyApiErrorToForm(form, err)` show up here automatically.
 * Give every field a default value in `useZodForm` (inputs need '' rather than undefined).
 *
 * @example
 * <FormField control={form.control} name="title" label="Title" required maxLength={200}>
 *   {(field) => <Input {...field} />}
 * </FormField>
 * <FormField control={form.control} name="accent" label="Accent">
 *   {(field) => <AccentPicker value={field.value} onChange={field.onChange} />}
 * </FormField>
 */
export function FormField<TValues extends FieldValues, TName extends FieldPath<TValues>>({
  control,
  name,
  maxLength,
  children,
  ...fieldProps
}: FormFieldProps<TValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const len = typeof field.value === 'string' ? field.value.length : Array.isArray(field.value) ? field.value.length : 0;
        return (
          <Field {...fieldProps} error={fieldState.error?.message ?? (fieldState.invalid ? true : undefined)} count={maxLength ? { value: len, max: maxLength } : undefined}>
            {children(field, fieldState)}
          </Field>
        );
      }}
    />
  );
}

/** Form-level error from `applyApiErrorToForm` (root.server) or any root error. */
export function FormError<TValues extends FieldValues>({ errors, className }: { errors: FieldErrors<TValues>; className?: string }) {
  const msg: string | undefined = get(errors, 'root.server.message') ?? get(errors, 'root.message');
  if (!msg) return null;
  return (
    <Callout tone="red" className={className} title="That did not save.">
      {msg}
    </Callout>
  );
}

export interface FormSaveBarProps<TValues extends FieldValues> {
  form: UseFormReturn<TValues, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  saving?: boolean;
  /** Called by the Save button and Cmd/Ctrl+S. Usually `form.handleSubmit(onSubmit)`. */
  onSave: () => void;
  /** Default: `form.reset()` back to the last saved values. */
  onDiscard?: () => void;
  saveLabel?: string;
  /** Show even when the form is not dirty (create forms). */
  alwaysVisible?: boolean;
  className?: string;
}

/**
 * Floating "Unsaved changes" bar with Discard and Save. Appears when the form is dirty.
 * Cmd/Ctrl+S saves. Put it at the end of the form.
 */
export function FormSaveBar<TValues extends FieldValues>({ form, saving, onSave, onDiscard, saveLabel = 'Save changes', alwaysVisible, className }: FormSaveBarProps<TValues>) {
  const dirty = form.formState.isDirty;
  const visible = alwaysVisible || dirty || saving;
  useHotkeys({ 'mod+s': () => visible && !saving && onSave() }, { allowInInputs: true });
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className={cn(
            'sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-line bg-white/95 py-2.5 pr-2.5 pl-4 shadow-[var(--shadow-3)] backdrop-blur',
            className,
          )}
          role="region"
          aria-label="Save changes"
        >
          <span className="flex items-center gap-2 text-sm text-ink-2">
            <span className={cn('size-2 rounded-full', dirty ? 'bg-yellow' : 'bg-green')} aria-hidden="true" />
            {dirty ? 'Unsaved changes' : 'All saved'}
          </span>
          <div className="flex items-center gap-2">
            {dirty ? (
              <Button variant="ghost" size="sm" onClick={() => (onDiscard ? onDiscard() : form.reset())} disabled={saving}>
                Discard
              </Button>
            ) : null}
            <Button variant="primary" size="sm" onClick={onSave} loading={saving}>
              {saveLabel}
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
