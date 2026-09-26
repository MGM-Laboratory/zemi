'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  accentSchema,
  blocksSchema,
  EVENT_MODES,
  fromJakartaInput,
  jakartaDateInput,
  slugSchema,
  type EventAdmin,
  type EventMode,
  type EventUpdateInput,
  type Venue,
} from '@zemi/shared';
import { History, Lock, MapPinned, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { z } from 'zod';
import {
  AccentPicker,
  BlockEditor,
  ImageUploadCrop,
  JakartaDateTimeFields,
  ReadOnlyScope,
  SlugField,
  TagsInput,
  useVenues,
  VenueSelect,
} from '@/components/admin/fields';
import { Button } from '@/components/admin/ui/button';
import { Card, CardHeader } from '@/components/admin/ui/card';
import { Callout } from '@/components/admin/ui/feedback';
import { FormError, FormField, FormSaveBar } from '@/components/admin/ui/form';
import { Input, NumberInput, Textarea } from '@/components/admin/ui/input';
import { notify } from '@/components/admin/ui/toast';
import { RadioGroup, Switch } from '@/components/admin/ui/toggles';
import { api, errorMessage } from '@/lib/admin/api';
import { formatRelative } from '@/lib/admin/format';
import { applyApiErrorToForm, useZodForm } from '@/lib/admin/form';
import { useDebouncedCallback, useMounted } from '@/lib/admin/hooks';
import { JakartaDateTimeInput, useTakenDates } from '../fields';
import { isEventAdmin, MODE_HINT, MODE_LABEL, nullIfEmpty } from '../lib';
import { acceptEvent, eventDetailKey, eventListKeys, useWorkspaceEvent } from '../use-event';
import { useUnsavedChangesGuard } from '../use-unsaved-guard';

/* ------------------------------------------------------------------ schema */

const isHttpUrl = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const detailsSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Give it a title. Something people would click.')
      .max(200, 'Keep the title under 200 characters.'),
    slug: slugSchema,
    number: z.number().int().min(0).max(100000).nullable(),
    summary: z.string().max(400, 'Keep the summary under 400 characters.'),
    coverAssetId: z.string().nullable(),
    startsAt: z.string().min(1, 'Pick a date.'),
    endsAt: z.string().min(1, 'Pick an end time.'),
    mode: z.enum(EVENT_MODES),
    venueId: z.string().nullable(),
    roomNote: z.string().max(200, 'Keep the room note under 200 characters.'),
    mapsUrl: z
      .string()
      .refine(
        (s) => s === '' || isHttpUrl(s),
        'That link looks off. It should start with https://',
      ),
    onlineNote: z.string().max(300, 'Keep the online note under 300 characters.'),
    accent: accentSchema,
    tags: z.array(z.string().min(1).max(40)).max(20, 'Twenty tags is the max.'),
    registrationOpen: z.boolean(),
    capacity: z.number().int().min(1, 'At least one seat.').max(100000).nullable(),
    registrationClosesAt: z.string().nullable(),
    showRegistrantCount: z.boolean(),
    description: blocksSchema,
  })
  .superRefine((v, ctx) => {
    if (v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'It has to end after it starts.' });
    }
    if (
      v.registrationClosesAt &&
      v.endsAt &&
      new Date(v.registrationClosesAt) > new Date(v.endsAt)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['registrationClosesAt'],
        message: 'Registration should close before the session ends.',
      });
    }
  });

type DetailsValues = z.infer<typeof detailsSchema>;

function toValues(e: EventAdmin): DetailsValues {
  return {
    title: e.title,
    slug: e.slug,
    number: e.number,
    summary: e.summary ?? '',
    coverAssetId: e.coverAssetId,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    mode: e.mode,
    venueId: e.venueId,
    roomNote: e.roomNote ?? '',
    mapsUrl: e.mapsUrl ?? '',
    onlineNote: e.onlineNote ?? '',
    accent: e.accent,
    tags: e.tags ?? [],
    registrationOpen: e.registrationOpen,
    capacity: e.capacity,
    registrationClosesAt: e.registrationClosesAt,
    showRegistrantCount: e.showRegistrantCount,
    description: e.description ?? [],
  };
}

const NULLABLE_TEXT = new Set<keyof DetailsValues>([
  'summary',
  'roomNote',
  'mapsUrl',
  'onlineNote',
]);

/** Only the fields that changed, in the API's shape ('' becomes null for nullable text). */
function toPatch(
  values: DetailsValues,
  dirty: Partial<Record<keyof DetailsValues, unknown>>,
): EventUpdateInput {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(values) as Array<keyof DetailsValues>) {
    if (!dirty[key]) continue;
    const v = values[key];
    if (NULLABLE_TEXT.has(key)) patch[key] = nullIfEmpty(v as string);
    else if (key === 'title') patch[key] = (v as string).trim();
    else patch[key] = v;
  }
  // Times travel together so the server can check the order.
  if ('startsAt' in patch || 'endsAt' in patch) {
    patch.startsAt = values.startsAt;
    patch.endsAt = values.endsAt;
  }
  return patch as EventUpdateInput;
}

/* ------------------------------------------------------------------ local draft */

interface StoredDraft {
  values: DetailsValues;
  savedAt: string;
}

const draftKey = (id: string) => `zemi.event-draft.${id}`;

function readDraft(id: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    return parsed?.values && parsed.savedAt ? parsed : null;
  } catch {
    return null;
  }
}

function writeDraft(id: string, values: DetailsValues) {
  try {
    window.localStorage.setItem(
      draftKey(id),
      JSON.stringify({ values, savedAt: new Date().toISOString() } satisfies StoredDraft),
    );
  } catch {
    /* private mode or full storage: the form still works */
  }
}

function clearDraft(id: string) {
  try {
    window.localStorage.removeItem(draftKey(id));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ form */

/**
 * Details tab: everything about the Friday itself. Explicit Save (Cmd/Ctrl+S) with a dirty
 * guard, a local draft that survives reloads, field-level server errors, read-only without `edit`.
 */
export function EventDetailsForm() {
  const { event, id, can } = useWorkspaceEvent();
  const qc = useQueryClient();
  const readOnly = !can('edit');
  const form = useZodForm(detailsSchema, { defaultValues: toValues(event) });
  const { control, setValue, formState } = form;
  const [saving, setSaving] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const lastSynced = useRef(event.updatedAt);
  const { dates: takenDates } = useTakenDates(id);
  const venues = useVenues();

  const values = useWatch({ control }) as DetailsValues;
  const dirty = formState.isDirty;
  useUnsavedChangesGuard(dirty && !saving && !readOnly);

  // Offer a local draft that is newer than the server copy (read after mount: storage is browser only).
  const mounted = useMounted();
  const [draftHandled, setDraftHandled] = useState(false);
  const stored = useMemo(() => (mounted ? readDraft(id) : null), [mounted, id]);
  const draft = useMemo(() => {
    if (draftHandled || !stored) return null;
    const newer = new Date(stored.savedAt).getTime() > new Date(event.updatedAt).getTime();
    const differs =
      JSON.stringify({ ...toValues(event), ...stored.values }) !== JSON.stringify(toValues(event));
    return newer && differs ? stored : null;
  }, [draftHandled, stored, event]);

  // Keep a local draft while there are unsaved changes (checked again when the debounce fires,
  // so a save that lands in between never leaves a stale draft behind).
  const persist = useDebouncedCallback(() => {
    if (form.formState.isDirty) writeDraft(id, form.getValues() as DetailsValues);
  }, 800);
  useEffect(() => {
    if (dirty && !readOnly) persist();
  }, [values, dirty, readOnly, persist]);

  // Someone saved elsewhere (or a background refetch): follow the server when nothing is pending here.
  useEffect(() => {
    if (event.updatedAt === lastSynced.current) return;
    lastSynced.current = event.updatedAt;
    if (!form.formState.isDirty) {
      form.reset(toValues(event));
      // The editor reads its value on mount, so it remounts to show the server copy. Rare: only when
      // updatedAt moves while this form is clean.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditorKey((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.updatedAt]);

  const everPublished = Boolean(event.publishedAt) || event.visibility !== 'draft';
  const venue: Venue | null = useMemo(
    () => (venues.data ?? []).find((v) => v.id === values.venueId) ?? null,
    [venues.data, values.venueId],
  );
  const mapsFromVenue = Boolean(venue?.mapsUrl && values.mapsUrl === venue.mapsUrl);

  const onValid = async (v: DetailsValues) => {
    const patch = toPatch(
      v,
      formState.dirtyFields as Partial<Record<keyof DetailsValues, unknown>>,
    );
    if (!Object.keys(patch).length) {
      form.reset(v);
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch<EventAdmin>(`/admin/events/${id}`, patch);
      acceptEvent(qc, id, res);
      const fresh = isEventAdmin(res)
        ? res
        : await qc.fetchQuery({
            queryKey: eventDetailKey(id),
            queryFn: () => api.get<EventAdmin>(`/admin/events/${id}`),
          });
      lastSynced.current = fresh.updatedAt;
      form.reset(toValues(fresh));
      setEditorKey((k) => k + 1);
      clearDraft(id);
      setDraftHandled(true);
      void qc.invalidateQueries({ queryKey: eventDetailKey(id) });
      for (const key of eventListKeys()) void qc.invalidateQueries({ queryKey: key });
      notify.success('Saved.', {
        description: patch.slug ? 'The old link keeps redirecting here.' : undefined,
      });
    } catch (err) {
      const inline = applyApiErrorToForm(form, err);
      if (!inline) notify.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const submit = () =>
    form.handleSubmit(onValid, () =>
      notify.error('A few fields need a look before this can save.'),
    )();

  const discard = () => {
    form.reset(toValues(event));
    setEditorKey((k) => k + 1);
    clearDraft(id);
  };

  const restoreDraft = () => {
    if (!draft) return;
    form.reset({ ...toValues(event), ...draft.values }, { keepDefaultValues: true });
    setEditorKey((k) => k + 1);
    setDraftHandled(true);
    notify.info('Draft restored. Save it when you are happy.');
  };

  const pickVenue = (venueId: string | null, v: Venue | null) => {
    const prevMaps = venue?.mapsUrl ?? '';
    setValue('venueId', venueId, { shouldDirty: true });
    // Prefill the maps link from the room, unless someone typed their own.
    if (v?.mapsUrl && (!values.mapsUrl || values.mapsUrl === prevMaps))
      setValue('mapsUrl', v.mapsUrl, { shouldDirty: true, shouldValidate: true });
    if (!v && values.mapsUrl && values.mapsUrl === prevMaps)
      setValue('mapsUrl', '', { shouldDirty: true });
  };

  const mode = values.mode as EventMode;
  const closesPresets = useMemo(() => {
    if (!values.startsAt) return [];
    const day = jakartaDateInput(values.startsAt);
    const prev = jakartaDateInput(new Date(new Date(values.startsAt).getTime() - 86_400_000));
    return [
      { label: 'Night before, 20:00', value: fromJakartaInput(prev, '20:00').toISOString() },
      { label: 'Same day, 12:00', value: fromJakartaInput(day, '12:00').toISOString() },
      { label: 'When it starts', value: new Date(values.startsAt).toISOString() },
    ];
  }, [values.startsAt]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
      aria-label="Event details"
    >
      <ReadOnlyScope readOnly={readOnly}>
        {readOnly ? (
          <Callout tone="neutral" icon={<Lock />} title="You can look, not touch." className="mb-6">
            Editing this event needs the Edit permission. Ask the superadmin if that should be you.
          </Callout>
        ) : null}
        {draft && !readOnly ? (
          <Callout
            tone="yellow"
            icon={<History />}
            title="You left some changes here."
            className="mb-6"
            action={
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    clearDraft(id);
                    setDraftHandled(true);
                  }}
                >
                  Throw away
                </Button>
                <Button size="sm" variant="primary" onClick={restoreDraft}>
                  Restore
                </Button>
              </div>
            }
          >
            A local draft from {formatRelative(draft.savedAt)} is newer than the saved event. Only
            this browser has it.
          </Callout>
        ) : null}
        <FormError errors={formState.errors} className="mb-6" />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          {/* Basics */}
          <Card className="xl:col-start-1 xl:row-start-1">
            <CardHeader
              title="The basics"
              description="What people see first on the card and the event page."
            />
            <div className="space-y-5">
              <FormField control={control} name="title" label="Title" required maxLength={200}>
                {(field) => (
                  <Input {...field} placeholder="What is this Friday about?" autoComplete="off" />
                )}
              </FormField>
              <FormField
                control={control}
                name="slug"
                label="Link"
                hint={
                  everPublished ? 'It is public already. Change it only if you have to.' : undefined
                }
              >
                {(field) => (
                  <SlugField
                    value={field.value}
                    onChange={(s) => field.onChange(s)}
                    onBlur={field.onBlur}
                    source={values.title ?? ''}
                    basePath="/events/"
                    savedSlug={event.slug}
                    auto={everPublished ? false : undefined}
                  />
                )}
              </FormField>
              <div className="grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <FormField
                  control={control}
                  name="number"
                  label="Number"
                  optional
                  hint={
                    values.number != null ? `Shows as Zemi #${values.number}.` : 'Like Zemi #42.'
                  }
                >
                  {(field) => (
                    <NumberInput
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      min={0}
                      max={100000}
                      placeholder="42"
                    />
                  )}
                </FormField>
                <div className="hidden sm:block" />
              </div>
              <FormField
                control={control}
                name="summary"
                label="Summary"
                optional
                maxLength={400}
                hint="One or two sentences for cards and link previews."
              >
                {(field) => (
                  <Textarea
                    {...field}
                    minRows={2}
                    maxRows={6}
                    placeholder="Traffic data is messy. Here is how a graph model survived Jakarta."
                  />
                )}
              </FormField>
            </div>
          </Card>

          {/* Rail: cover, accent, tags */}
          <div className="xl:col-start-2 xl:row-span-4 xl:row-start-1">
            <div className="space-y-6 xl:sticky xl:top-[calc(var(--admin-topbar-h)+7rem)]">
              <Card>
                <CardHeader
                  title="Cover"
                  description="4:5, like a poster. Crop and adjust after you drop it."
                />
                <FormField control={control} name="coverAssetId" label="Cover image" hideLabel>
                  {(field) => (
                    <ImageUploadCrop
                      purpose="event-cover"
                      value={field.value}
                      initialImage={event.cover}
                      alt={values.title}
                      onChange={(assetId) => field.onChange(assetId)}
                      className="mx-auto w-full max-w-[18rem]"
                    />
                  )}
                </FormField>
              </Card>
              <Card>
                <CardHeader title="Look and tags" />
                <div className="space-y-5">
                  <FormField
                    control={control}
                    name="accent"
                    label="Accent"
                    hint="Tints the card, the cover frame and little details."
                  >
                    {(field) => <AccentPicker value={field.value} onChange={field.onChange} />}
                  </FormField>
                  <FormField
                    control={control}
                    name="tags"
                    label="Tags"
                    optional
                    hint="Enter or comma adds one. People can filter by them."
                  >
                    {(field) => (
                      <TagsInput value={field.value} onChange={field.onChange} max={20} />
                    )}
                  </FormField>
                </div>
              </Card>
            </div>
          </div>

          {/* When and where */}
          <Card className="xl:col-start-1 xl:row-start-2">
            <CardHeader
              title="When and where"
              description="Times are Jakarta time (WIB) for everyone."
            />
            <div className="space-y-5">
              <JakartaDateTimeFields
                value={{ startsAt: values.startsAt, endsAt: values.endsAt }}
                onChange={(r) => {
                  setValue('startsAt', r.startsAt, { shouldDirty: true, shouldValidate: true });
                  setValue('endsAt', r.endsAt, { shouldDirty: true, shouldValidate: true });
                }}
                errors={{
                  startsAt: formState.errors.startsAt?.message,
                  endsAt: formState.errors.endsAt?.message,
                }}
                takenDates={takenDates}
              />
              <FormField control={control} name="mode" label="Format">
                {(field) => (
                  <RadioGroup<EventMode>
                    variant="cards"
                    value={field.value}
                    onValueChange={field.onChange}
                    aria-label="Format"
                    options={EVENT_MODES.map((m) => ({
                      value: m,
                      label: MODE_LABEL[m],
                      description: MODE_HINT[m],
                    }))}
                    disabled={readOnly}
                  />
                )}
              </FormField>
              {mode !== 'online' ? (
                <>
                  <div className="grid gap-5 lg:grid-cols-2">
                    <FormField control={control} name="venueId" label="Room" optional>
                      {(field) => <VenueSelect value={field.value} onChange={pickVenue} />}
                    </FormField>
                    <FormField
                      control={control}
                      name="roomNote"
                      label="Room note"
                      optional
                      maxLength={200}
                      hint="Like 'Third floor, the door with the plant'."
                    >
                      {(field) => <Input {...field} placeholder="Third floor, left of the lift" />}
                    </FormField>
                  </div>
                  <FormField
                    control={control}
                    name="mapsUrl"
                    label="Google Maps link"
                    optional
                    hint={
                      mapsFromVenue
                        ? 'From the room. Change it if the entrance is somewhere else.'
                        : venue?.mapsUrl && !values.mapsUrl
                          ? "Empty uses the room's link. Paste another one if the entrance is somewhere else."
                          : 'Helps first-timers find the building.'
                    }
                    action={
                      venue?.mapsUrl && values.mapsUrl && !mapsFromVenue && !readOnly ? (
                        <button
                          type="button"
                          onClick={() =>
                            setValue('mapsUrl', venue.mapsUrl ?? '', {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                          className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-blue hover:underline"
                        >
                          <RotateCcw className="size-3.5" />
                          Use the room&apos;s link
                        </button>
                      ) : null
                    }
                  >
                    {(field) => (
                      <Input
                        {...field}
                        inputMode="url"
                        placeholder={venue?.mapsUrl ?? 'https://maps.app.goo.gl/...'}
                        leading={<MapPinned />}
                      />
                    )}
                  </FormField>
                </>
              ) : null}
              {mode !== 'offline' ? (
                <FormField
                  control={control}
                  name="onlineNote"
                  label="Online note"
                  optional
                  maxLength={300}
                  hint="Shown next to the livestream. Like 'Questions go in the chat'."
                >
                  {(field) => (
                    <Textarea
                      {...field}
                      minRows={2}
                      maxRows={5}
                      placeholder="Questions go in the chat. We read them out loud."
                    />
                  )}
                </FormField>
              ) : null}
            </div>
          </Card>

          {/* Registration */}
          <Card className="xl:col-start-1 xl:row-start-3">
            <CardHeader title="Registration" description="Who can grab a seat, and until when." />
            <div className="space-y-5">
              <Controller
                control={control}
                name="registrationOpen"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={readOnly}
                    label="Registration is open"
                    description={
                      field.value
                        ? 'People can register once the event is published.'
                        : 'The form is closed. Existing tickets still work.'
                    }
                  />
                )}
              />
              <div className="grid gap-5 lg:grid-cols-2">
                <FormField
                  control={control}
                  name="capacity"
                  label="Seats"
                  optional
                  hint={
                    venue?.capacity && values.capacity !== venue.capacity ? (
                      <>
                        The room fits {venue.capacity}.{' '}
                        {!readOnly ? (
                          <button
                            type="button"
                            className="font-medium text-blue hover:underline"
                            onClick={() =>
                              setValue('capacity', venue.capacity, {
                                shouldDirty: true,
                                shouldValidate: true,
                              })
                            }
                          >
                            Use that
                          </button>
                        ) : null}
                      </>
                    ) : (
                      'Leave empty for no cap.'
                    )
                  }
                >
                  {(field) => (
                    <NumberInput
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      min={1}
                      max={100000}
                      unit="seats"
                      placeholder="No cap"
                    />
                  )}
                </FormField>
                <FormField
                  control={control}
                  name="registrationClosesAt"
                  label="Closes at"
                  optional
                  hint="Empty means it stays open until the session ends."
                >
                  {(field) => (
                    <JakartaDateTimeInput
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      presets={closesPresets}
                    />
                  )}
                </FormField>
              </div>
              <Controller
                control={control}
                name="showRegistrantCount"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={readOnly}
                    label="Show how many registered"
                    description="Shows '42 going' on the site. Nice when it's busy, skip it for tiny sessions."
                  />
                )}
              />
            </div>
          </Card>

          {/* Description */}
          <Card className="xl:col-start-1 xl:row-start-4">
            <CardHeader
              title="Description"
              description="The long version for the event page. Type / for headings, lists and images."
            />
            <FormField control={control} name="description" label="Description" hideLabel>
              {(field) => (
                <BlockEditor
                  key={editorKey}
                  value={field.value}
                  onChange={(blocks) => field.onChange(blocks)}
                  placeholder="What is the talk about? Who should come? Bring the messy version."
                  minHeight="16rem"
                />
              )}
            </FormField>
          </Card>
        </div>

        {!readOnly ? (
          <FormSaveBar
            form={form}
            saving={saving}
            onSave={() => void submit()}
            onDiscard={discard}
            saveLabel="Save details"
          />
        ) : null}
      </ReadOnlyScope>
    </form>
  );
}
