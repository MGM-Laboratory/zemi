'use client';

import { useQueryClient } from '@tanstack/react-query';
import { jakartaTimeInput, type EventAdmin, type RundownItem, type SpeakerRef } from '@zemi/shared';
import { ArrowDownUp, Lock, Plus, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { DragHandle, ReadOnlyScope, SortableList } from '@/components/admin/fields';
import { Button, IconButton } from '@/components/admin/ui/button';
import { Card, CardHeader } from '@/components/admin/ui/card';
import { useConfirm } from '@/components/admin/ui/confirm-dialog';
import { Callout, EmptyState } from '@/components/admin/ui/feedback';
import { FormError, FormField, FormSaveBar } from '@/components/admin/ui/form';
import { Input, Textarea } from '@/components/admin/ui/input';
import { Select } from '@/components/admin/ui/select';
import { notify } from '@/components/admin/ui/toast';
import { api, errorMessage } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { applyApiErrorToForm, useZodForm } from '@/lib/admin/form';
import { detectMove, hhmmToMinutes, isEventAdmin, minutesToHhmm, nullIfEmpty } from '../lib';
import {
  acceptEvent,
  eventDetailKey,
  eventListKeys,
  patchEventCache,
  useWorkspaceEvent,
} from '../use-event';
import { useUnsavedChangesGuard } from '../use-unsaved-guard';
import { RundownTimeline } from './rundown-timeline';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const itemSchema = z
  .object({
    time: z.string().regex(HHMM, 'Use HH:mm, like 13:15.'),
    endTime: z.string().refine((s) => s === '' || HHMM.test(s), 'Use HH:mm, like 13:30.'),
    agenda: z
      .string()
      .trim()
      .min(1, 'What happens at this time?')
      .max(200, 'Keep it under 200 characters.'),
    note: z.string().max(500, 'Keep the note under 500 characters.'),
    speakerId: z.string().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.endTime && HHMM.test(v.time) && hhmmToMinutes(v.endTime) <= hhmmToMinutes(v.time)) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'It ends before it starts.' });
    }
  });
const schema = z.object({
  items: z.array(itemSchema).max(60, 'Sixty rows is the max. That is a long Friday.'),
});
type Values = z.infer<typeof schema>;
export type RundownRow = Values['items'][number];

const toValues = (e: EventAdmin): Values => ({
  items: e.rundown.map((r) => ({
    time: r.time,
    endTime: r.endTime ?? '',
    agenda: r.agenda,
    note: r.note ?? '',
    speakerId: r.speaker?.id ?? null,
  })),
});
const toBody = (v: Values) => ({
  items: v.items.map((r) => ({
    time: r.time,
    endTime: nullIfEmpty(r.endTime),
    agenda: r.agenda.trim(),
    note: nullIfEmpty(r.note),
    speakerId: r.speakerId || null,
  })),
});

const round5 = (m: number) => Math.round(m / 5) * 5;

/**
 * The API stores rows sorted by start time (ties keep their order), so only an order that is
 * already in time order survives a save.
 */
function inTimeOrder(rows: readonly Pick<RundownRow, 'time'>[]): boolean {
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!.time;
    const b = rows[i]!.time;
    if (HHMM.test(a) && HHMM.test(b) && hhmmToMinutes(b) < hhmmToMinutes(a)) return false;
  }
  return true;
}

/** The classic Friday: doors, talks, questions, coffee. Scaled to the event's own times. */
export function standardRundown(e: EventAdmin): RundownRow[] {
  const s = hhmmToMinutes(jakartaTimeInput(e.startsAt));
  let end = hhmmToMinutes(jakartaTimeInput(e.endsAt));
  if (end <= s) end += 1440;
  const d = end - s;
  const at = (f: number) => round5(s + d * f);
  const talksStart = at(15 / 120);
  const talksEnd = at(75 / 120);
  const qa = at(95 / 120);
  const rows: RundownRow[] = [
    {
      time: minutesToHhmm(s),
      endTime: minutesToHhmm(talksStart),
      agenda: 'Doors open, grab a coffee',
      note: '',
      speakerId: null,
    },
  ];
  const speakers = e.speakersFull.filter((p) => p.role !== 'moderator');
  if (speakers.length) {
    const slot = (talksEnd - talksStart) / speakers.length;
    speakers.forEach((p, i) => {
      rows.push({
        time: minutesToHhmm(round5(talksStart + slot * i)),
        endTime: minutesToHhmm(round5(talksStart + slot * (i + 1))),
        agenda: p.talkTitle ? p.talkTitle : `Talk by ${p.nickname ?? p.fullName.split(' ')[0]}`,
        note: '',
        speakerId: p.id,
      });
    });
  } else {
    rows.push({
      time: minutesToHhmm(talksStart),
      endTime: minutesToHhmm(talksEnd),
      agenda: 'Talks',
      note: '',
      speakerId: null,
    });
  }
  rows.push({
    time: minutesToHhmm(talksEnd),
    endTime: minutesToHhmm(qa),
    agenda: 'Questions and discussion',
    note: 'Bring the half-formed ones too.',
    speakerId: null,
  });
  rows.push({
    time: minutesToHhmm(qa),
    endTime: minutesToHhmm(end),
    agenda: 'Coffee and chatting',
    note: '',
    speakerId: null,
  });
  rows.push({
    time: minutesToHhmm(end),
    endTime: '',
    agenda: 'See you next Friday',
    note: '',
    speakerId: null,
  });
  return rows;
}

/** Soft warnings (they never block saving). */
function rowHints(rows: RundownRow[], startMin: number, endMin: number): Array<string | null> {
  return rows.map((r, i) => {
    if (!HHMM.test(r.time)) return null;
    const t = hhmmToMinutes(r.time);
    const e = r.endTime && HHMM.test(r.endTime) ? hhmmToMinutes(r.endTime) : t;
    if (t < startMin || e > endMin)
      return `Outside the session (${minutesToHhmm(startMin)} to ${minutesToHhmm(endMin)}).`;
    const prev = rows[i - 1];
    if (prev && HHMM.test(prev.time) && hhmmToMinutes(prev.time) > t)
      return 'Starts before the row above. Saving puts the rows in time order.';
    return null;
  });
}

/**
 * Rundown tab: rows of time, optional end, agenda, note and speaker, with a live visual
 * timeline. Validation is strict on format, gentle on timing (hints, not errors).
 */
export function RundownEditor() {
  const { event, id, can } = useWorkspaceEvent();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const reduce = useReducedMotion();
  const readOnly = !can('edit');
  const form = useZodForm(schema, { defaultValues: toValues(event) });
  const { control, formState } = form;
  const { fields, append, remove, move, replace } = useFieldArray({ control, name: 'items' });
  const watched = useWatch({ control, name: 'items' }) as RundownRow[] | undefined;
  const rows = useMemo(() => watched ?? [], [watched]);
  const [saving, setSaving] = useState(false);
  const lastSynced = useRef(event.updatedAt);
  useUnsavedChangesGuard(formState.isDirty && !saving && !readOnly);

  useEffect(() => {
    if (event.updatedAt === lastSynced.current) return;
    lastSynced.current = event.updatedAt;
    if (!form.formState.isDirty) form.reset(toValues(event));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.updatedAt]);

  const startMin = hhmmToMinutes(jakartaTimeInput(event.startsAt));
  let endMin = hhmmToMinutes(jakartaTimeInput(event.endsAt));
  if (endMin <= startMin) endMin += 1440;
  const hints = useMemo(() => rowHints(rows, startMin, endMin), [rows, startMin, endMin]);
  // From the rows, not the hints: an "outside the session" hint wins over the order hint.
  const outOfOrder = useMemo(() => !inTimeOrder(rows), [rows]);
  const speakerOptions = event.speakersFull.map((s) => ({ value: s.id, label: s.fullName }));
  const speakerById = useMemo(
    () => new Map<string, SpeakerRef>(event.speakersFull.map((s) => [s.id, s])),
    [event.speakersFull],
  );

  const save = async (values: Values, opts: { quiet?: boolean; optimistic?: boolean } = {}) => {
    setSaving(true);
    const rollback = opts.optimistic
      ? patchEventCache(qc, id, (e) => ({
          ...e,
          rundown: values.items.map<RundownItem>((r, i) => ({
            id: `pending-${i}`,
            time: r.time,
            endTime: r.endTime || null,
            agenda: r.agenda,
            note: r.note || null,
            speaker: r.speakerId ? (speakerById.get(r.speakerId) ?? null) : null,
          })),
        }))
      : null;
    try {
      const res = await api.put<unknown>(`/admin/events/${id}/rundown`, toBody(values));
      acceptEvent(qc, id, res);
      // The API sorts rows by start time: show what it stored, and say so when that moved rows.
      const fresh = isEventAdmin(res) && res.id === id ? res : null;
      const sorted =
        fresh != null &&
        fresh.rundown.map((r) => r.time).join() !== values.items.map((r) => r.time).join();
      if (fresh) {
        lastSynced.current = fresh.updatedAt;
        form.reset(toValues(fresh));
      } else {
        form.reset(values);
      }
      void qc.invalidateQueries({ queryKey: eventDetailKey(id) });
      for (const key of eventListKeys()) void qc.invalidateQueries({ queryKey: key });
      notify.success(
        sorted
          ? 'Rundown saved, in time order.'
          : opts.quiet
            ? 'Order saved.'
            : 'Rundown saved.',
      );
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
      () => notify.error('A few rows need a look before this can save.'),
    )();

  const onReorder = (next: typeof fields) => {
    const mv = detectMove(
      fields.map((f) => f.id),
      next.map((f) => f.id),
    );
    if (!mv) return;
    const wasClean = !form.formState.isDirty;
    move(mv.from, mv.to);
    if (wasClean && !readOnly) {
      const v = form.getValues();
      // Rows are stored in time order. A drop that breaks it stays unsaved with a hint (and
      // "Sort by time"), instead of saving and snapping straight back.
      if (schema.safeParse(v).success && inTimeOrder(v.items))
        void save(v, { quiet: true, optimistic: true });
    }
  };

  const sortByTime = () => {
    const sorted = [...rows].sort(
      (a, b) => hhmmToMinutes(a.time || '00:00') - hhmmToMinutes(b.time || '00:00'),
    );
    replace(sorted);
    notify.info('Sorted by start time. Save when it looks right.');
  };

  const applyTemplate = async () => {
    if (rows.length) {
      const ok = await confirm({
        title: 'Swap in the standard Friday?',
        description: `This replaces the ${rows.length} rows here with doors, talks, questions and coffee, timed to ${minutesToHhmm(startMin)} to ${minutesToHhmm(endMin)} WIB. Nothing is saved until you press Save.`,
        confirmLabel: 'Use the standard rundown',
      });
      if (!ok) return;
    }
    replace(standardRundown(event));
    notify.success('Standard Friday in. Tweak it and save.', { celebrate: 'square' });
  };

  const addRow = () => {
    const last = rows[rows.length - 1];
    const lastEnd = last
      ? last.endTime && HHMM.test(last.endTime)
        ? hhmmToMinutes(last.endTime)
        : HHMM.test(last.time)
          ? hhmmToMinutes(last.time) + 15
          : startMin
      : startMin;
    append(
      {
        time: minutesToHhmm(Math.min(lastEnd, 1435)),
        endTime: '',
        agenda: '',
        note: '',
        speakerId: null,
      },
      { shouldFocus: true, focusName: `items.${rows.length}.agenda` },
    );
  };

  return (
    <form
      noValidate
      aria-label="Rundown"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <ReadOnlyScope readOnly={readOnly}>
        {readOnly ? (
          <Callout tone="neutral" icon={<Lock />} title="You can look, not touch." className="mb-6">
            Editing the rundown needs the Edit permission on this event.
          </Callout>
        ) : null}
        <FormError errors={formState.errors} className="mb-6" />

        <Card className="mb-6">
          <CardHeader
            title="Preview"
            description={`How the afternoon flows, ${minutesToHhmm(startMin)} to ${minutesToHhmm(endMin)} WIB. Updates as you type.`}
          />
          <RundownTimeline rows={rows} startMin={startMin} endMin={endMin} event={event} />
        </Card>

        <Card>
          <CardHeader
            title="Rundown"
            description="Times are WIB, and rows run in time order. To move a row, change its time. The public page turns these into chapters for the recording too."
            actions={
              !readOnly ? (
                <div className="flex flex-wrap gap-2">
                  {outOfOrder ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<ArrowDownUp />}
                      onClick={sortByTime}
                    >
                      Sort by time
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Sparkles />}
                    onClick={() => void applyTemplate()}
                  >
                    Use the standard Friday rundown
                  </Button>
                </div>
              ) : null
            }
          />

          {fields.length === 0 ? (
            <EmptyState
              size="sm"
              title="No rundown yet."
              description={
                readOnly
                  ? 'Someone with edit access can add one.'
                  : 'Start from the standard Friday (doors, talks, questions, coffee) or add rows one by one.'
              }
              cast={[
                { shape: 'square', mood: 'look', size: 40, lookAt: { x: 0.8, y: 0.2 } },
                { shape: 'triangle', mood: 'idle', size: 34 },
              ]}
              action={
                !readOnly ? (
                  <>
                    <Button
                      variant="primary"
                      icon={<Sparkles />}
                      onClick={() => void applyTemplate()}
                    >
                      Use the standard Friday
                    </Button>
                    <Button variant="ghost" icon={<Plus />} onClick={addRow}>
                      Add a row
                    </Button>
                  </>
                ) : null
              }
            />
          ) : (
            <>
              <div
                className="mb-2 hidden grid-cols-[2rem_6.5rem_6.5rem_minmax(0,1fr)_11rem_2rem] gap-2 px-1 text-xs font-semibold text-ink-3 md:grid"
                aria-hidden="true"
              >
                <span />
                <span>Starts</span>
                <span>Ends</span>
                <span>What happens</span>
                <span>Speaker</span>
                <span />
              </div>
              <SortableList
                items={fields}
                getId={(f) => f.id}
                onReorder={onReorder}
                itemLabel={(f) => `${f.time} ${f.agenda || 'row'}`}
                aria-label="Rundown rows"
                gap="sm"
                renderItem={(f, { handle, index, isDragging, readOnly: ro }) => {
                  const hint = hints[index];
                  return (
                    <motion.div
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        'rounded-2xl border border-line bg-white p-2.5 transition-shadow',
                        isDragging && 'border-line-strong shadow-[var(--shadow-3)]',
                      )}
                    >
                      <div className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_2rem] items-start gap-2 md:grid-cols-[2rem_6.5rem_6.5rem_minmax(0,1fr)_11rem_2rem]">
                        <DragHandle
                          {...handle}
                          disabled={ro}
                          label={`Drag row ${index + 1}`}
                          className="mt-0.5"
                        />
                        <FormField
                          control={control}
                          name={`items.${index}.time`}
                          label={`Row ${index + 1} starts`}
                          hideLabel
                        >
                          {(field) => <Input {...field} type="time" step={300} mono size="sm" />}
                        </FormField>
                        <FormField
                          control={control}
                          name={`items.${index}.endTime`}
                          label={`Row ${index + 1} ends`}
                          hideLabel
                        >
                          {(field) => (
                            <Input
                              {...field}
                              type="time"
                              step={300}
                              mono
                              size="sm"
                              aria-label={`Row ${index + 1} ends (optional)`}
                            />
                          )}
                        </FormField>
                        <div className="col-start-4 row-start-1 flex justify-end md:col-start-6">
                          {!ro ? (
                            <IconButton
                              label={`Remove row ${index + 1}`}
                              size="sm"
                              variant="danger"
                              onClick={() => remove(index)}
                            >
                              <Trash2 />
                            </IconButton>
                          ) : null}
                        </div>
                        <FormField
                          control={control}
                          name={`items.${index}.agenda`}
                          label={`Row ${index + 1}: what happens`}
                          hideLabel
                          className="col-span-3 col-start-2 md:col-span-1 md:col-start-4 md:row-start-1"
                        >
                          {(field) => (
                            <Input
                              {...field}
                              size="sm"
                              placeholder="Talk, questions, coffee..."
                              maxLength={200}
                            />
                          )}
                        </FormField>
                        <FormField
                          control={control}
                          name={`items.${index}.speakerId`}
                          label={`Row ${index + 1} speaker`}
                          hideLabel
                          className="col-span-3 col-start-2 md:col-span-1 md:col-start-5 md:row-start-1"
                        >
                          {(field) => (
                            <Select
                              size="sm"
                              value={field.value}
                              onValueChange={(v) => field.onChange(v)}
                              options={speakerOptions}
                              clearable="No speaker"
                              placeholder={
                                speakerOptions.length ? 'No speaker' : 'Add speakers first'
                              }
                              disabled={!speakerOptions.length}
                              aria-label={`Row ${index + 1} speaker`}
                            />
                          )}
                        </FormField>
                        <FormField
                          control={control}
                          name={`items.${index}.note`}
                          label={`Row ${index + 1} note`}
                          hideLabel
                          className="col-span-3 col-start-2 md:col-span-4 md:col-start-2"
                        >
                          {(field) => (
                            <Textarea
                              {...field}
                              minRows={1}
                              maxRows={4}
                              placeholder="Note, optional. Like 'mic check at 13:25'."
                              className="py-1.5 text-sm"
                            />
                          )}
                        </FormField>
                      </div>
                      {hint ? (
                        <p className="mt-1.5 flex items-center gap-1.5 pl-10 text-[0.8125rem] text-[#7a5600]">
                          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                          {hint}
                        </p>
                      ) : null}
                    </motion.div>
                  );
                }}
              />
              {!readOnly ? (
                <Button
                  variant="ghost"
                  icon={<Plus />}
                  onClick={addRow}
                  className="mt-3"
                  disabled={fields.length >= 60}
                >
                  Add a row
                </Button>
              ) : null}
            </>
          )}
          {formState.errors.items?.root?.message || formState.errors.items?.message ? (
            <p className="mt-3 text-[0.8125rem] font-medium text-red-600" role="alert">
              {formState.errors.items?.root?.message ?? formState.errors.items?.message}
            </p>
          ) : null}
        </Card>

        {!readOnly ? (
          <FormSaveBar
            form={form}
            saving={saving}
            onSave={() => void submit()}
            saveLabel="Save rundown"
          />
        ) : null}
      </ReadOnlyScope>
    </form>
  );
}
