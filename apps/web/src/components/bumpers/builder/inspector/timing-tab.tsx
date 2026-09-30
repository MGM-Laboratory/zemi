'use client';

import { BUMPER_TRANSITION_META, BUMPER_TRANSITIONS, bumperPlayable, bumperSlideSchema, pickBumperTransition, type BumperSlide, type BumperTransitionKey } from '@zemi/shared';
import { Repeat } from 'lucide-react';
import { RadioGroup as RRadio } from 'radix-ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Callout } from '@/components/admin/ui/feedback';
import { Field } from '@/components/admin/ui/field';
import { Select } from '@/components/admin/ui/select';
import { SegmentedControl } from '@/components/admin/ui/toggles';
import { cn } from '@/lib/admin/cn';
import { slideName } from '../canvas/labels';
import { TransitionPreview } from '../canvas/transition-preview';
import { useBuilder } from '../store';
import type { InspectorCtx } from './context';
import { DraftNumberInput } from './inputs';
import { InspectorSection } from './ui';

const PRESETS = [5, 10, 15, 20, 30, 60];
const MOOD: Record<string, string> = { playful: 'Playful', grand: 'Grand', calm: 'Calm', snappy: 'Snappy' };
const AUTO = 'auto';
/** Stand-in "previous" for the first bumper: a black screen. */
const FROM_BLACK: BumperSlide = bumperSlideSchema.parse({ id: 'preview-black', kind: 'blank' });

/** Timing: operator paced or auto-advance, loops, and the transition into this bumper. */
export function TimingTab({ ic }: { ic: InspectorCtx }) {
  const b = useBuilder();
  const { slide, theme, data, showEventId, canEdit } = ic;
  const slides = b.state.doc.slides;
  const t = slide.timing;
  const auto = t.autoAdvanceSec != null;
  const index = slides.findIndex((s) => s.id === slide.id);
  const prev = useMemo(() => {
    const before = bumperPlayable(slides.slice(0, Math.max(0, index)));
    return before[before.length - 1] ?? null;
  }, [slides, index]);
  const planned = pickBumperTransition(prev, { ...slide, transitionIn: 'auto' }, { motion: theme.motion });
  const current: BumperTransitionKey = slide.transitionIn === 'auto' ? planned : slide.transitionIn;

  return (
    <div>
      <InspectorSection title="Moving on" description={auto ? 'Playback moves on by itself when the time is up. Any press from the operator still works.' : 'Stays on screen until the operator presses next.'}>
        <SegmentedControl<'manual' | 'auto'>
          aria-label="Moving on"
          fullWidth
          value={auto ? 'auto' : 'manual'}
          onValueChange={(v) => {
            if (!canEdit) return;
            if (v === 'auto') b.setTiming(slide.id, { autoAdvanceSec: t.autoAdvanceSec ?? ic.template.timing?.autoAdvanceSec ?? 15 });
            else b.setTiming(slide.id, { autoAdvanceSec: null, loopToId: null });
          }}
          options={[
            { value: 'manual', label: 'Wait for me' },
            { value: 'auto', label: 'By itself' },
          ]}
        />
        {auto ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Seconds">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={t.autoAdvanceSec === p}
                  disabled={!canEdit}
                  onClick={() => b.setTiming(slide.id, { autoAdvanceSec: p })}
                  className="mono h-8 rounded-full border border-line-strong bg-white px-3 text-xs text-ink-2 tabular-nums transition hover:border-ink-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white"
                >
                  {p} s
                </button>
              ))}
            </div>
            <Field label="Or pick your own">
              <DraftNumberInput value={t.autoAdvanceSec} onCommit={(v) => b.setTiming(slide.id, { autoAdvanceSec: Math.round(v) })} min={2} max={7200} unit="sec" readOnly={!canEdit} />
            </Field>
          </div>
        ) : null}
      </InspectorSection>

      <InspectorSection title="Loop back to" description="Loops make pre-show and break rotations: when the time is up, playback jumps back to a bumper instead of moving on.">
        <Field hint={auto ? undefined : 'Loops need the bumper to move on by itself. Turn that on above.'} label="Loop target" hideLabel>
          <Select
            value={t.loopToId}
            onValueChange={(v) => b.setTiming(slide.id, { loopToId: v })}
            clearable="No loop, move on to the next"
            placeholder="No loop, move on to the next"
            readOnly={!canEdit || !auto}
            options={slides
              .map((s, i) => ({ s, i }))
              .filter(({ s }) => s.id !== slide.id)
              .map(({ s, i }) => ({
                value: s.id,
                label: `${i + 1}. ${slideName(s, theme, data, showEventId)}`,
                textValue: `${i + 1} ${slideName(s, theme, data, showEventId)}`,
                description: s.hidden ? 'Hidden, playback skips it' : undefined,
                icon: <Repeat />,
              }))}
          />
        </Field>
      </InspectorSection>

      <InspectorSection title="Transition in" description={prev ? `From ${slideName(prev, theme, data, showEventId)}. Hover one to see it.` : 'This is the first bumper that plays, so it comes in from black. Hover one to see it.'}>
        {theme.motion === 'still' ? <Callout tone="neutral">Motion is set to still for this show, so every change plays as a calm fade.</Callout> : null}
        {slide.hidden ? <Callout tone="neutral">This bumper is hidden, so playback skips it. The transition applies once you show it again.</Callout> : null}
        <TransitionList value={slide.transitionIn} planned={planned} current={current} readOnly={!canEdit} onChange={(v) => b.updateSlide(slide.id, (s) => ({ ...s, transitionIn: v }))} from={prev ?? FROM_BLACK} to={slide} ic={ic} />
      </InspectorSection>
    </div>
  );
}

function TransitionList({ value, planned, current, onChange, readOnly, from, to, ic }: { value: 'auto' | BumperTransitionKey; planned: BumperTransitionKey; current: BumperTransitionKey; onChange: (v: 'auto' | BumperTransitionKey) => void; readOnly: boolean; from: BumperSlide; to: BumperSlide; ic: InspectorCtx }) {
  const [preview, setPreview] = useState<BumperTransitionKey | null>(null);
  const [run, setRun] = useState(0);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Replay the previewed transition every few seconds while it is hovered.
  useEffect(() => {
    if (!preview) return;
    const id = setInterval(() => setRun((n) => n + 1), 3400);
    return () => clearInterval(id);
  }, [preview]);
  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    [],
  );

  const show = (k: BumperTransitionKey | null) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    // A short delay so sweeping the pointer down the list doesn't start twenty previews.
    hoverTimer.current = setTimeout(() => setPreview(k), k ? 140 : 0);
  };
  const shown = preview ?? current;
  const meta = BUMPER_TRANSITION_META[shown];

  return (
    <div
      onPointerLeave={() => show(null)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) show(null);
      }}
    >
      <div className="sticky top-[42px] z-[1] -mx-1 mb-3 rounded-b-2xl bg-white px-1 pt-2 pb-1">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#0e1116]">
          {preview ? (
            <TransitionPreview key={`${preview}-${run}`} from={from} to={to} theme={ic.theme} data={ic.data} showEventId={ic.showEventId} transition={preview} holdMs={450} style={{ position: 'absolute', inset: 0 }} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
              <span className="font-display text-lg font-extrabold text-white [font-variation-settings:'CASL'_0.4]">{BUMPER_TRANSITION_META[current].label}</span>
              <span className="text-xs text-white/60">Hover or focus a transition to play it here</span>
            </div>
          )}
        </div>
        {preview ? (
          <p className="mt-1.5 truncate px-1 text-xs text-ink-3" aria-live="polite">
            <span className="font-semibold text-ink">{meta.label}:</span> {meta.description}
          </p>
        ) : null}
      </div>
      <RRadio.Root value={value} onValueChange={(v) => onChange(v as 'auto' | BumperTransitionKey)} disabled={readOnly} aria-label="Transition into this bumper" className="space-y-1">
        <RRadio.Item value={AUTO} className={rowClass} onPointerEnter={() => show(planned)} onFocus={() => show(planned)}>
          <Dot />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Auto: {BUMPER_TRANSITION_META[planned].label}</span>
            <span className="block text-xs leading-snug text-ink-3">What the pair rules pick for this spot. Changes if you reorder.</span>
          </span>
        </RRadio.Item>
        {BUMPER_TRANSITIONS.map((k) => {
          const m = BUMPER_TRANSITION_META[k];
          return (
            <RRadio.Item key={k} value={k} className={rowClass} onPointerEnter={() => show(k)} onFocus={() => show(k)}>
              <Dot />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-ink">{m.label}</span>
                  <span className="text-[0.6875rem] text-ink-4">{MOOD[m.mood]}</span>
                </span>
                <span className="block text-xs leading-snug text-ink-3">{m.description}</span>
              </span>
            </RRadio.Item>
          );
        })}
      </RRadio.Root>
    </div>
  );
}

const rowClass = cn(
  'group flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors',
  'hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus data-[state=checked]:bg-blue-50 disabled:cursor-default',
);

function Dot() {
  return (
    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line-strong bg-white group-data-[state=checked]:border-blue">
      <RRadio.Indicator className="block size-2 rounded-full bg-blue" />
    </span>
  );
}
