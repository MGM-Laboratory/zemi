'use client';

import { MARK_PATHS, SHAPE_ORDER, SHAPE_PATHS_46, type BumperElementType } from '@zemi/shared';
import { ChevronDown, Clock, Frame, Grid3x3, ImageIcon, Magnet, Minus, Play, Plus, QrCode, Shapes, SkipBack, Sticker, Timer, Type } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/admin/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/admin/ui/dropdown-menu';
import { Tooltip } from '@/components/admin/ui/tooltip';
import { cn } from '@/lib/admin/cn';
import { EXTRA_LABELS } from '../../engine/extras';

/** A tiny character (circle with two eyes) for the "Add character" button. */
function CharacterGlyph() {
  return (
    <svg viewBox="0 0 46 46" aria-hidden="true" className="size-[18px]">
      <path d={SHAPE_PATHS_46.circle} fill="currentColor" opacity="0.2" />
      <path d={SHAPE_PATHS_46.circle} fill="none" stroke="currentColor" strokeWidth="4" />
      <ellipse cx="16.5" cy="21" rx="3.4" ry="4" fill="currentColor" />
      <ellipse cx="29.5" cy="21" rx="3.4" ry="4" fill="currentColor" />
    </svg>
  );
}

/** The 2x2 mark, in the current color, for "Add logo". */
function MarkGlyph() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="size-[16px]">
      {SHAPE_ORDER.map((s) => (
        <path key={s} d={MARK_PATHS[s]} fill="currentColor" />
      ))}
    </svg>
  );
}

export const EXTRA_ICONS: Record<BumperElementType, ReactNode> = {
  text: <Type />,
  image: <ImageIcon />,
  qr: <QrCode />,
  shape: <Shapes />,
  character: <CharacterGlyph />,
  sticker: <Sticker />,
  clock: <Clock />,
  countdown: <Timer />,
  logo: <MarkGlyph />,
  line: <Minus />,
};

const ADD_ORDER: BumperElementType[] = ['text', 'image', 'qr', 'shape', 'character', 'sticker', 'clock', 'countdown', 'logo', 'line'];

export type Zoom = 'fit' | number;
const ZOOMS: Array<{ value: string; label: string }> = [
  { value: 'fit', label: 'Zoom to fit' },
  { value: '0.25', label: '25%' },
  { value: '0.5', label: '50%' },
  { value: '0.75', label: '75%' },
  { value: '1', label: '100%' },
  { value: '1.5', label: '150%' },
];

function ToolButton({ label, pressed, onClick, disabled, children, shortcut }: { label: string; pressed?: boolean; onClick: () => void; disabled?: boolean; children: ReactNode; shortcut?: string }) {
  return (
    <Tooltip content={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-2 transition-[background-color,color,transform] duration-150 active:scale-[0.92] [&_svg]:size-[18px]',
          'hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-40',
          pressed && 'bg-blue-50 text-blue hover:bg-blue-50 hover:text-blue-600',
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export interface CanvasToolbarProps {
  canEdit: boolean;
  hasSlide: boolean;
  onAdd: (type: BumperElementType) => void;
  snap: boolean;
  onSnap: (v: boolean) => void;
  safe: boolean;
  onSafe: (v: boolean) => void;
  grid: boolean;
  onGrid: (v: boolean) => void;
  zoom: Zoom;
  scale: number;
  onZoom: (z: Zoom) => void;
  onPlay: () => void;
  onPlayFromPrevious: () => void;
  /** Why "Play from previous" is off (no bumper before this one), or null. */
  playFromPreviousBlocked: string | null;
}

/** Add elements, view toggles, zoom, and the two previews. Scrolls sideways on small screens. */
export function CanvasToolbar({ canEdit, hasSlide, onAdd, snap, onSnap, safe, onSafe, grid, onGrid, zoom, scale, onZoom, onPlay, onPlayFromPrevious, playFromPreviousBlocked }: CanvasToolbarProps) {
  const zoomLabel = zoom === 'fit' ? `${Math.round(scale * 100)}%` : `${Math.round(zoom * 100)}%`;
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-white px-2 no-scrollbar sm:px-3" role="toolbar" aria-label="Canvas tools">
      <div className="hidden shrink-0 items-center gap-0.5 rounded-full bg-surface-muted p-0.5 @3xl:flex" role="group" aria-label="Add an element">
        {ADD_ORDER.map((t) => (
          <ToolButton key={t} label={`Add ${EXTRA_LABELS[t].toLowerCase()}`} onClick={() => onAdd(t)} disabled={!canEdit || !hasSlide}>
            {EXTRA_ICONS[t]}
          </ToolButton>
        ))}
      </div>
      <div className="shrink-0 @3xl:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={!canEdit || !hasSlide}>
            <Button size="sm" variant="secondary" icon={<Plus />} iconRight={<ChevronDown className="size-3.5" />}>
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[13rem]">
            <DropdownMenuLabel>Add to this bumper</DropdownMenuLabel>
            {ADD_ORDER.map((t) => (
              <DropdownMenuItem key={t} icon={<span className="flex size-4 items-center justify-center [&_svg]:!size-4">{EXTRA_ICONS[t]}</span>} onSelect={() => onAdd(t)}>
                {EXTRA_LABELS[t]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <span className="mx-1.5 h-5 w-px shrink-0 bg-line" aria-hidden="true" />
      <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="View">
        <ToolButton label={snap ? 'Snapping on (hold Alt to skip)' : 'Snapping off'} pressed={snap} onClick={() => onSnap(!snap)}>
          <Magnet />
        </ToolButton>
        <ToolButton label="Title-safe area" pressed={safe} onClick={() => onSafe(!safe)}>
          <Frame />
        </ToolButton>
        <ToolButton label="48 px grid" pressed={grid} onClick={() => onGrid(!grid)}>
          <Grid3x3 />
        </ToolButton>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="mono ml-1 inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-ink-2 tabular-nums transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            aria-label={`Zoom: ${zoom === 'fit' ? 'fit, ' : ''}${zoomLabel}`}
          >
            {zoom === 'fit' ? <span className="hidden font-body @2xl:inline">Fit</span> : null}
            {zoomLabel}
            <ChevronDown className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[10rem]">
          <DropdownMenuLabel>Zoom</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={String(zoom)} onValueChange={(v) => onZoom(v === 'fit' ? 'fit' : Number(v))}>
            {ZOOMS.map((z) => (
              <DropdownMenuRadioItem key={z.value} value={z.value}>
                {z.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
        <Tooltip content={playFromPreviousBlocked ?? 'Play the transition into this bumper'}>
          <span className="inline-flex">
            <Button size="sm" variant="ghost" icon={<SkipBack />} onClick={onPlayFromPrevious} disabled={!hasSlide || !!playFromPreviousBlocked} aria-label="Play from previous">
              <span className="hidden @2xl:inline">From previous</span>
            </Button>
          </span>
        </Tooltip>
        <Tooltip content="Play this bumper's entrance">
          <span className="inline-flex">
            <Button size="sm" variant="secondary" icon={<Play />} onClick={onPlay} disabled={!hasSlide} aria-label="Play this bumper">
              <span className="hidden @xl:inline">Play this</span>
            </Button>
          </span>
        </Tooltip>
      </div>
    </div>
  );
}

