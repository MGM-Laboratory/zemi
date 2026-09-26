'use client';

import { VENUE_KINDS, venueInput, type Venue, type VenueInput, type VenueKind } from '@zemi/shared';
import { ExternalLink, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { ReadOnlyScope } from '@/components/admin/fields';
import {
  Badge,
  Button,
  DateText,
  FormError,
  Input,
  NumberInput,
  Select,
  Sheet,
  Textarea,
  useConfirm,
} from '@/components/admin/ui';
import { ScopedFormField as FormField } from '../shared/scoped-form-field';
import { api, errorMessage } from '@/lib/admin/api';
import { applyApiErrorToForm, useZodForm } from '@/lib/admin/form';
import { useAdminMutation } from '@/lib/admin/hooks';
import { adminKeys } from '@/lib/admin/query-keys';
import { blankToNull, nullToBlank } from '../shared/form-utils';
import type { VenueRow } from '../shared/types';
import { VENUE_KIND_META } from './venue-meta';

type VenueFormValues = {
  name: string;
  kind: VenueKind;
  building: string;
  floor: string;
  capacity: number | null;
  address: string;
  mapsUrl: string;
  notes: string;
};

const EMPTY: VenueFormValues = { name: '', kind: 'classroom', building: '', floor: '', capacity: null, address: '', mapsUrl: '', notes: '' };

function toForm(v: VenueRow): VenueFormValues {
  return {
    name: v.name,
    kind: v.kind,
    building: nullToBlank(v.building),
    floor: nullToBlank(v.floor),
    capacity: v.capacity ?? null,
    address: nullToBlank(v.address),
    mapsUrl: nullToBlank(v.mapsUrl),
    notes: nullToBlank(v.notes),
  };
}

const KIND_OPTIONS = VENUE_KINDS.map((k) => {
  const Icon = VENUE_KIND_META[k].icon;
  return { value: k, label: VENUE_KIND_META[k].label, description: VENUE_KIND_META[k].hint, icon: <Icon /> };
});

function isHttpUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export interface VenueSheetProps {
  /** The venue to edit, `'new'` to create, or null when closed. */
  venue: VenueRow | 'new' | null;
  onClose: () => void;
  canManage: boolean;
  onDelete: (v: VenueRow) => void;
  /** Name to prefill when creating (from the search box). */
  draftName?: string;
}

/** Create or edit a room in a side sheet. People without `venues.manage` get a read-only view. */
export function VenueSheet({ venue, onClose, canManage, onDelete, draftName }: VenueSheetProps) {
  const open = venue !== null;
  const isNew = venue === 'new';
  const current = venue && venue !== 'new' ? venue : null;
  const confirm = useConfirm();
  const form = useZodForm(venueInput, { defaultValues: EMPTY });
  const { control, watch } = form;

  useEffect(() => {
    if (!open) return;
    form.reset(current ? toForm(current) : { ...EMPTY, name: draftName ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current?.id, current?.updatedAt]);

  const save = useAdminMutation({
    mutationFn: (body: VenueInput) => (current ? api.patch<Venue>(`/admin/venues/${current.id}`, body) : api.post<Venue>('/admin/venues', body)),
    invalidate: [adminKeys.venues.all],
    successMessage: (v) => (current ? `${v.name} is updated.` : `${v.name} is ready for Fridays.`),
    celebrate: !current,
    errorToast: (err) => (err.hasFieldErrors ? false : errorMessage(err)),
    onError: (err) => void applyApiErrorToForm(form, err),
    onSuccess: () => {
      form.reset(form.getValues());
      onClose();
    },
  });

  const submit = form.handleSubmit((values) => {
    const body = blankToNull(values as unknown as Record<string, unknown>, ['building', 'floor', 'address', 'mapsUrl', 'notes']) as unknown as VenueInput;
    save.mutate(body);
  });

  const requestClose = async () => {
    if (canManage && form.formState.isDirty && !save.isPending) {
      const ok = await confirm({
        title: 'Close without saving?',
        description: 'The changes in this room are not saved yet.',
        confirmLabel: 'Close anyway',
        cancelLabel: 'Keep editing',
        destructive: true,
      });
      if (!ok) return;
    }
    onClose();
  };

  const maps = watch('mapsUrl') ?? '';
  const mapsOk = maps && isHttpUrl(maps);
  const readOnly = !canManage;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) void requestClose();
      }}
      width="md"
      dismissible={!form.formState.isDirty}
      title={isNew ? 'New room' : current?.name ?? 'Room'}
      description={
        current ? (
          <span className="flex flex-wrap items-center gap-2">
            <Badge size="sm" tone={current.eventCount ? 'blue' : 'neutral'} shape="circle">
              {current.eventCount === 1 ? 'Used by 1 event' : `Used by ${current.eventCount ?? 0} events`}
            </Badge>
            {current.updatedAt ? (
              <span className="text-ink-3">
                Changed <DateText value={current.updatedAt} format="relative" />
              </span>
            ) : null}
          </span>
        ) : (
          'Rooms are reusable. Next Friday you can pick it straight from the list.'
        )
      }
      footer={
        canManage ? (
          <>
            <div className="flex gap-2 sm:contents">
              {current ? (
                <Button type="button" variant="danger-soft" icon={<Trash2 />} className="flex-1 sm:mr-auto sm:flex-none" onClick={() => onDelete(current)}>
                  Delete
                </Button>
              ) : null}
              <Button type="button" variant="ghost" className="flex-1 sm:flex-none" onClick={() => void requestClose()}>
                Cancel
              </Button>
            </div>
            <Button type="submit" form="venue-form" variant="primary" loading={save.isPending}>
              {isNew ? 'Add room' : 'Save room'}
            </Button>
          </>
        ) : (
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <ReadOnlyScope readOnly={readOnly}>
        <form
          id="venue-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-5"
        >
          <FormError errors={form.formState.errors} />
          {readOnly ? <p className="text-sm text-ink-3">Only people who manage rooms can change this. You can still pick it for your events.</p> : null}
          <FormField control={control} name="name" label="Name" required maxLength={120}>
            {(field) => <Input {...field} value={field.value ?? ''} placeholder="Theater Room, Building B" autoFocus={isNew} autoComplete="off" />}
          </FormField>
          <FormField control={control} name="kind" label="Kind">
            {(field) => (
              <Select<VenueKind> value={field.value} onValueChange={(v) => v && field.onChange(v)} options={KIND_OPTIONS} />
            )}
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField control={control} name="building" label="Building" optional maxLength={120}>
              {(field) => <Input {...field} value={field.value ?? ''} placeholder="Building B" />}
            </FormField>
            <FormField control={control} name="floor" label="Floor" optional maxLength={40}>
              {(field) => <Input {...field} value={field.value ?? ''} placeholder="3" />}
            </FormField>
          </div>
          <FormField control={control} name="capacity" label="Seats" optional hint="Used to warn you when registrations pass the room size.">
            {(field) => <NumberInput value={field.value ?? null} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} min={0} max={100000} unit="seats" steppers />}
          </FormField>
          <FormField control={control} name="address" label="Address" optional maxLength={300}>
            {(field) => <Textarea {...field} value={field.value ?? ''} autosize minRows={2} maxRows={4} placeholder="Jl. Veteran No. 8, Malang" />}
          </FormField>
          <FormField
            control={control}
            name="mapsUrl"
            label="Google Maps link"
            optional
            hint="Paste the share link. It helps first-timers find the door."
            action={
              mapsOk ? (
                <a
                  href={maps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md font-medium text-blue underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  Open <ExternalLink className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">the map in a new tab</span>
                </a>
              ) : null
            }
          >
            {(field) => <Input {...field} value={field.value ?? ''} inputMode="url" placeholder="https://maps.app.goo.gl/..." spellCheck={false} />}
          </FormField>
          <FormField control={control} name="notes" label="Notes for the crew" optional maxLength={1000} hint="Where the key lives, which HDMI works, that kind of thing.">
            {(field) => <Textarea {...field} value={field.value ?? ''} autosize minRows={3} maxRows={8} placeholder="Projector remote is in the top drawer." />}
          </FormField>
        </form>
      </ReadOnlyScope>
    </Sheet>
  );
}
