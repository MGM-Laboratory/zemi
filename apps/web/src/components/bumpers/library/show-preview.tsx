'use client';

import { BUMPER_KIND_META, type BumperData, type BumperSlide, type BumperTheme } from '@zemi/shared';
import { EyeOff, Repeat, Timer } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';
import { usePrefersReducedMotion } from '@/lib/admin/hooks';
import { slideTitle } from './labels';
import { LazyMount, SlideThumb } from './slide-thumb';

export interface ShowPreviewProps {
  slides: BumperSlide[];
  theme: BumperTheme;
  data: BumperData;
  showEventId: string | null;
  /** Bumps when a new set of slides arrives, so the big stage replays. */
  version?: string | number;
  /** Dim while a newer preview is on its way. */
  stale?: boolean;
  className?: string;
}

/**
 * A show at a glance: the picked bumper big and playing its entrance, and a filmstrip of every
 * bumper under it (thumbnails mount as they scroll into view).
 */
export function ShowPreview({ slides, theme, data, showEventId, version = 0, stale, className }: ShowPreviewProps) {
  const reduce = usePrefersReducedMotion();
  const [picked, setPicked] = useState(0);
  const index = Math.min(picked, Math.max(0, slides.length - 1));
  const current = slides[index] ?? null;
  const titles = useMemo(() => slides.map((s) => slideTitle(s, theme, data, showEventId)), [slides, theme, data, showEventId]);

  return (
    <div className={cn('min-w-0 space-y-3 transition-opacity duration-200', stale && 'opacity-60', className)}>
      <figure className="space-y-2">
        <SlideThumb
          slide={current}
          theme={theme}
          data={data}
          showEventId={showEventId}
          live={!reduce}
          replayKey={`${version}-${index}-${current?.kind ?? ''}`}
          className="aspect-video w-full rounded-2xl ring-1 ring-line"
        />
        {current ? (
          <figcaption className="flex min-w-0 items-baseline gap-2 text-sm">
            <span className="mono shrink-0 text-ink-3 tabular-nums">
              {index + 1} of {slides.length}
            </span>
            <span className="truncate font-medium text-ink">{titles[index]}</span>
            <span className="ml-auto hidden shrink-0 text-ink-3 sm:inline">{BUMPER_KIND_META[current.kind].label}</span>
          </figcaption>
        ) : null}
      </figure>
      <ol className="flex min-w-0 snap-x gap-2.5 overflow-x-auto pb-2 [scrollbar-width:thin]" aria-label="Bumpers in this show">
        {slides.map((s, i) => (
          <li key={`${i}-${s.kind}`} className="w-36 shrink-0 snap-start sm:w-40">
            <button
              type="button"
              onClick={() => setPicked(i)}
              aria-pressed={i === index}
              aria-label={`${i + 1}. ${titles[i]}`}
              className={cn(
                'group block w-full rounded-xl p-1 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                i === index ? 'bg-ink/[0.06]' : 'hover:bg-surface-muted',
              )}
            >
              <span className="relative block">
                <LazyMount className="aspect-video w-full overflow-hidden rounded-lg bg-surface-muted ring-1 ring-line group-aria-pressed:ring-2 group-aria-pressed:ring-ink">
                  <SlideThumb slide={s} theme={theme} data={data} showEventId={showEventId} className="size-full" />
                </LazyMount>
                <span className="pointer-events-none absolute right-1 bottom-1 flex gap-1">
                  {s.hidden ? (
                    <Chip title="Hidden: playback skips it">
                      <EyeOff className="size-3" aria-hidden="true" />
                    </Chip>
                  ) : null}
                  {s.timing.autoAdvanceSec ? (
                    <Chip title={s.timing.loopToId ? `Moves on after ${s.timing.autoAdvanceSec} seconds and loops back` : `Moves on after ${s.timing.autoAdvanceSec} seconds`}>
                      {s.timing.loopToId ? <Repeat className="size-3" aria-hidden="true" /> : <Timer className="size-3" aria-hidden="true" />}
                      {s.timing.autoAdvanceSec}s
                    </Chip>
                  ) : null}
                </span>
              </span>
              <span className="mt-1.5 flex min-w-0 items-baseline gap-1.5 px-0.5 text-[0.75rem]">
                <span className="mono shrink-0 text-ink-4 tabular-nums">{i + 1}</span>
                <span className="truncate text-ink-2">{titles[i]}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Chip({ children, title }: { children: ReactNode; title: string }) {
  return (
    <span title={title} className="mono inline-flex h-5 items-center gap-1 rounded-full bg-ink/75 px-1.5 text-[0.625rem] text-white">
      {children}
    </span>
  );
}
