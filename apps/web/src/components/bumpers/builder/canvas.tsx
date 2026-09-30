'use client';

import { bumperPlayable, pickBumperTransition, type BumperBox, type BumperElementType, type BumperSlide } from '@zemi/shared';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { EmptyState } from '@/components/admin/ui/feedback';
import { notify } from '@/components/admin/ui/toast';
import { useMediaQuery } from '@/lib/admin/hooks';
import { newBumperId } from '../api';
import { defaultExtraBox, defaultExtraProps, EXTRA_LABELS } from '../engine/extras';
import { SlideView } from '../engine/slide-view';
import { BumperStage, type StageMetrics } from '../engine/stage';
import { CW, CH, angleFrom, boxCenter, canvasToContent, clampBox, hitTest, resizeBox, sameBox, snapMove, snapResize, snapTargets, type ElementInfo, type Guide, type Handle, type Pt, type SnapTargets } from './canvas/geometry';
import { elementLabel, slideName } from './canvas/labels';
import { CanvasOverlay } from './canvas/overlay';
import { PlayFromPreviousDialog, PlayThisDialog } from './canvas/play-dialogs';
import { requestInspectorFocus, useCanvasScanner, useCanvasSnapshot } from './canvas/registry';
import { CanvasToolbar, type Zoom } from './canvas/toolbar';
import { useBuilder } from './store';

/** Snap distance in screen px. */
const SNAP_PX = 7;
/** Movement (screen px) before a press turns into a drag. */
const DRAG_PX = 3;

interface Preview {
  slideId: string;
  key: string;
  box: BumperBox;
  rotate: number;
}

type Gesture =
  | { kind: 'move'; id: number; pointerId: number; el: ElementInfo; start: Pt; startClient: Pt; moved: boolean; targets: SnapTargets; last: Preview | null }
  | { kind: 'resize'; id: number; pointerId: number; el: ElementInfo; handle: Handle; start: Pt; targets: SnapTargets; last: Preview | null }
  | { kind: 'rotate'; id: number; pointerId: number; el: ElementInfo; center: Pt; last: Preview | null };

/** The slide with the in-progress drag patched in (the store only sees the gesture's end). */
function withPreview(slide: BumperSlide, p: Preview): BumperSlide {
  if (p.key.startsWith('x:')) {
    const id = p.key.slice(2);
    return { ...slide, extras: slide.extras.map((e) => (e.id === id ? { ...e, box: p.box, rotate: p.rotate } : e)) };
  }
  return { ...slide, layers: { ...slide.layers, [p.key]: { ...(slide.layers[p.key] ?? {}), box: p.box } } };
}

const fmt = (b: BumperBox) => `x ${b.x}, y ${b.y}`;

/**
 * Element sizes of a slide. Text fits itself to its box only when it first renders, so the canvas
 * renders the slide afresh whenever a box changes size (a resize, a reset, a typed width).
 */
function sizeSignature(slide: BumperSlide): string {
  const layers = Object.entries(slide.layers)
    .map(([k, l]) => (l.box ? `${k}:${l.box.w}x${l.box.h}` : ''))
    .join('|');
  const extras = slide.extras.map((e) => `${e.id}:${e.box.w}x${e.box.h}`).join('|');
  return `${slide.style.variant ?? ''}#${layers}#${extras}`;
}

/**
 * The builder canvas: the current bumper in edit mode, letterboxed and zoomed to fit (or at a
 * fixed zoom), with an overlay to select, drag, resize, rotate and nudge elements, snap guides, a
 * toolbar to add free elements, and the two previews (this bumper's entrance, and the transition
 * into it from the previous one).
 */
export function BuilderCanvas() {
  const b = useBuilder();
  const { state, slide, canEdit } = b;
  const { theme, eventId: showEventId, slides } = state.doc;
  const data = state.data;
  const wide = useMediaQuery('(min-width: 640px)', true);
  const pad = wide ? 28 : 14;

  const [zoom, setZoom] = useState<Zoom>('fit');
  const [snapOn, setSnapOn] = useState(true);
  const [showSafe, setShowSafe] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [metrics, setMetrics] = useState<StageMetrics | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [playOpen, setPlayOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const overlayRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const gestureSeq = useRef(0);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);

  useCanvasScanner(canvasEl);
  const snapshot = useCanvasSnapshot();
  const elements = useMemo(() => (slide && snapshot.slideId === slide.id ? snapshot.elements : []), [slide, snapshot]);
  const k = snapshot.contentScale;
  const s = metrics?.scale ?? 0;
  const selected = useMemo(() => elements.find((e) => e.key === state.element) ?? null, [elements, state.element]);
  const livePreview = preview && slide && preview.slideId === slide.id ? preview : null;
  const viewSlide = useMemo(() => (slide && livePreview ? withPreview(slide, livePreview) : slide), [slide, livePreview]);

  const index = slide ? slides.findIndex((x) => x.id === slide.id) : -1;
  const prevPlayable = useMemo(() => {
    if (index <= 0) return null;
    const before = bumperPlayable(slides.slice(0, index));
    return before[before.length - 1] ?? null;
  }, [slides, index]);
  const plannedIn = slide && prevPlayable ? pickBumperTransition(prevPlayable, slide, { motion: theme.motion }) : null;

  // The engine's settle() (run on every static render) strips inline `rotate` and `visibility`
  // from animated elements, which are exactly where the builder's rotation and hide live. Put
  // them back after each render so the canvas shows what playback should show.
  useLayoutEffect(() => {
    if (!canvasEl || !viewSlide) return;
    canvasEl.querySelectorAll<HTMLElement>('[data-bumper-slide] [data-el]').forEach((n) => {
      const key = n.dataset.el ?? '';
      const deg = key.startsWith('x:') ? viewSlide.extras.find((e) => e.id === key.slice(2))?.rotate : viewSlide.layers[key]?.rotate;
      const rotate = deg ? `${deg}deg` : '';
      if (n.style.rotate !== rotate) n.style.rotate = rotate;
      const visibility = n.hasAttribute('data-hidden') ? 'hidden' : '';
      if (n.style.visibility !== visibility) n.style.visibility = visibility;
    });
  });

  // Keep keyboard focus on an element that was just added or picked with the pointer.
  useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    const btn = buttons.current.get(key);
    if (btn) {
      pendingFocus.current = null;
      btn.focus({ preventScroll: true });
    }
  }, [elements]);

  // A fixed zoom starts centered on the canvas.
  useEffect(() => {
    const v = viewportRef.current;
    if (!v || zoom === 'fit') return;
    v.scrollTo({ left: (v.scrollWidth - v.clientWidth) / 2, top: (v.scrollHeight - v.clientHeight) / 2 });
  }, [zoom]);

  const registerButton = useCallback((key: string, el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(key, el);
    else buttons.current.delete(key);
  }, []);

  const focusElement = (key: string) => {
    const btn = buttons.current.get(key);
    if (btn) btn.focus({ preventScroll: true });
    else pendingFocus.current = key;
  };

  const say = (text: string) => setAnnouncement(text);
  const labelFor = (e: ElementInfo) => elementLabel(slide, e);

  const commit = (el: ElementInfo, box: BumperBox, rotate: number, coalesce: string) => {
    if (!slide) return;
    const next = clampBox(box);
    if (sameBox(next, el.box) && rotate === el.rotate) return;
    if (el.extraId) b.updateExtra(slide.id, el.extraId, (x) => ({ ...x, box: next, rotate }), coalesce);
    else b.moveLayer(slide.id, el.key, next, coalesce);
  };

  const pointFrom = (e: { clientX: number; clientY: number }): Pt => {
    const r = overlayRef.current?.getBoundingClientRect();
    if (!r || !s) return { x: 0, y: 0 };
    return canvasToContent({ x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }, k);
  };

  const endGesture = () => {
    gesture.current = null;
    setPreview(null);
    setGuides([]);
  };

  /* ---------------------------------------------------------------- pointer */

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!slide || !s) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Keep focus on the element button we focus below (the default would move it to the canvas region).
    e.preventDefault();
    const p = pointFrom(e);
    const hit = hitTest(elements, p, 4 / (s * k));
    if (!hit) {
      b.selectElement(null);
      return;
    }
    if (state.element !== hit.key) b.selectElement(hit.key);
    focusElement(hit.key);
    if (!canEdit || hit.locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { kind: 'move', id: ++gestureSeq.current, pointerId: e.pointerId, el: hit, start: p, startClient: { x: e.clientX, y: e.clientY }, moved: false, targets: snapTargets(elements, hit.key), last: null };
  };

  const onHandleDown = (handle: Handle, e: ReactPointerEvent<HTMLElement>) => {
    e.stopPropagation();
    if (!slide || !selected || !canEdit || selected.locked || !s) return;
    e.preventDefault();
    overlayRef.current?.setPointerCapture(e.pointerId);
    gesture.current = { kind: 'resize', id: ++gestureSeq.current, pointerId: e.pointerId, el: selected, handle, start: pointFrom(e), targets: snapTargets(elements, selected.key), last: null };
  };

  const onRotateDown = (e: ReactPointerEvent<HTMLElement>) => {
    e.stopPropagation();
    if (!slide || !selected?.extraId || !canEdit || !s) return;
    e.preventDefault();
    overlayRef.current?.setPointerCapture(e.pointerId);
    gesture.current = { kind: 'rotate', id: ++gestureSeq.current, pointerId: e.pointerId, el: selected, center: boxCenter(selected.box), last: null };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) {
      if (e.pointerType === 'mouse' && s) {
        const hit = hitTest(elements, pointFrom(e), 2 / (s * k));
        const key = hit?.key ?? null;
        if (key !== hoverKey) setHoverKey(key);
      }
      return;
    }
    if (g.pointerId !== e.pointerId || !slide) return;
    const p = pointFrom(e);
    const threshold = SNAP_PX / (s * k);
    const snapping = snapOn && !e.altKey;
    let box: BumperBox = g.el.box;
    let rotate = g.el.rotate;
    let lines: Guide[] = [];
    if (g.kind === 'move') {
      if (!g.moved && Math.hypot(e.clientX - g.startClient.x, e.clientY - g.startClient.y) < DRAG_PX) return;
      g.moved = true;
      let dx = p.x - g.start.x;
      let dy = p.y - g.start.y;
      // Shift keeps the move on one axis.
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      box = { ...g.el.box, x: g.el.box.x + dx, y: g.el.box.y + dy };
      if (snapping) ({ box, guides: lines } = snapMove(box, rotate, g.targets, threshold));
    } else if (g.kind === 'resize') {
      const keep = g.el.lockAspect || e.shiftKey;
      box = resizeBox(g.el.box, g.el.rotate, g.handle, { x: p.x - g.start.x, y: p.y - g.start.y }, keep);
      if (snapping && !g.el.rotate) ({ box, guides: lines } = snapResize(box, g.el.box, g.handle, keep, g.targets, threshold));
    } else {
      rotate = angleFrom(g.center, p, e.shiftKey);
    }
    const next: Preview = { slideId: slide.id, key: g.el.key, box: clampBox(box), rotate };
    g.last = next;
    setPreview(next);
    setGuides(lines);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const last = g.last;
    endGesture();
    if (!last) return;
    const label = labelFor(g.el);
    commit(g.el, last.box, last.rotate, `gesture:${last.slideId}:${g.el.key}:${g.id}`);
    if (g.kind === 'resize') say(`${label} resized to ${last.box.w} by ${last.box.h}.`);
    else if (g.kind === 'rotate') say(`${label} rotated to ${last.rotate} degrees.`);
    else say(`${label} moved to ${fmt(last.box)}.`);
  };

  const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!slide || !s) return;
    const hit = hitTest(elements, pointFrom(e), 4 / (s * k));
    if (hit) requestInspectorFocus({ slideId: slide.id, elementKey: hit.key });
  };

  /* ---------------------------------------------------------------- keyboard */

  const nudge = (el: ElementInfo, dx: number, dy: number) => {
    if (!slide) return;
    const box = clampBox({ ...el.box, x: el.box.x + dx, y: el.box.y + dy });
    commit(el, box, el.rotate, `nudge:${slide.id}:${el.key}`);
    say(`${labelFor(el)} at ${fmt(box)}.`);
  };

  const removeOrHide = (el: ElementInfo) => {
    if (!slide || !canEdit) return;
    const label = labelFor(el);
    if (el.extraId) {
      b.removeExtra(slide.id, el.extraId);
      b.selectElement(null);
      regionRef.current?.focus({ preventScroll: true });
      say(`${label} removed. Undo brings it back.`);
      notify.info(`${label} removed.`, { action: { label: 'Undo', onClick: () => b.undo() } });
    } else if (!el.hidden) {
      b.setLayer(slide.id, el.key, { hidden: true });
      say(`${label} hidden. Select it again to show it.`);
      notify.info(`${label} hidden. It stays on the canvas as an outline.`, { action: { label: 'Undo', onClick: () => b.undo() } });
    }
  };

  const onElementKeyDown = (key: string, e: KeyboardEvent<HTMLButtonElement>) => {
    const el = elements.find((x) => x.key === key);
    if (!el || !slide) return;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = arrows[e.key];
    if (dir) {
      if (!canEdit || el.locked || state.element !== key || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      nudge(el, dir[0] * step, dir[1] * step);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeOrHide(el);
    } else if (e.key === 'Escape') {
      if (state.element) {
        e.preventDefault();
        b.selectElement(null);
        say('Nothing selected.');
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      requestInspectorFocus({ slideId: slide.id, elementKey: key });
    }
  };

  const onElementFocus = (key: string) => {
    if (state.element !== key) b.selectElement(key);
  };

  /* ---------------------------------------------------------------- add */

  const add = (type: BumperElementType) => {
    if (!slide || !canEdit) return;
    // Cascade new elements from the middle so a few quick adds don't pile up on one spot.
    const step = (slide.extras.length % 6) * 36;
    let box = defaultExtraBox(type);
    box = { ...box, x: box.x + step, y: box.y + step };
    for (let i = 0; i < 12 && slide.extras.some((x) => x.box.x === box.x && x.box.y === box.y); i++) box = { ...box, x: box.x + 36, y: box.y + 36 };
    const id = newBumperId('x');
    const z = slide.extras.reduce((m, x) => Math.max(m, x.z), -1) + 1;
    b.addExtra(slide.id, { id, type, box, rotate: 0, z: Math.min(50, Math.max(0, z)), props: defaultExtraProps(type) });
    b.selectElement(`x:${id}`);
    pendingFocus.current = `x:${id}`;
    say(`${EXTRA_LABELS[type]} added in the middle. Arrow keys move it.`);
  };

  /* ---------------------------------------------------------------- render */

  const sizes = useMemo(() => (slide ? sizeSignature(slide) : ''), [slide]);
  const slideView = useMemo(
    () => (viewSlide ? <SlideView key={`${viewSlide.id}:${sizes}`} slide={viewSlide} theme={theme} data={data} showEventId={showEventId} mode="edit" /> : null),
    [viewSlide, theme, data, showEventId, sizes],
  );

  if (!slide) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-surface-muted p-6">
        <EmptyState
          title={slides.length ? 'Pick a bumper' : 'No bumpers yet'}
          description={slides.length ? 'Choose one in the rail to edit it here.' : 'Add the first one from the rail and it shows up here, ready to drag around.'}
          cast={[
            { shape: 'circle', mood: 'look', size: 44, lookAt: { x: -0.8, y: 0.2 } },
            { shape: 'square', mood: 'sleep', size: 52 },
          ]}
        />
      </div>
    );
  }

  const fixed = zoom !== 'fit';
  const innerStyle = fixed ? { width: CW * zoom + pad * 2, height: CH * zoom + pad * 2 } : { width: '100%', height: '100%' };
  const canvasRect = metrics && s ? { left: pad + metrics.left, top: pad + metrics.top, width: CW * s, height: CH * s } : null;
  const name = slideName(slide, theme, data, showEventId);

  return (
    <div className="@container flex min-h-0 flex-1 flex-col bg-surface-muted">
      <CanvasToolbar
        canEdit={canEdit}
        hasSlide
        onAdd={add}
        snap={snapOn}
        onSnap={setSnapOn}
        safe={showSafe}
        onSafe={setShowSafe}
        grid={showGrid}
        onGrid={setShowGrid}
        zoom={zoom}
        scale={s}
        onZoom={setZoom}
        onPlay={() => setPlayOpen(true)}
        onPlayFromPrevious={() => setPrevOpen(true)}
        playFromPreviousBlocked={prevPlayable ? null : 'This is the first bumper that plays, so nothing comes before it.'}
      />
      <div
        ref={regionRef}
        tabIndex={-1}
        role="group"
        aria-roledescription="canvas"
        aria-label={`Canvas: ${name}`}
        aria-describedby="bumper-canvas-help"
        className="relative min-h-0 flex-1 outline-none"
      >
        <p id="bumper-canvas-help" className="sr-only">
          Tab moves between the elements on this bumper. Arrow keys nudge the selected one, Shift for 10 pixels. Delete removes a free element or hides a template one. Enter edits it in the inspector. Escape deselects.
        </p>
        <div
          ref={viewportRef}
          className={fixed ? 'absolute inset-0 flex overflow-auto' : 'absolute inset-0 flex overflow-hidden'}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget || e.target === e.currentTarget.firstChild) b.selectElement(null);
          }}
        >
          <div className="relative m-auto shrink-0" style={innerStyle}>
            {canvasRect ? <div aria-hidden="true" className="pointer-events-none absolute ring-1 ring-black/5" style={{ ...canvasRect, boxShadow: 'var(--shadow-2)' }} /> : null}
            <BumperStage canvasRef={setCanvasEl} onMetrics={setMetrics} letterbox="transparent" style={{ position: 'absolute', left: pad, top: pad, right: pad, bottom: pad }}>
              {slideView}
            </BumperStage>
            {canvasRect ? (
              <div
                ref={overlayRef}
                data-canvas-overlay=""
                className="absolute touch-none select-none"
                style={{ ...canvasRect, cursor: livePreview ? 'grabbing' : hoverKey && canEdit ? 'move' : 'default' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={endGesture}
                onLostPointerCapture={(e) => {
                  if (gesture.current?.pointerId === e.pointerId) endGesture();
                }}
                onPointerLeave={() => {
                  if (!gesture.current) setHoverKey(null);
                }}
                onDoubleClick={onDoubleClick}
              >
                <CanvasOverlay
                  view={{ scale: s, k }}
                  elements={elements}
                  selected={selected}
                  preview={livePreview && selected && livePreview.key === selected.key ? livePreview : null}
                  hoverKey={hoverKey}
                  guides={guides}
                  showGrid={showGrid}
                  showSafe={showSafe}
                  canEdit={canEdit}
                  onHandleDown={onHandleDown}
                  onRotateDown={onRotateDown}
                  onElementFocus={onElementFocus}
                  onElementKeyDown={onElementKeyDown}
                  registerButton={registerButton}
                  labelFor={labelFor}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <StatusBar selected={selected ? { label: labelFor(selected), box: livePreview?.box ?? selected.box, rotate: livePreview?.rotate ?? selected.rotate, locked: selected.locked, hidden: selected.hidden } : null} canEdit={canEdit} index={index} total={slides.length} />
      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>
      <PlayThisDialog open={playOpen} onOpenChange={setPlayOpen} slide={slide} name={name} theme={theme} data={data} showEventId={showEventId} />
      {prevPlayable && plannedIn ? (
        <PlayFromPreviousDialog
          open={prevOpen}
          onOpenChange={setPrevOpen}
          from={prevPlayable}
          to={slide}
          fromName={slideName(prevPlayable, theme, data, showEventId)}
          toName={name}
          transition={plannedIn}
          overridden={slide.transitionIn !== 'auto'}
          theme={theme}
          data={data}
          showEventId={showEventId}
        />
      ) : null}
    </div>
  );
}

function StatusBar({ selected, canEdit, index, total }: { selected: { label: string; box: BumperBox; rotate: number; locked: boolean; hidden: boolean } | null; canEdit: boolean; index: number; total: number }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-3 overflow-hidden border-t border-line bg-white px-3 text-xs text-ink-3">
      {selected ? (
        <>
          <span className="truncate font-semibold text-ink">{selected.label}</span>
          <span className="mono shrink-0 tabular-nums">
            {selected.box.x}, {selected.box.y} · {selected.box.w}×{selected.box.h}
            {selected.rotate ? ` · ${selected.rotate}°` : ''}
          </span>
          {selected.locked ? <span className="shrink-0">Part of the backdrop, it stays put</span> : selected.hidden ? <span className="shrink-0">Hidden on screen</span> : null}
        </>
      ) : (
        <span className="truncate">{canEdit ? 'Click to select, drag to move, double-click to edit. Hold Alt to skip snapping.' : 'View only. You can look around, but changes need Build bumpers access.'}</span>
      )}
      <span className="mono ml-auto shrink-0 tabular-nums">
        {index + 1} / {total}
      </span>
    </div>
  );
}
