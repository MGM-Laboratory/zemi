'use client';

import { SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { ACCENT_HEX, INK } from '../../engine/palette';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandShape } from '../../parts/shapes';
import { accentText, onPop, popFill, resetCast, shapeTint } from '../_tpl-end-kit';
import { defineTemplate, Eyebrow, f, useMascots } from '../kit';

const pad = (n: number) => String(Math.max(0, Math.round(n))).padStart(2, '0');

function partNumber(ctx: ResolveCtx): number {
  return ctx.num('number', ctx.rundownItem ? ctx.rundownItem.index + 1 : 1);
}

/**
 * Section: a chapter card between parts of the show. "Part 2" in mono, the title in giant type
 * that loosens up as it lands, and the part number as a huge mono numeral with a character
 * climbing onto it. Band: the title rides a tilted accent band across the whole screen.
 */
function Render() {
  const ctx = useSlide();
  const band = ctx.slide.style.variant === 'band';
  const cast = useMascots(['triangle']);
  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title');
  const subtitle = ctx.text('subtitle');
  const showNumber = ctx.flag('showNumber', true);
  const digits = pad(partNumber(ctx)).split('');
  const still = ctx.theme.motion === 'still';
  const fill = popFill(ctx.colors);
  const ink = onPop(ctx.colors);
  const morph = ctx.rundownItem ? `rundown:${ctx.rundownItem.index}` : null;
  // Yellow never stands alone as type on white: the giant numerals get an ink outline, like a sticker.
  const outline = fill === ACCENT_HEX.yellow && !ctx.colors.dark;

  useEnter((tl, root, { at, calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-sec-char]'));
    resetCast(chars);
    const t = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (t) tl.fromTo(t, { '--casl': 0 }, { '--casl': 1, duration: at(1.8), ease: 'power2.out' }, at(0.45));
    if (still) return;
    const nums = root.querySelectorAll<HTMLElement>('[data-sec-digit]');
    if (nums.length) tl.fromTo(nums, { yPercent: 70, rotation: (i) => (i % 2 ? 10 : -10), opacity: 0 }, { yPercent: 0, rotation: 0, opacity: 1, duration: at(0.9), ease: 'back.out(1.5)', stagger: at(0.12) }, at(0.1));
    const strip = root.querySelector<HTMLElement>('[data-sec-band]');
    if (strip) tl.fromTo(strip, { scaleX: 0 }, { scaleX: 1, duration: at(0.8), ease: 'zemiInOut', transformOrigin: '0% 50%' }, at(0));
    const shapes = root.querySelectorAll<HTMLElement>('[data-sec-shape]');
    if (shapes.length) tl.fromTo(shapes, { scale: 0, rotation: -120 }, { scale: 1, rotation: 0, duration: at(0.6), ease: 'back.out(2)', stagger: at(0.08) }, at(0.9));
    chars.forEach((c, i) => {
      // Scramble up from below, peek over, then hop into place.
      tl.fromTo(c, { y: 260, opacity: 0 }, { y: 0, opacity: 1, duration: at(0.7), ease: 'back.out(1.4)' }, at(0.7 + i * 0.1));
      tl.add(charAnim.look(c, band ? 1 : -1, 0.3, 0.3), at(1.35));
      tl.add(charAnim.hop(c, { height: calm ? 10 : 26 }), at(1.6 + i * 0.08));
    });
  });

  useIdle((root, { calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-sec-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c));
    const anims: gsap.core.Animation[] = chars.flatMap((c, i) => charAnim.idle(c, { calm, seed: i * 3 + 1 }));
    const glance = gsap.timeline({ repeat: -1, repeatDelay: 4, delay: 2.5 });
    chars.forEach((c) => glance.add(charAnim.look(c, band ? -0.6 : 0.4, -0.6, 0.4), 0).add(charAnim.look(c, band ? 1 : -1, 0.3, 0.4), 2));
    anims.push(glance);
    const nums = root.querySelectorAll<HTMLElement>('[data-sec-digit]');
    nums.forEach((n, i) => anims.push(gsap.to(n, { y: calm ? -6 : -14, rotation: (i % 2 ? 1 : -1) * (calm ? 0.8 : 1.6), duration: 3.2 + i * 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1 })));
    const shapes = root.querySelectorAll<HTMLElement>('[data-sec-shape]');
    shapes.forEach((s, i) => anims.push(gsap.to(s, { y: calm ? -6 : -12, rotation: (i % 2 ? 1 : -1) * 12, duration: 2.4 + i * 0.35, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: i * 0.2 })));
    const tilt = root.querySelector<HTMLElement>('[data-sec-tilt]');
    if (tilt) anims.push(gsap.to(tilt, { rotation: calm ? -3.3 : -3.9, duration: 5, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
    };
  });

  const charSize = cast.length > 2 ? 120 : 170;
  const crew = (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
      {cast.map((s: ShapeName) => (
        <div key={s} data-sec-char="" style={{ width: charSize, height: charSize }}>
          <BumperCharacter shape={s} color={shapeTint(ctx.colors, s)} mood="happy" lookX={band ? 1 : -1} lookY={0.3} />
        </div>
      ))}
    </div>
  );

  if (band) {
    return (
      <>
        <El id="band" label="Band" box={{ x: -120, y: 360, w: 2160, h: 360 }} enter="fade" locked>
          <div data-sec-tilt="" style={{ width: '100%', height: '100%', transform: 'rotate(-3.5deg)' }}>
            <div data-sec-band="" style={{ width: '100%', height: '100%', background: fill, boxShadow: ctx.colors.dark ? undefined : `0 18px 0 ${ctx.colors.accentSoft}` }} />
          </div>
        </El>
        <El id="eyebrow" label="Eyebrow" box={{ x: 130, y: 236, w: 900, h: 64 }} enter="wipe" order={2}>
          <Eyebrow size={40}>{eyebrow}</Eyebrow>
        </El>
        <El id="title" label="Title" box={{ x: 130, y: 392, w: 1660, h: 290 }} enter="split-words" order={3} morph={morph} valign="center">
          <FitText max={210} min={70} casl={0} lineHeight={1} valign="center" style={{ color: ink }}>
            {title}
          </FitText>
        </El>
        {subtitle ? (
          <El id="subtitle" label="Line" box={{ x: 130, y: 780, w: 1100, h: 70 }} enter="rise" order={6}>
            <FitText max={46} min={26} font="body" weight={700} lineHeight={1.2} style={{ color: ctx.colors.fg2 }}>
              {subtitle}
            </FitText>
          </El>
        ) : null}
        {showNumber ? (
          <El id="number" label="Number" box={{ x: 1520, y: 104, w: 300, h: 164 }} align="end" valign="end" enter="fade" order={1}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, color: ctx.colors.dark ? ctx.colors.fg : accentText(ctx.colors) }}>
              {digits.map((d, i) => (
                <span key={i} data-sec-digit="" style={{ ...fontStyle('mono', { weight: 800, tracking: -0.02 }), fontSize: 156, lineHeight: 1, display: 'inline-block' }}>
                  {d}
                </span>
              ))}
            </div>
          </El>
        ) : null}
        <El id="shapes" label="Shapes" box={{ x: 1340, y: 790, w: 480, h: 120 }} align="end" enter="fade">
          <div style={{ display: 'flex', gap: 22 }}>
            {SHAPE_ORDER.map((s) => (
              <div key={s} data-sec-shape="" style={{ width: 96, height: 96 }}>
                <BrandShape shape={s} color={shapeTint(ctx.colors, s)} />
              </div>
            ))}
          </div>
        </El>
        {cast.length ? (
          <El id="cast" label="Characters" box={{ x: 1000, y: 354 - charSize, w: 540, h: charSize }} enter="fade" lockAspect valign="end">
            <div style={{ rotate: '-3.5deg', transformOrigin: '0% 100%' }}>{crew}</div>
          </El>
        ) : null}
      </>
    );
  }

  return (
    <>
      {showNumber ? (
        <El id="number" label="Number" box={{ x: 1000, y: 110, w: 824, h: 800 }} align="end" valign="end" enter="fade" order={0}>
          <div style={{ display: 'flex', alignItems: 'flex-end', color: fill, lineHeight: 0.78 }}>
            {digits.map((d, i) => (
              <span key={i} data-sec-digit="" style={{ ...fontStyle('mono', { weight: 800, tracking: -0.06 }), fontSize: 700, lineHeight: 0.78, display: 'inline-block', ...(outline ? { WebkitTextStroke: `14px ${INK}`, paintOrder: 'stroke fill' } : null) }}>
                {d}
              </span>
            ))}
          </div>
        </El>
      ) : null}
      {cast.length ? (
        <El id="cast" label="Characters" box={{ x: showNumber ? 1380 : 1480, y: showNumber ? 404 - charSize : 600, w: 400, h: charSize }} align="end" valign="end" enter="fade" lockAspect>
          {crew}
        </El>
      ) : null}
      <El id="eyebrow" label="Eyebrow" box={{ x: 130, y: 300, w: 860, h: 64 }} enter="wipe" order={1}>
        <Eyebrow size={40}>{eyebrow}</Eyebrow>
      </El>
      <El id="title" label="Title" box={{ x: 120, y: 384, w: showNumber ? 1080 : 1640, h: 470 }} enter="split-words" order={2} morph={morph} valign="end">
        <FitText max={200} min={70} casl={0} lineHeight={1} valign="end">
          {title}
        </FitText>
      </El>
      {subtitle ? (
        <El id="subtitle" label="Line" box={{ x: 130, y: 884, w: 1000, h: 70 }} enter="rise" order={5}>
          <FitText max={44} min={26} font="body" weight={700} lineHeight={1.2} style={{ color: ctx.colors.fg2 }}>
            {subtitle}
          </FitText>
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'section',
  background: 'paper',
  variants: [
    { key: 'giant', label: 'Giant number' },
    { key: 'band', label: 'Title on a band' },
  ],
  fields: [
    { key: 'number', label: 'Part number', type: 'number', min: 0, max: 99, default: (ctx) => (ctx.rundownItem ? ctx.rundownItem.index + 1 : 1), group: 'content' },
    f.eyebrow((ctx) => `Part ${partNumber(ctx)}`),
    f.title((ctx) => ctx.rundownItem?.agenda ?? 'A new chapter'),
    f.subtitle((ctx) => {
      const r = ctx.rundownItem;
      if (!r) return '';
      return [r.time && r.endTime ? `${r.time} to ${r.endTime}` : r.time, r.speaker?.name].filter(Boolean).join('  ·  ');
    }, 'Line'),
    { key: 'showNumber', label: 'Show the big number', type: 'toggle', default: true, group: 'options' },
  ],
  describe: (ctx) => ctx.text('title') || 'Section',
  headline: (ctx) => {
    const e = ctx.text('eyebrow');
    if (e && e.length <= 14) return e;
    return ctx.text('title').split(/\s+/).slice(0, 2).join(' ') || 'Next up';
  },
  sample: () => ({ refs: { rundown: { index: 1, time: '13:20', agenda: 'Opening remarks' } } }),
  Render,
});
