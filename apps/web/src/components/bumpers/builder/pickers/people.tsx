'use client';

import type { BumperSlide, BumperSpeakerData, BumperTeamData } from '@zemi/shared';
import { useRef, useState } from 'react';
import { Combobox, type ComboOption } from '@/components/admin/ui/combobox';
import { Field } from '@/components/admin/ui/field';
import { Input } from '@/components/admin/ui/input';
import { Avatar } from '@/components/admin/ui/media';
import { SegmentedControl } from '@/components/admin/ui/toggles';
import { bumpersApi } from '../../api';
import type { InspectorCtx } from '../inspector/context';
import { useBuilder } from '../store';
import { OrderedPicks } from './ordered-picks';

const ROLE_LABEL: Record<string, string> = { keynote: 'Keynote', moderator: 'Moderator', panelist: 'Panelist', speaker: 'Speaker' };

function speakerOption(s: BumperSpeakerData, role?: string | null): ComboOption<BumperSpeakerData> {
  return {
    value: s.id,
    label: s.fullName,
    description: [role ? ROLE_LABEL[role] ?? role : null, s.organization ?? s.headline].filter(Boolean).join(' · ') || undefined,
    icon: <Avatar name={s.fullName} image={s.avatar} size={24} />,
    keywords: [s.nickname ?? '', s.organization ?? ''],
    data: s,
  };
}

function teamOption(t: BumperTeamData): ComboOption<BumperTeamData> {
  return { value: t.id, label: t.name, description: t.role ?? undefined, icon: <Avatar name={t.name} image={t.avatar} size={24} />, data: t };
}

async function loadSpeakers(q: string, signal: AbortSignal, ic: InspectorCtx) {
  const list = await bumpersApi.sources.speakers({ q: q.trim() || undefined, eventId: ic.eventId ?? undefined, limit: 20 }, signal);
  const roles = new Map((ic.ctx.event?.speakers ?? []).map((s) => [s.speakerId, s.role]));
  return list.map((s) => speakerOption(s, roles.get(s.id)));
}

async function loadTeam(q: string, signal: AbortSignal) {
  return (await bumpersApi.sources.team({ q: q.trim() || undefined, limit: 30 }, signal)).map(teamOption);
}

/** One speaker (keynote, speaker, talk title, thank-you). */
export function SpeakerRef({ ic }: { ic: InspectorCtx }) {
  const b = useBuilder();
  const { slide, data, canEdit } = ic;
  const id = slide.refs.speakerId ?? null;
  const rec = id ? data.speakers[id] : undefined;
  return (
    <Field label="Speaker" hint={ic.ctx.event ? "Today's lineup comes first." : undefined}>
      <div data-focus="ref:speaker">
        <Combobox<BumperSpeakerData>
          value={id}
          selectedOption={rec ? speakerOption(rec) : null}
          onValueChange={(v, o) => {
            if (o?.data) b.mergeData({ speakers: { [o.data.id]: o.data } });
            b.setRefs(slide.id, { speakerId: v, teamMemberId: null });
          }}
          loadOptions={(q, signal) => loadSpeakers(q, signal, ic)}
          placeholder="Pick a speaker"
          searchPlaceholder="Search speakers"
          emptyText="Nobody by that name."
          clearable
          readOnly={!canEdit}
        />
      </div>
    </Field>
  );
}

type PersonMode = 'speaker' | 'team' | 'name';

/** Which kind of person a slide is about right now. */
export function personModeOf(slide: BumperSlide): PersonMode | null {
  if (slide.refs.speakerId) return 'speaker';
  if (slide.refs.teamMemberId) return 'team';
  if (typeof slide.fields.name === 'string' && slide.fields.name.trim()) return 'name';
  return null;
}

/** A host, opener, award winner or quote author: a speaker, a team member, or a typed name. */
export function PersonRef({ ic }: { ic: InspectorCtx }) {
  const b = useBuilder();
  const { slide, data, canEdit } = ic;
  const [chosen, setChosen] = useState<PersonMode>('speaker');
  const mode = personModeOf(slide) ?? chosen;
  const nameRef = useRef<HTMLInputElement>(null);
  const speaker = slide.refs.speakerId ? data.speakers[slide.refs.speakerId] : undefined;
  const team = slide.refs.teamMemberId ? data.team[slide.refs.teamMemberId] : undefined;

  const switchTo = (m: PersonMode) => {
    setChosen(m);
    if (m === mode) return;
    if (m === 'name') {
      b.setRefs(slide.id, { speakerId: null, teamMemberId: null });
      requestAnimationFrame(() => nameRef.current?.focus());
    } else if (m === 'speaker') b.setRefs(slide.id, { teamMemberId: null });
    else b.setRefs(slide.id, { speakerId: null });
  };

  return (
    <div className="space-y-2.5" data-focus="ref:person">
      <SegmentedControl<PersonMode>
        aria-label="Who is it"
        size="sm"
        fullWidth
        value={mode}
        onValueChange={canEdit ? switchTo : () => undefined}
        options={[
          { value: 'speaker', label: 'Speaker' },
          { value: 'team', label: 'Team' },
          { value: 'name', label: 'Type a name' },
        ]}
      />
      {mode === 'speaker' ? (
        <Combobox<BumperSpeakerData>
          aria-label="Speaker"
          value={slide.refs.speakerId ?? null}
          selectedOption={speaker ? speakerOption(speaker) : null}
          onValueChange={(v, o) => {
            if (o?.data) b.mergeData({ speakers: { [o.data.id]: o.data } });
            b.setRefs(slide.id, { speakerId: v, teamMemberId: null });
          }}
          loadOptions={(q, signal) => loadSpeakers(q, signal, ic)}
          placeholder="Pick a speaker"
          searchPlaceholder="Search speakers"
          emptyText="Nobody by that name."
          clearable
          readOnly={!canEdit}
        />
      ) : mode === 'team' ? (
        <Combobox<BumperTeamData>
          aria-label="Team member"
          value={slide.refs.teamMemberId ?? null}
          selectedOption={team ? teamOption(team) : null}
          onValueChange={(v, o) => {
            if (o?.data) b.mergeData({ team: { [o.data.id]: o.data } });
            b.setRefs(slide.id, { teamMemberId: v, speakerId: null });
          }}
          loadOptions={loadTeam}
          placeholder="Pick a team member"
          searchPlaceholder="Search the team"
          emptyText="No one on the team page by that name."
          clearable
          readOnly={!canEdit}
        />
      ) : (
        <div className="grid gap-2">
          <Field label="Name" hideLabel>
            <Input ref={nameRef} placeholder="Name, like Dr. Rani Kusuma" maxLength={120} value={typeof slide.fields.name === 'string' ? slide.fields.name : ''} readOnly={!canEdit} onChange={(e) => b.setField(slide.id, 'name', e.target.value)} />
          </Field>
          <Field label="Role" hideLabel>
            <Input placeholder="Role, like Head of the lab" maxLength={160} value={typeof slide.fields.role === 'string' ? slide.fields.role : ''} readOnly={!canEdit} onChange={(e) => b.setField(slide.id, 'role', e.target.value)} />
          </Field>
        </div>
      )}
      <p className="text-xs text-ink-3">
        {mode === 'name' ? 'For someone without a profile. The role line is optional.' : mode === 'team' ? 'From the published team page.' : 'Name, photo and role come from their profile, so edits there show up here.'}
      </p>
    </div>
  );
}

/** Panel: 2 to 6 people, in order. */
export function SpeakersRef({ ic }: { ic: InspectorCtx }) {
  const b = useBuilder();
  const { slide, data, canEdit } = ic;
  const ids = slide.refs.speakerIds ?? [];
  const roles = new Map((ic.ctx.event?.speakers ?? []).map((s) => [s.speakerId, s.role]));
  return (
    <Field label="People on stage" hint={ids.length ? 'Drag to change the order on screen.' : 'Empty uses the lineup panelists. Pick up to 6.'}>
      <OrderedPicks<BumperSpeakerData>
        label="People on stage"
        focusKey="ref:speakers"
        ids={ids}
        max={6}
        row={(id) => {
          const s = data.speakers[id];
          const role = roles.get(id);
          return s ? { label: s.fullName, description: s.organization ?? s.headline ?? undefined, icon: <Avatar name={s.fullName} image={s.avatar} size={28} />, meta: role ? <span className="text-xs text-ink-3">{ROLE_LABEL[role] ?? role}</span> : undefined } : { label: 'Removed speaker', description: 'Their profile is gone.' };
        }}
        onChange={(next) => b.setRefs(slide.id, { speakerIds: next })}
        onAdd={(id, rec) => {
          if (rec) b.mergeData({ speakers: { [id]: rec } });
          b.setRefs(slide.id, { speakerIds: [...ids, id] });
        }}
        loadOptions={(q, signal) => loadSpeakers(q, signal, ic)}
        addPlaceholder="Add a person"
        searchPlaceholder="Search speakers"
        emptyText="Nobody by that name."
        readOnly={!canEdit}
      />
    </Field>
  );
}

/** Credits: the organizers, in order. */
export function TeamRef({ ic }: { ic: InspectorCtx }) {
  const b = useBuilder();
  const { slide, data, canEdit } = ic;
  const ids = slide.refs.teamMemberIds ?? [];
  return (
    <Field label="Organizers" hint={ids.length ? 'Drag to change the order.' : 'Empty uses everyone on the published team page.'}>
      <OrderedPicks<BumperTeamData>
        label="Organizers"
        focusKey="ref:team"
        ids={ids}
        max={30}
        row={(id) => {
          const t = data.team[id];
          return t ? { label: t.name, description: t.role ?? undefined, icon: <Avatar name={t.name} image={t.avatar} size={28} /> } : { label: 'Removed team member' };
        }}
        onChange={(next) => b.setRefs(slide.id, { teamMemberIds: next })}
        onAdd={(id, rec) => {
          if (rec) b.mergeData({ team: { [id]: rec } });
          b.setRefs(slide.id, { teamMemberIds: [...ids, id] });
        }}
        loadOptions={loadTeam}
        addPlaceholder="Add a team member"
        searchPlaceholder="Search the team"
        emptyText="No one on the team page by that name."
        readOnly={!canEdit}
      />
    </Field>
  );
}
