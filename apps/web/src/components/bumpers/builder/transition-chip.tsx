'use client';

import {
  BUMPER_TRANSITION_META,
  BUMPER_TRANSITIONS,
  pickBumperTransition,
  type BumperMotionLevel,
  type BumperSlide,
  type BumperTransitionKey,
  type BumperTransitionMood,
} from '@zemi/shared';
import {
  ArrowDownToLine,
  Blend,
  Blinds,
  BookOpen,
  Boxes,
  Camera,
  Check,
  Clock,
  Coffee,
  Drama,
  Droplets,
  Eye,
  Grid3x3,
  Grip,
  Orbit,
  PartyPopper,
  Rainbow,
  Rows3,
  Scissors,
  Send,
  Shapes,
  Shuffle,
  Sparkles,
  Stamp,
  Type,
  WandSparkles,
  Wind,
  CircleDot,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { PopoverAnchor, PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/admin/ui/popover';
import { cn } from '@/lib/admin/cn';
import { useMediaQuery, usePrefersReducedMotion } from '@/lib/admin/hooks';
import { BumperStage } from '../engine/stage';
import { BumperDirector, type DirectorTarget, type TransitionEvent } from '../transitions/director';
import { useBuilder } from './store';

/** A tiny icon per transition, for the rail chips and pickers. */
export const TRANSITION_ICON: Record<BumperTransitionKey, LucideIcon> = {
  'curtain-call': Drama,
  'q-iris': CircleDot,
  eyelids: Eye,
  'shape-morph': Shapes,
  'grid-mosaic': Grid3x3,
  'magic-move': WandSparkles,
  'paper-plane': Send,
  'coffee-pour': Coffee,
  'bridge-arc': Rainbow,
  'block-stack': Boxes,
  'hunch-shutter': Camera,
  'confetti-pop': PartyPopper,
  'split-doors': Rows3,
  'portal-zoom': Orbit,
  stamp: Stamp,
  blinds: Blinds,
  'page-turn': BookOpen,
  'ribbon-sweep': Wind,
  'scramble-cut': Shuffle,
  'clock-wipe': Clock,
  'ink-flood': Droplets,
  'gravity-drop': ArrowDownToLine,
  halftone: Grip,
  'word-wipe': Type,
  crossfade: Blend,
  cut: Scissors,
};

const MOODS: Array<{ mood: BumperTransitionMood; label: string }> = [
  { mood: 'playful', label: 'Playful' },
  { mood: 'grand', label: 'Grand' },
  { mood: 'snappy', label: 'Snappy' },
  { mood: 'calm', label: 'Calm' },
];

/** What the screen really plays: with motion set to still, everything but a cut becomes a crossfade (the director's rule). */
export function effectiveTransition(key: BumperTransitionKey, motion: BumperMotionLevel): BumperTransitionKey {
  return motion === 'still' && key !== 'cut' ? 'crossfade' : key;
}

/** The pair rules' own pick, ignoring the slide's hand-picked transition. */
export function autoTransition(from: BumperSlide, to: BumperSlide, motion: BumperMotionLevel): BumperTransitionKey {
  return effectiveTransition(pickBumperTransition(from, { ...to, transitionIn: 'auto' }, { motion }), motion);
}

const FILL: CSSProperties = { position: 'absolute', inset: 0 };

/**
 * A mini stage that plays `from` to `to` with one transition, holds a beat, and plays it again.
 * Each run remounts the director so it always starts from the first bumper.
 */
export function TransitionPreview({ from, to, transition, className }: { from: BumperSlide; to: BumperSlide; transition: BumperTransitionKey; className?: string }) {
  const [run, setRun] = useState(0);
  return (
    <div className={cn('relative aspect-video overflow-hidden rounded-xl bg-[#0e1116]', className)} aria-hidden="true">
      <PreviewRun key={`${transition}-${run}`} from={from} to={to} transition={transition} onDone={() => setRun((n) => n + 1)} />
    </div>
  );
}

function PreviewRun({ from, to, transition, onDone }: { from: BumperSlide; to: BumperSlide; transition: BumperTransitionKey; onDone: () => void }) {
  const { state } = useBuilder();
  const [target, setTarget] = useState<DirectorTarget>({ slideId: from.id, seq: 0 });
  const [slides] = useState(() => [from, to]);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const t = setTimeout(() => setTarget({ slideId: to.id, seq: 1, transition, dir: 1 }), 500);
    return () => clearTimeout(t);
  }, [to.id, transition]);
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    if (!ended) return;
    const t = setTimeout(() => done.current(), 1400);
    return () => clearTimeout(t);
  }, [ended]);
  const onTransition = (e: TransitionEvent) => {
    if (e.phase === 'end') setEnded(true);
  };
  return (
    <BumperStage style={FILL} letterbox="#0e1116">
      <BumperDirector slides={slides} theme={state.doc.theme} data={state.data} showEventId={state.doc.eventId} target={target} initial="static" onTransition={onTransition} />
    </BumperStage>
  );
}

export interface TransitionChipProps {
  /** The playable slide before `to` (what the screen shows when the operator presses next). */
  from: BumperSlide;
  to: BumperSlide;
  /** Planned transition for this pair (planBumperTransitions). */
  planned: BumperTransitionKey;
  /** 1-based positions for the labels. */
  fromIndex: number;
  toIndex: number;
  orientation: 'vertical' | 'horizontal';
  className?: string;
}

/**
 * The transition between two bumpers in the rail: name and icon, a small animated preview on
 * hover, and a picker on click that sets the next bumper's `transitionIn` (or back to Auto).
 */
export function TransitionChip({ from, to, planned, fromIndex, toIndex, orientation, className }: TransitionChipProps) {
  const { state, canEdit, updateSlide } = useBuilder();
  const motion = state.doc.theme.motion;
  const shown = effectiveTransition(planned, motion);
  const manual = to.transitionIn !== 'auto';
  const Icon = TRANSITION_ICON[shown];
  const label = BUMPER_TRANSITION_META[shown].label;
  const fine = useMediaQuery('(hover: hover) and (pointer: fine)');
  const reduce = usePrefersReducedMotion();
  const [hover, setHover] = useState(false);
  const [picking, setPicking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const canPreview = fine && !reduce;
  const enter = () => {
    if (!canPreview) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHover(true), 380);
  };
  const leave = () => {
    if (timer.current) clearTimeout(timer.current);
    setHover(false);
  };
  const choose = (key: 'auto' | BumperTransitionKey) => {
    updateSlide(to.id, (s) => (s.transitionIn === key ? s : { ...s, transitionIn: key }));
    setPicking(false);
  };
  const stillNote = motion === 'still' && planned !== 'cut';
  const title = `From ${fromIndex} to ${toIndex}: ${label}${manual ? ', picked by hand' : ''}${stillNote ? ' (motion is set to still)' : ''}`;

  return (
    <PopoverRoot open={hover && !picking && canPreview}>
      <PopoverAnchor asChild>
        <span className={cn('inline-flex min-w-0', className)} onPointerEnter={enter} onPointerLeave={leave}>
          <PopoverRoot
            open={picking}
            onOpenChange={(o) => {
              setPicking(o);
              if (o) leave();
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`${title}. ${canEdit ? 'Change the transition' : 'See the transitions'}`}
                className={cn(
                  'group/chip relative inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full border bg-white text-ink-3 transition-colors duration-150',
                  'hover:border-ink-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus data-[state=open]:border-ink data-[state=open]:text-ink',
                  manual ? 'border-blue/40 text-blue-600' : 'border-line-strong',
                  orientation === 'vertical' ? 'h-6 max-w-full px-2.5 text-[0.75rem] leading-none font-medium' : 'size-6',
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                {orientation === 'vertical' ? <span className="truncate">{label}</span> : null}
                {manual ? <span className={cn('size-1.5 shrink-0 rounded-full bg-blue', orientation === 'horizontal' && 'absolute -top-0.5 -right-0.5 ring-2 ring-white')} aria-hidden="true" /> : null}
              </button>
            </PopoverTrigger>
            <PopoverContent padded={false} side={orientation === 'vertical' ? 'right' : 'bottom'} align="center" className="w-[20rem]" onOpenAutoFocus={(e) => e.preventDefault()}>
              <TransitionPicker from={from} to={to} fromIndex={fromIndex} toIndex={toIndex} canEdit={canEdit} onChoose={choose} />
            </PopoverContent>
          </PopoverRoot>
        </span>
      </PopoverAnchor>
      {hover && !picking && canPreview ? (
        <PopoverContent
          padded={false}
          side={orientation === 'vertical' ? 'right' : 'bottom'}
          align="center"
          className="pointer-events-none w-64 p-2"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <TransitionPreview from={from} to={to} transition={shown} />
          <p className="mt-2 px-1 text-[0.8125rem] leading-snug">
            <span className="font-semibold text-ink">{label}.</span> <span className="text-ink-3">{BUMPER_TRANSITION_META[shown].description}</span>
          </p>
          {stillNote ? <p className="mt-1 px-1 text-[0.75rem] text-ink-3">Motion is set to still, so the screen crossfades.</p> : null}
        </PopoverContent>
      ) : null}
    </PopoverRoot>
  );
}

/** Auto plus every transition, grouped by mood, with a preview of the one under the pointer or focus. */
function TransitionPicker({ from, to, fromIndex, toIndex, canEdit, onChoose }: { from: BumperSlide; to: BumperSlide; fromIndex: number; toIndex: number; canEdit: boolean; onChoose: (key: 'auto' | BumperTransitionKey) => void }) {
  const { state } = useBuilder();
  const motion = state.doc.theme.motion;
  const reduce = usePrefersReducedMotion();
  const auto = autoTransition(from, to, motion);
  const value = to.transitionIn;
  const [peek, setPeek] = useState<BumperTransitionKey>(value === 'auto' ? auto : effectiveTransition(value, motion));
  const listRef = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-key]') ?? []);
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
    items[next]?.focus();
  };
  // Keyboard users land on the picked row.
  useEffect(() => {
    listRef.current?.querySelector<HTMLButtonElement>('button[aria-checked="true"]')?.focus({ preventScroll: false });
  }, []);

  const row = (key: 'auto' | BumperTransitionKey, label: string, hint?: string) => {
    const k: BumperTransitionKey = key === 'auto' ? auto : key;
    const Icon = key === 'auto' ? Sparkles : TRANSITION_ICON[key];
    const on = value === key;
    return (
      <button
        key={key}
        type="button"
        data-key={key}
        role="menuitemradio"
        aria-checked={on}
        disabled={!canEdit}
        onPointerEnter={() => setPeek(effectiveTransition(k, motion))}
        onFocus={() => setPeek(effectiveTransition(k, motion))}
        onClick={() => onChoose(key)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[0.875rem] transition-colors',
          'hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent',
          on ? 'font-semibold text-ink' : 'text-ink-2',
        )}
      >
        <Icon className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          {label}
          {hint ? <span className="ml-1.5 font-normal text-ink-3">{hint}</span> : null}
        </span>
        {on ? <Check className="size-4 shrink-0 text-ink" aria-hidden="true" /> : null}
      </button>
    );
  };

  return (
    <div className="flex max-h-[min(34rem,calc(100dvh-6rem))] flex-col">
      <div className="border-b border-line p-3">
        <p className="mb-2 text-[0.8125rem] text-ink-3">
          Into bumper {toIndex}, after {fromIndex}
        </p>
        {reduce ? null : <TransitionPreview from={from} to={to} transition={peek} />}
        {/* Two fixed lines: hovering a row must never shift the list under the pointer. */}
        <p className="mt-2 line-clamp-2 h-[2.75em] text-[0.8125rem] leading-snug">
          <span className="font-semibold text-ink">{BUMPER_TRANSITION_META[peek].label}.</span> <span className="text-ink-3">{BUMPER_TRANSITION_META[peek].description}</span>
        </p>
        {motion === 'still' ? <p className="mt-1 text-[0.75rem] text-ink-3">Motion is set to still, so the screen crossfades unless you pick a cut.</p> : null}
      </div>
      <div ref={listRef} role="menu" aria-label="Transition into this bumper" onKeyDown={onKeyDown} className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {row('auto', 'Auto', BUMPER_TRANSITION_META[auto].label)}
        {MOODS.map(({ mood, label }) => (
          <div key={mood} role="group" aria-label={label}>
            <p className="label px-2.5 pt-3 pb-1 text-ink-4" aria-hidden="true">
              {label}
            </p>
            {BUMPER_TRANSITIONS.filter((k) => BUMPER_TRANSITION_META[k].mood === mood).map((k) => row(k, BUMPER_TRANSITION_META[k].label))}
          </div>
        ))}
      </div>
    </div>
  );
}
