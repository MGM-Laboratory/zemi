'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PUBLICATION_TYPE_LABELS, VENUE_KINDS, venueInput, type Paginated, type SpeakerRef, type Venue, type VenueKind } from '@zemi/shared';
import { useState } from 'react';
import { useAbility } from '@/lib/admin/ability';
import { adminFetch, api, isApiError, errorMessage } from '@/lib/admin/api';
import { adminKeys } from '@/lib/admin/query-keys';
import { Button } from '../ui/button';
import { Combobox, type ComboOption } from '../ui/combobox';
import { Dialog } from '../ui/dialog';
import { Field } from '../ui/field';
import { Input, NumberInput } from '../ui/input';
import { Avatar } from '../ui/media';
import { Select } from '../ui/select';
import { notify } from '../ui/toast';
import { useReadOnly } from './read-only';

function unwrap<T>(res: T[] | Paginated<T> | { items: T[] } | null | undefined): T[] {
  if (!res) return [];
  return Array.isArray(res) ? res : (res.items ?? []);
}

/* ------------------------------------------------------------------ SpeakerPicker */

export function speakerOption(s: SpeakerRef): ComboOption<SpeakerRef> {
  return {
    value: s.id,
    label: s.fullName,
    description: [s.defaultPosition, s.defaultOrganization].filter(Boolean).join(', ') || s.headline || undefined,
    icon: <Avatar name={s.fullName} image={s.avatar} size={28} />,
    data: s,
  };
}

export interface SpeakerPickerProps {
  value: SpeakerRef | null;
  onChange: (speaker: SpeakerRef | null) => void;
  /** Speaker ids to hide (already on the event). */
  exclude?: string[];
  /**
   * Called with the typed name when someone picks "Add <name> as a new speaker". Only offered when
   * the ability has `speakers.create`. Return the created SpeakerRef to select it.
   */
  onCreate?: (name: string) => Promise<SpeakerRef | void> | SpeakerRef | void;
  placeholder?: string;
  readOnly?: boolean;
  clearable?: boolean;
  id?: string;
  className?: string;
}

/**
 * Search the speaker directory (GET /admin/speakers/lookup?q=). Shows avatars.
 * @example <SpeakerPicker value={row.speaker} onChange={(s) => setRow({ ...row, speaker: s })} onCreate={openNewSpeakerSheet} />
 */
export function SpeakerPicker({ value, onChange, exclude = [], onCreate, placeholder = 'Find a speaker', readOnly: ro, clearable, id, className }: SpeakerPickerProps) {
  const readOnly = useReadOnly(ro);
  const ability = useAbility();
  const canCreate = Boolean(onCreate) && ability.has('speakers.create');
  return (
    <Combobox<SpeakerRef>
      id={id}
      className={className}
      readOnly={readOnly}
      clearable={clearable}
      placeholder={placeholder}
      searchPlaceholder="Type a name"
      value={value?.id ?? null}
      selectedOption={value ? speakerOption(value) : null}
      onValueChange={(_, opt) => onChange(opt?.data ?? null)}
      loadOptions={async (q, signal) => {
        const res = await adminFetch<SpeakerRef[] | Paginated<SpeakerRef>>('/admin/speakers/lookup', { query: { q }, signal });
        return unwrap(res)
          .filter((s) => !exclude.includes(s.id))
          .map(speakerOption);
      }}
      emptyText="Nobody by that name yet."
      onCreate={
        canCreate
          ? async (name) => {
              const created = await onCreate!(name);
              if (created) onChange(created);
            }
          : undefined
      }
      createLabel={(q) => `Add "${q}" as a new speaker`}
    />
  );
}

/* ------------------------------------------------------------------ PublicationPicker */

export interface PublicationRef {
  id: string;
  slug?: string;
  title: string;
  type?: string | null;
  publishedYear?: number | null;
  containerTitle?: string | null;
}

export function publicationOption(p: PublicationRef): ComboOption<PublicationRef> {
  const type = p.type ? (PUBLICATION_TYPE_LABELS as Record<string, string>)[p.type] ?? p.type : null;
  return {
    value: p.id,
    label: p.title,
    description: [type, p.containerTitle, p.publishedYear].filter(Boolean).join(' · ') || undefined,
    data: p,
  };
}

export interface PublicationPickerProps {
  value: PublicationRef | null;
  onChange: (pub: PublicationRef | null) => void;
  exclude?: string[];
  /** Offer quick-create (POST /admin/publications/quick {title, url}). Needs `publications.create`. Default true. */
  allowQuickCreate?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  clearable?: boolean;
  id?: string;
  className?: string;
}

/**
 * Search publications (GET /admin/publications/lookup?q=) or quick-create a stub with a title
 * and link, so every paper mention links to /publications/[slug].
 */
export function PublicationPicker({ value, onChange, exclude = [], allowQuickCreate = true, placeholder = 'Find a paper or project', readOnly: ro, clearable, id, className }: PublicationPickerProps) {
  const readOnly = useReadOnly(ro);
  const ability = useAbility();
  const qc = useQueryClient();
  const [quick, setQuick] = useState<{ title: string; url: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCreate = allowQuickCreate && ability.has('publications.create');

  const create = async () => {
    if (!quick?.title.trim()) {
      setError('Give it a title first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<PublicationRef | { publication: PublicationRef }>('/admin/publications/quick', { title: quick.title.trim(), url: quick.url.trim() || null });
      const pub = 'publication' in res ? res.publication : res;
      void qc.invalidateQueries({ queryKey: adminKeys.publications.all });
      onChange(pub);
      notify.success('Added. You can fill in the rest later.', { celebrate: 'square' });
      setQuick(null);
    } catch (err) {
      setError(isApiError(err) && err.fieldErrors.url ? err.fieldErrors.url : errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Combobox<PublicationRef>
        id={id}
        className={className}
        readOnly={readOnly}
        clearable={clearable}
        placeholder={placeholder}
        searchPlaceholder="Type a title, DOI or keyword"
        value={value?.id ?? null}
        selectedOption={value ? publicationOption(value) : null}
        onValueChange={(_, opt) => onChange(opt?.data ?? null)}
        loadOptions={async (q, signal) => {
          const res = await adminFetch<PublicationRef[] | Paginated<PublicationRef>>('/admin/publications/lookup', { query: { q }, signal });
          return unwrap(res)
            .filter((p) => !exclude.includes(p.id))
            .map(publicationOption);
        }}
        emptyText="No publication matches that yet."
        onCreate={canCreate ? (q) => setQuick({ title: q, url: '' }) : undefined}
        createLabel={(q) => `Quick-add "${q}"`}
      />
      <Dialog
        open={Boolean(quick)}
        onOpenChange={(o) => !o && setQuick(null)}
        title="Quick-add a publication"
        description="Just a title and a link for now. It gets its own page, and you can fill in authors and details later."
        footer={
          <>
            <Button variant="ghost" onClick={() => setQuick(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void create()}>
              Add publication
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" required error={error && !error.includes('link') ? error : undefined}>
            <Input value={quick?.title ?? ''} onChange={(e) => setQuick((q) => (q ? { ...q, title: e.target.value } : q))} autoFocus maxLength={400} />
          </Field>
          <Field label="Link" optional hint="Publisher page, arXiv, DOI link or a PDF.">
            <Input value={quick?.url ?? ''} inputMode="url" placeholder="https://" onChange={(e) => setQuick((q) => (q ? { ...q, url: e.target.value } : q))} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ VenueSelect */

const KIND_LABEL: Record<VenueKind, string> = {
  classroom: 'Classroom',
  theater: 'Theater',
  lab: 'Lab',
  hall: 'Hall',
  online: 'Online',
  other: 'Other',
};

export function venueOption(v: Pick<Venue, 'id' | 'name' | 'kind' | 'building' | 'floor' | 'capacity'>): ComboOption<typeof v> {
  return {
    value: v.id,
    label: v.name,
    description: [KIND_LABEL[v.kind], v.building, v.floor ? `floor ${v.floor}` : null, v.capacity ? `${v.capacity} seats` : null].filter(Boolean).join(' · '),
    keywords: [v.building ?? '', v.kind],
    data: v,
  };
}

/** GET /admin/venues as a cached query (shared by every VenueSelect). */
export function useVenues(enabled = true) {
  return useQuery({
    queryKey: adminKeys.venues.list(),
    enabled,
    queryFn: async ({ signal }) => unwrap(await adminFetch<Venue[] | Paginated<Venue>>('/admin/venues', { query: { pageSize: 100 }, signal })),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export interface VenueSelectProps {
  value: string | null | undefined;
  onChange: (venueId: string | null, venue: Venue | null) => void;
  readOnly?: boolean;
  id?: string;
  className?: string;
}

/** Pick a room. People with `venues.manage` can add a new one inline. */
export function VenueSelect({ value, onChange, readOnly: ro, id, className }: VenueSelectProps) {
  const readOnly = useReadOnly(ro);
  const ability = useAbility();
  const qc = useQueryClient();
  const venues = useVenues();
  const [draft, setDraft] = useState<{ name: string; kind: VenueKind; building: string; floor: string; capacity: number | null; mapsUrl: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const canCreate = ability.has('venues.manage');
  const options = (venues.data ?? []).map((v) => venueOption(v) as ComboOption<Venue>);

  const save = async () => {
    if (!draft) return;
    const payload = {
      name: draft.name.trim(),
      kind: draft.kind,
      building: draft.building.trim() || null,
      floor: draft.floor.trim() || null,
      capacity: draft.capacity,
      mapsUrl: draft.mapsUrl.trim() || null,
    };
    const parsed = venueInput.safeParse(payload);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.path[0] === 'mapsUrl' ? 'That link looks off. It should start with https://' : i.path[0] === 'name' ? 'Give the room a name.' : i.message;
      setErrors(fe);
      return;
    }
    setSaving(true);
    try {
      const v = await api.post<Venue>('/admin/venues', parsed.data);
      await qc.invalidateQueries({ queryKey: adminKeys.venues.all });
      onChange(v.id, v);
      notify.success(`${v.name} is ready to use.`, { celebrate: 'arch' });
      setDraft(null);
    } catch (err) {
      if (isApiError(err) && err.hasFieldErrors) setErrors(err.fieldErrors);
      else notify.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Combobox<Venue>
        id={id}
        className={className}
        readOnly={readOnly}
        clearable
        placeholder={venues.isPending ? 'Loading rooms...' : 'Pick a room'}
        searchPlaceholder="Search rooms"
        value={value ?? null}
        options={options}
        onValueChange={(v, opt) => onChange(v, (opt?.data as Venue | undefined) ?? null)}
        emptyText={venues.isError ? 'Rooms did not load. Try again in a moment.' : 'No room by that name.'}
        onCreate={canCreate ? (q) => setDraft({ name: q, kind: 'classroom', building: '', floor: '', capacity: null, mapsUrl: '' }) : undefined}
        createLabel={(q) => `Add "${q}" as a new room`}
      />
      <Dialog
        open={Boolean(draft)}
        onOpenChange={(o) => {
          if (!o) {
            setDraft(null);
            setErrors({});
          }
        }}
        title="Add a room"
        description="Rooms are reusable. Next Friday you can pick it straight from the list."
        accent="green"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              Add room
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required error={errors.name} className="sm:col-span-2">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus maxLength={120} />
            </Field>
            <Field label="Kind">
              <Select value={draft.kind} onValueChange={(k) => k && setDraft({ ...draft, kind: k as VenueKind })} options={VENUE_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
            </Field>
            <Field label="Seats" optional error={errors.capacity}>
              <NumberInput value={draft.capacity} onChange={(n) => setDraft({ ...draft, capacity: n })} min={0} max={100000} unit="seats" />
            </Field>
            <Field label="Building" optional>
              <Input value={draft.building} onChange={(e) => setDraft({ ...draft, building: e.target.value })} maxLength={120} />
            </Field>
            <Field label="Floor" optional>
              <Input value={draft.floor} onChange={(e) => setDraft({ ...draft, floor: e.target.value })} maxLength={40} />
            </Field>
            <Field label="Maps link" optional error={errors.mapsUrl} hint="A Google Maps link helps first-timers find the door." className="sm:col-span-2">
              <Input value={draft.mapsUrl} inputMode="url" placeholder="https://maps.app.goo.gl/..." onChange={(e) => setDraft({ ...draft, mapsUrl: e.target.value })} />
            </Field>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
