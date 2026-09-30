'use client';

import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { gsap } from '../../engine/gsap';
import { StaticMark } from '../../parts/shapes';
import { defineTemplate } from '../kit';

/** True black for projectors (the ink backdrop has soft accent glows, a blank screen must not). */
const BLACK = '#000000';

/**
 * Black: a plain black screen for the room (a projector at #000 looks switched off), or a clear
 * one for OBS with the background set to transparent. Hold: the same, with a tiny Zemi mark
 * breathing in the middle for longer pauses.
 */
function Render() {
  const ctx = useSlide();
  const hold = ctx.slide.style.variant === 'mark';

  useEnter((tl, root, { at, calm }) => {
    const shapes = root.querySelectorAll<SVGGElement>('[data-blank-mark] [data-shape]');
    if (!shapes.length || ctx.theme.motion === 'still') return;
    tl.fromTo(shapes, { scale: 0, rotation: -90 }, { scale: 1, rotation: 0, duration: at(calm ? 0.9 : 0.7), ease: 'back.out(1.8)', stagger: at(0.12) }, at(0.3));
  });

  useIdle((root, { calm }) => {
    const shapes = root.querySelectorAll<SVGGElement>('[data-blank-mark] [data-shape]');
    if (!shapes.length) return;
    // Breathing, slow and out of step, with a small hop through the four every so often.
    const anims: gsap.core.Animation[] = Array.from(shapes).map((s, i) => gsap.to(s, { scale: calm ? 0.95 : 0.9, duration: 2.4 + i * 0.3, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: i * 0.4 }));
    const hop = gsap.timeline({ repeat: -1, repeatDelay: calm ? 12 : 8, delay: 4 });
    hop.to(shapes, { y: -12, duration: 0.28, ease: 'power2.out', yoyo: true, repeat: 1, stagger: 0.09 });
    anims.push(hop);
    return anims;
  });

  return (
    <>
      {ctx.background === 'ink' ? <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: BLACK, pointerEvents: 'none' }} /> : null}
      {hold ? (
        <El id="mark" label="Zemi mark" box={{ x: 900, y: 480, w: 120, h: 120 }} align="center" valign="center" enter="fade" lockAspect>
          <div data-blank-mark="" style={{ width: '100%', height: '100%' }}>
            <StaticMark tone={ctx.background === 'accent' ? (ctx.colors.dark ? 'paper' : 'ink') : 'color'} />
          </div>
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'blank',
  background: 'ink',
  noBug: true,
  variants: [
    { key: 'plain', label: 'Nothing at all' },
    { key: 'mark', label: 'A tiny Zemi mark' },
  ],
  fields: [],
  presets: [
    { key: 'black', label: 'Black', description: 'The room screen goes dark.', slide: { style: { background: 'ink', variant: 'plain' } } },
    { key: 'clear', label: 'Clear for OBS', description: 'Nothing at all, the camera shows through.', slide: { style: { background: 'transparent', variant: 'plain' } } },
    { key: 'hold', label: 'Hold', description: 'Black with a tiny Zemi mark breathing in the middle.', slide: { style: { background: 'ink', variant: 'mark' } } },
  ],
  describe: (ctx) => {
    const base = ctx.background === 'transparent' ? 'Clear' : ctx.background === 'ink' ? 'Black' : 'Plain screen';
    return ctx.slide.style.variant === 'mark' ? `${base}, with the mark` : base;
  },
  headline: () => '',
  Render,
});
