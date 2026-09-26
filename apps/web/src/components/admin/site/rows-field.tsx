'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, type ArrayPath, type Control, type FieldArray, type FieldValues, type Path } from 'react-hook-form';
import { DragHandle, SortableList } from '@/components/admin/fields';
import { Button, FormField, IconButton, Input, Select, ShapeGlyph, Textarea } from '@/components/admin/ui';
import { cn } from '@/lib/admin/cn';
import { reorderToMove } from './site-kit';

export const SHAPES = [
  { value: 'circle', label: 'Circle', character: 'Q, the question', tone: 'text-blue' },
  { value: 'triangle', label: 'Triangle', character: 'Hunch, the spark', tone: 'text-red' },
  { value: 'square', label: 'Square', character: 'Block, the evidence', tone: 'text-yellow' },
  { value: 'arch', label: 'Arch', character: 'Bridge, the conversation', tone: 'text-green' },
] as const;
export type Shape = (typeof SHAPES)[number]['value'];

/**
 * A sortable list of { title, body } cards (optionally with a brand shape) inside a react-hook-form.
 * Used for the about page pillars, audiences and "how to present" steps.
 */
export function RowsField<F extends FieldValues, N extends ArrayPath<F>>({
  control,
  name,
  max,
  noun,
  numbered,
  withShape,
  titleMax = 80,
  bodyMax = 400,
  titlePlaceholder,
  bodyPlaceholder,
  newRow,
}: {
  control: Control<F, unknown, F>;
  name: N;
  max: number;
  noun: string;
  numbered?: boolean;
  withShape?: boolean;
  titleMax?: number;
  bodyMax?: number;
  titlePlaceholder?: string;
  bodyPlaceholder?: string;
  newRow: () => FieldArray<F, N>;
}) {
  const { fields, append, remove, move } = useFieldArray({ control, name });
  return (
    <div className="space-y-3">
      {fields.length ? (
        <SortableList
          aria-label={`${noun}s`}
          items={fields}
          getId={(f) => f.id}
          itemLabel={(f) => `${noun} ${fields.findIndex((x) => x.id === f.id) + 1}`}
          onReorder={(next) => {
            const mv = reorderToMove(fields, next);
            if (mv) move(mv[0], mv[1]);
          }}
          renderItem={(_f, { handle, index, isDragging }) => (
            <div className={cn('rounded-2xl border border-line bg-white p-3 transition-shadow sm:p-4', isDragging && 'shadow-[var(--shadow-3)]')}>
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center gap-1 pt-6">
                  <DragHandle {...handle} label={`Move ${noun} ${index + 1}`} />
                  {numbered ? <span className="mono text-xs text-ink-4 tabular-nums">{index + 1}</span> : null}
                </div>
                <div className={cn('grid min-w-0 flex-1 gap-3', withShape && 'sm:grid-cols-[minmax(0,1fr)_11rem]')}>
                  <FormField control={control} name={`${name}.${index}.title` as Path<F>} label="Title" maxLength={titleMax}>
                    {(field) => <Input {...field} value={(field.value as string) ?? ''} placeholder={titlePlaceholder} />}
                  </FormField>
                  {withShape ? (
                    <FormField control={control} name={`${name}.${index}.shape` as Path<F>} label="Shape">
                      {(field) => (
                        <Select
                          value={field.value as string}
                          onValueChange={(v) => field.onChange(v ?? 'circle')}
                          options={SHAPES.map((s) => ({ value: s.value, label: s.label, description: s.character, icon: <ShapeGlyph shape={s.value} className={cn('size-3.5', s.tone)} /> }))}
                        />
                      )}
                    </FormField>
                  ) : null}
                  <div className={cn(withShape && 'sm:col-span-2')}>
                    <FormField control={control} name={`${name}.${index}.body` as Path<F>} label="Text" maxLength={bodyMax}>
                      {(field) => <Textarea {...field} value={(field.value as string) ?? ''} autosize minRows={2} maxRows={6} placeholder={bodyPlaceholder} />}
                    </FormField>
                  </div>
                </div>
                <IconButton label={`Remove ${noun} ${index + 1}`} size="sm" variant="danger" className="mt-6" onClick={() => remove(index)}>
                  <Trash2 />
                </IconButton>
              </div>
            </div>
          )}
        />
      ) : (
        <p className="rounded-2xl border border-dashed border-line-strong px-4 py-4 text-sm text-ink-3">None yet. The section hides itself until there is one.</p>
      )}
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" icon={<Plus />} disabled={fields.length >= max} onClick={() => append(newRow())}>
          Add {noun}
        </Button>
        <span className="mono text-xs text-ink-4 tabular-nums">
          {fields.length} / {max}
        </span>
      </div>
    </div>
  );
}
