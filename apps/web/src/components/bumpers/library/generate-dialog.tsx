'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  bumperGenerateInput,
  bumperPlayable,
  type Accent,
  type BumperGenerateInput,
  type BumperMotionLevel,
  type BumperPersonPick,
  type BumperQnaMode,
} from '@zemi/shared';
import { ArrowDown, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { AccentPicker } from '@/components/admin/fields/simple-fields';
import { ShapeGlyph } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Dialog } from '@/components/admin/ui/dialog';
import { Callout, EmptyState, ErrorState, Skeleton } from '@/components/admin/ui/feedback';
import { Field } from '@/components/admin/ui/field';
import { Input } from '@/components/admin/ui/input';
import { Spinner } from '@/components/admin/ui/spinner';
import { notify } from '@/components/admin/ui/toast';
import { SegmentedControl, Switch } from '@/components/admin/ui/toggles';
import { cn } from '@/lib/admin/cn';
import { useAdminMutation, useDebouncedValue, usePrefersReducedMotion } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';
import { bumperKeys, bumpersApi } from '../api';
import { EventPicker, nextBuildable, type EventPickLike } from './event-picker';
import { countLabel, runtimeLabel } from './labels';
import { PersonPickField } from './person-pick';
import { ShowPreview } from './show-preview';

/** The generator's own defaults (from the shared schema), so the switches start where the API does. */
const D = bumperGenerateInput.parse({ eventId: '00000000-0000-4000-8000-000000000000' });

interface Options {
  eventId: string | null;
  title: string;
  preshow: boolean;
  houseRules: boolean;
  welcome: boolean;
  agenda: boolean;
  host: BumperPersonPick;
  opening: BumperPersonPick;
  papers: boolean;
  thanks: boolean;
  qna: BumperQnaMode;
  breaks: boolean;
  photo: boolean;
  nextEvent: boolean;
  credits: boolean;
  closing: boolean;
  accent: 'event' | Accent;
  motion: BumperMotionLevel;
}

function initialOptions(eventId: string | null): Options {
  return {
    eventId,
    title: '',
    preshow: D.preshow,
    houseRules: D.houseRules,
    welcome: D.welcome,
    agenda: D.agenda,
    host: D.host,
    opening: D.opening,
    papers: D.papers,
    thanks: D.thanks,
    qna: D.qna,
    breaks: D.breaks,
    photo: D.photo,
    nextEvent: D.nextEvent,
    credits: D.credits,
    closing: D.closing,
    accent: 'event',
    motion: 'full',
  };
}

/** Person picks with the typed parts trimmed. An unfinished pick is fine: the preview notes say what is missing. */
function cleanPick(p: BumperPersonPick): BumperPersonPick {
  return { mode: p.mode, id: p.id ?? null, name: p.name?.trim() || null, role: p.role?.trim() || null };
}

function toInput(o: Options, eventId: string): Partial<BumperGenerateInput> & { eventId: string } {
  return {
    eventId,
    preshow: o.preshow,
    houseRules: o.houseRules,
    welcome: o.welcome,
    agenda: o.agenda,
    host: cleanPick(o.host),
    opening: cleanPick(o.opening),
    papers: o.papers,
    thanks: o.thanks,
    qna: o.qna,
    breaks: o.breaks,
    photo: o.photo,
    nextEvent: o.nextEvent,
    credits: o.credits,
    closing: o.closing,
    theme: { accent: o.accent, motion: o.motion },
  };
}

const QNA_HINT: Record<BumperQnaMode, string> = {
  end: 'One Q and A card near the end, plus the top question from the discussion page. Skipped if the rundown already has one.',
  'after-each': 'A Q and A card after every talk. The rundown\'s own Q and A slot only adds the questions card.',
  none: 'No Q and A cards at all.',
};

const MOTION_HINT: Record<BumperMotionLevel, string> = {
  full: 'Every transition, bounce and cheer.',
  calm: 'Slower, smaller moves and gentler transitions. Good for serious rooms.',
  still: 'Crossfades only. For old projectors or a stream that stutters.',
};

export interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Start with this Friday picked (the event tab). */
  event?: EventPickLike | null;
}

/**
 * "Generate from an event": pick a Friday, say what goes in, watch the bumpers appear on the
 * right (a debounced preview from the real generator), then create the show and land in the
 * builder. On phones it is a bottom sheet with the preview under the options.
 */
export function GenerateDialog({ open, onOpenChange, event }: GenerateDialogProps) {
  const router = useRouter();
  const reduce = usePrefersReducedMotion();
  const previewRef = useRef<HTMLElement>(null);
  const [opts, setOpts] = useState<Options>(() => initialOptions(event?.id ?? null));
  const [picked, setPicked] = useState<EventPickLike | null>(event ?? null);
  const [wasOpen, setWasOpen] = useState(open);
  // A fresh start every time the dialog opens.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOpts(initialOptions(event?.id ?? null));
      setPicked(event ?? null);
    }
  }
  const set = <K extends keyof Options>(key: K, value: Options[K]) => setOpts((o) => ({ ...o, [key]: value }));

  // Nothing picked yet: the next Friday the principal can build for (the API sorts upcoming first).
  const events = useQuery({
    queryKey: bumperKeys.source('events', { limit: 30 }),
    queryFn: ({ signal }) => bumpersApi.sources.events({ limit: 30 }, signal),
    enabled: open && !opts.eventId,
    staleTime: 60_000,
  });
  const fallbackEvent = nextBuildable(events.data);
  const eventId = opts.eventId ?? fallbackEvent?.id ?? null;
  const shownEvent = opts.eventId ? picked : fallbackEvent;

  const inputKey = eventId ? JSON.stringify(toInput(opts, eventId)) : null;
  const debouncedKey = useDebouncedValue(inputKey, 400);
  const preview = useQuery({
    queryKey: [...bumperKeys.all, 'preview', debouncedKey],
    queryFn: () => bumpersApi.preview(JSON.parse(debouncedKey!) as ReturnType<typeof toInput>),
    enabled: open && !!debouncedKey,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const settling = inputKey !== debouncedKey || preview.isFetching;
  const result = preview.data;
  const playable = result ? bumperPlayable(result.slides) : [];
  const autoSec = playable.reduce((n, s) => n + (s.timing.autoAdvanceSec ?? 0), 0);

  const create = useAdminMutation({
    mutationFn: () => bumpersApi.generate({ ...toInput(opts, eventId!), ...(opts.title.trim() ? { title: opts.title.trim() } : {}), create: true }),
    invalidate: [bumperKeys.lists()],
    onSuccess: (show) => {
      notify.success(`Your show is ready: ${countLabel(show.slideCount)} to play with.`, { celebrate: true });
      onOpenChange(false);
      router.push(adminRoutes.bumper(show.id));
    },
  });

  const noEvents = !opts.eventId && events.isSuccess && !fallbackEvent;
  const canCreate = !!eventId && !create.isPending && (!result || result.slides.length > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      // 'full' caps the width at 100vw minus 2rem even as a phone sheet, so it is 'xl' widened on laptops.
      size="xl"
      dismissible={false}
      accent="red"
      title="Generate a show"
      description="Pick a Friday and say what goes in. We build the bumpers from its lineup, rundown and papers, and you can change every card after."
      // Wide screens: a full-height studio, options and preview scroll on their own.
      className="lg:h-[calc(100dvh-4rem)] lg:max-w-[min(96rem,calc(100vw-2rem))]"
      bodyClassName="pt-2 lg:overflow-hidden lg:pb-0"
      footer={
        <>
          <p className="mr-auto hidden text-sm text-ink-3 sm:block" aria-live="polite">
            {result ? `${countLabel(result.slides.length)}${runtimeLabel(autoSec) ? `, ${runtimeLabel(autoSec)}` : ''}` : ''}
          </p>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Sparkles />} loading={create.isPending} disabled={!canCreate} onClick={() => create.mutate()}>
            Create show
          </Button>
        </>
      }
    >
      <div className="grid min-w-0 gap-6 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-8">
        <div className="min-w-0 space-y-6 lg:-mr-2 lg:overflow-y-auto lg:pr-2 lg:pb-6">
          {result ? (
            // Phones and tablets: the preview sits under the options, so offer a shortcut to it.
            <button
              type="button"
              onClick={() => previewRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })}
              className="flex w-full items-center gap-2 rounded-2xl bg-surface-muted px-4 py-3 text-left text-sm text-ink-2 transition-colors hover:bg-[#efefec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus lg:hidden"
            >
              <Sparkles className="size-4 shrink-0 text-red" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="font-medium text-ink">{countLabel(result.slides.length)} ready.</span> See them under the options.
              </span>
              <ArrowDown className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
            </button>
          ) : null}
          <Group title="The Friday">
            <Field label="Event" hint="Only Fridays you can build bumpers for can be picked. The next one comes first.">
              <EventPicker
                value={eventId}
                selected={shownEvent}
                buildableOnly
                onChange={(id, e) => {
                  setPicked(e);
                  set('eventId', id);
                }}
                placeholder={events.isPending && !opts.eventId ? 'Finding the next Friday...' : 'Pick a Friday'}
              />
            </Field>
            <Field label="Show name" optional>
              <Input value={opts.title} onChange={(e) => set('title', e.target.value)} maxLength={120} placeholder={result?.title ?? 'Zemi #98 bumpers'} />
            </Field>
          </Group>

          <Group title="Before the start">
            <Switch
              checked={opts.preshow}
              onCheckedChange={(v) => set('preshow', v)}
              label="Pre-show loop"
              description="Starting soon with a live countdown, then the agenda, looping on screen while people find a seat."
            />
            <Switch
              checked={opts.preshow && opts.houseRules}
              disabled={!opts.preshow}
              onCheckedChange={(v) => set('houseRules', v)}
              label="House rules in the loop"
              description="Phones on silent, the recording notice, where the coffee is."
            />
          </Group>

          <Group title="Opening">
            <Switch checked={opts.welcome} onCheckedChange={(v) => set('welcome', v)} label="Welcome" description="The big hello with the Zemi number and a cheer from the crew." />
            <Switch checked={opts.agenda} onCheckedChange={(v) => set('agenda', v)} label="Agenda" description="Today's rundown with times. Only when the rundown has items." />
            <PersonPickField
              label="Host card"
              autoHint="The moderator on the lineup, or a team member whose role says host or MC."
              value={opts.host}
              onChange={(v) => set('host', v)}
              eventId={eventId}
            />
            <PersonPickField
              label="Opening remarks"
              autoHint="Whoever the rundown says opens, or else the keynote speaker."
              value={opts.opening}
              onChange={(v) => set('opening', v)}
              eventId={eventId}
            />
          </Group>

          <Group title="Talks">
            <Switch checked={opts.papers} onCheckedChange={(v) => set('papers', v)} label="Papers" description="A card for each paper a speaker wrote that is linked to this Friday. Off: the talk title instead." />
            <Switch checked={opts.thanks} onCheckedChange={(v) => set('thanks', v)} label="Thank-yous" description="A warm thank-you with an applause cue after every talk." />
            <Field label="Q and A" hint={QNA_HINT[opts.qna]}>
              <SegmentedControl<BumperQnaMode>
                aria-label="Q and A"
                value={opts.qna}
                onValueChange={(v) => set('qna', v)}
                options={[
                  { value: 'end', label: 'At the end' },
                  { value: 'after-each', label: 'After each talk' },
                  { value: 'none', label: 'None' },
                ]}
              />
            </Field>
          </Group>

          <Group title="Breaks and photos">
            <Switch checked={opts.breaks} onCheckedChange={(v) => set('breaks', v)} label="Breaks" description="Follow the rundown's break with a looping countdown and what comes after it." />
            <Switch checked={opts.photo} onCheckedChange={(v) => set('photo', v)} label="Group photo" description="Squeeze in: a 3, 2, 1 with a flash, at the rundown's photo slot or near the end." />
          </Group>

          <Group title="Closing">
            <Switch checked={opts.nextEvent} onCheckedChange={(v) => set('nextEvent', v)} label="Next Friday" description="A promo for the next published Friday with a register QR, when there is one." />
            <Switch checked={opts.credits} onCheckedChange={(v) => set('credits', v)} label="Credits" description="Everyone who made today happen, rolling up the screen." />
            <Switch checked={opts.closing} onCheckedChange={(v) => set('closing', v)} label="Goodbye card" description="That's a wrap, with the socials and a slow confetti drizzle." />
          </Group>

          <Group title="Look">
            <Field label="Accent" hint={opts.accent === 'event' ? "Follows the event's color, so it matches the poster." : 'Every bumper in the show uses this color.'}>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  aria-pressed={opts.accent === 'event'}
                  onClick={() => set('accent', 'event')}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                    opts.accent === 'event' ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white text-ink-2 hover:border-ink-4',
                  )}
                >
                  <span className="flex items-center gap-0.5" aria-hidden="true">
                    <ShapeGlyph shape="circle" className="text-blue" />
                    <ShapeGlyph shape="triangle" className="text-red" />
                    <ShapeGlyph shape="square" className="text-yellow" />
                    <ShapeGlyph shape="arch" className="text-green" />
                  </span>
                  Event color
                </button>
                <AccentPicker size="sm" value={opts.accent === 'event' ? null : opts.accent} onChange={(a) => set('accent', a)} aria-label="Show accent" />
              </div>
            </Field>
            <Field label="Motion" hint={MOTION_HINT[opts.motion]}>
              <SegmentedControl<BumperMotionLevel>
                aria-label="Motion"
                value={opts.motion}
                onValueChange={(v) => set('motion', v)}
                options={[
                  { value: 'full', label: 'Full' },
                  { value: 'calm', label: 'Calm' },
                  { value: 'still', label: 'Still' },
                ]}
              />
            </Field>
          </Group>
        </div>

        <section ref={previewRef} aria-label="Preview" className="min-w-0 scroll-mt-2 lg:overflow-y-auto lg:pb-6">
          <div className="mb-3 flex min-h-6 items-center gap-2">
            <h3 className="label text-ink-3">Preview</h3>
            {result ? (
              <span className="text-sm text-ink-2">
                {countLabel(result.slides.length)}
                {runtimeLabel(autoSec) ? <span className="text-ink-3">, {runtimeLabel(autoSec)}</span> : null}
              </span>
            ) : null}
            {eventId && settling ? <Spinner size={14} label="Updating the preview" className="ml-auto" /> : null}
          </div>
          {!eventId ? (
            noEvents ? (
              <EmptyState
                size="sm"
                title="No Friday to build for yet."
                description="Once there is an event you can build bumpers for, it shows up here."
                cast={[
                  { shape: 'circle', mood: 'look', size: 40, lookAt: { x: 0.8, y: 0.2 } },
                  { shape: 'square', mood: 'sleep', size: 48 },
                ]}
              />
            ) : events.isError ? (
              <ErrorState size="sm" error={events.error} onRetry={() => void events.refetch()} retrying={events.isFetching} />
            ) : (
              <PreviewSkeleton />
            )
          ) : preview.isError && !result ? (
            <ErrorState size="sm" error={preview.error} onRetry={() => void preview.refetch()} retrying={preview.isFetching} />
          ) : !result ? (
            <PreviewSkeleton />
          ) : (
            <div className="space-y-4">
              {result.slides.length ? (
                <ShowPreview slides={result.slides} theme={result.theme} data={result.data} showEventId={result.eventId} version={preview.dataUpdatedAt} stale={settling} />
              ) : (
                <EmptyState size="sm" title="That switches everything off." description="Turn a few things back on to get some bumpers." />
              )}
              {result.notes.length ? (
                <Callout tone="neutral" title="What we did and why">
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
                    {result.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </Callout>
              ) : null}
              {preview.isError ? <p className="text-sm text-red-600">The latest change did not preview. What you see is the one before it.</p> : null}
            </div>
          )}
        </section>
      </div>
    </Dialog>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="label mb-2 text-ink-3">{title}</h3>
      <div className="space-y-4 rounded-2xl border border-line p-4">{children}</div>
    </section>
  );
}

function PreviewSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="aspect-video w-full" rounded="lg" />
      <div className="flex gap-2.5 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-video w-36 shrink-0 sm:w-40" rounded="md" />
        ))}
      </div>
    </div>
  );
}
