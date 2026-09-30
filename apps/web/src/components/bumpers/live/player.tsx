'use client';

import {
  bumperAutoNext,
  bumperStep,
  pickBumperTransition,
  type BumperControlInput,
  type BumperOutputMode,
  type BumperShowDetail,
  type BumperSlide,
  type BumperTransitionKey,
} from '@zemi/shared';
import { Clapperboard, Expand, Grid3x3, Keyboard, LogOut, MonitorOff, Moon, Pause, Play, Radio, RotateCcw, Scissors, Shrink, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/admin/cn';
import { adminRoutes } from '@/lib/admin/nav';
import { BumperThumb } from '../builder/thumb';
import { BumperClockProvider, useBumperNow } from '../engine/clock';
import { BumperStage } from '../engine/stage';
import type { DirectorTarget } from '../transitions/director';
import { Countdown, DarkButton, focusRing, KeyHelpPanel, ModeChip, SlideGrid, StageMessage } from './chrome';
import { LiveGate } from './gate';
import { Program } from './program';
import { advanceLeft, outputsLabel, STATUS_LABEL, StatusDot, transitionLabel, useFontsReady, useFullscreen, usePlaybackInfo, usePlaybackKeys, useWakeLock } from './shared';
import { useStings } from './sound';
import { useAdminLive, useDirectorTarget, type AdminLive } from './use-live';

/**
 * /admin/stage/bumpers/[id]/play: the show fills the browser window for the room screen.
 * "Drive the OBS output" (on by default) sends every press to the server and plays whatever the
 * server says, so this screen, the controller, the docks and every OBS output stay identical.
 * Off, it is a local rehearsal: only this window moves.
 */
export function BumperPlayer({ id, from }: { id: string; from: string | null }) {
  const live = useAdminLive(id);
  return (
    <LiveGate live={live} what="play">
      {(show) => <PlayerStage live={live} show={show} from={from} exitHref={adminRoutes.bumper(id)} />}
    </LiveGate>
  );
}

interface LocalPlayback {
  slideId: string | null;
  seq: number;
  dir: 1 | -1;
  transition: BumperTransitionKey | null;
  mode: BumperOutputMode;
  cue: number;
  autoplay: boolean;
  /** ms timestamp of the next local auto-advance. */
  advanceAt: number | null;
}

const NAV: ReadonlySet<BumperControlInput['action']> = new Set(['next', 'prev', 'goto', 'first', 'last']);

function PlayerStage({ live, show, from, exitHref }: { live: AdminLive; show: BumperShowDetail; from: string | null; exitHref: string }) {
  const router = useRouter();
  const [drive, setDrive] = useState(true);
  const [local, setLocal] = useState<LocalPlayback | null>(null);
  const [overlay, setOverlay] = useState<'grid' | 'help' | null>(null);
  const [cut, setCut] = useState(false);
  const [hud, setHud] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ to: string } | null>(null);
  const [resyncSeq, setResyncSeq] = useState<number | null>(null);
  const fonts = useFontsReady();
  const [fullscreen, toggleFullscreen] = useFullscreen();
  const sting = useStings(show.theme.sound, 'gesture');
  useWakeLock(true);

  const slides = show.slides;
  const byId = useMemo(() => new Map(slides.map((s) => [s.id, s])), [slides]);
  const serverTarget = useDirectorTarget(live.state, slides, show.version);
  const rehearsing = !drive && local !== null;

  // What the director follows. Server seqs are even and local ones odd, so switching between the
  // two always looks like a change to the director; a resync after rehearsal crossfades.
  const target = useMemo<DirectorTarget | null>(() => {
    if (rehearsing && local) return { slideId: local.slideId, seq: local.seq * 2 + 1, transition: local.transition, dir: local.dir };
    if (!serverTarget) return null;
    return { slideId: serverTarget.slideId, seq: serverTarget.seq * 2, transition: serverTarget.seq === resyncSeq ? 'crossfade' : serverTarget.transition, dir: serverTarget.dir };
  }, [rehearsing, local, serverTarget, resyncSeq]);

  const state = live.state;
  const currentId = target?.slideId ?? null;
  const mode: BumperOutputMode = rehearsing && local ? local.mode : (state?.mode ?? 'show');
  const autoplay = rehearsing && local ? local.autoplay : (state?.autoplay ?? true);
  const info = usePlaybackInfo(slides, currentId, show.theme, show.data, show.eventId);

  // Replays: the server's cue (or the rehearsal's own) going up replays the entrance.
  const cueKey = rehearsing && local ? `l${local.cue}` : `s${state?.cue ?? 0}`;
  const [replay, setReplay] = useState({ key: cueKey, n: 0 });
  if (replay.key !== cueKey) {
    const same = replay.key[0] === cueKey[0] && Number(cueKey.slice(1)) > Number(replay.key.slice(1));
    setReplay({ key: cueKey, n: replay.n + (same ? 1 : 0) });
  }

  /* -------------------------------------------------------------- presses */

  const say = (text: string) => setNotice(text);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3800);
    return () => clearTimeout(t);
  }, [notice]);

  const send = (input: BumperControlInput) => {
    const armed = cut && NAV.has(input.action);
    if (armed) setCut(false);
    void live.send(armed ? { ...input, transition: 'cut' } : input);
  };

  const localAdvanceAt = (slide: BumperSlide | null, on: boolean, m: BumperOutputMode) =>
    slide?.timing.autoAdvanceSec && on && m === 'show' ? Date.now() + slide.timing.autoAdvanceSec * 1000 : null;

  const localGo = (to: BumperSlide | null, dir: 1 | -1) => {
    if (!to || !local || to.id === local.slideId) return;
    const fromSlide = local.slideId ? (byId.get(local.slideId) ?? null) : null;
    const transition = cut ? 'cut' : pickBumperTransition(fromSlide, to, { motion: show.theme.motion });
    if (cut) setCut(false);
    setLocal({ ...local, slideId: to.id, seq: local.seq + 1, dir, transition, advanceAt: localAdvanceAt(to, local.autoplay, local.mode) });
  };

  const localMode = (m: BumperOutputMode) => {
    if (!local) return;
    const cur = local.slideId ? (byId.get(local.slideId) ?? null) : null;
    setLocal({ ...local, mode: m, advanceAt: localAdvanceAt(cur, local.autoplay, m) });
  };

  // Local auto-advance while rehearsing (the server runs its own clock for the real show).
  const localAt = rehearsing ? (local?.advanceAt ?? null) : null;
  const autoStepRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    autoStepRef.current = () => {
      if (!local?.slideId) return;
      localGo(bumperAutoNext(slides, local.slideId), 1);
    };
  });
  useEffect(() => {
    if (localAt === null) return;
    const t = setTimeout(() => autoStepRef.current(), Math.max(0, localAt - Date.now()));
    return () => clearTimeout(t);
  }, [localAt]);

  const act = {
    next: () => (rehearsing ? localGo(bumperStep(slides, currentId, 1), 1) : send({ action: 'next' })),
    prev: () => (rehearsing ? localGo(bumperStep(slides, currentId, -1), -1) : send({ action: 'prev' })),
    first: () => (rehearsing ? localGo(info.playable[0] ?? null, -1) : send({ action: 'first' })),
    last: () => (rehearsing ? localGo(info.playable[info.playable.length - 1] ?? null, 1) : send({ action: 'last' })),
    goto: (position: number) => {
      const to = info.playable[position - 1];
      if (!to) return say(`There's no bumper ${position}. This show has ${info.playable.length}.`);
      if (rehearsing) localGo(to, position - 1 >= info.index ? 1 : -1);
      else send({ action: 'goto', slideId: to.id });
    },
    gotoSlide: (s: BumperSlide) => {
      const pos = info.playable.indexOf(s);
      if (rehearsing) localGo(s, pos >= info.index ? 1 : -1);
      else send({ action: 'goto', slideId: s.id });
    },
    black: () => (rehearsing ? localMode(mode === 'black' ? 'show' : 'black') : send({ action: 'toggle-black' })),
    clear: () => (rehearsing ? localMode(mode === 'clear' ? 'show' : 'clear') : send({ action: mode === 'clear' ? 'show' : 'clear' })),
    replay: () => (rehearsing && local ? setLocal({ ...local, cue: local.cue + 1 }) : send({ action: 'replay' })),
    autoplay: () => {
      if (rehearsing && local) {
        const cur = local.slideId ? (byId.get(local.slideId) ?? null) : null;
        setLocal({ ...local, autoplay: !local.autoplay, advanceAt: localAdvanceAt(cur, !local.autoplay, local.mode) });
      } else send({ action: autoplay ? 'autoplay-off' : 'autoplay-on' });
    },
  };

  const setDriving = (on: boolean) => {
    if (on === drive) return;
    if (on) {
      setResyncSeq(serverTarget?.seq ?? null);
      setDrive(true);
      say('Driving every screen again. This window follows the show.');
      return;
    }
    const cur = currentId ? (byId.get(currentId) ?? null) : null;
    setLocal({ slideId: currentId, seq: 0, dir: 1, transition: null, mode, cue: 0, autoplay, advanceAt: localAdvanceAt(cur, autoplay, mode) });
    setDrive(false);
    say('Rehearsal: only this window moves. OBS and the room screen stay put.');
  };

  const escape = () => {
    if (overlay) setOverlay(null);
    else if (ask) setAsk(null);
    else router.push(exitHref);
  };

  const buffer = usePlaybackKeys({
    ...act,
    fullscreen: toggleFullscreen,
    grid: () => setOverlay((o) => (o === 'grid' ? null : 'grid')),
    help: () => setOverlay((o) => (o === 'help' ? null : 'help')),
    cut: () => setCut((c) => !c),
    escape,
  });

  /* -------------------------------------------------------------- starting the show */

  // A show's clock (auto-advance, "running for") waits for its first press. Opening the player
  // on a show nobody started yet counts as that press. A `?from=` jump goes straight there,
  // unless OBS is already showing something else mid-show: then we ask first.
  const started = useRef(false);
  const ready = live.status === 'open' && !!live.presence && !!state;
  useEffect(() => {
    if (!ready || !drive || started.current || !state) return;
    started.current = true;
    const to = from && byId.get(from) && !byId.get(from)!.hidden ? from : null;
    if (to && to !== state.slideId) {
      if (state.startedAt && (live.presence?.outputs ?? 0) > 0) queueMicrotask(() => setAsk({ to }));
      else void live.send({ action: 'goto', slideId: to });
    } else if (!state.startedAt && state.slideId) {
      void live.send({ action: 'goto', slideId: state.slideId });
    }
  }, [ready, drive, state, from, byId, live]);

  /* -------------------------------------------------------------- pointer: zones, swipes, HUD */

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const down = useRef<{ x: number; y: number; id: number } | null>(null);
  const poke = () => {
    setHud(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHud(false), 2000);
  };
  useEffect(() => {
    hideTimer.current = setTimeout(() => setHud(false), 2600);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    if (e.pointerType !== 'mouse') poke();
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = down.current;
    down.current = null;
    if (!d || d.id !== e.pointerId || overlay || ask) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) act.next();
      else act.prev();
      return;
    }
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      if (e.clientX < window.innerWidth / 2) act.prev();
      else act.next();
    }
  };

  const hudVisible = (hud || hovering) && !overlay && !ask;
  const liveText = info.current ? `Bumper ${info.index + 1} of ${info.playable.length}: ${info.titles.get(info.current.id) ?? ''}${mode !== 'show' ? `. Screen is ${mode}.` : ''}` : 'Nothing on screen yet.';

  return (
    <BumperClockProvider value={{ offsetMs: live.offsetMs }}>
      <div
        data-bumper-player=""
        className="fixed inset-0 h-dvh w-dvw touch-none overflow-hidden bg-black text-white select-none"
        style={{ cursor: hudVisible || overlay || ask ? 'default' : 'none' }}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse') poke();
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          down.current = null;
        }}
      >
        <h1 className="sr-only">{show.title}: player</h1>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {liveText}
        </p>

        <BumperStage style={{ position: 'absolute', inset: 0 }} letterbox="#000" aria-label={info.current ? `Bumper ${info.index + 1}: ${info.titles.get(info.current.id) ?? ''}` : undefined}>
          {target && fonts ? (
            <Program slides={slides} theme={show.theme} data={show.data} showEventId={show.eventId} target={target} mode={mode} replay={replay.n} onTransition={sting} />
          ) : null}
        </BumperStage>

        {!info.playable.length ? (
          <StageMessage title="Nothing to play yet." action={<Link href={exitHref} className={cn('inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-semibold text-[#0e1116]', focusRing)}>Open the builder</Link>}>
            Add a bumper or two in the builder (or unhide one), then come back.
          </StageMessage>
        ) : null}

        {/* Top chips: jump buffer, cut, notices. */}
        <div className="pointer-events-none absolute inset-x-0 top-4 flex flex-col items-center gap-2 px-4">
          {buffer ? (
            <span className="rounded-full bg-[#0e1116]/90 px-4 py-2 text-sm text-white shadow-lg ring-1 ring-white/15">
              Go to <b className="mono text-base">{buffer}</b> <span className="text-white/55">then Enter</span>
            </span>
          ) : null}
          {cut ? (
            <span className="flex items-center gap-2 rounded-full bg-[#f94141] px-4 py-2 text-sm font-semibold text-white shadow-lg">
              <Scissors className="size-4" aria-hidden="true" /> Cut armed: the next change skips its transition
            </span>
          ) : null}
          {notice || live.error ? (
            <span role="status" className="max-w-xl rounded-full bg-[#0e1116]/92 px-4 py-2 text-center text-sm text-white shadow-lg ring-1 ring-white/15">
              {live.error ?? notice}
            </span>
          ) : null}
        </div>

        <Hud visible={hudVisible} live={live} show={show} info={info} mode={mode} autoplay={autoplay} drive={drive} rehearsing={rehearsing} fullscreen={fullscreen} localAdvanceAt={localAt} onDrive={setDriving} onHover={setHovering} act={act} onGrid={() => setOverlay('grid')} onHelp={() => setOverlay('help')} onFullscreen={toggleFullscreen} onExit={() => router.push(exitHref)} />

        {overlay === 'grid' ? (
          <div className="absolute inset-0 z-30 touch-pan-y overflow-y-auto overscroll-contain bg-[#0b0d11]/95 px-4 py-5 backdrop-blur-sm sm:px-8 sm:py-7" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            <div className="mx-auto max-w-[1600px]">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.25]">All bumpers</h2>
                  <p className="text-sm text-white/60">Pick one to jump there. Arrow keys work, Esc closes.</p>
                </div>
                <DarkButton tone="plain" onClick={() => setOverlay(null)} icon={<X />}>
                  Close
                </DarkButton>
              </div>
              <SlideGrid
                slides={slides}
                theme={show.theme}
                data={show.data}
                showEventId={show.eventId}
                currentId={currentId}
                titles={info.titles}
                onPick={(s) => {
                  setOverlay(null);
                  act.gotoSlide(s);
                }}
              />
            </div>
          </div>
        ) : null}

        {overlay === 'help' ? (
          <div className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-black/60 p-4" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setOverlay(null); }}>
            <KeyHelpPanel where="player" onClose={() => setOverlay(null)}>
              <p className="mt-4 rounded-2xl bg-white/[0.05] p-3 text-[0.8125rem] leading-relaxed text-white/70">
                Click or tap the right half for next and the left half to go back. Swipe works on touch screens. Move the mouse for the controls.
              </p>
            </KeyHelpPanel>
          </div>
        ) : null}

        {ask ? (
          <div className="absolute inset-0 z-30 grid place-items-center bg-black/55 p-4" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            <section aria-labelledby="bumper-jump-title" className="w-full max-w-md rounded-[24px] bg-[#15181e] p-6 text-white shadow-2xl ring-1 ring-white/10">
              <Radio className="size-6 text-[#f94141]" aria-hidden="true" />
              <h2 id="bumper-jump-title" className="mt-3 font-display text-xl font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.25]">
                OBS is on bumper {info.index + 1} right now.
              </h2>
              <p className="mt-1.5 text-[0.9375rem] text-white/70">
                Jump every screen to {info.playable.findIndex((s) => s.id === ask.to) + 1}, {info.titles.get(ask.to)}? The stream sees it too.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <DarkButton
                  tone="primary"
                  onClick={() => {
                    const to = ask.to;
                    setAsk(null);
                    void live.send({ action: 'goto', slideId: to });
                  }}
                >
                  Jump there
                </DarkButton>
                <DarkButton tone="plain" autoFocus onClick={() => setAsk(null)}>
                  Stay on {info.index + 1}
                </DarkButton>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </BumperClockProvider>
  );
}

/* ---------------------------------------------------------------- HUD */

type Act = { next(): void; prev(): void; black(): void; clear(): void; replay(): void; autoplay(): void };

function Hud({
  visible,
  live,
  show,
  info,
  mode,
  autoplay,
  drive,
  rehearsing,
  fullscreen,
  localAdvanceAt,
  onDrive,
  onHover,
  act,
  onGrid,
  onHelp,
  onFullscreen,
  onExit,
}: {
  visible: boolean;
  live: AdminLive;
  show: BumperShowDetail;
  info: ReturnType<typeof usePlaybackInfo>;
  mode: BumperOutputMode;
  autoplay: boolean;
  drive: boolean;
  rehearsing: boolean;
  fullscreen: boolean;
  localAdvanceAt: number | null;
  onDrive: (on: boolean) => void;
  onHover: (on: boolean) => void;
  act: Act;
  onGrid: () => void;
  onHelp: () => void;
  onFullscreen: () => void;
  onExit: () => void;
}) {
  const now = useBumperNow(250, visible);
  const left = rehearsing ? (localAdvanceAt ? Math.max(0, (localAdvanceAt - now + live.offsetMs) / 1000) : null) : advanceLeft(live.state, now);
  const cur = info.current;
  const auto = cur?.timing.autoAdvanceSec ?? null;
  const stop = (e: { stopPropagation(): void }) => e.stopPropagation();
  const presence = live.presence;
  return (
    <div
      className={cn('absolute inset-x-0 bottom-0 z-20 p-3 transition-[opacity,transform] duration-300 ease-out sm:p-4', visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0')}
      aria-hidden={!visible}
      inert={!visible}
      onPointerDown={stop}
      onPointerUp={stop}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-5 gap-y-3 rounded-[22px] bg-[#0e1116]/88 px-4 py-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10 backdrop-blur-md sm:px-5">
        {/* Where we are */}
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
          <span className="mono shrink-0 text-2xl font-semibold tabular-nums">
            {info.index + 1}
            <span className="text-white/40">/{info.playable.length}</span>
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate text-[0.9375rem] font-semibold">{cur ? info.titles.get(cur.id) : 'Nothing on screen'}</span>
              <ModeChip mode={mode} />
            </span>
            <span className="block truncate text-[0.8125rem] text-white/55">{show.title}</span>
          </span>
        </div>

        {/* What's next */}
        {info.next ? (
          <div className="hidden min-w-0 items-center gap-3 md:flex">
            <BumperThumb slide={info.next} theme={show.theme} data={show.data} showEventId={show.eventId} className="aspect-video w-32 shrink-0 rounded-lg ring-1 ring-white/15" />
            <span className="min-w-0 max-w-[16rem]">
              <span className="mono block text-[0.6875rem] tracking-[0.08em] text-white/50 uppercase">Next</span>
              <span className="block truncate text-sm font-medium">{info.titles.get(info.next.id)}</span>
              <span className="block truncate text-[0.8125rem] text-white/55">via {transitionLabel(info.nextTransition)}</span>
            </span>
          </div>
        ) : info.playable.length ? (
          <span className="hidden text-sm text-white/55 md:inline">{"That's the last one."}</span>
        ) : null}

        {/* Auto-advance */}
        {auto ? (
          <div className="flex items-center gap-2 text-sm" title={info.loopTo ? `Loops back to ${info.titles.get(info.loopTo.id)}` : undefined}>
            <Countdown left={left} total={auto} paused={!autoplay || mode !== 'show'} />
            <span className="text-white/70">{!autoplay ? 'Auto paused' : mode !== 'show' ? 'Waits while ' + mode : left !== null ? `Moves on in ${Math.ceil(left)}s` : 'Auto'}</span>
          </div>
        ) : null}

        {/* Connection */}
        <div className="flex items-center gap-2 text-[0.8125rem] text-white/70">
          {drive ? (
            <>
              <StatusDot status={live.status} />
              <span>{live.status === 'open' ? outputsLabel(presence) : STATUS_LABEL[live.status]}</span>
            </>
          ) : (
            <span className="rounded-full bg-[#f7bf33] px-2.5 py-1 text-[0.75rem] font-semibold text-[#0e1116]">Rehearsal, only this window</span>
          )}
        </div>

        {/* Drive */}
        <label className="flex cursor-pointer items-center gap-2 text-[0.8125rem] text-white/85">
          <button type="button" role="switch" aria-checked={drive} onClick={() => onDrive(!drive)} className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors', drive ? 'bg-[#1fb872]' : 'bg-white/20', focusRing)}>
            <span className={cn('absolute top-1 size-4 rounded-full bg-white shadow transition-[left]', drive ? 'left-5' : 'left-1')} />
          </button>
          Drive the OBS output
        </label>

        {/* Tools */}
        <div className="flex items-center gap-1">
          <DarkButton tone={mode === 'black' ? 'active' : 'ghost'} size="sm" onClick={act.black} aria-pressed={mode === 'black'} title="Black (B)" aria-label="Black screen" icon={<Moon />} className="size-9 px-0" />
          <DarkButton tone={mode === 'clear' ? 'active' : 'ghost'} size="sm" onClick={act.clear} aria-pressed={mode === 'clear'} title="Clear (C)" aria-label="Clear screen" icon={<MonitorOff />} className="size-9 px-0" />
          <DarkButton tone="ghost" size="sm" onClick={act.replay} title="Replay (R)" aria-label="Replay the entrance" icon={<RotateCcw />} className="size-9 px-0" />
          <DarkButton tone="ghost" size="sm" onClick={act.autoplay} aria-pressed={!autoplay} title={autoplay ? 'Pause auto-advance (P)' : 'Resume auto-advance (P)'} aria-label={autoplay ? 'Pause auto-advance' : 'Resume auto-advance'} icon={autoplay ? <Pause /> : <Play />} className="size-9 px-0" />
          <DarkButton tone="ghost" size="sm" onClick={onGrid} title="All bumpers (G)" aria-label="All bumpers" icon={<Grid3x3 />} className="size-9 px-0" />
          <DarkButton tone="ghost" size="sm" onClick={onFullscreen} title="Fullscreen (F)" aria-label={fullscreen ? 'Leave fullscreen' : 'Fullscreen'} icon={fullscreen ? <Shrink /> : <Expand />} className="size-9 px-0" />
          <DarkButton tone="ghost" size="sm" onClick={onHelp} title="Keys (?)" aria-label="Keys" icon={<Keyboard />} className="size-9 px-0" />
          <Link href={adminRoutes.bumperControl(show.id)} title="Controller" aria-label="Open the controller" className={cn('inline-flex size-9 items-center justify-center rounded-full text-white/80 hover:bg-white/[0.08] hover:text-white [&_svg]:size-4', focusRing)}>
            <Clapperboard />
          </Link>
          <DarkButton tone="ghost" size="sm" onClick={onExit} title="Back to the builder (Esc)" aria-label="Back to the builder" icon={<LogOut />} className="size-9 px-0" />
        </div>
      </div>
      <div className="sr-only">
        <DarkButton onClick={act.prev}>Previous bumper</DarkButton>
        <DarkButton onClick={act.next}>Next bumper</DarkButton>
      </div>
    </div>
  );
}
