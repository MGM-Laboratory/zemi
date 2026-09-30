'use client';

import { useEnter, useSlide } from '../../engine/context';
import { fontStyle } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import type { ResolveCtx } from '../../engine/types';
import { defineTemplate } from '../kit';

/** The first free text on the canvas, for the rail label and the word transitions. */
function firstText(ctx: ResolveCtx): string {
  const t = ctx.slide.extras.find((e) => e.type === 'text' && typeof e.props.text === 'string' && e.props.text.trim());
  return t ? ctx.fill(String(t.props.text)).trim().split('\n')[0]!.slice(0, 60) : '';
}

/**
 * Blank canvas: only the backdrop, everything else comes from the free elements added in the
 * builder. The backdrop shapes drift in on entry so even an empty canvas says hello. The
 * builder shows a gentle hint while it is empty (never on the output).
 */
function Render() {
  const ctx = useSlide();
  const empty = ctx.slide.extras.length === 0;
  const still = ctx.theme.motion === 'still';

  useEnter((tl, root, { at, calm }) => {
    // The backdrop shapes say hello one by one (a bounce in place, so nothing jumps on the first frame).
    const floaters = root.querySelectorAll<HTMLElement>('[data-floater]');
    // Back to rest first, so a replay never starts from half a drift.
    gsap.set(floaters, { x: 0, y: 0, scale: 1, rotation: 0 });
    if (still) return;
    floaters.forEach((el, i) => {
      tl.to(el, { scale: calm ? 1.05 : 1.14, rotation: `+=${(i % 2 ? 1 : -1) * (calm ? 4 : 10)}`, duration: at(0.34), ease: 'sine.inOut', yoyo: true, repeat: 1 }, at(0.1 + i * 0.12));
    });
  });

  if (!empty) return null;
  if (ctx.mode === 'edit') {
    return (
      <div data-custom-hint="" aria-hidden="true" style={{ position: 'absolute', left: 460, top: 360, width: 1000, height: 360, borderRadius: 36, border: `4px dashed ${ctx.colors.dark ? '#ffffff40' : '#0e111633'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, pointerEvents: 'none', color: ctx.colors.fg2 }}>
        <span style={{ ...fontStyle('display', { weight: 800, casl: 0.8 }), fontSize: 64, lineHeight: 1, color: ctx.colors.fg }}>A blank canvas</span>
        <span style={{ ...fontStyle('body', { weight: 600 }), fontSize: 34, textAlign: 'center', maxWidth: 780 }}>Add text, images, QR codes and characters from the toolbar</span>
      </div>
    );
  }
  if (ctx.mode === 'thumb') {
    // A quiet plus in thumbnails, so an empty canvas reads as "add something" and not as broken.
    return (
      <div aria-hidden="true" style={{ position: 'absolute', left: 810, top: 390, width: 300, height: 300, borderRadius: 60, border: `10px dashed ${ctx.colors.dark ? '#ffffff47' : '#0e111633'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <svg viewBox="0 0 24 24" width="130" height="130" aria-hidden="true">
          <path d="M12 4v16M4 12h16" stroke={ctx.colors.fg2} strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  return null;
}

export default defineTemplate({
  kind: 'custom',
  background: 'paper',
  fields: [],
  presets: [
    {
      key: 'statement',
      label: 'Big statement',
      description: 'One line, huge, with a squiggle under it.',
      slide: {
        style: { background: 'paper' },
        extras: [
          { id: 'x-say', type: 'text', box: { x: 160, y: 300, w: 1600, h: 380 }, rotate: 0, z: 0, props: { text: 'Say something big', font: 'display', size: 190, weight: 900, casl: 0.7, tone: 'ink', align: 'center' } },
          { id: 'x-squiggle', type: 'line', box: { x: 610, y: 700, w: 700, h: 44 }, rotate: 0, z: 0, props: { tone: 'accent', thickness: 12, style: 'squiggle' } },
          { id: 'x-spark', type: 'sticker', box: { x: 1620, y: 140, w: 170, h: 170 }, rotate: 12, z: 0, props: { sticker: 'spark' } },
        ],
      },
    },
    {
      key: 'qr',
      label: 'Scan this',
      description: 'A big QR code with a line of text next to it.',
      slide: {
        style: { background: 'paper' },
        extras: [
          { id: 'x-head', type: 'text', box: { x: 150, y: 320, w: 900, h: 200 }, rotate: 0, z: 0, props: { text: 'Scan this', font: 'display', size: 180, weight: 900, casl: 0.6, tone: 'ink', align: 'start' } },
          { id: 'x-line', type: 'text', box: { x: 156, y: 540, w: 860, h: 160 }, rotate: 0, z: 0, props: { text: 'Point your camera here. It opens right up.', font: 'body', size: 54, weight: 600, tone: 'muted', align: 'start' } },
          { id: 'x-qr', type: 'qr', box: { x: 1180, y: 240, w: 520, h: 600 }, rotate: 0, z: 0, props: { url: '', style: 'rounded', tone: 'ink', logo: true, label: '{site.q}' } },
        ],
      },
    },
    {
      key: 'hello',
      label: 'Character says hi',
      description: 'A character and a friendly line.',
      slide: {
        style: { background: 'paper' },
        extras: [
          { id: 'x-char', type: 'character', box: { x: 260, y: 320, w: 440, h: 440 }, rotate: 0, z: 0, props: { shape: 'circle', mood: 'happy', lookX: 0.7, lookY: 0 } },
          { id: 'x-hi', type: 'text', box: { x: 800, y: 360, w: 960, h: 360 }, rotate: 0, z: 0, props: { text: 'Hi there.\nGlad you came.', font: 'display', size: 150, weight: 900, casl: 1, tone: 'ink', align: 'start' } },
        ],
      },
    },
  ],
  describe: (ctx) => firstText(ctx) || (ctx.slide.extras.length ? 'Custom bumper' : 'Blank canvas'),
  headline: (ctx) => firstText(ctx).split(/\s+/).slice(0, 3).join(' ') || 'Hello',
  Render,
});
