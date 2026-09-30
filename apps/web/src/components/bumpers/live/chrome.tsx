'use client';

import type { BumperData, BumperOutputMode, BumperSlide, BumperTheme } from '@zemi/shared';
import { EyeOff, Pause, Repeat, Timer, X } from 'lucide-react';
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { Character } from '@/components/admin/characters/character';
import { Spinner } from '@/components/admin/ui/spinner';
import { cn } from '@/lib/admin/cn';
import { BumperThumb } from '../builder/thumb';
import { KEY_HELP } from './shared';

/**
 * Dark control-room pieces shared by the player, the controller and the dock. The bumpers are
 * loud; everything around them stays calm: ink surfaces, hairlines, one accent per state.
 */

export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f9be6]';

export interface DarkButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'plain' | 'primary' | 'danger' | 'active' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: ReactNode;
  busy?: boolean;
}

/** A button for dark surfaces. `active` marks a pressed toggle (black, clear, autoplay). */
export const DarkButton = forwardRef<HTMLButtonElement, DarkButtonProps>(function DarkButton({ tone = 'plain', size = 'md', icon, busy, className, children, type = 'button', ...rest }, ref) {
  const sizes = {
    sm: 'h-8 gap-1.5 rounded-full px-3 text-[0.8125rem] [&_svg]:size-4',
    md: 'h-10 gap-2 rounded-full px-4 text-sm [&_svg]:size-[18px]',
    lg: 'h-12 gap-2 rounded-2xl px-5 text-[0.9375rem] [&_svg]:size-5',
    xl: 'h-16 gap-2.5 rounded-[20px] px-6 text-lg [&_svg]:size-6',
  } as const;
  const tones = {
    plain: 'bg-white/[0.07] text-white ring-1 ring-white/10 hover:bg-white/[0.12]',
    ghost: 'text-white/80 hover:bg-white/[0.08] hover:text-white',
    primary: 'bg-[#3a6dc5] text-white hover:bg-[#4a7bd2] shadow-[0_8px_24px_-12px_rgba(58,109,197,0.9)]',
    danger: 'bg-[#f94141] text-white hover:bg-[#ff5555]',
    active: 'bg-white text-[#0e1116] hover:bg-white/90',
  } as const;
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-[background-color,color,transform,box-shadow] duration-150 select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        focusRing,
        sizes[size],
        tones[tone],
        className,
      )}
      aria-busy={busy || undefined}
      {...rest}
    >
      {icon}
      {children}
      {busy ? <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-current opacity-80 motion-safe:animate-pulse" aria-hidden="true" /> : null}
    </button>
  );
});

/** Black / Clear chip for thumbnails and monitors. */
export function ModeChip({ mode, className }: { mode: BumperOutputMode; className?: string }) {
  if (mode === 'show') return null;
  return (
    <span className={cn('mono inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase', mode === 'black' ? 'bg-black text-white ring-1 ring-white/25' : 'bg-white text-[#0e1116]', className)}>
      {mode === 'black' ? 'Black' : 'Clear'}
    </span>
  );
}

/** Auto-advance and loop badges for a slide. */
export function TimingBadges({ slide, titleOf, className }: { slide: BumperSlide; titleOf?: (id: string) => string | undefined; className?: string }) {
  const sec = slide.timing.autoAdvanceSec;
  const loop = slide.timing.loopToId;
  if (!sec && !slide.hidden) return null;
  return (
    <span className={cn('flex flex-wrap items-center gap-1', className)}>
      {slide.hidden ? (
        <span className="inline-flex h-5 items-center gap-1 rounded-full bg-white/10 px-1.5 text-[0.6875rem] text-white/70">
          <EyeOff className="size-3" aria-hidden="true" />
          Hidden
        </span>
      ) : null}
      {sec ? (
        <span className="mono inline-flex h-5 items-center gap-1 rounded-full bg-[#f7bf33]/15 px-1.5 text-[0.6875rem] text-[#f7d27a]" title={`Moves on after ${sec} seconds`}>
          <Timer className="size-3" aria-hidden="true" />
          {sec}s
        </span>
      ) : null}
      {sec && loop ? (
        <span className="inline-flex h-5 max-w-full items-center gap-1 truncate rounded-full bg-[#0f8657]/25 px-1.5 text-[0.6875rem] text-[#7fd6ad]" title={`Loops back to ${titleOf?.(loop) ?? 'an earlier bumper'}`}>
          <Repeat className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">Loop</span>
        </span>
      ) : null}
    </span>
  );
}

/** Full-window message on the dark stage (loading, no access, deleted). */
export function StageMessage({ title, children, action, loading }: { title: string; children?: ReactNode; action?: ReactNode; loading?: boolean }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-[#0b0d11] p-6 text-white">
      <div className="flex max-w-md flex-col items-center text-center">
        {loading ? (
          <Spinner size={44} label={null} />
        ) : (
          <div className="flex items-end gap-2" aria-hidden="true">
            <Character shape="circle" mood="look" size={40} lookAt={{ x: 0.6, y: 0.3 }} />
            <Character shape="square" mood="oops" size={46} />
            <Character shape="arch" mood="look" size={40} lookAt={{ x: -0.6, y: 0.3 }} />
          </div>
        )}
        <h1 className="mt-5 font-display text-2xl font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.25]" role={loading ? 'status' : undefined}>
          {title}
        </h1>
        {children ? <div className="mt-2 text-[0.9375rem] leading-relaxed text-white/70">{children}</div> : null}
        {action ? <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}

/** The keyboard help, as a small panel. */
export function KeyHelpPanel({ where, onClose, children }: { where: 'player' | 'controller'; onClose: () => void; children?: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  return (
    <section aria-labelledby="bumper-keys-title" className="w-full max-w-lg rounded-[24px] bg-[#15181e] p-5 text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="bumper-keys-title" className="font-display text-xl font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.25]">
            Keys
          </h2>
          <p className="mt-0.5 text-sm text-white/60">Presenter clickers work too.</p>
        </div>
        <DarkButton ref={closeRef} tone="ghost" size="sm" onClick={onClose} aria-label="Close the keys" className="-mt-1 -mr-2 size-9 px-0">
          <X />
        </DarkButton>
      </div>
      <dl className="mt-4 divide-y divide-white/[0.07]">
        {KEY_HELP.filter((k) => !k.only || k.only === where).map((k) => (
          <div key={`${k.label}-${k.keys.join()}`} className="flex items-center justify-between gap-4 py-2">
            <dt className="text-[0.9375rem] text-white/85">{k.label}</dt>
            <dd className="flex shrink-0 flex-wrap justify-end gap-1">
              {k.keys.map((key) => (
                <kbd key={key} className="mono inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-white/10 px-1.5 text-[0.75rem] text-white ring-1 ring-white/15">
                  {key}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}

/**
 * Every slide as a thumbnail, numbered in playback order, to jump to. Arrow keys move between
 * them, Enter jumps. Hidden slides are shown dimmed and can't be picked.
 */
export function SlideGrid({
  slides,
  theme,
  data,
  showEventId,
  currentId,
  titles,
  onPick,
  className,
}: {
  slides: BumperSlide[];
  theme: BumperTheme;
  data: BumperData;
  showEventId: string | null;
  currentId: string | null;
  titles: Map<string, string>;
  onPick: (slide: BumperSlide) => void;
  className?: string;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  let n = 0;
  const numbers = slides.map((s) => (s.hidden ? null : ++n));

  useEffect(() => {
    const i = Math.max(0, slides.findIndex((s) => s.id === currentId));
    buttons.current[i]?.focus();
    buttons.current[i]?.scrollIntoView({ block: 'center' });
    // Only when the grid opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = buttons.current;
    const at = list.findIndex((b) => b === document.activeElement);
    if (at < 0) return;
    const cols = gridRef.current ? getComputedStyle(gridRef.current).gridTemplateColumns.split(' ').length : 1;
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? cols : e.key === 'ArrowUp' ? -cols : 0;
    if (!delta) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(list.length - 1, at + delta));
    list[next]?.focus();
  };

  return (
    <div ref={gridRef} data-own-arrows="" onKeyDown={onKey} className={cn('grid grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] gap-4', className)}>
      {slides.map((s, i) => {
        const current = s.id === currentId;
        return (
          <button
            key={s.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            disabled={s.hidden}
            onClick={() => onPick(s)}
            aria-current={current ? 'true' : undefined}
            aria-label={`${numbers[i] ? `Bumper ${numbers[i]}` : 'Hidden bumper'}: ${titles.get(s.id) ?? ''}${current ? ', on screen now' : ''}`}
            className={cn('group rounded-2xl p-1.5 text-left transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40', focusRing, current && 'bg-white/[0.06]')}
          >
            <BumperThumb slide={s} theme={theme} data={data} showEventId={showEventId} lazy className={cn('aspect-video w-full rounded-xl ring-1 ring-white/10', current && 'ring-2 ring-[#f94141]')}>
              {current ? <span className="mono absolute top-2 left-2 rounded-full bg-[#f94141] px-2 py-0.5 text-[0.625rem] font-bold tracking-[0.08em] text-white uppercase">On screen</span> : null}
            </BumperThumb>
            <span className="mt-2 flex items-start gap-2 px-0.5">
              <span className="mono mt-px w-6 shrink-0 text-[0.8125rem] text-white/50">{numbers[i] ?? '·'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.875rem] font-medium text-white/90">{titles.get(s.id)}</span>
                <TimingBadges slide={s} titleOf={(id) => titles.get(id)} className="mt-1" />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A small ring that empties as auto-advance approaches. */
export function Countdown({ left, total, paused, size = 30 }: { left: number | null; total: number; paused?: boolean; size?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const frac = left === null ? 1 : Math.max(0, Math.min(1, left / total));
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={3} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={paused ? 'rgba(255,255,255,0.45)' : '#f7bf33'} strokeWidth={3} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: 'stroke-dashoffset 250ms linear' }} />
      </svg>
      {paused ? <Pause className="absolute size-3 text-white/70" /> : null}
    </span>
  );
}
