'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BUMPER_CATEGORIES,
  BUMPER_CATEGORY_META,
  BUMPER_KIND_META,
  BUMPER_KINDS,
  BUMPER_MAX_SLIDES,
  type BumperCategory,
  type BumperData,
  type BumperKind,
  type BumperPublicationData,
  type BumperSlide,
  type BumperSpeakerData,
} from '@zemi/shared';
import { ArrowLeft, Layers, Search, Sparkles } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/admin/ui/button';
import { Combobox, type ComboOption } from '@/components/admin/ui/combobox';
import { Dialog } from '@/components/admin/ui/dialog';
import { EmptyState } from '@/components/admin/ui/feedback';
import { Input } from '@/components/admin/ui/input';
import { Avatar } from '@/components/admin/ui/media';
import { cn } from '@/lib/admin/cn';
import { useMediaQuery, usePrefersReducedMotion } from '@/lib/admin/hooks';
import { bumperKeys, bumpersApi, mergeData } from '../api';
import type { TemplatePreset } from '../engine/types';
import { slideTitle } from '../library/labels';
import { getTemplate } from '../templates';
import { cloneSlides, newSlide, SLIDE_BLOCKS, type SlideBlock } from './factory';
import { useBuilder, useBuilderUi, type BuilderDoc } from './store';
import { BumperThumb } from './thumb';

type Section = 'all' | 'blocks' | BumperCategory;

/* ---------------------------------------------------------------- smart refs */

/**
 * Refs a new bumper gets from the show itself, so the gallery preview shows real people and the
 * inserted bumper matches it: the next lineup speaker for a speaker card, the speaker just before
 * for their thank-you or paper, the moderator for the host. Only records already in the bundle.
 */
export function suggestRefs(kind: BumperKind, doc: BuilderDoc, data: BumperData, at: number): BumperSlide['refs'] {
  const event = doc.eventId ? data.events[doc.eventId] : undefined;
  const lineup = (event?.speakers ?? []).filter((s) => data.speakers[s.speakerId]);
  const before = doc.slides.slice(0, at).reverse();
  const lastSpeaker = before.find((s) => s.refs.speakerId && data.speakers[s.refs.speakerId])?.refs.speakerId ?? null;
  const talker = (roles: string[]) => {
    const used = new Set(doc.slides.filter((s) => s.kind === kind).map((s) => s.refs.speakerId));
    const pool = lineup.filter((s) => roles.includes(s.role));
    return (pool.find((s) => !used.has(s.speakerId)) ?? pool[0])?.speakerId ?? null;
  };
  switch (kind) {
    case 'speaker':
      return withSpeaker(talker(['speaker', 'keynote']));
    case 'keynote':
      return withSpeaker(talker(['keynote']) ?? talker(['speaker']));
    case 'talk-title':
    case 'thanks-speaker':
    case 'quote':
    case 'lower-third':
      return withSpeaker(lastSpeaker ?? talker(['speaker', 'keynote']));
    case 'mc':
      return withSpeaker(lineup.find((s) => s.role === 'moderator')?.speakerId ?? null);
    case 'paper': {
      const pubs = (event?.publicationIds ?? []).map((id) => data.publications[id]).filter((p): p is BumperPublicationData => !!p);
      const all = pubs.length ? pubs : Object.values(data.publications);
      const theirs = lastSpeaker ? all.find((p) => p.authors.some((a) => a.speakerId === lastSpeaker)) : undefined;
      const pub = theirs ?? all[0];
      return pub ? { publicationId: pub.id, ...(theirs && lastSpeaker ? { speakerId: lastSpeaker } : {}) } : {};
    }
    default:
      return {};
  }
}

const withSpeaker = (id: string | null): BumperSlide['refs'] => (id ? { speakerId: id } : {});

interface Entry {
  kind: BumperKind;
  label: string;
  description: string;
  category: BumperCategory;
  presets: TemplatePreset[];
  words: string;
}

const ENTRIES: Entry[] = BUMPER_KINDS.map((kind) => {
  const meta = BUMPER_KIND_META[kind];
  const presets = getTemplate(kind).presets ?? [];
  return {
    kind,
    label: meta.label,
    description: meta.description,
    category: meta.category,
    presets,
    words: [kind, meta.label, meta.description, BUMPER_CATEGORY_META[meta.category].label, ...presets.map((p) => `${p.label} ${p.description ?? ''}`)].join(' ').toLowerCase(),
  };
});

const matches = (words: string, q: string) => q.split(/\s+/).every((w) => words.includes(w));

/* ---------------------------------------------------------------- dialog */

/** "Add a bumper": every template rendered with this show's data and theme, presets, and multi-bumper blocks. */
export function BuilderGallery() {
  const { galleryAt, closeGallery } = useBuilderUi();
  const { state } = useBuilder();
  const open = galleryAt !== null;
  const at = Math.min(galleryAt ?? 0, state.doc.slides.length);
  const prev = at > 0 ? state.doc.slides[at - 1] : null;
  const where = !state.doc.slides.length
    ? 'The first bumper of the show.'
    : at >= state.doc.slides.length
      ? 'It goes at the end.'
      : prev
        ? `It goes in at ${at + 1}, after "${slideTitle(prev, state.doc.theme, state.data, state.doc.eventId)}".`
        : 'It goes first.';
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? null : closeGallery())}
      title="Add a bumper"
      description={where}
      size="full"
      className="h-[calc(100dvh-1rem)] sm:h-[min(60rem,calc(100dvh-4rem))]"
      bodyClassName="flex min-h-0 flex-1 flex-col p-0 sm:p-0 lg:flex-row"
    >
      {open ? <GalleryBody at={at} onDone={closeGallery} /> : null}
    </Dialog>
  );
}

function GalleryBody({ at, onDone }: { at: number; onDone: () => void }) {
  const { state, insertSlides, mergeData: merge } = useBuilder();
  const [section, setSection] = useState<Section>('all');
  const [query, setQuery] = useState('');
  const [block, setBlock] = useState<SlideBlock | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const toTop = () => scroller.current?.scrollTo({ top: 0 });
  const full = state.doc.slides.length >= BUMPER_MAX_SLIDES;
  const room = BUMPER_MAX_SLIDES - state.doc.slides.length;
  // Type to search straight away with a keyboard; phones keep their keyboard down until asked.
  const fine = useMediaQuery('(hover: hover) and (pointer: fine)');

  const insert = (slides: BumperSlide[], records?: Partial<BumperData>) => {
    if (slides.length > room) return;
    if (records) merge(records);
    insertSlides(at, slides);
    onDone();
  };

  const nav: Array<{ key: Section; label: string; count: number }> = [
    { key: 'all', label: 'Everything', count: ENTRIES.length + SLIDE_BLOCKS.length },
    { key: 'blocks', label: 'Blocks', count: SLIDE_BLOCKS.length },
    ...BUMPER_CATEGORIES.map((c) => ({ key: c as Section, label: BUMPER_CATEGORY_META[c].label, count: ENTRIES.filter((e) => e.category === c).length })),
  ];

  if (block) return <SpeakerBlockStep block={block} at={at} room={room} onBack={() => setBlock(null)} onInsert={insert} />;

  const shownEntries = ENTRIES.filter((e) => (q ? matches(e.words, q) : section === 'all' || section === e.category));
  const shownBlocks = SLIDE_BLOCKS.filter((b) => (q ? matches(`${b.label} ${b.description} block`.toLowerCase(), q) : section === 'all' || section === 'blocks'));
  const groups = (q || section === 'all' ? BUMPER_CATEGORIES : BUMPER_CATEGORIES.filter((c) => c === section)).map((c) => ({ c, list: shownEntries.filter((e) => e.category === c) })).filter((g) => g.list.length);

  return (
    <>
      <nav aria-label="Kinds of bumpers" className="shrink-0 border-b border-line lg:w-60 lg:border-r lg:border-b-0">
        <ul className="no-scrollbar flex gap-1 overflow-x-auto px-5 py-2.5 sm:px-6 lg:flex-col lg:overflow-visible lg:px-3 lg:py-4">
          {nav.map((n) => {
            const on = !q && section === n.key;
            return (
              <li key={n.key} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setSection(n.key);
                    setQuery('');
                    toTop();
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-full px-3 py-1.5 text-left text-sm whitespace-nowrap transition-colors lg:rounded-xl lg:px-3 lg:py-2',
                    'focus-visible:outline-2 focus-visible:outline-focus',
                    on ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-muted hover:text-ink',
                  )}
                >
                  {n.key === 'blocks' ? <Layers className="size-4 shrink-0" aria-hidden="true" /> : null}
                  <span className="flex-1">{n.label}</span>
                  <span className={cn('mono text-[0.6875rem] tabular-nums', on ? 'text-white/70' : 'text-ink-4')}>{n.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 px-5 pt-3 pb-3 sm:px-6 lg:pt-4">
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              toTop();
            }}
            leading={<Search />}
            placeholder="Search: speaker, coffee, QR, prayer..."
            aria-label="Search templates"
            autoFocus={fine}
            wrapperClassName="max-w-xl"
          />
          {full ? <p className="mt-2 text-sm text-red-600">This show is full ({BUMPER_MAX_SLIDES} bumpers). Remove one to add another.</p> : null}
        </div>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 sm:px-6">
          {!shownEntries.length && !shownBlocks.length ? (
            <EmptyState
              size="sm"
              title={`Nothing called "${query.trim()}".`}
              description="Try speaker, coffee, questions or photo."
              cast={[
                { shape: 'circle', mood: 'look', size: 40, lookAt: { x: 0.8, y: -0.2 } },
                { shape: 'square', mood: 'sleep', size: 44 },
              ]}
            />
          ) : null}
          {shownBlocks.length ? (
            <section className="mb-7" aria-labelledby="gallery-blocks">
              <SectionHead id="gallery-blocks" title="Blocks" hint="A few bumpers that belong together, added in one go." />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {shownBlocks.map((b) => (
                  <BlockCard key={b.key} block={b} at={at} disabled={full} onPick={() => (b.needs === 'speaker' ? setBlock(b) : insert(b.build({})))} />
                ))}
              </div>
            </section>
          ) : null}
          {groups.map(({ c, list }) => (
            <section key={c} className="mb-7" aria-labelledby={`gallery-${c}`}>
              <SectionHead id={`gallery-${c}`} title={BUMPER_CATEGORY_META[c].label} hint={BUMPER_CATEGORY_META[c].hint} />
              <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {list.map((e) => (
                  <TemplateCard key={e.kind} entry={e} at={at} disabled={full} onInsert={(s) => insert([s])} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

function SectionHead({ id, title, hint }: { id: string; title: string; hint: string }) {
  return (
    <div className="sticky top-0 z-[1] -mx-1 mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 bg-white/95 px-1 py-2 backdrop-blur-sm">
      <h3 id={id} className="font-display text-base font-extrabold tracking-[-0.01em] text-ink [font-variation-settings:'CASL'_0.2]">
        {title}
      </h3>
      <p className="text-[0.8125rem] text-ink-3">{hint}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- one template */

function TemplateCard({ entry, at, disabled, onInsert }: { entry: Entry; at: number; disabled: boolean; onInsert: (slide: BumperSlide) => void }) {
  const { state } = useBuilder();
  const { doc, data } = state;
  const fine = useMediaQuery('(hover: hover) and (pointer: fine)');
  const reduce = usePrefersReducedMotion();
  const [hover, setHover] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);
  // One preview per preset, built once per gallery open (the ids are throwaway).
  const previews = useMemo(() => {
    const refs = suggestRefs(entry.kind, doc, data, at);
    const map = new Map<string, BumperSlide>();
    map.set('', newSlide(entry.kind, { overrides: { refs } }));
    for (const p of entry.presets) map.set(p.key, newSlide(entry.kind, { preset: p, overrides: { refs: { ...refs, ...(p.slide.refs ?? {}) } } }));
    return map;
  }, [entry, doc, data, at]);
  const shown = previews.get(peek ?? '') ?? previews.get('')!;
  const live = hover && fine && !reduce;
  const add = (key: string) => onInsert(cloneSlides([previews.get(key) ?? previews.get('')!])[0]!);
  const peekPreset = entry.presets.find((p) => p.key === peek);

  return (
    <div
      className="group min-w-0"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => {
        setHover(false);
        setPeek(null);
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => add(peek ?? '')}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        className="block w-full rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50"
        aria-label={`Add ${entry.label}${peekPreset ? `, ${peekPreset.label}` : ''}. ${entry.description}`}
      >
        <BumperThumb
          slide={shown}
          theme={doc.theme}
          data={data}
          showEventId={doc.eventId}
          lazy
          live={live}
          replayKey={peek ?? ''}
          className="aspect-video w-full rounded-xl ring-1 ring-line transition-[box-shadow,transform] duration-200 group-hover:ring-2 group-hover:ring-ink motion-safe:group-hover:-translate-y-0.5"
        />
        <span className="mt-2 block truncate text-[0.9375rem] font-semibold text-ink">{peekPreset ? `${entry.label}: ${peekPreset.label}` : entry.label}</span>
        {/* Fixed two lines, so peeking at a preset never moves the chips under the pointer. */}
        <span className="mt-0.5 line-clamp-2 h-[2.75em] text-[0.8125rem] leading-snug text-ink-3">{peekPreset?.description || entry.description}</span>
      </button>
      {entry.presets.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${entry.label} presets`}>
          {entry.presets.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={disabled}
              onPointerEnter={() => setPeek(p.key)}
              onFocus={() => setPeek(p.key)}
              onClick={() => add(p.key)}
              title={p.description}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[0.75rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50',
                peek === p.key ? 'border-ink bg-ink text-white' : 'border-line-strong text-ink-2 hover:border-ink-4 hover:text-ink',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- blocks */

function BlockCard({ block, at, disabled, onPick }: { block: SlideBlock; at: number; disabled: boolean; onPick: () => void }) {
  const { state } = useBuilder();
  const { doc, data } = state;
  const preview = useMemo(() => {
    if (block.needs !== 'speaker') return block.build({});
    const speakerId = suggestRefs('speaker', doc, data, at).speakerId ?? undefined;
    const pub = speakerId ? Object.values(data.publications).find((p) => p.authors.some((a) => a.speakerId === speakerId)) : undefined;
    return block.build({ speakerId, publicationId: pub?.id ?? null });
  }, [block, doc, data, at]);
  const count = block.needs === 'speaker' ? 3 : preview.length;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className="group flex min-w-0 flex-col rounded-2xl border border-line p-3 text-left transition hover:border-ink-4 hover:bg-surface-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50"
    >
      <span className="grid grid-cols-3 gap-1.5" aria-hidden="true">
        {preview.slice(0, 3).map((s) => (
          <BumperThumb key={s.id} slide={s} theme={doc.theme} data={data} showEventId={doc.eventId} lazy className="aspect-video w-full rounded-lg ring-1 ring-line" />
        ))}
      </span>
      <span className="mt-2.5 flex items-center gap-2">
        <span className="text-[0.9375rem] font-semibold text-ink">{block.label}</span>
        <span className="mono rounded-full bg-surface-muted px-1.5 text-[0.6875rem] text-ink-3 group-hover:bg-white">{count} bumpers</span>
      </span>
      <span className="mt-0.5 text-[0.8125rem] leading-snug text-ink-3">{block.description}</span>
    </button>
  );
}

function speakerOption(s: BumperSpeakerData): ComboOption<BumperSpeakerData> {
  const sub = [s.position, s.organization].filter(Boolean).join(', ');
  return {
    value: s.id,
    label: s.fullName,
    description: sub || s.headline || undefined,
    icon: <Avatar name={s.fullName} image={s.avatar} size={28} />,
    data: s,
  };
}

/** The speaker block asks who first, then pairs their paper when there is one. */
function SpeakerBlockStep({ block, at, room, onBack, onInsert }: { block: SlideBlock; at: number; room: number; onBack: () => void; onInsert: (slides: BumperSlide[], records?: Partial<BumperData>) => void }) {
  const { state } = useBuilder();
  const { doc, data } = state;
  const eventId = doc.eventId ?? undefined;
  const [speaker, setSpeaker] = useState<BumperSpeakerData | null>(null);
  const pubs = useQuery({
    queryKey: bumperKeys.source('publications', { eventId: eventId ?? null, speaker: speaker?.id ?? null }),
    queryFn: ({ signal }) => bumpersApi.sources.publications({ eventId, q: eventId ? undefined : speaker!.fullName, limit: 50 }, signal),
    enabled: !!speaker,
    staleTime: 60_000,
  });
  const paper = speaker ? (pubs.data?.find((p) => p.authors.some((a) => a.speakerId === speaker.id)) ?? null) : null;
  const records = useMemo<Partial<BumperData>>(() => (speaker ? { speakers: { [speaker.id]: speaker }, publications: paper ? { [paper.id]: paper } : {} } : {}), [speaker, paper]);
  const previewData = useMemo(() => mergeData(data, records), [data, records]);
  const slides = useMemo(() => (speaker && !pubs.isLoading ? block.build({ speakerId: speaker.id, publicationId: paper?.id ?? null }) : []), [block, speaker, paper, pubs.isLoading]);
  const titles = slides.map((s) => slideTitle(s, doc.theme, previewData, doc.eventId));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-6 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <Button variant="ghost" size="sm" icon={<ArrowLeft />} onClick={onBack} className="-ml-2">
          All templates
        </Button>
        <h3 className="mt-3 font-display text-lg font-extrabold tracking-[-0.01em] text-ink [font-variation-settings:'CASL'_0.2]">Who is speaking?</h3>
        <p className="mt-1 text-[0.9375rem] text-ink-3">
          {eventId ? "Today's lineup comes first." : 'Search every speaker.'} We add their intro, their paper if they have one on record (the talk title if not), and a thank-you.
        </p>
        <Combobox<BumperSpeakerData>
          className="mt-4 max-w-md"
          value={speaker?.id ?? null}
          selectedOption={speaker ? speakerOption(speaker) : null}
          onValueChange={(_, o) => setSpeaker(o?.data ?? null)}
          loadOptions={async (query, signal) => (await bumpersApi.sources.speakers({ q: query.trim() || undefined, eventId, limit: 20 }, signal)).map(speakerOption)}
          placeholder="Pick a speaker"
          searchPlaceholder="Search by name"
          emptyText="Nobody by that name yet."
          aria-label="Speaker"
        />
        {speaker ? (
          <div className="mt-6">
            {pubs.isLoading ? (
              <p className="text-sm text-ink-3">Looking for their paper...</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-ink-2">
                  {paper ? (
                    <>
                      With their paper <span className="font-semibold text-ink">{paper.title}</span>.
                    </>
                  ) : (
                    'No paper on record, so the talk title goes in the middle.'
                  )}
                </p>
                <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {slides.map((s, i) => (
                    <li key={s.id} className="min-w-0">
                      <BumperThumb slide={s} theme={doc.theme} data={previewData} showEventId={doc.eventId} className="aspect-video w-full rounded-xl ring-1 ring-line" />
                      <p className="mt-1.5 flex gap-1.5 text-[0.8125rem]">
                        <span className="mono text-ink-4 tabular-nums">{at + i + 1}</span>
                        <span className="truncate text-ink-2">{titles[i]}</span>
                      </p>
                    </li>
                  ))}
                </ol>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button variant="primary" icon={<Sparkles />} disabled={slides.length > room} onClick={() => onInsert(cloneSlides(slides), records)}>
                    Add {slides.length} bumpers
                  </Button>
                  {slides.length > room ? <span className="text-sm text-red-600">Not enough room left in this show.</span> : null}
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
