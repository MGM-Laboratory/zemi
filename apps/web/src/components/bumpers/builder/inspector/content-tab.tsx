'use client';

import { BUMPER_KIND_META, type BumperRefKey } from '@zemi/shared';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/admin/cn';
import { ImageField, ImagesField } from '../pickers/image-picker';
import { personModeOf, PersonRef, SpeakerRef, SpeakersRef, TeamRef } from '../pickers/people';
import { EventRef, PublicationRef, RundownRef, ThreadsRef } from '../pickers/records';
import { useBuilder } from '../store';
import type { InspectorCtx } from './context';
import { FieldControl } from './field-control';
import { ItemsEditor } from './items-editor';
import { InspectorSection } from './ui';

function RefPicker({ refKey, ic }: { refKey: BumperRefKey; ic: InspectorCtx }) {
  const b = useBuilder();
  const { slide, data, canEdit } = ic;
  switch (refKey) {
    case 'event':
      return <EventRef ic={ic} />;
    case 'speaker':
      return <SpeakerRef ic={ic} />;
    case 'person':
      return <PersonRef ic={ic} />;
    case 'speakers':
      return <SpeakersRef ic={ic} />;
    case 'team':
      return <TeamRef ic={ic} />;
    case 'publication':
      return <PublicationRef ic={ic} />;
    case 'rundown':
      return <RundownRef ic={ic} />;
    case 'thread':
      return <ThreadsRef ic={ic} max={1} />;
    case 'threads':
      return <ThreadsRef ic={ic} max={3} />;
    case 'image':
      return (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-ink">Photo</p>
          <ImageField
            label="Photo"
            focusKey="ref:image"
            value={slide.refs.assetId}
            image={slide.refs.assetId ? (data.images[slide.refs.assetId] ?? null) : null}
            eventId={ic.eventId}
            readOnly={!canEdit}
            emptyLabel="Pick a photo"
            onChange={(id) => b.setRefs(slide.id, { assetId: id })}
          />
        </div>
      );
    case 'images':
      return (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-ink">Logos</p>
          <ImagesField label="Logos" focusKey="ref:images" value={slide.refs.assetIds ?? []} images={data.images} eventId={ic.eventId} readOnly={!canEdit} onChange={(ids) => b.setRefs(slide.id, { assetIds: ids })} />
        </div>
      );
    default:
      return null;
  }
}

/** Content: what the bumper is about (pickers per ref), its text fields, its list rows, and extra options. */
export function ContentTab({ ic, moreOpen, onMoreOpen }: { ic: InspectorCtx; moreOpen: boolean; onMoreOpen: (open: boolean) => void }) {
  const { slide, template } = ic;
  const refs = BUMPER_KIND_META[slide.kind].refs;
  // A typed name lives in the person picker, so the plain name and role fields step aside.
  const typedPerson = refs.includes('person') && personModeOf(slide) === 'name';
  const fields = template.fields.filter((f) => !(typedPerson && (f.key === 'name' || f.key === 'role')));
  const main = fields.filter((f) => f.group !== 'options');
  const more = fields.filter((f) => f.group === 'options');
  const overriddenMore = more.filter((f) => slide.fields[f.key] !== undefined && slide.fields[f.key] !== null && slide.fields[f.key] !== '').length;

  return (
    <div>
      {refs.length ? (
        <InspectorSection title="What it shows" description="Pick the records. Names, photos and titles stay in sync with their pages.">
          <div className="space-y-4">
            {refs.map((r) => (
              <RefPicker key={r} refKey={r} ic={ic} />
            ))}
          </div>
        </InspectorSection>
      ) : null}
      {main.length ? (
        <InspectorSection title="Text" description="Leave a field empty to use what's shown in grey.">
          <div className="space-y-4">
            {main.map((f) => (
              <FieldControl key={f.key} def={f} ic={ic} />
            ))}
          </div>
        </InspectorSection>
      ) : null}
      {template.items ? <ItemsEditor def={template.items} ic={ic} /> : null}
      {more.length ? (
        <section className="border-b border-line last:border-b-0">
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => onMoreOpen(!moreOpen)}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus sm:px-5"
          >
            <span className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] [font-variation-settings:'CASL'_0.2]">
              More options
              {overriddenMore ? <span className="ml-2 font-body text-xs font-medium text-blue">{overriddenMore} changed</span> : null}
            </span>
            <ChevronDown className={cn('size-4 text-ink-3 transition-transform', moreOpen && 'rotate-180')} />
          </button>
          {moreOpen ? (
            <div className="space-y-4 px-4 pb-5 sm:px-5">
              {more.map((f) => (
                <FieldControl key={f.key} def={f} ic={ic} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      {!refs.length && !fields.length && !template.items ? (
        <p className="px-5 py-6 text-sm text-ink-3">Nothing to fill in on this one. Add text, images or QR codes from the canvas toolbar, and style it in Style.</p>
      ) : null}
    </div>
  );
}

/** Open the "More options" group when a field inside it is asked for. */
export function isOptionField(ic: InspectorCtx, key: string): boolean {
  return ic.template.fields.some((f) => f.key === key && f.group === 'options');
}
