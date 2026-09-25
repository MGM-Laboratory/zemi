'use client';

import { useEffect, useRef } from 'react';

/**
 * One shared pointer store for the whole page. A single passive `pointermove` listener feeds
 * every subscriber once per animation frame, so twenty characters with tracking eyes cost the
 * same as one.
 *
 * Read it imperatively inside rAF loops (`pointer.get()`) or subscribe with `usePointer(cb)`.
 * Never render from it: it is a mutable object, not React state.
 */
export interface PointerState {
  /** Client coordinates in px. */
  x: number;
  y: number;
  /** Normalized to the viewport: -1 (left/top) to 1 (right/bottom). */
  nx: number;
  ny: number;
  /** Smoothed velocity in px per second. */
  vx: number;
  vy: number;
  /** True once the pointer has moved at least once. */
  active: boolean;
  down: boolean;
  type: 'mouse' | 'pen' | 'touch' | '';
  /** performance.now() of the last move. */
  lastMove: number;
}

type Listener = (s: PointerState) => void;

const state: PointerState = {
  x: 0,
  y: 0,
  nx: 0,
  ny: 0,
  vx: 0,
  vy: 0,
  active: false,
  down: false,
  type: '',
  lastMove: 0,
};

const listeners = new Set<Listener>();
let bound = false;
let raf = 0;
let prevX = 0;
let prevY = 0;
let prevT = 0;

function flush() {
  raf = 0;
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  state.nx = (state.x / w) * 2 - 1;
  state.ny = (state.y / h) * 2 - 1;
  for (const fn of listeners) fn(state);
}

function schedule() {
  if (!raf) raf = requestAnimationFrame(flush);
}

function onMove(e: PointerEvent) {
  const t = performance.now();
  const dt = Math.max(1, t - prevT) / 1000;
  const vx = (e.clientX - prevX) / dt;
  const vy = (e.clientY - prevY) / dt;
  // Light smoothing so velocity-driven effects don't jitter.
  state.vx = state.vx * 0.6 + vx * 0.4;
  state.vy = state.vy * 0.6 + vy * 0.4;
  prevX = state.x = e.clientX;
  prevY = state.y = e.clientY;
  prevT = state.lastMove = t;
  state.active = true;
  state.type = (e.pointerType as PointerState['type']) || 'mouse';
  schedule();
}

function onDown(e: PointerEvent) {
  state.down = true;
  onMove(e);
}
function onUp() {
  state.down = false;
  schedule();
}

function bind() {
  if (bound || typeof window === 'undefined') return;
  bound = true;
  state.x = prevX = window.innerWidth / 2;
  state.y = prevY = window.innerHeight / 2;
  prevT = performance.now();
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
}

function unbind() {
  if (!bound) return;
  bound = false;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerdown', onDown);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onUp);
  window.removeEventListener('resize', schedule);
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

export const pointer = {
  /** The live state object. Starts at the viewport center. */
  get(): PointerState {
    bind();
    return state;
  },
  subscribe(fn: Listener): () => void {
    bind();
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
      if (listeners.size === 0) unbind();
    };
  },
};

/**
 * Subscribe to the shared pointer. The callback runs at most once per frame and is always the
 * latest one you passed (no need to memoize). Returns the live state for imperative reads.
 *
 * @example
 * usePointer((p) => { el.style.transform = `translate(${p.nx * 8}px, ${p.ny * 8}px)`; });
 */
export function usePointer(cb?: Listener, enabled = true): PointerState {
  const cbRef = useRef(cb);
  useEffect(() => {
    cbRef.current = cb;
  });
  useEffect(() => {
    if (!enabled || !cbRef.current) return;
    return pointer.subscribe((s) => cbRef.current?.(s));
  }, [enabled]);
  return state;
}
