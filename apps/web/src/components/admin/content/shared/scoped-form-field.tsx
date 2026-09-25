'use client';

import type { FieldPath, FieldValues } from 'react-hook-form';
import { useReadOnly } from '@/components/admin/fields';
import { FormField, type FormFieldProps } from '@/components/admin/ui';

/**
 * FormField that also honours an enclosing <ReadOnlyScope>. The kit's Input, Textarea and Select
 * only read read-only from their <Field>, so without this a view-only admin sees editable text boxes.
 */
export function ScopedFormField<TValues extends FieldValues, TName extends FieldPath<TValues>>(props: FormFieldProps<TValues, TName>) {
  const readOnly = useReadOnly(props.readOnly);
  return <FormField {...props} readOnly={readOnly || undefined} />;
}
