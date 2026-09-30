'use client';

import type { BumperPersonPick } from '@zemi/shared';
import { useState } from 'react';
import { Combobox, type ComboOption } from '@/components/admin/ui/combobox';
import { Field } from '@/components/admin/ui/field';
import { Input } from '@/components/admin/ui/input';
import { Avatar } from '@/components/admin/ui/media';
import { Select } from '@/components/admin/ui/select';
import { bumpersApi } from '../api';

type Mode = BumperPersonPick['mode'];

const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'auto', label: 'Pick for me' },
  { value: 'speaker', label: 'A speaker' },
  { value: 'team', label: 'A team member' },
  { value: 'name', label: 'Type a name' },
  { value: 'none', label: 'Nobody, skip it' },
];

export interface PersonPickFieldProps {
  label: string;
  /** What "Pick for me" does, in plain words. */
  autoHint: string;
  value: BumperPersonPick;
  onChange: (pick: BumperPersonPick) => void;
  /** The event, so its lineup comes first in the speaker search. */
  eventId: string | null;
}

/** Who a person card is about: picked for me, a speaker, a team member, a typed name, or nobody. */
export function PersonPickField({ label, autoHint, value, onChange, eventId }: PersonPickFieldProps) {
  const [picked, setPicked] = useState<ComboOption | null>(null);
  const hint =
    value.mode === 'auto'
      ? autoHint
      : value.mode === 'none'
        ? 'No card for this one.'
        : value.mode === 'name'
          ? 'For someone without a profile. The role line is optional.'
          : value.mode === 'speaker'
            ? "Today's lineup comes first."
            : 'From the published team page.';

  return (
    <div className="space-y-2">
      <Field label={label} hint={hint}>
        <Select<Mode>
          value={value.mode}
          onValueChange={(mode) => {
            setPicked(null);
            onChange({ mode: mode ?? 'auto', id: null, name: null, role: null });
          }}
          options={MODES}
        />
      </Field>
      {value.mode === 'speaker' ? (
        <Combobox
          aria-label={`${label}: speaker`}
          value={value.id ?? null}
          selectedOption={picked}
          onValueChange={(id, o) => {
            setPicked(o);
            onChange({ ...value, id });
          }}
          loadOptions={async (q, signal) =>
            (await bumpersApi.sources.speakers({ q: q.trim() || undefined, eventId: eventId ?? undefined, limit: 20 }, signal)).map((s) => ({
              value: s.id,
              label: s.fullName,
              description: s.organization ?? s.headline ?? undefined,
              icon: <Avatar name={s.fullName} image={s.avatar} size={24} />,
            }))
          }
          placeholder="Pick a speaker"
          searchPlaceholder="Search speakers"
          emptyText="Nobody by that name."
        />
      ) : value.mode === 'team' ? (
        <Combobox
          aria-label={`${label}: team member`}
          value={value.id ?? null}
          selectedOption={picked}
          onValueChange={(id, o) => {
            setPicked(o);
            onChange({ ...value, id });
          }}
          loadOptions={async (q, signal) =>
            (await bumpersApi.sources.team({ q: q.trim() || undefined, limit: 30 }, signal)).map((t) => ({
              value: t.id,
              label: t.name,
              description: t.role ?? undefined,
              icon: <Avatar name={t.name} image={t.avatar} size={24} />,
            }))
          }
          placeholder="Pick a team member"
          searchPlaceholder="Search the team"
          emptyText="No one on the team page by that name."
        />
      ) : value.mode === 'name' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input aria-label={`${label}: name`} placeholder="Name" maxLength={160} value={value.name ?? ''} onChange={(e) => onChange({ ...value, name: e.target.value })} />
          <Input aria-label={`${label}: role`} placeholder="Role, like Head of the lab" maxLength={160} value={value.role ?? ''} onChange={(e) => onChange({ ...value, role: e.target.value })} />
        </div>
      ) : null}
    </div>
  );
}
