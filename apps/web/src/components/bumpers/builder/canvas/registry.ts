'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { parseBox, type ElementInfo } from './geometry';

/**
 * What the canvas has on screen, shared with the inspector (they are siblings without a common
 * provider). Boxes, default boxes and labels only exist in the rendered slide (templates decide
 * them), so the canvas reads them from the `data-el` attributes and publishes them here.
 */

export interface CanvasSnapshot {
  slideId: string | null;
  /** Content scale inside the canvas (0.95 when the theme shrinks for overscan). */
  contentScale: number;
  elements: ElementInfo[];
}

const EMPTY: CanvasSnapshot = { slideId: null, contentScale: 1, elements: [] };
let current: CanvasSnapshot = EMPTY;
let currentKey = '';
const listeners = new Set<() => void>();

function publish(next: CanvasSnapshot) {
  const key = JSON.stringify(next);
  if (key === currentKey) return;
  currentKey = key;
  current = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The elements on the canvas right now. */
export function useCanvasSnapshot(): CanvasSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => EMPTY,
  );
}

function num(v: string | undefined): number {
  const n = Number.parseFloat(v ?? '');
  return Number.isFinite(n) ? n : 0;
}

/** Read every top-level `[data-el]` of a rendered slide. */
export function scanSlide(root: HTMLElement | null): CanvasSnapshot {
  if (!root) return EMPTY;
  const slide = root.querySelector<HTMLElement>('[data-bumper-slide]');
  if (!slide) return EMPTY;
  const content = slide.querySelector<HTMLElement>('[data-content]');
  const m = /scale\(([\d.]+)\)/.exec(content?.style.transform ?? '');
  const contentScale = m ? Number(m[1]) || 1 : 1;
  const nodes = Array.from(slide.querySelectorAll<HTMLElement>('[data-el]')).filter((n) => !n.parentElement?.closest('[data-el]'));
  const elements: ElementInfo[] = [];
  nodes.forEach((n, order) => {
    const key = n.dataset.el;
    const box = parseBox(n.dataset.box);
    if (!key || !box) return;
    const extraId = key.startsWith('x:') ? key.slice(2) : null;
    elements.push({
      key,
      label: n.dataset.elLabel || key,
      box,
      defaultBox: parseBox(n.dataset.defaultBox) ?? box,
      rotate: num(n.style.rotate),
      z: num(n.style.zIndex),
      order,
      lockAspect: n.hasAttribute('data-lock-aspect'),
      locked: n.hasAttribute('data-locked'),
      hidden: n.hasAttribute('data-hidden'),
      extraId,
      extraType: n.dataset.extra ?? null,
    });
  });
  return { slideId: slide.dataset.bumperSlide ?? null, contentScale, elements };
}

/**
 * Keep the shared snapshot in step with a rendered canvas: scans after every DOM change of the
 * slide (attributes the builder cares about and added or removed nodes), on the next frame.
 */
export function useCanvasScanner(root: HTMLElement | null) {
  const frame = useRef(0);
  useEffect(() => {
    if (!root) return;
    const run = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => publish(scanSlide(root)));
    };
    const mo = new MutationObserver(run);
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-el', 'data-box', 'data-default-box', 'data-hidden', 'data-locked', 'data-lock-aspect', 'style'] });
    run();
    return () => {
      mo.disconnect();
      cancelAnimationFrame(frame.current);
      publish(EMPTY);
    };
  }, [root]);
}

/* ---------------------------------------------------------------- canvas to inspector requests */

export interface FocusRequest {
  slideId: string;
  /** Element key on the canvas (`title`, `x:abc123`). */
  elementKey: string;
}

const focusListeners = new Set<(r: FocusRequest) => void>();

/** Double-click (or Enter) on a canvas element: ask the inspector to focus the matching field. */
export function requestInspectorFocus(r: FocusRequest) {
  focusListeners.forEach((l) => l(r));
}

export function useInspectorFocusRequests(handler: (r: FocusRequest) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const l = (r: FocusRequest) => ref.current(r);
    focusListeners.add(l);
    return () => {
      focusListeners.delete(l);
    };
  }, []);
}
