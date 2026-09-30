'use client';

import { SHAPE_COLORS, type ShapeName } from '@zemi/shared';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { ACCENT_SHAPE, INK, INK_2, INK_3, PAPER } from '../../engine/palette';
import { eventNumberLabel } from '../../engine/resolve';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandShape, BumperImage } from '../../parts/shapes';
import { Sticker } from '../../parts/stickers';
import { resetCast, shapeTint } from '../_tpl-end-kit';
import { defineTemplate, useMascots } from '../kit';

/** Stable id for the lab's sample photo (the lab fixtures can provide it). */
export const SAMPLE_PHOTO_ID = '5a3b0000-0000-4000-8000-00000000e001';

/**
 * Photo: one image, full-bleed with a caption strip, or framed like a print tossed onto the
 * table with tape on its corners. The picture drifts in a slow Ken Burns zoom while it is up.
 * Without a photo it shows a friendly "Pick a photo" frame instead of a hole.
 */
function Render() {
  const ctx = useSlide();
  const framed = ctx.slide.style.variant === 'framed';
  const cast = useMascots(framed ? ['arch'] : []);
  const img = ctx.image;
  const caption = ctx.flag('showCaption', true) ? ctx.text('caption') : '';
  const credit = ctx.flag('showCaption', true) ? ctx.text('credit') : '';
  const fit = ctx.text('fit') === 'contain' ? 'contain' : 'cover';
  const still = ctx.theme.motion === 'still';
  const bullet: ShapeName = ACCENT_SHAPE[ctx.accent];

  useEnter((tl, root, { at, calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-im-char]'));
    resetCast(chars);
    const kb = root.querySelector<HTMLElement>('[data-kb]');
    if (kb) gsap.set(kb, { scale: 1, x: 0, y: 0 });
    if (still) return;
    if (kb) tl.fromTo(kb, { scale: calm ? 1.06 : 1.14 }, { scale: 1.02, duration: at(framed ? 1.6 : 2.2), ease: 'zemiOut' }, at(0));
    const print = root.querySelector<HTMLElement>('[data-im-print]');
    if (print) tl.fromTo(print, { y: 900, rotation: 14, scale: 1.1 }, { y: 0, rotation: 0, scale: 1, duration: at(calm ? 1.1 : 0.95), ease: 'back.out(1.1)' }, at(0));
    const tape = root.querySelectorAll<HTMLElement>('[data-im-tape]');
    if (tape.length) tl.fromTo(tape, { scale: 1.8, opacity: 0 }, { scale: 1, opacity: 1, duration: at(0.25), ease: 'power3.in', stagger: at(0.12) }, at(0.9));
    const dot = root.querySelector<HTMLElement>('[data-im-bullet]');
    if (dot) tl.fromTo(dot, { rotation: -360, scale: 0 }, { rotation: 0, scale: 1, duration: at(0.8), ease: 'back.out(1.8)' }, at(0.7));
    chars.forEach((c, i) => {
      tl.fromTo(c, { y: 200, opacity: 0 }, { y: 0, opacity: 1, duration: at(0.7), ease: 'back.out(1.5)' }, at(1.2 + i * 0.1));
      tl.add(charAnim.look(c, -1, -0.5, 0.3), at(1.8));
    });
  });

  useIdle((root, { calm }) => {
    const anims: gsap.core.Animation[] = [];
    const kb = root.querySelector<HTMLElement>('[data-kb]');
    // The slow Ken Burns: a gentle push in with a small drift, then back out.
    if (kb) anims.push(gsap.to(kb, { scale: calm ? 1.06 : 1.1, x: calm ? -12 : -28, y: calm ? -6 : -16, duration: calm ? 26 : 18, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    const print = root.querySelector('[data-im-print]');
    if (print) anims.push(gsap.to(print, { rotation: calm ? 0.4 : 0.9, y: calm ? -4 : -8, duration: 4.5, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    const dot = root.querySelector('[data-im-bullet]');
    if (dot) anims.push(gsap.to(dot, { rotation: '+=360', duration: calm ? 40 : 24, ease: 'none', repeat: -1 }));
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-im-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c));
    anims.push(...chars.flatMap((c, i) => charAnim.idle(c, { calm, seed: i * 3 + 4 })));
    const glance = gsap.timeline({ repeat: -1, repeatDelay: 5, delay: 2 });
    chars.forEach((c) => glance.add(charAnim.look(c, 0, 0, 0.4), 0).add(charAnim.look(c, -1, -0.5, 0.4), 2.5));
    anims.push(glance);
    return () => {
      anims.forEach((a) => a.kill());
      stops.forEach((s) => s());
    };
  });

  const empty = (dark: boolean, size: 'big' | 'small') => (
    <div style={{ position: 'absolute', inset: size === 'big' ? '136px 96px 96px' : 0, borderRadius: size === 'big' ? 40 : 10, border: `5px dashed ${dark ? '#ffffff47' : `${INK}33`}`, background: dark ? '#ffffff0a' : '#f7f7f5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
      <div style={{ width: size === 'big' ? 190 : 150, height: size === 'big' ? 190 : 150 }}>
        <Sticker name="camera" />
      </div>
      <span style={{ ...fontStyle('display', { weight: 850, casl: 0.6 }), fontSize: size === 'big' ? 84 : 64, lineHeight: 1, color: dark ? PAPER : INK }}>Pick a photo</span>
      <span style={{ ...fontStyle('body', { weight: 600 }), fontSize: size === 'big' ? 34 : 28, color: dark ? '#f5f6f8bd' : INK_2 }}>Choose one from the event photos or upload your own.</span>
    </div>
  );

  const crew = cast.length ? (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
      {cast.map((s) => (
        <div key={s} data-im-char="" style={{ width: 150, height: 150 }}>
          <BumperCharacter shape={s} color={shapeTint(ctx.colors, s)} mood="happy" lookX={-1} lookY={-0.5} />
        </div>
      ))}
    </div>
  ) : null;

  if (framed) {
    const W = 1240;
    const H = 860;
    const m = 34;
    const bottom = 150;
    return (
      <>
        {crew ? (
          <El id="cast" label="Characters" box={{ x: 1500, y: 790, w: 320, h: 150 }} enter="fade" lockAspect valign="end">
            {crew}
          </El>
        ) : null}
        <El id="photo" label="Photo" box={{ x: 340, y: 110, w: W, h: H }} enter="fade" lockAspect>
          <div data-im-print="" style={{ position: 'absolute', inset: 0, rotate: '-2deg' }}>
            <div style={{ position: 'absolute', inset: 0, background: PAPER, borderRadius: 10, boxShadow: `0 28px 60px ${INK}40, 0 3px 0 ${INK}1a`, border: ctx.colors.dark ? undefined : `2px solid ${INK}1f` }} />
            <div style={{ position: 'absolute', left: m, top: m, width: W - m * 2, height: H - m - bottom, overflow: 'hidden', borderRadius: 4, background: img?.color ?? '#e9e9e4' }}>
              {img ? (
                <div data-kb="" style={{ position: 'absolute', inset: 0 }}>
                  <BumperImage image={img} width={W} fit={fit} />
                </div>
              ) : (
                empty(false, 'small')
              )}
            </div>
            <div style={{ position: 'absolute', left: m + 6, right: m + 6, bottom: 0, height: bottom, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 30 }}>
              <div style={{ flex: 1, minWidth: 0, height: 90 }}>
                <FitText max={60} min={30} weight={700} casl={1} tracking={-0.01} lineHeight={1.05} valign="center" style={{ color: INK }}>
                  {caption || (img ? '' : 'A Friday worth keeping')}
                </FitText>
              </div>
              {credit ? <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.1 }), fontSize: 24, color: INK_3, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{credit}</span> : null}
            </div>
            {[
              { left: -40, top: 18, rot: -38 },
              { right: -40, top: 18, rot: 38 },
            ].map((t, i) => (
              <div key={i} data-im-tape="" style={{ position: 'absolute', ...('left' in t ? { left: t.left } : { right: t.right }), top: t.top, width: 190, height: 58, rotate: `${t.rot}deg`, background: `${ctx.colors.accent === 'yellow' ? '#f7bf33' : ctx.colors.accentHex}b3`, borderRadius: 6 }} />
            ))}
          </div>
        </El>
      </>
    );
  }

  return (
    <>
      <El id="photo" label="Photo" box={{ x: 0, y: 0, w: 1920, h: 1080 }} enter="fade" lockAspect>
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: img?.color ?? (ctx.colors.dark ? INK : '#f7f7f5') }}>
          {img ? (
            <div data-kb="" style={{ position: 'absolute', inset: 0 }}>
              <BumperImage image={img} width={1920} fit={fit} />
            </div>
          ) : (
            empty(ctx.colors.dark, 'big')
          )}
          {img && ctx.theme.bug ? <div style={{ position: 'absolute', left: 0, top: 0, width: 760, height: 300, background: `radial-gradient(ellipse at 0% 0%, ${INK}8c, ${INK}00 70%)` }} /> : null}
        </div>
      </El>
      {img && (caption || credit) ? (
        <El id="caption" label="Caption" box={{ x: 96, y: 890, w: 1400, h: 110 }} valign="end" enter="wipe" order={4}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, maxWidth: '100%', padding: '18px 34px 18px 22px', borderRadius: 999, background: PAPER, boxShadow: `0 12px 34px ${INK}40` }}>
            <div data-im-bullet="" style={{ width: 52, height: 52, flex: 'none' }}>
              <BrandShape shape={bullet} color={SHAPE_COLORS[bullet]} />
            </div>
            {caption ? (
              <span style={{ ...fontStyle('display', { weight: 800, casl: 0.5, tracking: -0.02 }), fontSize: 44, lineHeight: 1.1, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{caption}</span>
            ) : null}
            {credit ? <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.1 }), fontSize: 22, color: INK_3, textTransform: 'uppercase', whiteSpace: 'nowrap', flex: 'none' }}>{credit}</span> : null}
          </div>
        </El>
      ) : null}
      {crew ? (
        <El id="cast" label="Characters" box={{ x: 1400, y: 860, w: 424, h: 150 }} align="end" valign="end" enter="fade" lockAspect>
          {crew}
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'image',
  background: 'ink',
  variants: [
    { key: 'full', label: 'Full screen' },
    { key: 'framed', label: 'Framed print' },
  ],
  fields: [
    { key: 'caption', label: 'Caption', type: 'text', max: 140, default: (ctx) => ctx.image?.alt ?? '', hint: 'From the photo description. Type to override.' },
    { key: 'credit', label: 'Small print', type: 'text', max: 60, default: (ctx) => (ctx.event?.number != null ? `Zemi ${eventNumberLabel(ctx.event)}` : ''), placeholder: 'Photo by...' },
    { key: 'showCaption', label: 'Show the caption', type: 'toggle', default: true, group: 'options' },
    { key: 'fit', label: 'Fit', type: 'select', options: [{ value: 'cover', label: 'Fill the frame' }, { value: 'contain', label: 'Show the whole photo' }], default: 'cover', group: 'options' },
  ],
  describe: (ctx) => ctx.text('caption') || (ctx.image ? 'Photo' : 'Photo (pick one)'),
  headline: () => 'Look',
  sample: () => ({ refs: { assetId: SAMPLE_PHOTO_ID } }),
  Render,
});
