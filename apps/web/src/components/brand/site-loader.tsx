'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { MARK_PATHS, SHAPE_COLORS, SHAPE_ORDER } from '@zemi/shared';
import loader from './site-loader.module.css';

/**
 * First-visit loader. The four shapes tumble in and snap into the mark while a mono clock ticks
 * 13:14 to 13:15 ("doors open"), then the curtain lifts.
 *
 * - Pure CSS timeline, so it plays before hydration and finishes on its own at ~1.15s even if
 *   JavaScript is slow or off. Page content renders underneath at full opacity (LCP is not delayed).
 * - Skipped for the rest of the tab session: `SITE_LOADER_SCRIPT` (inline, in the public layout)
 *   sets `data-zemi-seen` on <html> before first paint when sessionStorage says we've been here.
 * - Client-side navigations never show it (the layout persists).
 * - Hidden entirely under prefers-reduced-motion.
 */
export function SiteLoader() {
  const [gone, setGone] = useState(false);

  useEffect(() => {
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
    const skip = seen || reduced;
    if (skip) markReady();
    const ready = skip ? undefined : setTimeout(markReady, 820);
    const done = setTimeout(() => setGone(true), skip ? 0 : 1300);
    return () => {
      clearTimeout(ready);
      clearTimeout(done);
    };
  }, []);

  if (gone) return null;

  return (
    <div className={loader.root} aria-hidden="true" data-site-loader="">
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
