'use client';

import type { BumperPublicationData, BumperThreadData } from '@zemi/shared';
import { MessageCircle, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { Combobox, type ComboOption } from '@/components/admin/ui/combobox';
import { Callout } from '@/components/admin/ui/feedback';
import { Field } from '@/components/admin/ui/field';
import { Select } from '@/components/admin/ui/select';
import { notify } from '@/components/admin/ui/toast';
import { bumpersApi } from '../../api';
import { EventPicker, eventPickLabel } from '../../library/event-picker';
import type { InspectorCtx } from '../inspector/context';
import { useBuilder } from '../store';
import { OrderedPicks } from './ordered-picks';

/** The Friday a slide is about. Empty follows the show's event. */
export function EventRef({ ic }: { ic: InspectorCtx }) {
  const b = useBuilder();
  const { slide, data, canEdit, showEventId } = ic;
  const [busy, setBusy] = useState(false);
  const id = slide.refs.eventId ?? null;
  const ev = id ? data.events[id] : undefined;
  const showEvent = showEventId ? data.events[showEventId] : undefined;
  const hint = id ? 'Only this bumper. Clear it to follow the show again.' : showEvent ? `Follows the show: ${eventPickLabel(showEvent)}.` : 'Pick the Friday this bumper is about.';
  return (
    <Field label="Event" hint={hint}>
      <div data-focus="ref:event">
        <EventPicker
          value={id}
          selected={ev ?? null}
          clearable
          placeholder={showEvent ? eventPickLabel(showEvent) : 'Pick a Friday'}
          aria-label="Event"
          onChange={async (next) => {
            if (!canEdit) return;
            if (!next) return b.setRefs(slide.id, { eventId: null });
            if (!data.events[next]) {
              setBusy(true);
              try {
                b.mergeData(await bumpersApi.resolve({ eventIds: [next] }));
              } catch (err) {
                notify.error(err);
                return;
              } finally {
                setBusy(false);
              }
            }
            b.setRefs(slide.id, { eventId: next === showEventId ? null : next });
          }}
        />
      </div>
      {busy ? <p className="text-xs text-ink-3">Loading that Friday...</p> : null}
    </Field>
  );
}

function pubOption(p: BumperPublicationData): ComboOption<BumperPublicationData> {
  return { value: p.id, label: p.title, description: [p.typeLabel, p.containerTitle, p.publishedYear].filter(Boolean).join(' · ') || undefined, data: p };
}

/** A paper or project. The event's papers come first. */
export function PublicationRef({ ic }: { ic: InspectorCtx }) {
  const b = useBuilder();
  const { slide, data, canEdit } = ic;
  const id = slide.refs.publicationId ?? null;
  const rec = id ? data.publications[id] : undefined;
  return (
    <Field label="Paper" hint={ic.ctx.event ? "This Friday's papers come first." : undefined}>
      <div data-focus="ref:publication">
        <Combobox<BumperPublicationData>
          value={id}
          selectedOption={rec ? pubOption(rec) : null}
          onValueChange={(v, o) => {
            if (o?.data) b.mergeData({ publications: { [o.data.id]: o.data } });
            b.setRefs(slide.id, { publicationId: v });
          }}
          loadOptions={async (q, signal) => (await bumpersApi.sources.publications({ q: q.trim() || undefined, eventId: ic.eventId ?? undefined, limit: 20 }, signal)).map(pubOption)}
          placeholder="Pick a paper"
          searchPlaceholder="Search papers and projects"
          emptyText="No paper by that title."
          clearable
          readOnly={!canEdit}
        />
      </div>
    </Field>
  );
}

const AUTO = '__auto';

/** One agenda item from the event rundown, stored as index + time + agenda (rows are recreated on every save). */
export function RundownRef({ ic }: { ic: InspectorCtx }) {
  const b = useBuilder();
  const { slide, ctx, canEdit } = ic;
  const ref = slide.refs.rundown ?? null;
  const found = ctx.rundownItem;
  const lost = !!ref && !found;
  if (!ctx.rundown.length) {
    return (
      <Field label="Agenda item">
        <p className="rounded-2xl border border-dashed border-line-strong px-3 py-2.5 text-sm text-ink-3" data-focus="ref:rundown">
          {ctx.event ? 'This Friday has no rundown yet. Add it on the event page and the items show up here.' : 'Pick an event first, then one of its agenda items.'}
        </p>
      </Field>
    );
  }
  return (
    <Field label="Agenda item" hint={ref ? undefined : 'Auto picks what comes next by the clock.'}>
      <div data-focus="ref:rundown" className="space-y-2">
        <Select
          value={found ? String(found.index) : ref ? null : AUTO}
          onValueChange={(v) => {
            if (!v || v === AUTO) return b.setRefs(slide.id, { rundown: null });
            const item = ctx.rundown[Number(v)];
            if (item) b.setRefs(slide.id, { rundown: { index: item.index, time: item.time, agenda: item.agenda } });
          }}
          placeholder="Pick an agenda item"
          readOnly={!canEdit}
          options={[
            { value: AUTO, label: 'Auto', description: 'What comes next by the clock' },
            ...ctx.rundown.map((r) => ({ value: String(r.index), label: `${r.time}  ${r.agenda}`, textValue: `${r.time} ${r.agenda}`, description: r.speaker?.name })),
          ]}
        />
        {lost ? (
          <Callout tone="yellow" title="That agenda item is gone">
            It was &ldquo;{ref.agenda || ref.time}&rdquo;. Pick the one it became, or Auto.
          </Callout>
        ) : null}
      </div>
    </Field>
  );
}

function threadRow(t: BumperThreadData | undefined) {
  if (!t) return { label: 'A question that is gone', description: 'It was deleted or hidden.' };
  return {
    label: t.title,
    description: t.authorLabel,
    meta: (
      <span className="mono inline-flex items-center gap-2 text-xs text-ink-3 tabular-nums">
        <span className="inline-flex items-center gap-0.5" title={`${t.score} votes`}>
          <ThumbsUp className="size-3" aria-hidden="true" />
          {t.score}
        </span>
        <span className="inline-flex items-center gap-0.5" title={`${t.commentCount} comments`}>
          <MessageCircle className="size-3" aria-hidden="true" />
          {t.commentCount}
        </span>
      </span>
    ),
  };
}

/** Questions from the discussion page (up to 3, or 1 for a single-question template). */
export function ThreadsRef({ ic, max }: { ic: InspectorCtx; max: number }) {
  const b = useBuilder();
  const { slide, data, canEdit } = ic;
  const ids = slide.refs.threadIds ?? [];
  return (
    <Field label={max === 1 ? 'Question' : 'Questions'} hint={ids.length ? 'Drag to change the order.' : "Empty shows the event's top voted question."}>
      <OrderedPicks<BumperThreadData>
        label={max === 1 ? 'Question' : 'Questions'}
        focusKey="ref:threads"
        ids={ids}
        max={max}
        row={(id) => threadRow(data.threads[id])}
        onChange={(next) => b.setRefs(slide.id, { threadIds: next })}
        onAdd={(id, rec) => {
          if (rec) b.mergeData({ threads: { [id]: rec } });
          b.setRefs(slide.id, { threadIds: [...ids, id] });
        }}
        loadOptions={async (q, signal) =>
          (await bumpersApi.sources.threads({ q: q.trim() || undefined, eventId: ic.eventId ?? undefined, limit: 20 }, signal)).map((t) => ({
            value: t.id,
            label: t.title,
            description: `${t.authorLabel} · ${t.score} ${t.score === 1 ? 'vote' : 'votes'} · ${t.commentCount} ${t.commentCount === 1 ? 'reply' : 'replies'}`,
            data: t,
          }))
        }
        addPlaceholder={ids.length ? 'Add another question' : 'Pick a question'}
        searchPlaceholder="Search the discussion"
        emptyText="No question matches that."
        readOnly={!canEdit}
      />
    </Field>
  );
}
