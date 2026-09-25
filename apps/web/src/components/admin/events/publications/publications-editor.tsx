'use client';

import { useQueryClient } from '@tanstack/react-query';
import { PUBLICATION_TYPE_LABELS, type EventAdmin, type ImageRef } from '@zemi/shared';
import { BookOpen, FileText, Lock, Trash2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { DragHandle, PublicationPicker, ReadOnlyScope, SortableList, type PublicationRef } from '@/components/admin/fields';
import { IconButton } from '@/components/admin/ui/button';
import { Card, CardHeader } from '@/components/admin/ui/card';
import { Callout, EmptyState } from '@/components/admin/ui/feedback';
import { Field } from '@/components/admin/ui/field';
import { FormError, FormField, FormSaveBar } from '@/components/admin/ui/form';
import { Input } from '@/components/admin/ui/input';
import { AdminImage } from '@/components/admin/ui/media';
import { notify } from '@/components/admin/ui/toast';
import { useAbility } from '@/lib/admin/ability';
import { api, errorMessage } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { applyApiErrorToForm, useZodForm } from '@/lib/admin/form';
import { adminRoutes } from '@/lib/admin/nav';
import { detectMove, nullIfEmpty } from '../lib';
import { acceptEvent, eventDetailKey, eventListKeys, patchEventCache, useWorkspaceEvent } from '../use-event';
import { useUnsavedChangesGuard } from '../use-unsaved-guard';

const schema = z.object({
  items: z
    .array(z.object({ publicationId: z.string().min(1), note: z.string().max(300, 'Keep the note under 300 characters.') }))
    .max(50, 'Fifty is the max for one event.'),
});
type Values = z.infer<typeof schema>;

interface PubInfo extends PublicationRef {
  cover?: ImageRef | null;
}

const toValues = (e: EventAdmin): Values => ({ items: e.publications.map((p) => ({ publicationId: p.id, note: p.note ?? '' })) });
const toBody = (v: Values) => ({ items: v.items.map((i) => ({ publicationId: i.publicationId, note: nullIfEmpty(i.note) })) });
const typeLabel = (t?: string | null) => (t ? ((PUBLICATION_TYPE_LABELS as Record<string, string>)[t] ?? t) : null);

/**
 * Publications tab: papers, projects and articles this Friday talks about. Pick from the
 * library or quick-add with a title and a link; each gets a short note ("the paper behind
 * the second talk"). Drag to reorder.
 */
export function PublicationsEditor() {
  const { event, id, can } = useWorkspaceEvent();
  const ability = useAbility();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const readOnly = !can('edit');
  const form = useZodForm(schema, { defaultValues: toValues(event) });
  const { control, formState } = form;
  const { fields, append, remove, move } = useFieldArray({ control, name: 'items' });
  const items = (useWatch({ control, name: 'items' }) as Values['items'] | undefined) ?? [];
  const [saving, setSaving] = useState(false);
  // Picked here but not saved yet; saved ones come from the event.
  const [picked, setPicked] = useState<Record<string, PubInfo>>({});
  const refs = useMemo<Record<string, PubInfo>>(
    () => ({
      ...picked,
      ...Object.fromEntries(event.publications.map((p) => [p.id, { id: p.id, slug: p.slug, title: p.title, type: p.type, publishedYear: p.publishedYear, containerTitle: p.containerTitle, cover: p.cover }])),
    }),
    [picked, event.publications],
  );
  const lastSynced = useRef(event.updatedAt);
  useUnsavedChangesGuard(formState.isDirty && !saving && !readOnly);

  useEffect(() => {
    if (event.updatedAt === lastSynced.current) return;
    lastSynced.current = event.updatedAt;
    if (!form.formState.isDirty) form.reset(toValues(event));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.updatedAt]);

  const ids = items.map((i) => i.publicationId);

  const save = async (values: Values, opts: { quiet?: boolean; optimistic?: boolean } = {}) => {
    setSaving(true);
    const rollback = opts.optimistic
      ? patchEventCache(qc, id, (e) => {
          const byId = new Map(e.publications.map((p) => [p.id, p]));
          return { ...e, publications: values.items.map((i) => byId.get(i.publicationId)).filter((p): p is EventAdmin['publications'][number] => Boolean(p)) };
        })
      : null;
    try {
      const res = await api.put<unknown>(`/admin/events/${id}/publications`, toBody(values));
      acceptEvent(qc, id, res);
      form.reset(values);
      void qc.invalidateQueries({ queryKey: eventDetailKey(id) });
      for (const key of eventListKeys()) void qc.invalidateQueries({ queryKey: key });
      notify.success(opts.quiet ? 'Order saved.' : 'Publications saved.');
    } catch (err) {
      rollback?.();
      if (!applyApiErrorToForm(form, err)) notify.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const submit = () => form.handleSubmit((v) => save(v), () => notify.error('A note or two needs a look before this can save.'))();

  const add = (p: PublicationRef | null) => {
    if (!p) return;
    if (ids.includes(p.id)) {
      notify.info('That one is already on the list.');
      return;
    }
    setPicked((r) => ({ ...r, [p.id]: p }));
    append({ publicationId: p.id, note: '' }, { shouldFocus: true, focusName: `items.${items.length}.note` });
  };

  const onReorder = (next: typeof fields) => {
    const mv = detectMove(
      fields.map((f) => f.id),
      next.map((f) => f.id),
    );
    if (!mv) return;
    const wasClean = !form.formState.isDirty;
    move(mv.from, mv.to);
    if (wasClean && !readOnly) void save(form.getValues(), { quiet: true, optimistic: true });
  };

  return (
    <form
      noValidate
      aria-label="Publications"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <ReadOnlyScope readOnly={readOnly}>
        {readOnly ? (
          <Callout tone="neutral" icon={<Lock />} title="You can look, not touch." className="mb-6">
            Linking publications needs the Edit permission on this event.
          </Callout>
        ) : null}
        <FormError errors={formState.errors} className="mb-6" />
        <Card>
          <CardHeader
            title={fields.length ? `${fields.length} linked` : 'Papers and projects'}
            description="They show up on the event page, and the event shows up on each publication's page."
          />
          {!readOnly ? (
            <div className="mb-5">
              <Field label="Link a publication" hint={ability.has('publications.create') ? 'Not in the library yet? Type the title and quick-add it with a link.' : 'Search the library by title, DOI or keyword.'}>
                <PublicationPicker value={null} onChange={add} exclude={ids} />
              </Field>
            </div>
          ) : null}

          {fields.length === 0 ? (
            <EmptyState
              size="sm"
              title="Nothing linked yet."
              description="Linking the paper behind a talk helps people go deeper after Friday."
              cast={[
                { shape: 'square', mood: 'sleep', size: 42 },
                { shape: 'circle', mood: 'look', size: 32, lookAt: { x: -0.8, y: 0.3 } },
              ]}
            />
          ) : (
            <SortableList
              items={fields}
              getId={(f) => f.id}
              onReorder={onReorder}
              itemLabel={(f) => refs[f.publicationId]?.title ?? 'publication'}
              aria-label="Linked publications"
              gap="sm"
              renderItem={(f, { handle, index, isDragging, readOnly: ro }) => {
                const p = refs[f.publicationId];
                const meta = [typeLabel(p?.type), p?.containerTitle, p?.publishedYear].filter(Boolean).join(' · ');
                const canOpen = ability.can('publication', f.publicationId, 'view');
                return (
                  <motion.div
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn('group flex items-start gap-2 rounded-[20px] border border-line bg-white p-3 transition-shadow sm:gap-3', isDragging && 'border-line-strong shadow-[var(--shadow-3)]')}
                  >
                    <DragHandle {...handle} disabled={ro} label={`Drag ${p?.title ?? 'publication'}`} className="mt-1" />
                    <span className="hidden h-[60px] w-12 shrink-0 overflow-hidden rounded-lg bg-yellow-50 transition-transform duration-300 group-hover:-rotate-3 sm:block" aria-hidden="true">
                      {p?.cover ? (
                        <AdminImage image={p.cover} sizes="96px" className="size-full" />
                      ) : (
                        <span className="flex size-full items-center justify-center text-[#7a5600]">{p?.type === 'software' || p?.type === 'project' ? <BookOpen className="size-5" /> : <FileText className="size-5" />}</span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          {canOpen ? (
                            <Link href={adminRoutes.publication(f.publicationId)} className="line-clamp-2 font-semibold text-ink underline-offset-4 hover:underline">
                              {p?.title ?? 'Unknown publication'}
                            </Link>
                          ) : (
                            <span className="line-clamp-2 font-semibold text-ink">{p?.title ?? 'Unknown publication'}</span>
                          )}
                          {meta ? <p className="truncate text-[0.8125rem] text-ink-3">{meta}</p> : null}
                        </div>
                        {!ro ? (
                          <IconButton label={`Unlink ${p?.title ?? 'publication'}`} size="sm" variant="danger" onClick={() => remove(index)}>
                            <Trash2 />
                          </IconButton>
                        ) : null}
                      </div>
                      <FormField control={control} name={`items.${index}.note`} label="Note" optional maxLength={300}>
                        {(field) => <Input {...field} size="sm" placeholder="Like 'the paper behind the second talk'" />}
                      </FormField>
                    </div>
                  </motion.div>
                );
              }}
            />
          )}
        </Card>
        {!readOnly ? <FormSaveBar form={form} saving={saving} onSave={() => void submit()} saveLabel="Save publications" /> : null}
      </ReadOnlyScope>
    </form>
  );
}

