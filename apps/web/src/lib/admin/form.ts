'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type FieldValues, type Path, type UseFormProps, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
import { isApiError } from './api';

/**
 * react-hook-form bound to a zod schema from @zemi/shared.
 * Input and output types follow the schema (defaults applied on submit).
 *
 * @example
 * const form = useZodForm(speakerInput, { defaultValues: { fullName: '', slug: '', links: [] } });
 * <form onSubmit={form.handleSubmit((values) => save.mutate(values))}>...</form>
 */
export function useZodForm<TSchema extends z.ZodType<FieldValues, FieldValues>>(
  schema: TSchema,
  options?: Omit<UseFormProps<z.input<TSchema>, unknown, z.output<TSchema>>, 'resolver'>,
): UseFormReturn<z.input<TSchema>, unknown, z.output<TSchema>> {
  return useForm<z.input<TSchema>, unknown, z.output<TSchema>>({
    resolver: zodResolver(schema) as never,
    mode: 'onTouched',
    ...options,
  });
}

export interface ApplyApiErrorOptions<T extends FieldValues> {
  /** Rename API paths to form paths: { 'coverAssetId': 'cover' }. */
  map?: Partial<Record<string, Path<T>>>;
  /** Focus the first field with an error. Default true. */
  focus?: boolean;
}

/**
 * Push an ApiError's zod field errors into react-hook-form with `setError`.
 * Unknown paths and the form-level message land on `root.server`.
 * Returns true when at least one field error was applied (so you can skip a toast).
 *
 * @example
 * onError: (err) => { if (!applyApiErrorToForm(form, err)) notify.error(err); }
 */
export function applyApiErrorToForm<T extends FieldValues>(
  form: Pick<UseFormReturn<T, unknown, never>, 'setError' | 'getValues'> | Pick<UseFormReturn<T>, 'setError' | 'getValues'>,
  err: unknown,
  opts: ApplyApiErrorOptions<T> = {},
): boolean {
  if (!isApiError(err)) return false;
  const entries = Object.entries(err.fieldErrors);
  if (!entries.length) {
    if (err.isValidation || err.isConflict) {
      form.setError('root.server' as Path<T>, { type: 'server', message: err.message });
    }
    return false;
  }
  let applied = 0;
  let first = true;
  const values = form.getValues() as Record<string, unknown>;
  for (const [rawPath, message] of entries) {
    const mapped = (opts.map?.[rawPath] ?? rawPath) as string;
    const known = mapped !== '_root' && hasPath(values, mapped);
    if (!known) {
      form.setError('root.server' as Path<T>, { type: 'server', message });
      continue;
    }
    form.setError(mapped as Path<T>, { type: 'server', message }, { shouldFocus: (opts.focus ?? true) && first });
    first = false;
    applied++;
  }
  return applied > 0;
}

function hasPath(obj: Record<string, unknown>, path: string): boolean {
  const top = path.split('.')[0]!;
  return obj != null && Object.prototype.hasOwnProperty.call(obj, top);
}
