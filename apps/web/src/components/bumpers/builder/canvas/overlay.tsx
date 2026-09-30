'use client';

import type { BumperBox } from '@zemi/shared';
import { EyeOff, Lock } from 'lucide-react';
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/admin/cn';
import { GRID, HANDLES, SAFE, contentToCanvas, rotatedBounds, type ElementInfo, type Guide, type Handle } from './geometry';

const BLUE = '#3a6dc5';
const RED = '#f94141';

export interface OverlayView {
  /** Stage scale (canvas px to screen px). */
  scale: number;
  /** Content scale inside the canvas (safe-area shrink). */
  k: number;
}

/** Content px to overlay px (the overlay sits exactly on the canvas). */
function place(v: OverlayView, b: BumperBox, deg = 0): CSSProperties {
  const p = contentToCanvas({ x: b.x, y: b.y }, v.k);
  return {
    position: 'absolute',
    left: p.x * v.scale,
    top: p.y * v.scale,
    width: b.w * v.k * v.scale,
    height: b.h * v.k * v.scale,
    rotate: deg ? `${deg}deg` : undefined,
  };
}

const CURSOR: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

function handleStyle(h: Handle): CSSProperties {
  const pos: Record<Handle, CSSProperties> = {
    nw: { left: 0, top: 0 },
    n: { left: '50%', top: 0 },
    ne: { left: '100%', top: 0 },
    e: { left: '100%', top: '50%' },
    se: { left: '100%', top: '100%' },
    s: { left: '50%', top: '100%' },
    sw: { left: 0, top: '100%' },
    w: { left: 0, top: '50%' },
  };
  return { ...pos[h], cursor: CURSOR[h] };
}

export interface CanvasOverlayProps {
  view: OverlayView;
  elements: ElementInfo[];
  selected: ElementInfo | null;
  /** Live box while dragging (overrides the selected element's box). */
  preview: { box: BumperBox; rotate: number } | null;
  hoverKey: string | null;
  guides: Guide[];
  showGrid: boolean;
  showSafe: boolean;
  canEdit: boolean;
  /** Resizing and rotating are offered (not for locked art). */
  onHandleDown: (h: Handle, e: ReactPointerEvent<HTMLElement>) => void;
  onRotateDown: (e: ReactPointerEvent<HTMLElement>) => void;
  /** Keyboard focus targets, one per element (Tab moves through them). */
  onElementFocus: (key: string) => void;
  onElementKeyDown: (key: string, e: KeyboardEvent<HTMLButtonElement>) => void;
  registerButton: (key: string, el: HTMLButtonElement | null) => void;
  labelFor: (e: ElementInfo) => string;
}

/**
 * Everything the builder draws over the slide: grid, title-safe frame, ghost outlines for hidden
 * elements, the hover outline, snap guides, the selection box with its handles, and one
 * invisible focusable button per element so the canvas works from the keyboard.
 */
export function CanvasOverlay({ view, elements, selected, preview, hoverKey, guides, showGrid, showSafe, canEdit, onHandleDown, onRotateDown, onElementFocus, onElementKeyDown, registerButton, labelFor }: CanvasOverlayProps) {
  const s = view.scale;
  const hover = hoverKey && hoverKey !== selected?.key ? elements.find((e) => e.key === hoverKey) : null;
  const selBox = selected ? (preview?.box ?? selected.box) : null;
  const selRot = selected ? (preview?.rotate ?? selected.rotate) : 0;
  const editable = canEdit && selected && !selected.locked;
  // Keep the rotate handle on screen when the element hugs the top of the canvas.
  const rotateBelow = selBox ? contentToCanvas(selBox, view.k).y * s < 44 : false;
  const gridPx = GRID * view.k * s;
  const safeOrigin = contentToCanvas({ x: SAFE.x0, y: SAFE.y0 }, view.k);

  return (
    <>
      {showGrid ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(58,109,197,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(58,109,197,0.22) 1px, transparent 1px)`,
            backgroundSize: `${gridPx}px ${gridPx}px`,
            backgroundPosition: `${contentToCanvas({ x: 0, y: 0 }, view.k).x * s}px ${contentToCanvas({ x: 0, y: 0 }, view.k).y * s}px`,
            mixBlendMode: 'multiply',
          }}
        />
      ) : null}
      {showSafe ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: safeOrigin.x * s,
            top: safeOrigin.y * s,
            width: (SAFE.x1 - SAFE.x0) * view.k * s,
            height: (SAFE.y1 - SAFE.y0) * view.k * s,
            outline: `1px dashed ${BLUE}`,
            outlineOffset: 0,
            boxShadow: '0 0 0 1px rgba(255,255,255,0.55)',
          }}
        >
          <span className="mono absolute top-1 left-1 rounded bg-blue px-1.5 py-px text-[10px] leading-4 text-white">Title safe</span>
        </div>
      ) : null}

      {elements
        .filter((e) => e.hidden && e.key !== selected?.key)
        .map((e) => (
          <div key={`ghost-${e.key}`} aria-hidden="true" className="pointer-events-none absolute" style={{ ...place(view, e.box, e.rotate), outline: '1.5px dashed rgba(107,114,128,0.9)', background: 'rgba(247,247,245,0.28)' }}>
            <span className="absolute top-1 left-1 inline-flex max-w-[calc(100%-8px)] items-center gap-1 truncate rounded-full bg-white/90 px-1.5 py-px text-[10px] leading-4 text-ink-3 shadow-[var(--shadow-1)]">
              <EyeOff className="size-2.5 shrink-0" />
              <span className="truncate">{labelFor(e)}</span>
            </span>
          </div>
        ))}

      {hover ? (
        <div aria-hidden="true" className="pointer-events-none absolute" style={{ ...place(view, hover.box, hover.rotate), outline: `1.5px solid ${BLUE}`, opacity: hover.hidden ? 0.6 : 0.85 }}>
          <span className="absolute -top-[22px] left-0 truncate rounded-md bg-blue px-1.5 py-px text-[11px] leading-4 font-medium whitespace-nowrap text-white">{labelFor(hover)}</span>
        </div>
      ) : null}

      {guides.map((g, i) =>
        g.axis === 'x' ? (
          <div key={`g${i}`} aria-hidden="true" className="pointer-events-none absolute top-0 h-full" style={{ left: contentToCanvas({ x: g.at, y: 0 }, view.k).x * s - 0.5, width: 1, background: RED, opacity: g.kind === 'element' ? 0.9 : 1, boxShadow: '0 0 0 0.5px rgba(255,255,255,0.6)' }} />
        ) : (
          <div key={`g${i}`} aria-hidden="true" className="pointer-events-none absolute left-0 w-full" style={{ top: contentToCanvas({ x: 0, y: g.at }, view.k).y * s - 0.5, height: 1, background: RED, opacity: g.kind === 'element' ? 0.9 : 1, boxShadow: '0 0 0 0.5px rgba(255,255,255,0.6)' }} />
        ),
      )}

      {selected && selBox ? (
        <div aria-hidden="true" className="pointer-events-none absolute" style={{ ...place(view, selBox, selRot) }}>
          <div className="absolute inset-0" style={{ outline: `1.5px ${selected.locked || selected.hidden ? 'dashed' : 'solid'} ${BLUE}`, boxShadow: '0 0 0 1px rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.35)' }} />
          {editable ? (
            <>
              {HANDLES.map((h) => {
                const corner = h.length === 2;
                return (
                  <span
                    key={h}
                    data-handle={h}
                    onPointerDown={(e) => onHandleDown(h, e)}
                    className="pointer-events-auto absolute flex size-7 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center"
                    style={handleStyle(h)}
                  >
                    <span
                      className={cn('block border-[1.5px] border-blue bg-white shadow-[0_1px_3px_rgba(14,17,22,0.25)]', corner ? 'size-2.5 rounded-[3px]' : h === 'n' || h === 's' ? 'h-1.5 w-3.5 rounded-full' : 'h-3.5 w-1.5 rounded-full')}
                    />
                  </span>
                );
              })}
              {selected.extraId ? (
                <>
                  <span className="absolute left-1/2 h-5 w-px -translate-x-1/2 bg-blue" style={rotateBelow ? { bottom: -20 } : { top: -20 }} />
                  <span
                    data-handle="rotate"
                    onPointerDown={onRotateDown}
                    className="pointer-events-auto absolute left-1/2 flex size-7 -translate-x-1/2 touch-none items-center justify-center"
                    style={{ ...(rotateBelow ? { bottom: -40 } : { top: -40 }), cursor: 'grab' }}
                  >
                    <span className="block size-3 rounded-full border-[1.5px] border-blue bg-white shadow-[0_1px_3px_rgba(14,17,22,0.25)]" />
                  </span>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {selected && selBox ? (
        <div aria-hidden="true" className="pointer-events-none absolute" style={place(view, rotatedBounds(selBox, selRot))}>
          <SizeTag label={labelFor(selected)} box={selBox} locked={selected.locked} hidden={selected.hidden} flip={contentToCanvas(rotatedBounds(selBox, selRot), view.k).y * s < 28} />
        </div>
      ) : null}

      {elements.map((e) => (
        <button
          key={`btn-${e.key}`}
          ref={(el) => registerButton(e.key, el)}
          type="button"
          tabIndex={0}
          aria-pressed={selected?.key === e.key}
          aria-label={`${labelFor(e)}${e.hidden ? ', hidden' : ''}${e.locked ? ', locked' : ''}`}
          onFocus={() => onElementFocus(e.key)}
          onKeyDown={(ev) => onElementKeyDown(e.key, ev)}
          className="pointer-events-none absolute rounded-[2px] outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
          style={place(view, e.box, e.rotate)}
        />
      ))}
    </>
  );
}

function SizeTag({ label, box, locked, hidden, flip }: { label: string; box: BumperBox; locked: boolean; hidden: boolean; flip: boolean }) {
  return (
    <span className={cn('absolute left-0 flex max-w-[max(100%,12rem)] items-center gap-1.5 rounded-md bg-blue px-1.5 py-px text-[11px] leading-4 whitespace-nowrap text-white shadow-[0_1px_2px_rgba(14,17,22,0.2)]', flip ? 'top-[calc(100%+6px)]' : '-top-[22px]')}>
      {locked ? <Lock className="size-2.5 shrink-0" /> : hidden ? <EyeOff className="size-2.5 shrink-0" /> : null}
      <span className="truncate font-medium">{label}</span>
      <span className="mono opacity-80 tabular-nums">
        {Math.round(box.w)}×{Math.round(box.h)}
      </span>
    </span>
  );
}

