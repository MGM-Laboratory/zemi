'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  SPEAKER_ROLES,
  type EventAdmin,
  type EventSpeaker,
  type SpeakerRef,
  type SpeakerRole,
} from '@zemi/shared';
import { Lock, RotateCcw, Trash2, UserPlus } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { DragHandle, ReadOnlyScope, SortableList, SpeakerPicker } from '@/components/admin/fields';
import { Button, IconButton } from '@/components/admin/ui/button';
import { Card, CardHeader } from '@/components/admin/ui/card';
import { Callout, EmptyState } from '@/components/admin/ui/feedback';
import { Field } from '@/components/admin/ui/field';
import { FormError, FormField, FormSaveBar } from '@/components/admin/ui/form';
import { Input } from '@/components/admin/ui/input';
import { Avatar } from '@/components/admin/ui/media';
import { Select } from '@/components/admin/ui/select';
import { notify } from '@/components/admin/ui/toast';
import { useAbility } from '@/lib/admin/ability';
import { api, errorMessage } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { applyApiErrorToForm, useZodForm } from '@/lib/admin/form';
import { adminRoutes } from '@/lib/admin/nav';
import { detectMove, nullIfEmpty } from '../lib';
import {
  acceptEvent,
  eventDetailKey,
  eventListKeys,
  patchEventCache,
  useWorkspaceEvent,
} from '../use-event';
import { useUnsavedChangesGuard } from '../use-unsaved-guard';
import { NewSpeakerSheet } from './new-speaker-sheet';

export const ROLE_LABEL: Record<SpeakerRole, string> = {
  speaker: 'Speaker',
  keynote: 'Keynote',
  moderator: 'Moderator',
  panelist: 'Panelist',
};

const rowSchema = z.object({
  speakerId: z.string().min(1),
  role: z.enum(SPEAKER_ROLES),
  organization: z.string().max(200, 'Keep it under 200 characters.'),
  position: z.string().max(200, 'Keep it under 200 characters.'),
  talkTitle: z.string().max(300, 'Keep the talk title under 300 characters.'),
});
const schema = z.object({
  speakers: z.array(rowSchema).max(30, 'Thirty people is the max for one Friday.'),
});
type Values = z.infer<typeof schema>;
type Row = Values['speakers'][number];

const toRow = (s: EventSpeaker): Row => ({
  speakerId: s.id,
  role: s.role,
  organization: s.organization ?? '',
  position: s.position ?? '',
  talkTitle: s.talkTitle ?? '',
});
const toValues = (e: EventAdmin): Values => ({ speakers: e.speakersFull.map(toRow) });
const toBody = (v: Values) => ({
  speakers: v.speakers.map((r) => ({
    speakerId: r.speakerId,
    role: r.role,
    organization: nullIfEmpty(r.organization),
    position: nullIfEmpty(r.position),
    talkTitle: nullIfEmpty(r.talkTitle),
  })),
});

/**
 * Speakers tab: who is on this Friday, their role, and the org/position shown for this talk
 * (prefilled from the person's defaults, editable per event). Drag to reorder: when nothing
 * else is pending, the new order saves right away.
 */
export function SpeakersEditor() {
  const { event, id, can } = useWorkspaceEvent();
  const ability = useAbility();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const readOnly = !can('edit');
  const form = useZodForm(schema, { defaultValues: toValues(event) });
  const { control, formState } = form;
  const { fields, append, remove, move } = useFieldArray({ control, name: 'speakers' });
  const rows = useWatch({ control, name: 'speakers' }) as Row[] | undefined;
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<{ open: boolean; name: string }>({ open: false, name: '' });
  // People picked here but not saved yet; saved ones come from the event.
  const [picked, setPicked] = useState<Record<string, SpeakerRef>>({});
  const refs = useMemo<Record<string, SpeakerRef>>(
    () => ({ ...picked, ...Object.fromEntries(event.speakersFull.map((s) => [s.id, s])) }),
    [picked, event.speakersFull],
  );
  const lastSynced = useRef(event.updatedAt);
  useUnsavedChangesGuard(formState.isDirty && !saving && !readOnly);

  // Follow server changes when there is nothing pending here.
  useEffect(() => {
    if (event.updatedAt === lastSynced.current) return;
    lastSynced.current = event.updatedAt;
    if (!form.formState.isDirty) form.reset(toValues(event));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.updatedAt]);

  const ids = (rows ?? []).map((r) => r.speakerId);

  const save = async (values: Values, opts: { quiet?: boolean; optimistic?: boolean } = {}) => {
    setSaving(true);
    const rollback = opts.optimistic
      ? patchEventCache(qc, id, (e) => {
          const byId = new Map(e.speakersFull.map((s) => [s.id, s]));
          return {
            ...e,
            speakersFull: values.speakers
              .map((r) => byId.get(r.speakerId))
              .filter((s): s is EventSpeaker => Boolean(s)),
          };
        })
      : null;
    try {
      const res = await api.put<unknown>(`/admin/events/${id}/speakers`, toBody(values));
      acceptEvent(qc, id, res);
      form.reset(values);
      void qc.invalidateQueries({ queryKey: eventDetailKey(id) });
      for (const key of eventListKeys()) void qc.invalidateQueries({ queryKey: key });
      notify.success(opts.quiet ? 'Order saved.' : 'Lineup saved.');
    } catch (err) {
      rollback?.();
      if (!applyApiErrorToForm(form, err)) notify.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const submit = () =>
    form.handleSubmit(
      (v) => save(v),
      () => notify.error('A few fields need a look before this can save.'),
    )();

  const addSpeaker = (s: SpeakerRef | null) => {
    if (!s) return;
    if (ids.includes(s.id)) {
      notify.info(`${s.fullName} is already on the lineup.`);
      return;
    }
    setPicked((r) => ({ ...r, [s.id]: s }));
    append(
      {
        speakerId: s.id,
        role: 'speaker',
        organization: s.defaultOrganization ?? '',
        position: s.defaultPosition ?? '',
        talkTitle: '',
      },
      { shouldFocus: false },
    );
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

  const canCreate = ability.has('speakers.create');
  const count = fields.length;

  return (
    <>
      <form
        noValidate
        aria-label="Speakers"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <ReadOnlyScope readOnly={readOnly}>
          {readOnly ? (
            <Callout
              tone="neutral"
              icon={<Lock />}
              title="You can look, not touch."
              className="mb-6"
            >
              Changing the lineup needs the Edit permission on this event.
            </Callout>
          ) : null}
          <FormError errors={formState.errors} className="mb-6" />

          <Card>
            <CardHeader
              title={
                count ? `${count} ${count === 1 ? 'person' : 'people'} on the lineup` : 'The lineup'
              }
              description="Order here is the order on the site. Drag the handle, or focus it and use Space and the arrow keys."
              actions={
                canCreate && !readOnly ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<UserPlus />}
                    onClick={() => setSheet({ open: true, name: '' })}
                  >
                    Create new speaker
                  </Button>
                ) : null
              }
            />

            {!readOnly ? (
              <div className="mb-5">
                <Field
                  label="Add someone"
                  hint={
                    canCreate
                      ? 'Search the directory. New person? Type their name and pick "Add as a new speaker".'
                      : 'Search the speaker directory.'
                  }
                >
                  <SpeakerPicker
                    value={null}
                    onChange={addSpeaker}
                    exclude={ids}
                    placeholder="Find a speaker by name"
                    onCreate={canCreate ? (name) => setSheet({ open: true, name }) : undefined}
                  />
                </Field>
              </div>
            ) : null}

            {count === 0 ? (
              <EmptyState
                size="sm"
                title="Nobody on the lineup yet."
                description={
                  readOnly
                    ? 'Someone with edit access can add speakers.'
                    : 'Add the first person above. They show up on the card and the event page.'
                }
                cast={[
                  { shape: 'circle', mood: 'look', size: 44, lookAt: { x: 0, y: -0.9 } },
                  { shape: 'arch', mood: 'sleep', size: 36 },
                ]}
              />
            ) : (
              <SortableList
                items={fields}
                getId={(f) => f.id}
                onReorder={onReorder}
                itemLabel={(f) => refs[f.speakerId]?.fullName ?? 'speaker'}
                aria-label="Lineup"
                gap="md"
                renderItem={(f, { handle, index, isDragging, readOnly: ro }) => {
                  const ref = refs[f.speakerId];
                  const row = rows?.[index];
                  const canOpen = ability.can('speaker', f.speakerId, 'view');
                  // Empty means "use their usual" (the API falls back to the defaults), so only
                  // a typed value that differs counts as an override.
                  const orgDiffers =
                    ref &&
                    row &&
                    ((row.organization !== '' &&
                      row.organization !== (ref.defaultOrganization ?? '')) ||
                      (row.position !== '' && row.position !== (ref.defaultPosition ?? '')));
                  return (
                    <motion.div
                      layout={!reduce}
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        'rounded-[20px] border border-line bg-white p-3 transition-shadow sm:p-4',
                        isDragging && 'border-line-strong shadow-[var(--shadow-3)]',
                      )}
                    >
                      <div className="flex items-start gap-2 sm:gap-3">
                        <DragHandle
                          {...handle}
                          disabled={ro}
                          label={`Drag ${ref?.fullName ?? 'speaker'}`}
                          className="mt-1"
                        />
                        <Avatar
                          name={ref?.fullName ?? '?'}
                          image={ref?.avatar}
                          size={44}
                          className="mt-0.5 hidden sm:inline-flex"
                        />
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <Avatar
                              name={ref?.fullName ?? '?'}
                              image={ref?.avatar}
                              size={32}
                              className="sm:hidden"
                            />
                            <div className="min-w-0 flex-1 basis-[11rem]">
                              {canOpen ? (
                                <Link
                                  href={adminRoutes.speaker(f.speakerId)}
                                  className="font-semibold text-ink underline-offset-4 hover:underline"
                                >
                                  {ref?.fullName ?? 'Unknown speaker'}
                                </Link>
                              ) : (
                                <span className="font-semibold text-ink">
                                  {ref?.fullName ?? 'Unknown speaker'}
                                </span>
                              )}
                              {ref?.headline ? (
                                <p className="truncate text-[0.8125rem] text-ink-3">
                                  {ref.headline}
                                </p>
                              ) : null}
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                              <FormField
                                control={control}
                                name={`speakers.${index}.role`}
                                label="Role"
                                hideLabel
                                className="w-36"
                              >
                                {(field) => (
                                  <Select<SpeakerRole>
                                    size="sm"
                                    value={field.value}
                                    onValueChange={(v) => v && field.onChange(v)}
                                    options={SPEAKER_ROLES.map((r) => ({
                                      value: r,
                                      label: ROLE_LABEL[r],
                                    }))}
                                    aria-label={`Role for ${ref?.fullName ?? 'speaker'}`}
                                  />
                                )}
                              </FormField>
                              {!ro ? (
                                <IconButton
                                  label={`Remove ${ref?.fullName ?? 'speaker'}`}
                                  size="sm"
                                  variant="danger"
                                  onClick={() => remove(index)}
                                >
                                  <Trash2 />
                                </IconButton>
                              ) : null}
                            </div>
                          </div>
                          <FormField
                            control={control}
                            name={`speakers.${index}.talkTitle`}
                            label="Talk title"
                            optional
                            maxLength={300}
                          >
                            {(field) => (
                              <Input
                                {...field}
                                size="sm"
                                placeholder="What are they talking about?"
                              />
                            )}
                          </FormField>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <FormField
                              control={control}
                              name={`speakers.${index}.organization`}
                              label="Organization"
                              optional
                            >
                              {(field) => (
                                <Input
                                  {...field}
                                  size="sm"
                                  placeholder={ref?.defaultOrganization ?? 'Where they are from'}
                                />
                              )}
                            </FormField>
                            <FormField
                              control={control}
                              name={`speakers.${index}.position`}
                              label="Position"
                              optional
                            >
                              {(field) => (
                                <Input
                                  {...field}
                                  size="sm"
                                  placeholder={ref?.defaultPosition ?? 'PhD student, lecturer...'}
                                />
                              )}
                            </FormField>
                          </div>
                          {orgDiffers &&
                          !ro &&
                          (ref?.defaultOrganization || ref?.defaultPosition) ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-blue hover:underline"
                              onClick={() => {
                                form.setValue(
                                  `speakers.${index}.organization`,
                                  ref?.defaultOrganization ?? '',
                                  { shouldDirty: true },
                                );
                                form.setValue(
                                  `speakers.${index}.position`,
                                  ref?.defaultPosition ?? '',
                                  { shouldDirty: true },
                                );
                              }}
                            >
                              <RotateCcw className="size-3.5" />
                              Use their usual:{' '}
                              {[ref?.defaultPosition, ref?.defaultOrganization]
                                .filter(Boolean)
                                .join(', ')}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </motion.div>
                  );
                }}
              />
            )}
            <AnimatePresence>
              {formState.errors.speakers?.root?.message || formState.errors.speakers?.message ? (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 text-[0.8125rem] font-medium text-red-600"
                  role="alert"
                >
                  {formState.errors.speakers?.root?.message ?? formState.errors.speakers?.message}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </Card>

          {!readOnly ? (
            <FormSaveBar
              form={form}
              saving={saving}
              onSave={() => void submit()}
              saveLabel="Save lineup"
            />
          ) : null}
        </ReadOnlyScope>
      </form>
      <NewSpeakerSheet
        open={sheet.open}
        initialName={sheet.name}
        onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))}
        onCreated={addSpeaker}
      />
    </>
  );
}

/** Used by the rundown tab to label speakers. */
export function useEventSpeakerOptions(event: EventAdmin) {
  return useMemo(
    () =>
      event.speakersFull.map((s) => ({
        value: s.id,
        label: s.nickname ? `${s.fullName} (${s.nickname})` : s.fullName,
      })),
    [event.speakersFull],
  );
}
