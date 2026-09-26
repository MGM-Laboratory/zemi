/**
 * QR detection off the main thread. The page posts RGBA frames (transferred, not copied);
 * this worker preprocesses the requested variant and runs the engine.
 *
 * in:  { type: 'init', pref, origin }
 *      { type: 'detect', id, variant, width, height, buffer }
 * out: { type: 'ready', engine } | { type: 'init-error', message }
 *      { type: 'result', id, variant, values, ms } | { type: 'detect-error', id, message }
 */
import { createEngine, type Engine, type EnginePreference } from './detect-core';
import type { FrameVariant } from './preprocess';

type InMsg =
  | { type: 'init'; pref: EnginePreference; origin: string }
  | { type: 'detect'; id: number; variant: FrameVariant; width: number; height: number; buffer: ArrayBuffer };

/** Typed loosely: the web tsconfig uses the DOM lib, and mixing in the webworker lib clashes. */
const ctx = self as unknown as { postMessage(message: unknown): void; onmessage: ((e: MessageEvent<InMsg>) => void) | null };
let engine: Engine | null = null;
let starting: Promise<Engine> | null = null;

ctx.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    try {
      starting ??= createEngine(msg.pref, msg.origin);
      engine = await starting;
      ctx.postMessage({ type: 'ready', engine: engine.kind });
    } catch (err) {
      starting = null;
      ctx.postMessage({ type: 'init-error', message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (msg.type === 'detect') {
    if (!engine) {
      ctx.postMessage({ type: 'detect-error', id: msg.id, message: 'not ready' });
      return;
    }
    const t0 = performance.now();
    try {
      const values = await engine.detect({ width: msg.width, height: msg.height, data: new Uint8ClampedArray(msg.buffer) }, msg.variant);
      ctx.postMessage({ type: 'result', id: msg.id, variant: msg.variant, values, ms: performance.now() - t0 });
    } catch (err) {
      ctx.postMessage({ type: 'detect-error', id: msg.id, message: err instanceof Error ? err.message : String(err) });
    }
  }
};
