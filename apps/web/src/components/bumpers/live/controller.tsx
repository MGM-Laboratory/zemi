'use client';

import { type BumperControlInput, type BumperPresenceClient, type BumperShowDetail, type BumperSlide } from '@zemi/shared';
import { ChevronLeft, ChevronRight, Clapperboard, Gamepad2, Keyboard, MonitorOff, MonitorPlay, Moon, PanelsTopLeft, Pause, Play, Radio, RotateCcw, Scissors, SkipBack, SkipForward, Sun, Tv } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { formatRelative } from '@/lib/admin/format';
import { cn } from '@/lib/admin/cn';
import { adminRoutes } from '@/lib/admin/nav';
import { BumperThumb } from '../builder/thumb';
import { eventChipLabel } from '../library/labels';
import { BumperClockProvider, useBumperNow } from '../engine/clock';
import { BumperStage } from '../engine/stage';
import type { TransitionEvent } from '../transitions/director';
import { Countdown, DarkButton, focusRing, KeyHelpPanel, ModeChip, TimingBadges } from './chrome';
import { LiveGate } from './gate';
import { ObsGuideDialog } from './obs-guide';
import { Program } from './program';
import { advanceLeft, formatSpan, STATUS_LABEL, StatusDot, transitionLabel, useFontsReady, useFullscreen, usePlaybackInfo, usePlaybackKeys, wibClock, type PlaybackInfo } from './shared';
import { AdminLiveContext, useAdminLive, useDirectorTarget, type AdminLive } from './use-live';

const NAV: ReadonlySet<BumperControlInput['action']> = new Set(['next', 'prev', 'goto', 'first', 'last']);

/**
 * /admin/stage/bumpers/[id]/control: the dark control room. The monitor is a live director
 * following the server (exactly what OBS shows), with next and previous previews, a filmstrip of
 * every bumper, the transport, notes, the auto-advance countdown and who is connected.
 */
export function BumperController({ id }: { id: string }) {
  const live = useAdminLive(id);
  return (
    <AdminLiveContext.Provider value={live}>
      <LiveGate live={live} what="control">
        {(show) => <ControlRoom live={live} show={show} />}
      </LiveGate>
    </AdminLiveContext.Provider>
  );
}

function ControlRoom({ live, show }: { live: AdminLive; show: BumperShowDetail }) {
  const router = useRouter();
  const [cut, setCut] = useState(false);
  const [help, setHelp] = useState(false);
  const [obs, setObs] = useState(false);
  const [flash, setFlash] = useState<TransitionEvent | null>(null);
  const [, toggleFullscreen] = useFullscreen();
  const stripRef = useRef<HTMLDivElement>(null);
  const state = live.state;
  const info = usePlaybackInfo(show.slides, state?.slideId ?? null, show.theme, show.data, show.eventId);
  const mode = state?.mode ?? 'show';
  const autoplay = state?.autoplay ?? true;

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const send = (input: BumperControlInput) => {
    const armed = cut && NAV.has(input.action);
    if (armed) setCut(false);
    void live.send(armed ? { ...input, transition: 'cut' } : input);
  };
  const goto = (s: BumperSlide) => send({ action: 'goto', slideId: s.id });
  const act = {
    next: () => send({ action: 'next' }),
    prev: () => send({ action: 'prev' }),
    first: () => send({ action: 'first' }),
    last: () => send({ action: 'last' }),
    goto: (position: number) => {
      const s = info.playable[position - 1];
      if (s) goto(s);
    },
    black: () => send({ action: 'toggle-black' }),
    clear: () => send({ action: mode === 'clear' ? 'show' : 'clear' }),
    show: () => send({ action: 'show' }),
    replay: () => send({ action: 'replay' }),
    autoplay: () => send({ action: autoplay ? 'autoplay-off' : 'autoplay-on' }),
  };

  const buffer = usePlaybackKeys({
    ...act,
    fullscreen: toggleFullscreen,
    help: () => setHelp((h) => !h),
    cut: () => setCut((c) => !c),
    grid: () => stripRef.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus(),
    escape: () => {
      if (help) setHelp(false);
      else router.push(adminRoutes.bumper(show.id));
    },
  }, !obs);

  const current = info.current;
  const announce = current ? `On screen: ${info.index + 1} of ${info.playable.length}, ${info.titles.get(current.id) ?? ''}${mode !== 'show' ? `, screen ${mode}` : ''}.` : 'Nothing on screen.';

  return (
    <BumperClockProvider value={{ offsetMs: live.offsetMs }}>
      <div data-bumper-controller="" className="min-h-dvh bg-[#0b0d11] text-white">
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announce}
        </p>
        <TopBar live={live} show={show} onObs={() => setObs(true)} onHelp={() => setHelp(true)} />

        <main className="mx-auto grid max-w-[1800px] grid-cols-[minmax(0,1fr)] gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:gap-5 lg:p-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
          <section aria-label="On screen" className="min-w-0 space-y-4">
            <Monitor live={live} show={show} info={info} flash={flash} onTransition={(e) => e.phase === 'start' && setFlash(e)} buffer={buffer} cut={cut} />
            <Transport live={live} info={info} mode={mode} autoplay={autoplay} cut={cut} act={act} onCut={() => setCut((c) => !c)} />
          </section>

          <aside aria-label="Up next and notes" className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)]">
            <Preview label="Up next" slide={info.next} show={show} info={info} emphasis onPick={goto} extra={info.next ? `via ${transitionLabel(info.nextTransition)}` : null} empty={info.playable.length ? "That's the last one. Next does nothing from here." : 'No bumpers to play yet.'} />
            <Preview label="Before" slide={info.prev} show={show} info={info} onPick={goto} empty={info.playable.length ? 'This is the first one.' : 'Nothing before, nothing after.'} />
            <Notes slide={current} className="sm:col-span-2 lg:col-span-1" />
            <Presence live={live} onObs={() => setObs(true)} className="sm:col-span-2 lg:col-span-1" />
          </aside>

          <section aria-label="Every bumper" className="min-w-0 lg:col-span-2">
            <Filmstrip ref={stripRef} show={show} info={info} onPick={goto} />
          </section>
        </main>

        {help ? (
          <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && setHelp(false)}>
            <KeyHelpPanel where="controller" onClose={() => setHelp(false)} />
          </div>
        ) : null}
        <ObsGuideDialog showId={show.id} open={obs} onOpenChange={setObs} />
      </div>
    </BumperClockProvider>
  );
}

/* ---------------------------------------------------------------- top bar */

function TopBar({ live, show, onObs, onHelp }: { live: AdminLive; show: BumperShowDetail; onObs: () => void; onHelp: () => void }) {
  const now = useBumperNow(1000);
  const started = live.state?.startedAt ? Date.parse(live.state.startedAt) : null;
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#0b0d11]/92 backdrop-blur">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-4 lg:px-5">
        <Link href={adminRoutes.bumper(show.id)} className={cn('-ml-1 inline-flex h-9 items-center gap-1 rounded-full pr-3 pl-2 text-sm font-medium text-white/75 hover:bg-white/[0.07] hover:text-white', focusRing)}>
          <ChevronLeft className="size-4" aria-hidden="true" />
          <span className="max-sm:sr-only">Builder</span>
        </Link>
        <div className="min-w-0 flex-1 sm:basis-48">
          <h1 className="truncate font-display text-lg leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.2]">{show.title}</h1>
          <p className="truncate text-[0.8125rem] text-white/50">{show.event ? eventChipLabel(show.event) : 'No event'} · Controller</p>
        </div>
        <dl className="order-3 flex w-full items-center gap-4 text-[0.8125rem] sm:order-none sm:w-auto sm:gap-5">
          <div className="flex flex-col leading-tight">
            <dt className="mono text-[0.625rem] tracking-[0.1em] text-white/45 uppercase">Running</dt>
            <dd className="mono text-[0.9375rem] text-white tabular-nums">{started ? formatSpan(now - started) : 'Not yet'}</dd>
          </div>
          <div className="flex flex-col leading-tight">
            <dt className="mono text-[0.625rem] tracking-[0.1em] text-white/45 uppercase">WIB</dt>
            <dd className="mono text-[0.9375rem] text-white tabular-nums" suppressHydrationWarning>
              {wibClock(now)}
            </dd>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:ml-0" title={STATUS_LABEL[live.status]}>
            <StatusDot status={live.status} />
            <span className="text-white/70">{live.status === 'open' ? 'Connected' : STATUS_LABEL[live.status]}</span>
          </div>
        </dl>
        <div className="flex items-center gap-1.5 max-sm:order-2">
          <Link href={adminRoutes.bumperPlay(show.id)} target="_blank" rel="noopener" className={cn('inline-flex h-9 items-center gap-1.5 rounded-full bg-white/[0.07] px-3 text-[0.8125rem] font-semibold ring-1 ring-white/10 hover:bg-white/[0.12] [&_svg]:size-4', focusRing)}>
            <Tv aria-hidden="true" />
            <span className="max-sm:sr-only">Player</span>
          </Link>
          <DarkButton size="sm" tone="plain" icon={<Clapperboard />} onClick={onObs} aria-label="OBS setup">
            <span className="max-sm:sr-only">OBS</span>
          </DarkButton>
          <DarkButton size="sm" tone="ghost" icon={<Keyboard />} onClick={onHelp} aria-label="Keys" className="size-9 px-0" title="Keys (?)" />
        </div>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------- monitor */

function Monitor({ live, show, info, flash, onTransition, buffer, cut }: { live: AdminLive; show: BumperShowDetail; info: PlaybackInfo; flash: TransitionEvent | null; onTransition: (e: TransitionEvent) => void; buffer: string; cut: boolean }) {
  const target = useDirectorTarget(live.state, show.slides, show.version);
  const fonts = useFontsReady();
  const now = useBumperNow(250);
  const state = live.state;
  const mode = state?.mode ?? 'show';
  const onAir = (live.presence?.outputs ?? 0) > 0;
  const cur = info.current;
  const auto = cur?.timing.autoAdvanceSec ?? null;
  const left = advanceLeft(state, now);
  const where = info.loopTo ?? info.next;
  return (
    <div className="rounded-[24px] bg-[#13161c] p-2.5 ring-1 ring-white/[0.08] sm:p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1.5 pt-0.5 pb-2.5">
        <span className={cn('mono inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[0.6875rem] font-bold tracking-[0.1em] uppercase', onAir && mode === 'show' ? 'bg-[#f94141] text-white' : 'bg-white/10 text-white/70')}>
          {onAir ? <Radio className="size-3.5" aria-hidden="true" /> : null}
          {onAir ? 'On air' : 'On screen'}
        </span>
        <span className="mono text-sm text-white/60 tabular-nums">
          {cur ? info.index + 1 : 0} of {info.playable.length}
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold">{cur ? info.titles.get(cur.id) : 'Nothing on screen'}</span>
        <ModeChip mode={mode} />
        {flash ? <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[0.75rem] text-white/80">{transitionLabel(flash.key)}</span> : null}
      </div>
      <div className="relative aspect-video overflow-hidden rounded-[16px] bg-black" style={mode === 'clear' ? { background: 'repeating-conic-gradient(#1a1e26 0% 25%, #232834 0% 50%) 50% / 28px 28px' } : undefined}>
        <BumperStage style={{ position: 'absolute', inset: 0 }} letterbox="transparent" aria-label={cur ? `Monitor: ${info.titles.get(cur.id) ?? ''}` : 'Monitor'}>
          {target && fonts ? <Program slides={show.slides} theme={show.theme} data={show.data} showEventId={show.eventId} target={target} mode={mode} replay={state?.cue ?? 0} onTransition={onTransition} /> : null}
        </BumperStage>
        <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-2">
          {buffer ? (
            <span className="rounded-full bg-[#0e1116]/90 px-4 py-1.5 text-sm shadow-lg ring-1 ring-white/15">
              Go to <b className="mono">{buffer}</b> <span className="text-white/55">then Enter</span>
            </span>
          ) : null}
          {cut ? (
            <span className="flex items-center gap-1.5 rounded-full bg-[#f94141] px-3.5 py-1.5 text-sm font-semibold shadow-lg">
              <Scissors className="size-4" aria-hidden="true" /> Cut armed
            </span>
          ) : null}
        </div>
        {!info.playable.length ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <p className="font-display text-xl font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.25]">Nothing to run yet.</p>
              <p className="mt-1 text-sm text-white/60">
                Add a bumper or two in the{' '}
                <Link href={adminRoutes.bumper(show.id)} className="font-semibold text-white underline underline-offset-2">
                  builder
                </Link>
                , or unhide one. This screen picks it up by itself.
              </p>
            </div>
          </div>
        ) : null}
        {mode === 'clear' ? <span className="mono absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[0.6875rem] text-white/75">Clear: OBS shows the camera</span> : null}
      </div>
      {auto ? (
        <div className="flex items-center gap-3 px-1.5 pt-3 pb-1 text-sm">
          <Countdown left={left} total={auto} paused={!state?.autoplay || mode !== 'show'} size={26} />
          <span className="min-w-0 flex-1 truncate text-white/75">
            {!state?.autoplay
              ? 'Auto-advance is paused.'
              : mode !== 'show'
                ? `Auto-advance waits while the screen is ${mode}.`
                : left !== null
                  ? `Moves on in ${Math.ceil(left)}s${where ? ` to ${info.titles.get(where.id)}` : ''}${info.loopTo ? ' (loop)' : ''}`
                  : 'Moves on by itself once the show starts.'}
          </span>
          <div className="hidden h-1.5 w-40 overflow-hidden rounded-full bg-white/10 sm:block" aria-hidden="true">
            <div className="h-full rounded-full bg-[#f7bf33] transition-[width] duration-300 ease-linear" style={{ width: `${left !== null ? Math.max(0, Math.min(100, (left / auto) * 100)) : 100}%` }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- transport */

function Transport({ live, info, mode, autoplay, cut, act, onCut }: { live: AdminLive; info: PlaybackInfo; mode: 'show' | 'black' | 'clear'; autoplay: boolean; cut: boolean; act: Record<'next' | 'prev' | 'first' | 'last' | 'black' | 'clear' | 'show' | 'replay' | 'autoplay', () => void>; onCut: () => void }) {
  const busy = live.pending > 0;
  const atStart = info.index <= 0;
  const atEnd = info.index >= info.playable.length - 1;
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,2fr)_auto] sm:gap-3">
        <DarkButton size="xl" tone="ghost" onClick={act.first} disabled={atStart} aria-label="First bumper" title="First (Home)" className="hidden w-14 px-0 sm:inline-flex" icon={<SkipBack />} />
        <DarkButton size="xl" tone="plain" onClick={act.prev} disabled={atStart} icon={<ChevronLeft />} busy={busy}>
          <span className="hidden sm:inline">Previous</span>
          <span className="sm:hidden">Back</span>
        </DarkButton>
        <DarkButton size="xl" tone="primary" onClick={act.next} disabled={atEnd} busy={busy} className="text-xl">
          Next
          <ChevronRight />
        </DarkButton>
        <DarkButton size="xl" tone="ghost" onClick={act.last} disabled={atEnd} aria-label="Last bumper" title="Last (End)" className="hidden w-14 px-0 sm:inline-flex" icon={<SkipForward />} />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div role="group" aria-label="Screen" className="col-span-3 grid grid-cols-3 rounded-2xl bg-white/[0.05] p-1 ring-1 ring-white/10 sm:flex">
          <ModeButton on={mode === 'show'} onClick={act.show} icon={<Sun />} label="Show" hint="Slides on screen" />
          <ModeButton on={mode === 'black'} onClick={act.black} icon={<Moon />} label="Black" hint="B" />
          <ModeButton on={mode === 'clear'} onClick={act.clear} icon={<MonitorOff />} label="Clear" hint="C" />
        </div>
        <DarkButton size="lg" tone={autoplay ? 'plain' : 'active'} onClick={act.autoplay} aria-pressed={!autoplay} icon={autoplay ? <Pause /> : <Play />} title="P" className="max-sm:px-2">
          {autoplay ? 'Pause auto' : 'Resume auto'}
        </DarkButton>
        <DarkButton size="lg" tone="plain" onClick={act.replay} icon={<RotateCcw />} title="R" className="max-sm:px-2">
          Replay
        </DarkButton>
        <DarkButton size="lg" tone={cut ? 'danger' : 'plain'} onClick={onCut} aria-pressed={cut} icon={<Scissors />} title="X: the next change skips its transition" className="max-sm:px-2">
          {cut ? 'Cut armed' : 'Cut'}
        </DarkButton>
      </div>
      {live.error ? (
        <p role="alert" className="rounded-2xl bg-[#f94141]/12 px-4 py-2.5 text-sm text-[#ffc2c2] ring-1 ring-[#f94141]/40">
          {live.error}
        </p>
      ) : null}
    </div>
  );
}

function ModeButton({ on, onClick, icon, label, hint }: { on: boolean; onClick: () => void; icon: ReactNode; label: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={hint}
      className={cn('inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors [&_svg]:size-[18px] sm:px-4', on ? 'bg-white text-[#0e1116]' : 'text-white/75 hover:bg-white/[0.08] hover:text-white', focusRing)}
    >
      {icon}
      {label}
    </button>
  );
}

/* ---------------------------------------------------------------- side cards */

const card = 'rounded-[20px] bg-[#13161c] p-3.5 ring-1 ring-white/[0.08] sm:p-4';
const cardLabel = 'mono text-[0.6875rem] font-semibold tracking-[0.1em] text-white/50 uppercase';

function Preview({ label, slide, show, info, emphasis, extra, empty, onPick }: { label: string; slide: BumperSlide | null; show: BumperShowDetail; info: PlaybackInfo; emphasis?: boolean; extra?: string | null; empty: string; onPick: (s: BumperSlide) => void }) {
  const pos = slide ? info.playable.indexOf(slide) + 1 : 0;
  return (
    <div className={card}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className={cardLabel}>{label}</h2>
        {slide ? <TimingBadges slide={slide} titleOf={(id) => info.titles.get(id)} /> : null}
      </div>
      {slide ? (
        <button type="button" onClick={() => onPick(slide)} className={cn('group block w-full text-left', focusRing, 'rounded-[14px]')} aria-label={`Go to ${pos}, ${info.titles.get(slide.id) ?? ''}`}>
          <BumperThumb slide={slide} theme={show.theme} data={show.data} showEventId={show.eventId} className={cn('aspect-video w-full rounded-[14px] ring-1 ring-white/10 transition group-hover:ring-white/30', !emphasis && 'opacity-90')} />
          <span className="mt-2.5 flex items-baseline gap-2">
            <span className="mono text-sm text-white/50">{pos}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{info.titles.get(slide.id)}</span>
          </span>
          {extra ? <span className="block text-[0.8125rem] text-white/55">{extra}</span> : null}
        </button>
      ) : (
        <p className="rounded-[14px] bg-white/[0.03] px-3 py-6 text-center text-sm text-white/50">{empty}</p>
      )}
    </div>
  );
}

function Notes({ slide, className }: { slide: BumperSlide | null; className?: string }) {
  const notes = slide?.notes?.trim();
  return (
    <div className={cn(card, className)}>
      <h2 className={cardLabel}>Notes for this one</h2>
      {notes ? <p className="mt-2 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-white/90">{notes}</p> : <p className="mt-2 text-sm text-white/45">No notes. Add some in the builder, on the Notes tab.</p>}
    </div>
  );
}

const KIND_ICON = { output: MonitorPlay, dock: PanelsTopLeft, controller: Gamepad2 } as const;

function clientName(c: BumperPresenceClient, me: string): string {
  if (c.id === me) return 'This controller';
  if (c.kind === 'output') return c.obs ? 'OBS output' : 'Output in a browser';
  if (c.kind === 'dock') return c.obs ? 'OBS dock' : 'Dock';
  return 'Player or controller';
}

function Presence({ live, onObs, className }: { live: AdminLive; onObs: () => void; className?: string }) {
  const clients = live.presence?.clients ?? [];
  const outputs = clients.filter((c) => c.kind === 'output');
  const obsOn = outputs.some((c) => c.obs);
  const order = { output: 0, dock: 1, controller: 2 } as const;
  const sorted = [...clients].sort((a, b) => order[a.kind] - order[b.kind]);
  return (
    <div className={cn(card, className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className={cardLabel}>Screens</h2>
        {obsOn ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0f8657]/25 px-2 py-0.5 text-[0.75rem] font-semibold text-[#7fd6ad]">
            <span className="size-1.5 rounded-full bg-[#1fb872]" aria-hidden="true" />
            OBS connected
          </span>
        ) : null}
      </div>
      {!outputs.length ? (
        <div className="mt-2.5 flex items-start justify-between gap-3 rounded-[14px] bg-white/[0.03] p-3">
          <p className="text-sm text-white/60">No outputs yet. Put the output link in OBS and it shows up here.</p>
          <DarkButton size="sm" tone="plain" onClick={onObs}>
            How
          </DarkButton>
        </div>
      ) : null}
      <ul className="mt-2.5 space-y-1.5">
        {sorted.map((c) => {
          const Icon = KIND_ICON[c.kind];
          return (
            <li key={`${c.kind}-${c.id}`} className="flex items-center gap-3 rounded-xl px-1 py-1">
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', c.kind === 'output' ? 'bg-[#3a6dc5]/25 text-[#9dbcf0]' : 'bg-white/[0.07] text-white/70')}>
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{clientName(c, live.cid)}</span>
                <span className="block truncate text-[0.75rem] text-white/50">
                  {c.agent ?? 'Unknown browser'} · connected {formatRelative(c.since)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- filmstrip */

function Filmstrip({ show, info, onPick, ref }: { show: BumperShowDetail; info: PlaybackInfo; onPick: (s: BumperSlide) => void; ref: Ref<HTMLDivElement> }) {
  const numbers = useMemo(() => {
    let n = 0;
    return new Map(show.slides.map((s) => [s.id, s.hidden ? null : ++n]));
  }, [show.slides]);
  const listRef = useRef<HTMLOListElement>(null);
  const currentId = info.current?.id ?? null;

  // Keep the bumper on screen in view as the show moves.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    const box = listRef.current;
    if (!el || !box) return;
    const target = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2;
    box.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [currentId]);

  const onKey = (e: KeyboardEvent<HTMLOListElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const at = buttons.findIndex((b) => b === document.activeElement);
    if (at < 0) return;
    e.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, at + (e.key === 'ArrowRight' ? 1 : -1)))]?.focus();
  };

  return (
    <div ref={ref} className="rounded-[24px] bg-[#13161c] p-3 ring-1 ring-white/[0.08]">
      <div className="flex items-baseline justify-between gap-3 px-1.5 pb-2.5">
        <h2 className={cardLabel}>Every bumper</h2>
        <p className="hidden text-[0.8125rem] text-white/45 sm:block">Click one to jump there. Hidden ones are dimmed.</p>
      </div>
      {!show.slides.length ? <p className="px-1.5 pb-2 text-sm text-white/45">No bumpers in this show yet.</p> : null}
      <ol ref={listRef} data-own-arrows="" onKeyDown={onKey} className="flex snap-x gap-3 overflow-x-auto overscroll-x-contain px-1 pb-2 [scrollbar-color:rgba(255,255,255,0.18)_transparent]">
        {show.slides.map((s) => {
          const current = s.id === currentId;
          const next = s.id === info.next?.id;
          const n = numbers.get(s.id);
          return (
            <li key={s.id} className="w-40 shrink-0 snap-start sm:w-48">
              <button
                type="button"
                disabled={s.hidden}
                onClick={() => onPick(s)}
                aria-current={current ? 'true' : undefined}
                aria-label={`${n ? `Bumper ${n}` : 'Hidden bumper'}: ${info.titles.get(s.id) ?? ''}${current ? ', on screen' : next ? ', up next' : ''}`}
                className={cn('group block w-full rounded-[16px] p-1.5 text-left transition-colors hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-35', focusRing, current && 'bg-white/[0.06]')}
              >
                <BumperThumb slide={s} theme={show.theme} data={show.data} showEventId={show.eventId} lazy className={cn('aspect-video w-full rounded-[12px] ring-1 ring-white/10', current && 'ring-2 ring-[#f94141]', next && 'ring-2 ring-white/40')}>
                  {current ? <span className="mono absolute top-1.5 left-1.5 rounded-full bg-[#f94141] px-1.5 py-0.5 text-[0.5625rem] font-bold tracking-[0.08em] text-white uppercase">On screen</span> : null}
                  {next ? <span className="mono absolute top-1.5 left-1.5 rounded-full bg-white px-1.5 py-0.5 text-[0.5625rem] font-bold tracking-[0.08em] text-[#0e1116] uppercase">Next</span> : null}
                </BumperThumb>
                <span className="mt-1.5 flex items-start gap-1.5 px-0.5">
                  <span className="mono w-5 shrink-0 text-[0.75rem] text-white/45">{n ?? '·'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] font-medium text-white/85">{info.titles.get(s.id)}</span>
                    <TimingBadges slide={s} titleOf={(id) => info.titles.get(id)} className="mt-1" />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
