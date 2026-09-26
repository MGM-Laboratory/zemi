'use client';

import type { EngineKind, EnginePreference } from './detect-core';
import type { FrameVariant } from './preprocess';

/**
 * Main-thread handle on the QR engine. Prefers a module Web Worker (detection never blocks the
 * camera preview or the UI); falls back to running the same engine on the main thread when a
 * worker cannot start (old browsers, blocked worker URLs).
 */
export interface QrDetector {
  kind: EngineKind;
  where: 'worker' | 'main';
  /** Detect in a frame. The frame's buffer is transferred to the worker (do not reuse it). */
  detect(frame: ImageData, variant: FrameVariant): Promise<string[]>;
  dispose(): void;
}

const INIT_TIMEOUT_MS = 12_000;

function workerDetector(pref: EnginePreference): Promise<QrDetector> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./detector.worker.ts', import.meta.url), { type: 'module', name: 'zemi-qr' });
    } catch (err) {
      reject(err);
      return;
    }
    let nextId = 1;
    const pending = new Map<number, { resolve: (v: string[]) => void; reject: (e: Error) => void }>();
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('The QR worker took too long to start.'));
    }, INIT_TIMEOUT_MS);

    worker.onerror = (e) => {
      clearTimeout(timer);
      pending.forEach((p) => p.reject(new Error(e.message || 'worker error')));
      pending.clear();
      reject(new Error(e.message || 'The QR worker failed to start.'));
    };
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as
        | { type: 'ready'; engine: EngineKind }
        | { type: 'init-error'; message: string }
        | { type: 'result'; id: number; values: string[] }
        | { type: 'detect-error'; id: number; message: string };
      if (msg.type === 'ready') {
        clearTimeout(timer);
        resolve({
          kind: msg.engine,
          where: 'worker',
          detect(frame, variant) {
            const id = nextId++;
            return new Promise<string[]>((res, rej) => {
              pending.set(id, { resolve: res, reject: rej });
              const buffer = frame.data.buffer as ArrayBuffer;
              worker.postMessage({ type: 'detect', id, variant, width: frame.width, height: frame.height, buffer }, [buffer]);
            });
          },
          dispose() {
            pending.forEach((p) => p.reject(new Error('disposed')));
            pending.clear();
            worker.terminate();
          },
        });
      } else if (msg.type === 'init-error') {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(msg.message));
      } else if (msg.type === 'result') {
        pending.get(msg.id)?.resolve(msg.values);
        pending.delete(msg.id);
      } else if (msg.type === 'detect-error') {
        pending.get(msg.id)?.reject(new Error(msg.message));
        pending.delete(msg.id);
      }
    };
    worker.postMessage({ type: 'init', pref, origin: window.location.origin });
  });
}

async function mainThreadDetector(pref: EnginePreference): Promise<QrDetector> {
  const { createEngine } = await import('./detect-core');
  const engine = await createEngine(pref, window.location.origin);
  return {
    kind: engine.kind,
    where: 'main',
    detect: (frame, variant) => engine.detect({ width: frame.width, height: frame.height, data: frame.data }, variant),
    dispose() {},
  };
}

/** Start the best available detector. `pref` comes from `?detector=native|zxing` (debugging). */
export async function createQrDetector(pref: EnginePreference = 'auto'): Promise<QrDetector> {
  if (typeof Worker !== 'undefined') {
    try {
      return await workerDetector(pref);
    } catch {
      /* fall through to the main thread */
    }
  }
  return mainThreadDetector(pref);
}
