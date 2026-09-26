'use client';

import type { StreamConfig } from '@zemi/shared';
import { ChevronLeft, ChevronRight, KeyRound, MousePointer2, RefreshCw, ShieldAlert } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Character } from '@/components/admin/characters/character';
import { Button } from '@/components/admin/ui/button';
import { Card } from '@/components/admin/ui/card';
import { ConfirmDialog } from '@/components/admin/ui/confirm-dialog';
import { CopyField } from '@/components/admin/ui/display';
import { notify } from '@/components/admin/ui/toast';
import { cn } from '@/lib/admin/cn';

type Obs = NonNullable<StreamConfig['obs']>;

/**
 * "Connect OBS": the server and key to paste (combined key first, it is the one people need),
 * the two key parts separately, rotate keys (stream.control, confirm), and an illustrated
 * five-step OBS guide with the settings we recommend.
 */
export function ObsSetupCard({
  stream,
  canControl,
  onRotate,
  rotating,
}: {
  stream: StreamConfig;
  canControl: boolean;
  onRotate: () => Promise<unknown>;
  rotating: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const obs = stream.obs;
  const live = stream.state === 'live';

  return (
    <Card padding="none" as="section" aria-labelledby="obs-setup-title" className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600" aria-hidden="true">
            <KeyRound className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 id="obs-setup-title" className="font-display text-xl leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.2]">
              Connect OBS
            </h2>
            <p className="mt-0.5 text-sm text-ink-3">
              {obs
                ? 'Two things to paste, one button to press. The guide below has every setting we like.'
                : 'The keys stay with the people who run the stream.'}
            </p>
          </div>
        </div>
        {canControl && obs ? (
          <Button size="sm" variant="secondary" icon={<RefreshCw />} loading={rotating} onClick={() => setConfirm(true)}>
            Rotate keys
          </Button>
        ) : null}
      </div>

      {obs ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-px bg-line xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <KeysColumn obs={obs} />
          <ObsGuide obs={obs} />
        </div>
      ) : (
        <NoKeys />
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive
        title={live ? 'Rotate the private key?' : 'Rotate the stream keys?'}
        description={
          live ? (
            <>
              OBS gets kicked off right now, and viewers see the &quot;hang tight&quot; card until you paste the new key into OBS. The
              stream address and the recording keep going.
            </>
          ) : (
            <>Both keys change. Anyone streaming with the old key gets kicked off right away, and the old key stops working for good.</>
          )
        }
        confirmLabel="Rotate keys"
        onConfirm={() => onRotate()}
      />
    </Card>
  );
}

/**
 * The API leaves `obs` out for admins who may watch the stream but not run it (stream.view
 * without stream.control). Say who has the keys instead of showing empty fields.
 */
function NoKeys() {
  return (
    <div className="flex flex-col items-start gap-4 px-5 py-6 sm:flex-row sm:items-center sm:gap-5 sm:px-6 sm:py-7">
      <div className="flex shrink-0 items-end gap-1.5" aria-hidden="true">
        <Character shape="square" mood="look" size={40} lookAt={{ x: 0.8, y: -0.1 }} />
        <Character shape="circle" mood="idle" size={32} />
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-ink">Ask a stream operator for the OBS keys.</p>
        <p className="mt-1 max-w-prose text-sm text-ink-3">
          The key works like a password for this stream, so only people who can go live see it. You can still watch the preview, check the signal and find the
          recordings right here.
        </p>
      </div>
    </div>
  );
}

function KeysColumn({ obs }: { obs: Obs }) {
  return (
    <div className="min-w-0 space-y-5 bg-white px-5 py-5 sm:px-6 sm:py-6">
      <Flash value={obs.obsStreamKey}>
        <div className="rounded-2xl border border-yellow/60 bg-yellow-50/70 p-3.5 sm:p-4">
          <span className="mono mb-2 inline-flex rounded-full bg-yellow px-2 py-0.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-ink uppercase">
            Paste this into OBS
          </span>
          <CopyField
            value={obs.obsStreamKey}
            secret
            label="Stream key for OBS"
            onCopy={() => notify.success('Copied. Paste it into OBS, Settings, Stream, Stream Key.')}
            className="[&_div.group]:bg-white"
          />
          <p className="mt-2 text-[0.8125rem] text-ink-2">
            The private key rides along inside it, so treat it like a password. Anyone with it can stream as this event.
          </p>
        </div>
      </Flash>

      <Flash value={obs.server}>
        <CopyField label="Server" value={obs.server} />
      </Flash>

      <div className="rounded-2xl border border-line bg-surface-muted/60 p-3.5 sm:p-4">
        <p className="text-sm font-semibold text-ink">The two parts, if you need them apart</p>
        <p className="mt-0.5 text-[0.8125rem] text-ink-3">Some encoders ask for the stream path and a password separately.</p>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <Flash value={obs.streamKey}>
            <CopyField label="Stream key" value={obs.streamKey} size="sm" />
          </Flash>
          <Flash value={obs.privateKey}>
            <CopyField label="Private key" value={obs.privateKey} secret size="sm" />
          </Flash>
        </div>
      </div>

      <p className="flex items-start gap-2 text-[0.8125rem] text-ink-3">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-ink-4" aria-hidden="true" />
        <span>Key leaked in a screenshot? Rotate it. The old one stops working the second you do.</span>
      </p>
    </div>
  );
}

/** Briefly highlights its child when `value` changes (after a rotate). */
function Flash({ value, children }: { value: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const [first] = useState(value);
  const changed = first !== value;
  return (
    <motion.div
      key={value}
      initial={changed && !reduce ? { backgroundColor: 'rgba(247,191,51,0.45)', scale: 0.985 } : false}
      animate={{ backgroundColor: 'rgba(247,191,51,0)', scale: 1 }}
      transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      className="-m-1 min-w-0 rounded-[18px] p-1"
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ guide */

interface GuideRow {
  label: string;
  value: string;
  /** Highlighted in the illustration (the thing to change). */
  mark?: boolean;
}

interface GuideStep {
  key: string;
  tab: string;
  title: string;
  where: string;
  /** Which OBS settings page the illustration shows ('controls' is the main window dock). */
  page: 'Stream' | 'Output' | 'Audio' | 'Video' | 'controls';
  rows: GuideRow[];
  notes: ReactNode[];
}

function steps(obs: Obs): GuideStep[] {
  const maskedKey = `${obs.streamKey.slice(0, 4)}...?key=••••••••`;
  return [
    {
      key: 'stream',
      tab: 'Stream',
      title: 'Point OBS at Zemi',
      where: 'Settings, Stream',
      page: 'Stream',
      rows: [
        { label: 'Service', value: 'Custom...', mark: true },
        { label: 'Server', value: obs.server, mark: true },
        { label: 'Stream Key', value: maskedKey, mark: true },
        { label: 'Use authentication', value: 'Off' },
      ],
      notes: [
        <>Service: pick <b>Custom...</b> at the very bottom of the list.</>,
        <>Paste the <b>Server</b> and the <b>Stream key for OBS</b> from this card.</>,
        <>Leave &quot;Use authentication&quot; off. The key already has the password in it.</>,
      ],
    },
    {
      key: 'output',
      tab: 'Output',
      title: 'Encoder and bitrate',
      where: 'Settings, Output, Output Mode: Advanced, Streaming tab',
      page: 'Output',
      rows: [
        { label: 'Encoder', value: 'x264 or hardware', mark: true },
        { label: 'Rate Control', value: 'CBR', mark: true },
        { label: 'Bitrate', value: '4000 Kbps', mark: true },
        { label: 'Keyframe Interval', value: '2 s', mark: true },
        { label: 'Profile', value: 'high' },
        { label: 'Tune', value: 'zerolatency' },
      ],
      notes: [
        <>Encoder: <b>x264</b>, or the hardware one (Apple VT H.264, NVIDIA NVENC H.264) if the laptop gets hot.</>,
        <>Rate control <b>CBR</b>. Bitrate <b>3500 to 4500 kbps</b> for 1080p30, or <b>2500 kbps</b> for 720p30.</>,
        <><b>Keyframe interval 2 s</b>. This one matters: it keeps the delay short and the recording tidy.</>,
        <>Profile <b>high</b>. Tune <b>zerolatency</b> is optional (x264 only).</>,
      ],
    },
    {
      key: 'audio',
      tab: 'Audio',
      title: 'Sound people can hear',
      where: 'Settings, Output, Audio tab and Settings, Audio',
      page: 'Audio',
      rows: [
        { label: 'Audio Bitrate', value: '160', mark: true },
        { label: 'Sample Rate', value: '48 kHz', mark: true },
        { label: 'Channels', value: 'Stereo' },
        { label: 'Mic/Auxiliary Audio', value: 'Room mic' },
      ],
      notes: [
        <>Audio bitrate <b>160 kbps</b> (Output, Audio tab).</>,
        <>Sample rate <b>48 kHz</b> (Settings, Audio). Stereo is fine.</>,
        <>Pick the room mic, then clap once and watch the green bar in the OBS mixer.</>,
      ],
    },
    {
      key: 'video',
      tab: 'Video',
      title: 'Picture size',
      where: 'Settings, Video',
      page: 'Video',
      rows: [
        { label: 'Base (Canvas) Resolution', value: '1920x1080', mark: true },
        { label: 'Output (Scaled) Resolution', value: '1920x1080', mark: true },
        { label: 'Common FPS Values', value: '30', mark: true },
      ],
      notes: [
        <>Base and output <b>1920x1080</b>, or <b>1280x720</b> on slow campus wifi.</>,
        <>Frame rate <b>30</b>. Slides do not need 60, and your upload speed will thank you.</>,
      ],
    },
    {
      key: 'go',
      tab: 'Go',
      title: 'Start streaming',
      where: 'OBS main window, Controls',
      page: 'controls',
      rows: [
        { label: 'Start Streaming', value: '', mark: true },
        { label: 'Start Recording', value: '' },
        { label: 'Settings', value: '' },
      ],
      notes: [
        <>Click <b>Start Streaming</b> in OBS.</>,
        <>This page flips to <b>Receiving signal</b> in a second or two. Only admins can see that preview.</>,
        <>Check the picture and the mic, then press <b>Go live</b> up top when the room is ready.</>,
      ],
    },
  ];
}

function ObsGuide({ obs }: { obs: Obs }) {
  const list = steps(obs);
  const [index, setIndex] = useState(0);
  const step = list[index]!;
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // On narrow screens the step strip scrolls sideways: keep the current step in view.
  useEffect(() => {
    const strip = listRef.current;
    const tab = tabRefs.current[index];
    if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return;
    const lr = strip.getBoundingClientRect();
    const tr = tab.getBoundingClientRect();
    if (tr.left < lr.left) strip.scrollLeft -= lr.left - tr.left + 8;
    else if (tr.right > lr.right) strip.scrollLeft += tr.right - lr.right + 8;
  }, [index]);
  const reduce = useReducedMotion();

  const go = (i: number, focus = false) => {
    const next = (i + list.length) % list.length;
    setIndex(next);
    if (focus) tabRefs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      go(index + 1, true);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      go(index - 1, true);
    } else if (e.key === 'Home') {
      e.preventDefault();
      go(0, true);
    } else if (e.key === 'End') {
      e.preventDefault();
      go(list.length - 1, true);
    }
  };

  return (
    <div className="@container min-w-0 bg-white px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-[1.0625rem] font-extrabold tracking-[-0.015em] [font-variation-settings:'CASL'_0.2]">OBS in five steps</h3>
        <span className="mono text-xs text-ink-3">
          Step {index + 1} of {list.length}
        </span>
      </div>

      <div ref={listRef} role="tablist" aria-label="OBS setup steps" onKeyDown={onKey} className="mt-3 flex gap-1 overflow-x-auto rounded-full bg-surface-muted p-1 [scrollbar-width:none]">
        {list.map((s, i) => {
          const active = i === index;
          const done = i < index;
          return (
            <button
              key={s.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`${baseId}-tab-${s.key}`}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`${baseId}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => go(i)}
              className={cn(
                'relative flex h-9 flex-[1_0_auto] items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                active ? 'text-ink' : 'text-ink-3 hover:text-ink',
              )}
            >
              {active ? (
                <motion.span
                  layoutId={`${baseId}-pill`}
                  className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgba(14,17,22,0.08),0_0_0_1px_var(--color-line)]"
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
                />
              ) : null}
              <span
                className={cn(
                  'mono relative flex size-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold',
                  active ? 'bg-ink text-white' : done ? 'bg-green text-white' : 'bg-white text-ink-3 ring-1 ring-line-strong',
                )}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span className="relative">{s.tab}</span>
            </button>
          );
        })}
      </div>

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${step.key}`} className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-5 @3xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] @3xl:items-start">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step.key}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, rotate: -0.6 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduce ? 0.12 : 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <ObsWindow step={step} />
          </motion.div>
        </AnimatePresence>

        <div className="min-w-0">
          <p className="mono text-[0.75rem] tracking-[0.08em] text-ink-3 uppercase">{step.where}</p>
          <h4 className="mt-1 font-display text-lg font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.3]">{step.title}</h4>
          <ol className="mt-3 space-y-2.5">
            {step.notes.map((n, i) => (
              <li key={i} className="flex gap-2.5 text-[0.9375rem] leading-snug text-ink-2 [&_b]:font-semibold [&_b]:text-ink">
                <span className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-blue" aria-hidden="true" />
                <span>{n}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex items-center gap-2">
            <Button size="sm" variant="ghost" icon={<ChevronLeft />} onClick={() => go(index - 1)} disabled={index === 0}>
              Back
            </Button>
            <Button size="sm" variant={index === list.length - 1 ? 'secondary' : 'primary'} iconRight={<ChevronRight />} onClick={() => go(index + 1)}>
              {index === list.length - 1 ? 'From the top' : 'Next step'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const OBS_PAGES = ['General', 'Stream', 'Output', 'Audio', 'Video', 'Hotkeys'] as const;

/**
 * A little drawing of the OBS settings window with the fields to change highlighted.
 * Decorative (aria-hidden): the same instructions are in the list next to it.
 */
function ObsWindow({ step }: { step: GuideStep }) {
  const reduce = useReducedMotion();
  const firstMark = step.rows.findIndex((r) => r.mark);
  return (
    <div aria-hidden="true" className="relative overflow-hidden rounded-2xl bg-[#1c1f26] text-[0.75rem] text-[#d7dbe3] shadow-[0_18px_40px_-24px_rgba(14,17,22,0.7)] ring-1 ring-black/40 select-none">
      <div className="flex h-7 items-center gap-1.5 border-b border-white/5 bg-[#252932] px-3">
        <span className="size-2.5 rounded-full bg-[#f94141]" />
        <span className="size-2.5 rounded-full bg-[#f7bf33]" />
        <span className="size-2.5 rounded-full bg-[#0f8657]" />
        <span className="mono ml-2 truncate text-[0.6875rem] text-white/50">{step.page === 'controls' ? 'OBS Studio' : 'Settings'}</span>
      </div>

      {step.page === 'controls' ? (
        <ControlsMock />
      ) : (
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] sm:grid-cols-[6.5rem_minmax(0,1fr)]">
          <ul className="space-y-0.5 border-r border-white/5 bg-[#20242c] p-1.5">
            {OBS_PAGES.map((p) => (
              <li
                key={p}
                className={cn('truncate rounded-md px-2 py-1.5', p === step.page ? 'bg-[#3a6dc5] font-semibold text-white' : 'text-white/55')}
              >
                {p}
              </li>
            ))}
          </ul>
          <div className="min-w-0 space-y-2 p-3 sm:p-3.5">
            {step.page === 'Output' ? (
              <div className="mb-1 flex items-center gap-2 text-[0.6875rem] text-white/55">
                <span>Output Mode</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/85">Advanced</span>
              </div>
            ) : null}
            {step.rows.map((r, i) => (
              <div key={r.label} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] items-center gap-2">
                <span className="truncate text-right text-white/60">{r.label}</span>
                <motion.span
                  initial={reduce || !r.mark ? false : { boxShadow: '0 0 0 0 rgba(247,191,51,0)' }}
                  animate={
                    reduce || !r.mark
                      ? undefined
                      : { boxShadow: ['0 0 0 0 rgba(247,191,51,0)', '0 0 0 3px rgba(247,191,51,0.55)', '0 0 0 2px rgba(247,191,51,0.9)'] }
                  }
                  transition={{ duration: 0.7, delay: 0.25 + i * 0.12, ease: 'easeOut' }}
                  className={cn(
                    'mono relative truncate rounded-md px-2 py-1 text-[0.6875rem]',
                    r.mark ? 'bg-[#2e333d] text-white ring-1 ring-[#f7bf33]' : 'bg-[#2a2e37] text-white/70',
                  )}
                >
                  {r.value}
                  {i === firstMark && !reduce ? <Pointer delay={0.15} /> : null}
                </motion.span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ControlsMock() {
  const reduce = useReducedMotion();
  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-2 p-2.5 sm:gap-3 sm:p-3">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-[#0e1116]">
        <div className="absolute inset-0 flex">
          {['#3a6dc5', '#f7bf33', '#f94141', '#0f8657', '#f5f6f8', '#3a6dc5'].map((c, i) => (
            <span key={i} className="h-3/5 flex-1 opacity-80" style={{ background: c }} />
          ))}
        </div>
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[0.625rem] text-white/80">Scene: Zemi room</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[0.625rem] tracking-[0.08em] text-white/45 uppercase">Controls</span>
        <motion.span
          className="relative rounded-md bg-[#3a6dc5] px-2 py-1.5 text-center font-semibold text-white ring-2 ring-[#f7bf33]"
          animate={reduce ? undefined : { scale: [1, 0.94, 1] }}
          transition={{ duration: 0.5, delay: 1.1, repeat: Infinity, repeatDelay: 2.2 }}
        >
          Start Streaming
          {!reduce ? <Pointer delay={0.3} /> : null}
        </motion.span>
        <span className="rounded-md bg-[#2a2e37] px-2 py-1.5 text-center text-white/70">Start Recording</span>
        <span className="rounded-md bg-[#2a2e37] px-2 py-1.5 text-center text-white/70">Settings</span>
      </div>
    </div>
  );
}

/** A cursor that glides onto the highlighted field and taps it. */
function Pointer({ delay = 0 }: { delay?: number }) {
  return (
    <motion.span
      className="pointer-events-none absolute right-2 bottom-[-6px] text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.6)]"
      initial={{ x: 40, y: 26, opacity: 0 }}
      animate={{ x: 0, y: 0, opacity: 1, scale: [1, 1, 0.85, 1] }}
      transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1], scale: { duration: 0.4, delay: delay + 0.8 } }}
    >
      <MousePointer2 className="size-4 fill-white text-ink" />
    </motion.span>
  );
}
