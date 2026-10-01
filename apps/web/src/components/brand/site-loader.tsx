'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MARK_PATHS, SHAPE_COLORS, SHAPE_ORDER } from '@zemi/shared';
import loader from './site-loader.module.css';

/** The curtain holds at most this long for the model preload (slow networks still get the site). */
const PRELOAD_CAP_MS = 12_000;

/**
 * Warm the 3D model cache and the 3D runtime (three.js + R3F). The imports are lazy so three.js
 * stays out of the first bundle.
 */
function preload(): Promise<void> {
  // The home story pins its 3D scenes: there the curtain also waits for the runtime.
  const home = typeof window !== 'undefined' && window.location.pathname === '/';
  return Promise.all([
    import('@/components/three/preload-models').then((m) => m.preloadModels()),
    home ? import('@/components/three/scene-canvas').then((m) => m.preloadSceneRuntime()) : null,
  ])
    .then(() => undefined)
    .catch(() => {
      /* network failed: the scenes have 2D fallbacks */
    });
}

/**
 * First-visit loader. The four shapes tumble in and snap into the mark while a mono clock ticks
 * 13:14 to 13:15 ("doors open"), then the curtain lifts.
 *
 * - Pure CSS timeline, so it plays before hydration. On a first visit the curtain holds after
 *   the intro (`data-hold`) until every 3D model is downloaded, parsed and cached
 *   (`data-lift`, set by JS when the preload resolves), so the pinned scenes never wait for a
 *   model mid-scroll. Without JavaScript the hold state lifts on its own after 12s.
 * - Skipped for the rest of the tab session: `SITE_LOADER_SCRIPT` (inline, in the public layout)
 *   sets `data-zemi-seen` on <html> before first paint when sessionStorage says we've been here.
 *   The preload still runs in the background on those visits (bytes are cached, parsing is local).
 * - Client-side navigations never show the loader (the layout persists), and the model cache
 *   lives in the same session, so returning to `/` never re-downloads anything.
 * - Hidden entirely under prefers-reduced-motion.
 */
export function SiteLoader() {
  const [gone, setGone] = useState(false);
  const [lift, setLift] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const html = document.documentElement;
    let seen = html.hasAttribute('data-zemi-seen');
    try {
      // Covers client-side entries into the public site, where the boot script didn't run.
      if (!seen && sessionStorage.getItem('zemi:seen') && !html.hasAttribute('data-zemi-boot')) seen = true;
      sessionStorage.setItem('zemi:seen', '1');
    } catch {
      /* storage blocked */
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (seen || reduced) {
      markReady();
      html.setAttribute('data-zemi-seen', '');
      setGone(true);
      void preload();
      return;
    }
    // First visit: the curtain waits for the models (capped, see PRELOAD_CAP_MS).
    const cap = setTimeout(() => setLift(true), PRELOAD_CAP_MS);
    void preload().finally(() => {
      clearTimeout(cap);
      setLift(true);
    });
    return () => clearTimeout(cap);
  }, []);

  useEffect(() => {
    if (!lift) return;
    markReady();
    const root = rootRef.current;
    if (root) {
      root.removeAttribute('data-hold');
      root.setAttribute('data-lift', '');
    }
    const done = setTimeout(() => setGone(true), 500);
    // The h1 paint rise (motion.module.css) waits for the curtain while data-zemi-seen is
    // missing. Once the curtain is long gone, set it so later client navigations rise right
    // away. A rise still running (a slow stream) keeps its delay pinned inline, so the flip
    // can't make it jump.
    const settle = setTimeout(() => {
      for (const el of document.querySelectorAll<HTMLElement>('[data-split-paint]')) {
        el.style.animationDelay = getComputedStyle(el).animationDelay;
      }
      document.documentElement.setAttribute('data-zemi-seen', '');
    }, 1700);
    return () => {
      clearTimeout(done);
      clearTimeout(settle);
    };
  }, [lift]);

  if (gone) return null;

  return (
    <div ref={rootRef} className={loader.root} data-hold="" aria-hidden="true" data-site-loader="">
      <div className={loader.stage}>
        <svg viewBox="0 0 100 100" className={loader.mark}>
          {SHAPE_ORDER.map((s) => (
            <g key={s} className={`${loader.shape} ${loader[s]}`}>
              <path d={MARK_PATHS[s]} fill={SHAPE_COLORS[s]} />
            </g>
          ))}
        </svg>
        <div className={loader.clock}>
          <span>13:1</span>
          <span className={loader.roll}>
            <span className={loader.rollInner}>
              <span>4</span>
              <span>5</span>
            </span>
          </span>
        </div>
        <div className={loader.label}>doors open</div>
      </div>
    </div>
  );
}

/**
 * Inline script for the public layout. Runs before paint: marks JS as available and skips the
 * loader for repeat visits in this tab session.
 */
export const SITE_LOADER_SCRIPT = `(function(){var d=document.documentElement;d.setAttribute('data-zemi-js','');d.setAttribute('data-zemi-boot','');d.setAttribute('data-zemi-public','');try{if(sessionStorage.getItem('zemi:seen')){d.setAttribute('data-zemi-seen','')}else{sessionStorage.setItem('zemi:seen','1')}}catch(e){}})();`;

const noop = () => () => {};

/**
 * Renders SITE_LOADER_SCRIPT inline during SSR and hydration only. Fresh client renders (for
 * example navigating from /admin into the public site) skip it, which avoids React's
 * "script tag while rendering" warning; the attributes are then set by PublicSiteProvider.
 */
export function SiteBootScript() {
  const isServerOrHydrating = useSyncExternalStore(noop, () => false, () => true);
  if (!isServerOrHydrating) return null;
  return <script dangerouslySetInnerHTML={{ __html: SITE_LOADER_SCRIPT }} />;
}

/* ------------------------------------------------------------------ site ready */

let ready = false;
const subs = new Set<() => void>();
function markReady() {
  if (ready) return;
  ready = true;
  for (const fn of subs) fn();
}

/**
 * True once the first-visit loader has lifted (or immediately when it is skipped). Use it to
 * start hero animations right as the curtain opens.
 *
 * @example const ready = useSiteReady(); <SplitReveal play={ready}>...</SplitReveal>
 */
export function useSiteReady(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      // Safety net for pages rendered without a SiteLoader (styleguide embeds, tests).
      const t = setTimeout(markReady, 1500);
      return () => {
        clearTimeout(t);
        subs.delete(cb);
      };
    },
    () => ready,
    () => false,
  );
}
