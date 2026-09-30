import { BUMPER_CANVAS, BUMPER_SAFE_INSET, type BumperBox } from '@zemi/shared';

/**
 * Canvas math for the builder. Everything is in "content" px: the 1920x1080 authoring space the
 * templates use. When the theme's overscan safe area is on, the slide's content layer is scaled
 * 0.95 around the canvas center, so screen positions go through `contentToCanvas` first.
 */

export const CW = BUMPER_CANVAS.width;
export const CH = BUMPER_CANVAS.height;
const CX = CW / 2;
const CY = CH / 2;
export const SAFE = { x0: BUMPER_SAFE_INSET.x, y0: BUMPER_SAFE_INSET.y, x1: CW - BUMPER_SAFE_INSET.x, y1: CH - BUMPER_SAFE_INSET.y };
export const GRID = 48;
export const MIN_SIZE = 8;

export interface Pt {
  x: number;
  y: number;
}

/** One selectable thing on the slide, read from its data attributes. */
export interface ElementInfo {
  /** Layer key (`title`) or `x:<extraId>` for free elements. */
  key: string;
  label: string;
  box: BumperBox;
  defaultBox: BumperBox;
  rotate: number;
  /** Stacking order (the element's z-index). */
  z: number;
  /** DOM order (later paints on top at the same z). */
  order: number;
  lockAspect: boolean;
  locked: boolean;
  hidden: boolean;
  extraId: string | null;
  /** Free element type ('text', 'qr'...) or null for template elements. */
  extraType: string | null;
}

/** Content px to canvas px (the safe-area shrink). */
export function contentToCanvas(p: Pt, k: number): Pt {
  return { x: CX + (p.x - CX) * k, y: CY + (p.y - CY) * k };
}

/** Canvas px to content px. */
export function canvasToContent(p: Pt, k: number): Pt {
  return { x: CX + (p.x - CX) / k, y: CY + (p.y - CY) / k };
}

export function parseBox(raw: string | undefined | null): BumperBox | null {
  if (!raw) return null;
  const [x, y, w, h] = raw.split(',').map(Number);
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
  return { x: x!, y: y!, w: w!, h: h! };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

function rotateVec(v: Pt, deg: number): Pt {
  if (!deg) return v;
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export function boxCenter(b: BumperBox): Pt {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** Is the point inside the box rotated around its center? */
export function pointInBox(p: Pt, b: BumperBox, deg: number, pad = 0): boolean {
  const c = boxCenter(b);
  const local = rotateVec({ x: p.x - c.x, y: p.y - c.y }, -deg);
  return Math.abs(local.x) <= b.w / 2 + pad && Math.abs(local.y) <= b.h / 2 + pad;
}

/** Topmost element under the point: visible before hidden ghosts, then z, then DOM order. Locked art is skipped. */
export function hitTest(elements: readonly ElementInfo[], p: Pt, pad = 0): ElementInfo | null {
  let best: ElementInfo | null = null;
  const rank = (e: ElementInfo) => [e.hidden ? 0 : 1, e.z, e.order] as const;
  for (const e of elements) {
    if (e.locked || !pointInBox(p, e.box, e.rotate, pad)) continue;
    if (!best) {
      best = e;
      continue;
    }
    const a = rank(e);
    const b = rank(best);
    if (a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])))) best = e;
  }
  return best;
}

/** Axis-aligned bounds of a rotated box (for guides and labels). */
export function rotatedBounds(b: BumperBox, deg: number): BumperBox {
  if (!deg) return b;
  const c = boxCenter(b);
  const pts = [
    { x: -b.w / 2, y: -b.h / 2 },
    { x: b.w / 2, y: -b.h / 2 },
    { x: b.w / 2, y: b.h / 2 },
    { x: -b.w / 2, y: b.h / 2 },
  ].map((v) => rotateVec(v, deg));
  const xs = pts.map((q) => q.x + c.x);
  const ys = pts.map((q) => q.y + c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Round and keep a box inside the schema limits. */
export function clampBox(b: BumperBox): BumperBox {
  const w = Math.round(Math.min(3840, Math.max(MIN_SIZE, b.w)));
  const h = Math.round(Math.min(2160, Math.max(MIN_SIZE, b.h)));
  return {
    x: Math.round(Math.min(3840, Math.max(-1920, b.x))),
    y: Math.round(Math.min(2160, Math.max(-1080, b.y))),
    w,
    h,
  };
}

export function sameBox(a: BumperBox, b: BumperBox): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/* ---------------------------------------------------------------- resize */

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export const HANDLE_DIR: Record<Handle, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

/**
 * Resize from one handle, the opposite side staying put (in the element's own rotated frame).
 * `delta` is the pointer movement in content px.
 */
export function resizeBox(start: BumperBox, deg: number, handle: Handle, delta: Pt, keepAspect: boolean): BumperBox {
  const [hx, hy] = HANDLE_DIR[handle];
  const d = rotateVec(delta, -deg);
  let w = hx ? Math.max(MIN_SIZE, start.w + hx * d.x) : start.w;
  let h = hy ? Math.max(MIN_SIZE, start.h + hy * d.y) : start.h;
  if (keepAspect) {
    const ratio = start.w / start.h;
    if (hx && hy) {
      // Corners follow whichever axis moved further, proportionally.
      const s = Math.max(w / start.w, h / start.h);
      w = Math.max(MIN_SIZE, start.w * s);
      h = Math.max(MIN_SIZE, w / ratio);
    } else if (hx) h = Math.max(MIN_SIZE, w / ratio);
    else w = Math.max(MIN_SIZE, h * ratio);
  }
  // Keep the anchor (opposite handle, or the center line on an untouched axis) fixed.
  const shift = rotateVec({ x: hx ? (hx * (w - start.w)) / 2 : 0, y: hy ? (hy * (h - start.h)) / 2 : 0 }, deg);
  const c = boxCenter(start);
  return { x: c.x + shift.x - w / 2, y: c.y + shift.y - h / 2, w, h };
}

/* ---------------------------------------------------------------- snapping */

export type GuideKind = 'center' | 'third' | 'safe' | 'edge' | 'element';

export interface SnapTarget {
  at: number;
  kind: GuideKind;
}

export interface Guide {
  axis: 'x' | 'y';
  at: number;
  kind: GuideKind;
}

export interface SnapTargets {
  x: SnapTarget[];
  y: SnapTarget[];
}

/** Canvas center lines, thirds, the title-safe area, the edges, and every other visible element's edges and centers. */
export function snapTargets(elements: readonly ElementInfo[], excludeKey: string | null): SnapTargets {
  const x: SnapTarget[] = [
    { at: CX, kind: 'center' },
    { at: CW / 3, kind: 'third' },
    { at: (CW * 2) / 3, kind: 'third' },
    { at: SAFE.x0, kind: 'safe' },
    { at: SAFE.x1, kind: 'safe' },
    { at: 0, kind: 'edge' },
    { at: CW, kind: 'edge' },
  ];
  const y: SnapTarget[] = [
    { at: CY, kind: 'center' },
    { at: CH / 3, kind: 'third' },
    { at: (CH * 2) / 3, kind: 'third' },
    { at: SAFE.y0, kind: 'safe' },
    { at: SAFE.y1, kind: 'safe' },
    { at: 0, kind: 'edge' },
    { at: CH, kind: 'edge' },
  ];
  for (const e of elements) {
    if (e.key === excludeKey || e.hidden) continue;
    const b = rotatedBounds(e.box, e.rotate);
    // Full-bleed art (bigger than the canvas) only adds noise.
    if (b.w >= CW * 0.95 && b.h >= CH * 0.95) continue;
    x.push({ at: b.x, kind: 'element' }, { at: b.x + b.w / 2, kind: 'element' }, { at: b.x + b.w, kind: 'element' });
    y.push({ at: b.y, kind: 'element' }, { at: b.y + b.h / 2, kind: 'element' }, { at: b.y + b.h, kind: 'element' });
  }
  return { x, y };
}

function nearest(values: number[], targets: SnapTarget[], threshold: number): { diff: number; target: SnapTarget } | null {
  let best: { diff: number; target: SnapTarget } | null = null;
  for (const v of values) {
    for (const t of targets) {
      const diff = t.at - v;
      if (Math.abs(diff) <= threshold && (!best || Math.abs(diff) < Math.abs(best.diff) || (Math.abs(diff) === Math.abs(best.diff) && t.kind !== 'element' && best.target.kind === 'element'))) {
        best = { diff, target: t };
      }
    }
  }
  return best;
}

function guidesFor(values: number[], targets: SnapTarget[], axis: 'x' | 'y'): Guide[] {
  const out = new Map<number, Guide>();
  for (const v of values) {
    for (const t of targets) {
      if (Math.abs(t.at - v) < 0.5) {
        const key = Math.round(t.at * 2);
        const prev = out.get(key);
        // Prefer the canvas-level name (center, safe) over "element" for the same line.
        if (!prev || (prev.kind === 'element' && t.kind !== 'element')) out.set(key, { axis, at: t.at, kind: t.kind });
      }
    }
  }
  return [...out.values()];
}

/** Snap a moving box (its edges and center) to the nearest lines. */
export function snapMove(box: BumperBox, deg: number, targets: SnapTargets, threshold: number): { box: BumperBox; guides: Guide[] } {
  const b = rotatedBounds(box, deg);
  const xs = [b.x, b.x + b.w / 2, b.x + b.w];
  const ys = [b.y, b.y + b.h / 2, b.y + b.h];
  const sx = nearest(xs, targets.x, threshold);
  const sy = nearest(ys, targets.y, threshold);
  const dx = sx?.diff ?? 0;
  const dy = sy?.diff ?? 0;
  const next = { ...box, x: box.x + dx, y: box.y + dy };
  const guides = [
    ...(sx ? guidesFor(xs.map((v) => v + dx), targets.x, 'x') : []),
    ...(sy ? guidesFor(ys.map((v) => v + dy), targets.y, 'y') : []),
  ];
  return { box: next, guides };
}

/** Snap the moving edges of an unrotated resize. With a locked aspect only the horizontal edge snaps and the height follows. */
export function snapResize(box: BumperBox, start: BumperBox, handle: Handle, keepAspect: boolean, targets: SnapTargets, threshold: number): { box: BumperBox; guides: Guide[] } {
  const [hx, hy] = HANDLE_DIR[handle];
  let { x, y, w, h } = box;
  const guides: Guide[] = [];
  const ratio = start.w / start.h;
  if (hx) {
    const edge = hx > 0 ? x + w : x;
    const s = nearest([edge], targets.x, threshold);
    if (s) {
      if (hx > 0) w += s.diff;
      else {
        x += s.diff;
        w -= s.diff;
      }
      guides.push({ axis: 'x', at: s.target.at, kind: s.target.kind });
      if (keepAspect) {
        const nh = w / ratio;
        if (hy < 0) y = y + h - nh;
        else if (!hy) y = y + (h - nh) / 2;
        h = nh;
      }
    }
  }
  if (hy && !(keepAspect && hx)) {
    const edge = hy > 0 ? y + h : y;
    const s = nearest([edge], targets.y, threshold);
    if (s) {
      if (hy > 0) h += s.diff;
      else {
        y += s.diff;
        h -= s.diff;
      }
      guides.push({ axis: 'y', at: s.target.at, kind: s.target.kind });
      if (keepAspect) {
        const nw = h * ratio;
        if (!hx) x = x + (w - nw) / 2;
        w = nw;
      }
    }
  }
  return { box: { x, y, w: Math.max(MIN_SIZE, w), h: Math.max(MIN_SIZE, h) }, guides };
}

/** Rotation from the center to the pointer (0 = handle straight up). Shift snaps to 15 degrees, and it always sticks near the right angles. */
export function angleFrom(center: Pt, p: Pt, step: boolean): number {
  let deg = (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI + 90;
  if (deg > 180) deg -= 360;
  if (step) deg = Math.round(deg / 15) * 15;
  else {
    for (const a of [-180, -90, 0, 90, 180]) if (Math.abs(deg - a) < 3) deg = a;
  }
  if (deg <= -180) deg = 180;
  return Math.round(deg);
}
