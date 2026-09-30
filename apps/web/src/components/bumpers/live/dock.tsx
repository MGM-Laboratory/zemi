'use client';

import type { BumperControlInput, BumperPublicShow } from '@zemi/shared';
import { ChevronLeft, ChevronRight, MonitorOff, Moon, Pause, Play, RotateCcw, Sun } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';
import { BumperThumb } from '../builder/thumb';
import { BumperClockProvider, useBumperNow } from '../engine/clock';
import { Countdown, focusRing, ModeChip, TimingBadges } from './chrome';
import { QuietCard, REVOKED_COPY } from './quiet-card';
import { advanceLeft, STATUS_LABEL, StatusDot, transitionLabel, usePlaybackInfo, usePlaybackKeys } from './shared';
import { usePublicLive, type PublicLive } from './use-live';

/**
 * /bumpers/dock/[key]: a compact controller for an OBS Custom Browser Dock (320 to 600 px wide)
 * and phones. Dark like OBS, big targets, and the playback keys work once the dock has focus.
 * Presses go to the server; the thumbnails follow the server state, never the button.
 */
export function BumperDock({ controlKey }: { controlKey: string }) {
  const live = usePublicLive(controlKey, 'dock');
  if (live.revoked) {
    const copy = REVOKED_COPY[live.revoked];
    return (
      <DockShell>
        <QuietCard title={copy.title} eyebrow="Zemi bumpers dock">
          {copy.body}
        </QuietCard>
      </DockShell>
    );
  }
  if (!live.show) {
    return (
      <DockShell>
        <div className="grid min-h-dvh place-items-center p-6 text-center">
          <div className="flex flex-col items-center gap-3" role="status">
            <StatusDot status={live.status} />
            <p className="text-sm text-white/70">{live.loaded ? "Can't reach Zemi right now. Trying again..." : 'Connecting to the show...'}</p>
          </div>
        </div>
      </DockShell>
    );
  }
  return (
    <BumperClockProvider value={{ offsetMs: live.offsetMs }}>
      <DockShell>
        <DockControls live={live} show={live.show} />
      </DockShell>
    </BumperClockProvider>
  );
}

function DockShell({ children }: { children: ReactNode }) {
  return (
    <div data-bumper-dock="" className="fixed inset-0 overflow-y-auto overscroll-contain bg-[#1b1d23] font-sans text-[#e8eaf0] [@media(min-height:520px)]:overflow-hidden">
      {children}
    </div>
  );
}

function DockControls({ live, show }: { live: PublicLive; show: BumperPublicShow }) {
  const state = live.state;
  const info = usePlaybackInfo(show.slides, state?.slideId ?? null, show.theme, show.data, show.eventId);
  const mode = state?.mode ?? 'show';
  const autoplay = state?.autoplay ?? true;
  const now = useBumperNow(500);
  const left = advanceLeft(state, now);
  const auto = info.current?.timing.autoAdvanceSec ?? null;
  const busy = live.pending > 0;
  const listRef = useRef<HTMLOListElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const send = (input: BumperControlInput) => void live.send(input);

  const act = {
    next: () => send({ action: 'next' }),
    prev: () => send({ action: 'prev' }),
    first: () => send({ action: 'first' }),
    last: () => send({ action: 'last' }),
    goto: (position: number) => {
      if (position >= 1 && position <= info.playable.length) send({ action: 'goto', position });
    },
    black: () => send({ action: 'toggle-black' }),
    clear: () => send({ action: mode === 'clear' ? 'show' : 'clear' }),
    replay: () => send({ action: 'replay' }),
    autoplay: () => send({ action: autoplay ? 'autoplay-off' : 'autoplay-on' }),
    help: () => undefined,
  };
  const buffer = usePlaybackKeys(act);
  const currentId = info.current?.id ?? null;

  // Keep the current row in view as the show moves (only inside the list, so the buttons never scroll away).
  useEffect(() => {
    const box = scrollRef.current;
    const row = listRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!box || !row || box.scrollHeight <= box.clientHeight) return;
    const top = row.offsetTop;
    if (top < box.scrollTop + 8 || top + row.offsetHeight > box.scrollTop + box.clientHeight - 8) {
      box.scrollTo({ top: Math.max(0, top - box.clientHeight / 2 + row.offsetHeight / 2), behavior: 'smooth' });
    }
  }, [currentId]);

  const onAir = (live.presence?.outputs ?? 0) > 0;
  const atStart = info.index <= 0;
  const atEnd = info.index >= info.playable.length - 1;

  return (
    <div className="flex min-h-dvh flex-col [@media(min-height:520px)]:h-dvh">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {info.current ? `On screen: ${info.index + 1} of ${info.playable.length}, ${info.titles.get(info.current.id) ?? ''}` : 'Nothing on screen'}
      </p>
      <header className="sticky top-0 z-10 shrink-0 border-b border-white/[0.06] bg-[#1b1d23]/95 px-3 pt-2.5 pb-2 backdrop-blur">
        <div className="flex items-center gap-2 text-[0.75rem]">
          <StatusDot status={live.status} />
          <span className="text-white/70">{live.status === 'open' ? (onAir ? 'Connected, OBS output live' : 'Connected') : STATUS_LABEL[live.status]}</span>
          <span className="ml-auto flex items-center gap-1.5">
            <ModeChip mode={mode} />
            {buffer ? <span className="mono rounded-full bg-white/10 px-2 py-0.5 text-white">Go to {buffer}</span> : null}
          </span>
        </div>
        <h1 className="mt-1 truncate text-[0.8125rem] font-semibold text-white/85">
          <span className="mono mr-1.5 text-white/45">{info.index + 1}/{info.playable.length}</span>
          {info.current ? info.titles.get(info.current.id) : 'Nothing on screen yet'}
        </h1>
      </header>

      <section aria-label="Now and next" className="shrink-0 px-3 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <DockThumb label="Now" slide={info.current} show={show} live title={info.current ? info.titles.get(info.current.id) : undefined} mode={mode} />
          <DockThumb label="Next" slide={info.next} show={show} title={info.next ? info.titles.get(info.next.id) : undefined} hint={info.next ? transitionLabel(info.nextTransition) : "That's the last one"} />
        </div>

        {auto ? (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-1.5 text-[0.75rem] text-white/70">
            <Countdown left={left} total={auto} paused={!autoplay || mode !== 'show'} size={22} />
            <span className="min-w-0 flex-1 truncate">{!autoplay ? 'Auto-advance paused' : mode !== 'show' ? `Waits while ${mode}` : left !== null ? `Moves on in ${Math.ceil(left)}s${info.loopTo ? ' (loop)' : ''}` : 'Moves on by itself'}</span>
            <button type="button" onClick={act.autoplay} aria-pressed={!autoplay} className={cn('inline-flex h-7 items-center gap-1 rounded-full bg-white/[0.08] px-2.5 font-semibold text-white hover:bg-white/[0.14] [&_svg]:size-3.5', focusRing)}>
              {autoplay ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              {autoplay ? 'Pause' : 'Resume'}
            </button>
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
          <DockButton onClick={act.prev} disabled={atStart} busy={busy} size="big" aria-label="Previous bumper">
            <ChevronLeft aria-hidden="true" />
            <span className="max-[359px]:sr-only">Back</span>
          </DockButton>
          <DockButton onClick={act.next} disabled={atEnd} busy={busy} size="big" tone="primary" aria-label="Next bumper">
            Next
            <ChevronRight aria-hidden="true" />
          </DockButton>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          <DockButton onClick={() => send({ action: 'show' })} active={mode === 'show'} aria-pressed={mode === 'show'}>
            <Sun aria-hidden="true" />
            <span>Show</span>
          </DockButton>
          <DockButton onClick={act.black} active={mode === 'black'} aria-pressed={mode === 'black'}>
            <Moon aria-hidden="true" />
            <span>Black</span>
          </DockButton>
          <DockButton onClick={act.clear} active={mode === 'clear'} aria-pressed={mode === 'clear'}>
            <MonitorOff aria-hidden="true" />
            <span>Clear</span>
          </DockButton>
          <DockButton onClick={act.replay} aria-label="Replay the entrance">
            <RotateCcw aria-hidden="true" />
            <span>Replay</span>
          </DockButton>
        </div>
        {live.error ? (
          <p role="alert" className="mt-2 rounded-xl bg-[#f94141]/15 px-3 py-2 text-[0.8125rem] text-[#ffb3b3]">
            {live.error}
          </p>
        ) : null}
      </section>

      <section ref={scrollRef} aria-labelledby="dock-list" className="relative mt-3 flex-1 px-1.5 pb-3 [@media(min-height:520px)]:min-h-0 [@media(min-height:520px)]:overflow-y-auto [@media(min-height:520px)]:overscroll-contain">
        <h2 id="dock-list" className="mono sticky top-0 z-[1] bg-[#1b1d23] px-1.5 pt-1 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.1em] text-white/45 uppercase">
          Jump to
        </h2>
        {!info.playable.length ? <p className="px-1.5 py-2 text-sm text-white/55">No bumpers in this show yet. Add some in Zemi Studio and they show up here.</p> : null}
        <ol ref={listRef} className="space-y-0.5">
          {info.playable.map((s, i) => {
            const current = s.id === currentId;
            const next = s.id === info.next?.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => send({ action: 'goto', slideId: s.id })}
                  aria-current={current ? 'true' : undefined}
                  className={cn('flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors', current ? 'bg-[#f94141]/15 ring-1 ring-[#f94141]/50' : 'hover:bg-white/[0.05]', focusRing)}
                >
                  <span className={cn('mono flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg text-[0.75rem] font-semibold tabular-nums', current ? 'bg-[#f94141] text-white' : 'bg-white/[0.07] text-white/70')}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-[0.875rem]', current ? 'font-semibold text-white' : 'text-white/85')}>{info.titles.get(s.id)}</span>
                    {current || next ? <span className="block text-[0.6875rem] text-white/45">{current ? 'On screen' : 'Up next'}</span> : null}
                  </span>
                  <TimingBadges slide={s} titleOf={(id) => info.titles.get(id)} className="shrink-0" />
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function DockThumb({ label, slide, show, title, hint, live, mode }: { label: string; slide: BumperPublicShow['slides'][number] | null; show: BumperPublicShow; title?: string; hint?: string; live?: boolean; mode?: 'show' | 'black' | 'clear' }) {
  return (
    <figure className="min-w-0">
      <div className="relative">
        {slide ? (
          <BumperThumb slide={slide} theme={show.theme} data={show.data} showEventId={show.eventId} className={cn('aspect-video w-full rounded-lg ring-1', live ? 'ring-[#f94141]/70' : 'ring-white/10')} />
        ) : (
          <div className="grid aspect-video w-full place-items-center rounded-lg bg-white/[0.04] text-[0.6875rem] text-white/40 ring-1 ring-white/10">{hint}</div>
        )}
        {live && mode && mode !== 'show' ? <span className={cn('absolute inset-0 grid place-items-center rounded-lg', mode === 'black' ? 'bg-black/85' : 'bg-[repeating-conic-gradient(#20242c_0%_25%,#2a2e37_0%_50%)] bg-[length:14px_14px] opacity-90')}><ModeChip mode={mode} /></span> : null}
        <span className={cn('mono absolute top-1 left-1 rounded-full px-1.5 py-px text-[0.5625rem] font-bold tracking-[0.08em] uppercase', live ? 'bg-[#f94141] text-white' : 'bg-black/60 text-white/85')}>{label}</span>
      </div>
      <figcaption className="mt-1 min-w-0">
        <span className="block truncate text-[0.75rem] font-medium text-white/85">{title ?? ' '}</span>
        {hint && slide ? <span className="block truncate text-[0.6875rem] text-white/45">via {hint}</span> : null}
      </figcaption>
    </figure>
  );
}

function DockButton({ children, onClick, disabled, busy, active, tone, size, className, ...rest }: { children: ReactNode; onClick: () => void; disabled?: boolean; busy?: boolean; active?: boolean; tone?: 'primary'; size?: 'big'; className?: string; 'aria-label'?: string; 'aria-pressed'?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={cn(
        'relative inline-flex min-w-0 items-center justify-center font-semibold transition-[background-color,transform] duration-100 select-none active:scale-[0.97] disabled:opacity-35',
        size === 'big' ? 'h-14 gap-1.5 rounded-2xl text-base [&_svg]:size-5' : 'h-12 flex-col gap-0.5 rounded-xl text-[0.6875rem] [&_svg]:size-[18px]',
        tone === 'primary' ? 'bg-[#3a6dc5] text-white hover:bg-[#4a7bd2]' : active ? 'bg-white text-[#0e1116]' : 'bg-white/[0.08] text-white hover:bg-white/[0.13]',
        focusRing,
        className,
      )}
      {...rest}
    >
      {children}
      {busy ? <span className="absolute top-2 right-2 size-1.5 rounded-full bg-current opacity-70 motion-safe:animate-pulse" aria-hidden="true" /> : null}
    </button>
  );
}
