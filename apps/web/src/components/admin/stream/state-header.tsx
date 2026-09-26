'use client';

import type { StreamConfig } from '@zemi/shared';
import { Eye, Radio, Square, TrendingUp } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Character, type CharacterMood } from '@/components/admin/characters/character';
import { Button } from '@/components/admin/ui/button';
import { ConfirmDialog } from '@/components/admin/ui/confirm-dialog';
import { DateText } from '@/components/admin/ui/display';
import { cn } from '@/lib/admin/cn';
import { useNow } from '@/lib/admin/hooks';
import { canGoLive, clock, roomState, secondsSince, type RoomState } from './lib';
import type { SseStatus } from './use-stream';

interface Look {
  eyebrow: string;
  title: string;
  body: string;
  surface: string;
  ink: 'dark' | 'light';
  shape: 'circle' | 'triangle' | 'square' | 'arch';
  mood: CharacterMood;
}

const LOOK: Record<RoomState, Look> = {
  idle: {
    eyebrow: 'Stream status',
    title: 'Waiting for OBS',
    body: 'Paste the key into OBS and hit Start Streaming. This page notices on its own.',
    surface: 'bg-surface-muted border-line-strong border-dashed',
    ink: 'dark',
    shape: 'circle',
    mood: 'sleep',
  },
  preview: {
    eyebrow: 'Only admins see this',
    title: 'Receiving signal',
    body: 'OBS is talking to us. Check the picture and the mic, then go live when the room is ready.',
    surface: 'bg-yellow-50 border-yellow/60',
    ink: 'dark',
    shape: 'square',
    mood: 'look',
  },
  live: {
    eyebrow: 'On air',
    title: 'Live',
    body: 'Everyone on the event page can watch. Every minute is being recorded.',
    surface: 'bg-red border-red',
    ink: 'light',
    shape: 'triangle',
    mood: 'cheer',
  },
  lost: {
    eyebrow: 'Still live, no picture',
    title: 'Signal lost',
    body: 'OBS dropped. Viewers see a "hang tight" card. Restart streaming in OBS and we pick it right back up.',
    surface: 'bg-red-600 border-red-600 zemi-stripes',
    ink: 'light',
    shape: 'triangle',
    mood: 'oops',
  },
  ended: {
    eyebrow: 'Stream status',
    title: 'Ended',
    body: 'The public stream is off. The recording gets stitched below.',
    surface: 'bg-surface-inverse border-surface-inverse',
    ink: 'light',
    shape: 'arch',
    mood: 'happy',
  },
};

/**
 * The big state header of the control room. It changes color, copy and character per state,
 * shows the live timer and viewer counts, and holds the two big buttons (Go live, End stream),
 * each behind a confirm dialog that focuses Cancel first. No keyboard shortcuts on purpose.
 */
export function StateHeader({
  stream,
  canControl,
  sse,
  onGoLive,
  onEnd,
  goingLive,
  ending,
  readOnlyText = 'You can watch the control room. Going live needs stream control access.',
  goLiveBlocked,
  draft = false,
}: {
  stream: StreamConfig;
  canControl: boolean;
  /** What to say instead of the buttons when `canControl` is false. */
  readOnlyText?: string;
  /** Why Go live is off for everyone (a cancelled event). End stream stays available while live. */
  goLiveBlocked?: string;
  /** The event is a draft: the public can't open the page or the stream yet. */
  draft?: boolean;
  sse: SseStatus;
  onGoLive: () => Promise<unknown>;
  onEnd: () => Promise<unknown>;
  goingLive: boolean;
  ending: boolean;
}) {
  const room = roomState(stream);
  const look = LOOK[room];
  const reduce = useReducedMotion();
  const now = useNow(1000);
  const light = look.ink === 'light';
  // White on the live red is only about 3.6:1, so small copy on red stays fully opaque.
  const onRed = room === 'live' || room === 'lost';
  const [confirm, setConfirm] = useState<'live' | 'end' | null>(null);
  const isLive = room === 'live' || room === 'lost';
  const elapsed = isLive ? clock(secondsSince(stream.liveStartedAt, now)) : null;

  // Replay the cheer every time we go live.
  const [cheer, setCheer] = useState(0);
  const prev = useRef(room);
  useEffect(() => {
    if (prev.current !== 'live' && room === 'live') setCheer((c) => c + 1);
    prev.current = room;
  }, [room]);

  return (
    <section
      aria-labelledby="stream-state-title"
      className={cn(
        'relative isolate overflow-hidden rounded-[24px] border transition-[background-color,border-color,color] duration-500 sm:rounded-[var(--radius-card)]',
        look.surface,
        room === 'live' && 'zemi-live-breathe',
        light ? 'text-white' : 'text-ink',
      )}
    >
      <Decor room={room} />

      <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-10 xl:p-9">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={cn('mono text-[0.75rem] tracking-[0.08em] uppercase', onRed ? 'text-white' : light ? 'text-white/80' : 'text-ink-3')}>{look.eyebrow}</span>
            <SseDot status={sse} light={light} />
          </div>

          <div className="mt-2 flex items-center gap-4">
            <SignalGlyph room={room} light={light} />
            <div className="relative min-w-0 overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.h2
                  key={room}
                  id="stream-state-title"
                  initial={reduce ? { opacity: 0 } : { y: '100%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { y: '-100%', opacity: 0 }}
                  transition={{ duration: reduce ? 0.15 : 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    'font-display text-[clamp(2.25rem,6vw,4.75rem)] leading-[0.92] font-extrabold tracking-[-0.04em] [font-variation-settings:"CASL"_0.35]',
                    room === 'live' && 'uppercase',
                  )}
                >
                  {look.title}
                </motion.h2>
              </AnimatePresence>
              <p className="sr-only" role="status" aria-live="polite">
                Stream status: {look.title}.
              </p>
            </div>
          </div>

          <p className={cn('mt-3 max-w-[40rem] text-[0.9375rem] sm:text-base', onRed ? 'text-white' : light ? 'text-white/85' : 'text-ink-2')}>
            {room === 'ended' && stream.ingestOnline
              ? 'The public stream is off and the recording gets stitched below. OBS is still connected, so check the preview and go live again if you need a second round.'
              : room === 'live' && draft
                ? 'Still a draft, so only admins can watch until you publish. Every minute is being recorded.'
                : look.body}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {elapsed ? (
              <Pill light>
                <span className="mono text-[0.9375rem] font-semibold tabular-nums" aria-label={`Live for ${elapsed}`}>
                  {elapsed}
                </span>
              </Pill>
            ) : null}
            {room === 'ended' && stream.liveEndedAt ? (
              <Pill light>
                Wrapped at <DateText value={stream.liveEndedAt} format="time" className="mono" />
              </Pill>
            ) : null}
            {room === 'preview' && stream.ingestOnlineAt ? (
              <Pill>
                Signal since <DateText value={stream.ingestOnlineAt} format="time" className="mono" />
              </Pill>
            ) : null}
            <Stat light={light} icon={<Eye />} label="Watching now" value={isLive ? stream.viewers : 0} dim={!isLive} />
            <Stat light={light} icon={<TrendingUp />} label="Peak" value={stream.peakViewers} dim={stream.peakViewers === 0} />
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <div className="hidden items-end gap-1.5 lg:flex" aria-hidden="true">
            <Character
              shape={look.shape}
              mood={look.mood}
              size={76}
              follow={room === 'preview'}
              replayKey={cheer}
              color={room === 'live' || room === 'lost' ? '#ffffff' : undefined}
            />
            <Character
              shape={room === 'ended' ? 'square' : 'circle'}
              mood={room === 'idle' ? 'sleep' : room === 'lost' ? 'oops' : 'look'}
              size={50}
              lookAt={room === 'idle' ? undefined : { x: -0.9, y: -0.2 }}
            />
          </div>
          {canControl ? (
            <Controls
              stream={stream}
              room={room}
              goingLive={goingLive}
              ending={ending}
              onAsk={setConfirm}
              light={light}
              blocked={goLiveBlocked}
            />
          ) : (
            <p className={cn('max-w-xs text-sm lg:text-right', onRed ? 'text-white' : light ? 'text-white/80' : 'text-ink-3')}>
              {readOnlyText}
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'live'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={stream.state === 'ended' ? 'Go live again?' : 'Go live?'}
        description={
          <>
            {draft
              ? 'The event is still a draft, so only admins can watch until you publish it. The recording starts now too'
              : 'Everyone on the event page will see this. The recording starts now too'}
            {stream.state === 'ended' ? ', as a new session.' : '.'}
          </>
        }
        confirmLabel="Go live"
        onConfirm={() => onGoLive()}
      />
      <ConfirmDialog
        open={confirm === 'end'}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive
        title="End the stream?"
        description="This stops the public stream and starts building the recording. You can go live again later, as a new session."
        confirmLabel="End stream"
        onConfirm={() => onEnd()}
      />
    </section>
  );
}

function Controls({
  stream,
  room,
  goingLive,
  ending,
  onAsk,
  light,
  blocked,
}: {
  stream: StreamConfig;
  room: RoomState;
  goingLive: boolean;
  ending: boolean;
  onAsk: (v: 'live' | 'end') => void;
  light: boolean;
  blocked?: string;
}) {
  const live = room === 'live' || room === 'lost';
  const ready = canGoLive(stream);
  if (live) {
    return (
      <div className="flex flex-col gap-2 lg:items-end">
        <Button
          size="lg"
          onClick={() => onAsk('end')}
          loading={ending}
          icon={<Square className="fill-current" />}
          className="bg-white text-red-600 hover:bg-red-50 focus-visible:outline-white"
        >
          End stream
        </Button>
        <span className="text-xs text-white">Asks first. Nothing happens by accident.</span>
      </div>
    );
  }
  if (blocked) {
    return <p className={cn('max-w-xs text-sm lg:text-right', light ? 'text-white/80' : 'text-ink-3')}>{blocked}</p>;
  }
  return (
    <div className="flex flex-col gap-2 lg:items-end">
      <Button
        size="lg"
        onClick={() => onAsk('live')}
        disabled={!ready}
        loading={goingLive}
        icon={<Radio />}
        aria-describedby="go-live-hint"
        className={cn(
          'min-w-[11rem]',
          ready ? 'bg-red text-white shadow-[0_10px_30px_-10px_rgba(249,65,65,0.8)] hover:bg-red-600' : 'bg-white text-ink',
          light && 'focus-visible:outline-white',
          ready && 'zemi-ready-pulse',
        )}
      >
        {room === 'ended' ? 'Go live again' : 'Go live'}
      </Button>
      <span id="go-live-hint" className={cn('max-w-[16rem] text-xs lg:text-right', light ? 'text-white/75' : 'text-ink-3')}>
        {ready ? 'Asks first. Nothing happens by accident.' : 'Wakes up when we see a signal from OBS.'}
      </span>
    </div>
  );
}

function Pill({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm',
        light ? 'bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-sm' : 'bg-white text-ink-2 ring-1 ring-line-strong',
      )}
    >
      {children}
    </span>
  );
}

function Stat({ icon, label, value, light, dim }: { icon: ReactNode; label: string; value: number; light: boolean; dim?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm [&_svg]:size-3.5',
        light ? 'bg-white/15 text-white ring-1 ring-white/25' : 'bg-white text-ink-2 ring-1 ring-line-strong',
        dim && 'opacity-70',
      )}
    >
      {icon}
      <span>{label}</span>
      <span className="relative inline-flex min-w-[1.5ch] justify-end overflow-hidden font-semibold tabular-nums">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            initial={reduce ? { opacity: 0 } : { y: '80%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: '-80%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          >
            {value.toLocaleString('en-US')}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}

function SseDot({ status, light }: { status: SseStatus; light: boolean }) {
  const label =
    status === 'open' ? 'Live updates on' : status === 'forbidden' ? 'Live updates off' : status === 'connecting' ? 'Connecting...' : 'Reconnecting...';
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', light ? 'text-white/90' : 'text-ink-3')} role="status">
      <span
        className={cn(
          'size-1.5 rounded-full',
          status === 'open' ? (light ? 'bg-white' : 'bg-green') : status === 'forbidden' ? 'bg-ink-4' : 'animate-pulse bg-yellow',
        )}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

/** Three arcs: asleep when idle, sweeping when a signal comes in, pulsing when live. */
function SignalGlyph({ room, light }: { room: RoomState; light: boolean }) {
  const reduce = useReducedMotion();
  const active = room === 'preview' || room === 'live';
  const color = light ? '#ffffff' : room === 'preview' ? 'var(--color-ink)' : 'var(--color-ink-4)';
  return (
    <svg viewBox="0 0 48 48" className="size-11 shrink-0 sm:size-14" aria-hidden="true">
      <circle cx="24" cy="30" r="4.5" fill={room === 'live' ? '#fff' : room === 'preview' ? 'var(--color-yellow)' : color} stroke={room === 'preview' ? 'var(--color-ink)' : 'none'} strokeWidth="2" />
      {[10, 17, 24].map((r, i) => (
        <motion.path
          key={r}
          d={`M ${24 - r} ${30 - r * 0.2} A ${r} ${r} 0 0 1 ${24 + r} ${30 - r * 0.2}`}
          fill="none"
          stroke={color}
          strokeWidth="3.2"
          strokeLinecap="round"
          initial={false}
          animate={
            reduce || !active
              ? { opacity: room === 'lost' ? (i === 0 ? 0.9 : 0.25) : room === 'idle' ? 0.35 : 0.9 }
              : { opacity: [0.25, 1, 0.25] }
          }
          transition={reduce || !active ? { duration: 0.3 } : { duration: 1.5, repeat: Infinity, delay: i * 0.22, ease: 'easeInOut' }}
        />
      ))}
    </svg>
  );
}

/** Soft shapes drifting in the corner of the header. Pure decoration. */
function Decor({ room }: { room: RoomState }) {
  const reduce = useReducedMotion();
  const light = room === 'live' || room === 'lost' || room === 'ended';
  const fill = light ? 'rgba(255,255,255,0.09)' : room === 'preview' ? 'rgba(247,191,51,0.28)' : 'rgba(14,17,22,0.035)';
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <motion.svg
        viewBox="0 0 200 200"
        className="absolute -top-16 -right-10 size-[22rem] sm:-top-24 sm:right-24 sm:size-[28rem]"
        animate={reduce ? undefined : { rotate: room === 'live' ? 360 : 20 }}
        transition={room === 'live' ? { duration: 60, repeat: Infinity, ease: 'linear' } : { duration: 3, ease: [0.22, 1, 0.36, 1] }}
      >
        <circle cx="60" cy="60" r="44" fill={fill} />
        <rect x="112" y="18" width="72" height="72" rx="18" fill={fill} />
        <path d="M 20 190 L 20 150 A 40 40 0 0 1 100 150 L 100 190 Z" fill={fill} />
        <path d="M150 112 L 188 180 L 112 180 Z" fill={fill} strokeLinejoin="round" />
      </motion.svg>
    </div>
  );
}
