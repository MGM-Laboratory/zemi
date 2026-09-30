'use client';

import { BUMPER_CANVAS, bumperHash, pickBumperTransition, type BumperData, type BumperOutputMode, type BumperSlide, type BumperTheme, type BumperTransitionKey } from '@zemi/shared';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from '../engine/gsap';
import { SlideView, type SlideHandle } from '../engine/slide-view';
import { mulberry } from './helpers';
import { getTransition, TRANSITIONS } from './index';
import type { TransitionContext } from './types';

export interface DirectorTarget {
  slideId: string | null;
  /** Bump to force a change (every server state change carries a new seq). */
  seq: number;
  /** Server-chosen transition. Null/undefined: pick locally with the pair rules. */
  transition?: BumperTransitionKey | null;
  dir?: 1 | -1;
  /** When the slide came on screen (server clock ms, from BumperLiveState.slideSince). Local playback leaves it out. */
  since?: number | null;
}

export interface TransitionEvent {
  phase: 'start' | 'end';
  key: BumperTransitionKey;
  fromSlideId: string | null;
  toSlideId: string;
}

export interface BumperDirectorProps {
  slides: BumperSlide[];
  theme: BumperTheme;
  data: BumperData;
  showEventId: string | null;
  target: DirectorTarget;
  mode?: BumperOutputMode;
  /** Change to replay the current slide's entrance. */
  replay?: number;
  /** First slide: play its entrance or just show it. */
  initial?: 'enter' | 'static';
  onTransition?: (e: TransitionEvent) => void;
}

interface Layer {
  key: string;
  slideId: string;
  since: number | null;
}

/**
 * Plays a show: keeps the current slide (and the incoming one during a transition) mounted, runs
 * the transition for each change, starts the incoming entrance at the transition's 'reveal'
 * label, and converges on the newest target when changes arrive faster than transitions finish
 * (the running one is finished instantly, never queued). Put it inside <BumperStage>.
 */
export function BumperDirector({ slides, theme, data, showEventId, target, mode = 'show', replay, initial = 'enter', onTransition }: BumperDirectorProps) {
  const slideMap = useMemo(() => new Map(slides.map((s) => [s.id, s])), [slides]);
  const [layers, setLayers] = useState<Layer[]>(() => (target.slideId ? [{ key: `${target.slideId}#0`, slideId: target.slideId, since: target.since ?? null }] : []));
  const handles = useRef(new Map<string, SlideHandle>());
  const rootRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);
  const currentKey = useRef<string | null>(layers[0]?.key ?? null);
  const running = useRef<gsap.core.Timeline | null>(null);
  const busy = useRef(false);
  const pending = useRef<DirectorTarget | null>(null);
  const awaiting = useRef<{ key: string; target: DirectorTarget } | null>(null);
  const counter = useRef(1);
  const lastSeq = useRef(target.seq);
  const firstShown = useRef(false);
  const alive = useRef(true);
  const props = useRef({ slideMap, theme, data, onTransition });
  useLayoutEffect(() => {
    props.current = { slideMap, theme, data, onTransition };
  });

  // finish and start hand control back to pump (defined below); they reach it through this ref.
  const pumpRef = useRef<() => void>(() => {});

  const finish = useCallback((toKey: string, fromKey: string | null, info: TransitionEvent) => {
    running.current = null;
    if (overlayRef.current) overlayRef.current.innerHTML = '';
    if (fromKey) handles.current.get(fromKey)?.settle();
    const toRoot = handles.current.get(toKey)?.root;
    if (toRoot) toRoot.style.visibility = 'visible';
    currentKey.current = toKey;
    setLayers((ls) => ls.filter((l) => l.key === toKey));
    busy.current = false;
    props.current.onTransition?.({ ...info, phase: 'end' });
    if (pending.current) queueMicrotask(() => pumpRef.current());
  }, []);

  const start = useCallback(
    (key: string, t: DirectorTarget, toH: SlideHandle) => {
      if (!alive.current) return;
      if (pending.current) {
        // A newer target arrived while this one was loading: skip it.
        setLayers((ls) => ls.filter((l) => l.key !== key));
        busy.current = false;
        pumpRef.current();
        return;
      }
      const fromKey = currentKey.current;
      const fromH = fromKey ? (handles.current.get(fromKey) ?? null) : null;
      const fromSlide = fromH ? fromH.slide : null;
      const toSlide = toH.slide;
      const { theme: th, data: dt } = props.current;
      let keyName: BumperTransitionKey = t.transition ?? pickBumperTransition(fromSlide, toSlide, { motion: th.motion });
      if (th.motion === 'still' && keyName !== 'cut') keyName = 'crossfade';
      if (!fromH?.root) keyName = keyName === 'cut' ? 'cut' : 'crossfade';
      const seed = bumperHash(`${fromSlide?.id ?? ''}>${toSlide.id}`);
      const speed = th.motion === 'calm' ? 0.8 : 1;
      const toRoot = toH.root!;
      const ctx: TransitionContext = {
        stage: rootRef.current ?? toRoot,
        overlay: overlayRef.current!,
        from: fromH,
        to: toH,
        fromSlide,
        toSlide,
        data: dt,
        fromColors: fromH ? fromH.ctx.colors : null,
        toColors: toH.ctx.colors,
        dir: t.dir ?? 1,
        speed,
        motion: th.motion === 'calm' ? 'calm' : 'full',
        seed,
        rand: mulberry(seed),
        width: BUMPER_CANVAS.width,
        height: BUMPER_CANVAS.height,
        show: () => {
          toRoot.style.visibility = 'visible';
        },
        hide: () => {
          if (fromH?.root) fromH.root.style.visibility = 'hidden';
        },
        headline: toH.headline(),
      };
      const info: TransitionEvent = { phase: 'start', key: keyName, fromSlideId: fromSlide?.id ?? null, toSlideId: toSlide.id };
      let tl: gsap.core.Timeline;
      try {
        tl = getTransition(keyName).run(ctx);
      } catch (err) {
        console.warn(`[bumpers] transition ${keyName} failed, using a crossfade`, err);
        if (overlayRef.current) overlayRef.current.innerHTML = '';
        tl = TRANSITIONS.crossfade.run(ctx);
      }
      const revealAt = tl.labels.reveal ?? tl.duration() * 0.45;
      tl.call(() => toH.enter(speed), [], revealAt);
      // Safety net: whatever the transition did, the end state is "incoming visible".
      tl.call(ctx.show, [], tl.duration());
      tl.eventCallback('onComplete', () => finish(key, fromKey, info));
      running.current = tl;
      props.current.onTransition?.(info);
      tl.play(0);
    },
    [finish],
  );

  const pump = useCallback(() => {
    if (!alive.current) return;
    if (busy.current) {
      // Converge: finish the running transition right now; its onComplete pumps again.
      running.current?.progress(1);
      return;
    }
    const t = pending.current;
    if (!t) return;
    pending.current = null;
    const cur = currentKey.current ? currentKey.current.split('#')[0] : null;
    if (!t.slideId) {
      handles.current.forEach((h) => h.settle());
      currentKey.current = null;
      setLayers([]);
      return;
    }
    if (t.slideId === cur) return;
    if (!props.current.slideMap.has(t.slideId)) return;
    busy.current = true;
    const key = `${t.slideId}#${counter.current++}`;
    awaiting.current = { key, target: t };
    const since = t.since ?? Date.now();
    setLayers((ls) => [...ls.filter((l) => l.key === currentKey.current), { key, slideId: t.slideId!, since }]);
  }, []);
  useLayoutEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  // A new target (seq) arrives.
  useEffect(() => {
    if (target.seq === lastSeq.current && firstShown.current) return;
    lastSeq.current = target.seq;
    if (!firstShown.current) return;
    pending.current = target;
    pump();
  }, [target, pump]);

  // After the incoming layer commits: hide it, prepare its entrance, wait for fonts/images, go.
  useLayoutEffect(() => {
    const a = awaiting.current;
    if (!a) return;
    const h = handles.current.get(a.key);
    if (!h?.root) return;
    awaiting.current = null;
    h.root.style.visibility = 'hidden';
    h.prepare();
    void h.ready(650).then(() => start(a.key, a.target, h));
  }, [layers, start]);

  // First slide. Idempotent (StrictMode runs layout effects twice: children prepare again first,
  // so this must redo its work on every run and cancel the previous run's pending entrance).
  useLayoutEffect(() => {
    const key = currentKey.current;
    const h = key ? handles.current.get(key) : null;
    firstShown.current = true;
    if (!key || !h) return;
    let cancelled = false;
    if (initial === 'enter') {
      h.prepare();
      void h.ready(650).then(() => {
        if (!cancelled && alive.current && currentKey.current === key) h.enter(theme.motion === 'calm' ? 0.8 : 1);
      });
    } else h.settle();
    return () => {
      cancelled = true;
    };
    // Only on mount: later slides arrive through targets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replay the current entrance.
  const lastReplay = useRef(replay);
  useEffect(() => {
    if (lastReplay.current === replay) return;
    lastReplay.current = replay;
    const h = currentKey.current ? handles.current.get(currentKey.current) : null;
    if (h && !busy.current) h.enter(theme.motion === 'calm' ? 0.8 : 1);
  }, [replay, theme.motion]);

  // Black / clear / show. The first run sets the mode instantly, so an output reloaded while
  // clear never flashes the slide over the camera.
  const modeReady = useRef(false);
  useEffect(() => {
    const m = modeRef.current;
    const l = layersRef.current;
    if (!m || !l) return;
    const d = !modeReady.current ? 0 : theme.motion === 'still' ? 0.2 : 0.5;
    modeReady.current = true;
    if (mode === 'black') {
      gsap.to(m, { opacity: 1, duration: d, ease: 'power2.inOut', overwrite: true });
      gsap.to(l, { opacity: 1, duration: d, overwrite: true });
    } else if (mode === 'clear') {
      gsap.to(m, { opacity: 0, duration: d, overwrite: true });
      gsap.to(l, { opacity: 0, duration: d, ease: 'power2.inOut', overwrite: true });
    } else {
      gsap.to(m, { opacity: 0, duration: d, ease: 'power2.inOut', overwrite: true });
      gsap.to(l, { opacity: 1, duration: d, overwrite: true });
    }
  }, [mode, theme.motion]);

  useEffect(() => {
    alive.current = true;
    const hs = handles.current;
    return () => {
      alive.current = false;
      running.current?.kill();
      hs.forEach((h) => h.settle());
    };
  }, []);

  return (
    <div ref={rootRef} data-director="" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div ref={layersRef} style={{ position: 'absolute', inset: 0 }}>
        {layers.map((l) => {
          const slide = slideMap.get(l.slideId);
          if (!slide) return null;
          const key = l.key;
          return (
            <SlideView
              key={key}
              ref={(h: SlideHandle | null) => {
                if (h) handles.current.set(key, h);
                return () => {
                  if (handles.current.get(key) === h) handles.current.delete(key);
                };
              }}
              slide={slide}
              theme={theme}
              data={data}
              showEventId={showEventId}
              mode="live"
              // The target's start wins for its slide (a replay restarts the clock on the server).
              liveSince={l.slideId === target.slideId && target.since != null ? target.since : l.since}
            />
          );
        })}
      </div>
      <div ref={overlayRef} data-transition-overlay="" aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none', overflow: 'hidden' }} />
      <div ref={modeRef} data-mode-layer="" aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'none', background: '#000', opacity: 0 }} />
    </div>
  );
}

/** Convenience for previews: resolve the transition a pair would get. */
export function transitionFor(from: BumperSlide | null, to: BumperSlide, theme: BumperTheme): BumperTransitionKey {
  return pickBumperTransition(from, to, { motion: theme.motion });
}
