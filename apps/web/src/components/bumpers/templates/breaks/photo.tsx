'use client';

import { SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import type { CSSProperties } from 'react';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { INK, PAPER, SHAPE_ACCENT } from '../../engine/palette';
import { eventNumberLabel } from '../../engine/resolve';
import { BumperCharacter, charAnim } from '../../parts/character';
import { Sticker } from '../../parts/stickers';
import { accentFill, accentInk, charColor, Pill, rest, restChars } from '../_tpl-mid-kit';
import { defineTemplate, Eyebrow, f, useMascots } from '../kit';

/** Seconds into the entrance when the 3, 2, 1 starts (after everyone squeezed in). */
const COUNT_AT = 2.3;

/** Viewfinder corner brackets and a focus box, drawn in a 1620 x 840 frame. */
function Brackets({ color, focus, shadow }: { color: string; focus: string; shadow: boolean }) {
  const arm = 110;
  const t = 12;
  const corner = (style: CSSProperties, key: string) => <div key={key} data-bracket="" style={{ position: 'absolute', width: arm, height: arm, borderColor: color, borderStyle: 'solid', borderWidth: 0, ...style }} />;
  return (
    <div style={{ position: 'absolute', inset: 0, filter: shadow ? 'drop-shadow(0 2px 8px rgba(14,17,22,0.55))' : undefined }}>
      {corner({ left: 0, top: 0, borderLeftWidth: t, borderTopWidth: t, borderTopLeftRadius: 34 }, 'tl')}
      {corner({ right: 0, top: 0, borderRightWidth: t, borderTopWidth: t, borderTopRightRadius: 34 }, 'tr')}
      {corner({ left: 0, bottom: 0, borderLeftWidth: t, borderBottomWidth: t, borderBottomLeftRadius: 34 }, 'bl')}
      {corner({ right: 0, bottom: 0, borderRightWidth: t, borderBottomWidth: t, borderBottomRightRadius: 34 }, 'br')}
      <div data-focus="" style={{ position: 'absolute', left: '50%', top: '57%', width: 36, height: 36, marginLeft: -18, marginTop: -18 }}>
        <div style={{ position: 'absolute', left: 16, top: 0, width: 4, height: 36, borderRadius: 4, background: focus }} />
        <div style={{ position: 'absolute', left: 0, top: 16, width: 36, height: 4, borderRadius: 4, background: focus }} />
      </div>
    </div>
  );
}

/** The squeezed-together crew. Positions are percentages so the element can be resized. */
function Crew({ cast, colorFor }: { cast: ShapeName[]; colorFor: (s: ShapeName) => string | undefined }) {
  const n = cast.length;
  const size = n > 2 ? 28.5 : 36;
  const step = n > 2 ? 23.5 : 30;
  const start = (100 - (size + (n - 1) * step)) / 2;
  return (
    <>
      {cast.map((s, i) => (
        <div key={s} data-photo-char="" data-side={i < n / 2 ? -1 : 1} style={{ position: 'absolute', left: `${start + i * step}%`, bottom: 0, width: `${size}%`, aspectRatio: '1 / 1', zIndex: n - Math.abs(i - (n - 1) / 2) }}>
          <BumperCharacter shape={s} color={colorFor(s)} mood={i === 1 ? 'happy' : 'idle'} lookX={0} lookY={0.2} />
        </div>
      ))}
    </>
  );
}

/**
 * Group photo: "Squeeze in!" inside a camera viewfinder, the crew squeezing together into frame,
 * then a 3, 2, 1 on the self-timer and one soft flash (their eyes close for it, of course). The
 * polaroid variant develops the shot after the flash. Replay the bumper for another take.
 */
function Render() {
  const ctx = useSlide();
  const polaroid = ctx.slide.style.variant === 'polaroid';
  const cast = useMascots([...SHAPE_ORDER]);
  const countdown = ctx.flag('countdown', true);
  const overCam = ctx.background === 'transparent';
  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title');
  const body = ctx.text('body');
  const hashtag = ctx.text('hashtag');
  const after = ctx.text('after');
  const chip = accentFill(ctx);
  const fg = overCam ? PAPER : ctx.colors.fg;
  const shadow = overCam ? '0 3px 18px rgba(14,17,22,0.7)' : undefined;
  const ringColor = ctx.background === 'accent' ? ctx.colors.fg : ctx.colors.accentHex;
  const accentText = overCam ? PAPER : accentInk(ctx);
  const still = ctx.theme.motion === 'still';
  // Inside the polaroid the backdrop is the accent, so a same-colored character turns paper.
  const colorFor = (s: ShapeName) => (polaroid ? (SHAPE_ACCENT[s] === ctx.accent ? PAPER : undefined) : charColor(ctx, s));

  useEnter((tl, root, { at, calm }) => {
    // A replay ("another take") can land mid countdown: bring the title back and hide the flash.
    rest(root, '[data-el="title"] [data-fit], [data-el="eyebrow"] > *', { opacity: 1, y: 0 });
    rest(root, '[data-photo-flash], [data-develop]', { opacity: 0 });
    rest(root, '[data-timer-cam]', { rotation: 0, scale: 1, opacity: 1 });
    const frame = root.querySelector('[data-el="frame"] > div');
    if (frame) tl.fromTo(frame, { scale: calm ? 1.04 : 1.14, opacity: 0 }, { scale: 1, opacity: 1, duration: at(0.9), ease: BE.out }, at(0));
    const focus = root.querySelector('[data-focus]');
    if (focus) tl.fromTo(focus, { scale: 2.4, opacity: 0 }, { scale: 1, opacity: 1, duration: at(0.4), ease: 'back.out(2)' }, at(1.35));
    const pol = root.querySelector('[data-polaroid]');
    if (pol) tl.fromTo(pol, { y: calm ? 60 : 260, rotation: calm ? 0 : -9 }, { y: 0, rotation: 0, duration: at(1.1), ease: BE.out }, at(0.05));
    const titleFit = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleFit) tl.fromTo(titleFit, { '--casl': 0 }, { '--casl': 1, duration: at(1.4), ease: 'power2.out' }, at(0.3));
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-photo-char]'));
    restChars(chars);
    chars.forEach((c, i) => {
      const side = Number(c.dataset.side ?? 1);
      tl.fromTo(c, { x: side * (calm ? 160 : 760), opacity: 0 }, { x: 0, opacity: 1, duration: at(0.85), ease: calm ? BE.out : 'back.out(2.4)' }, at(0.45 + Math.abs(i - (chars.length - 1) / 2) * 0.12));
      tl.add(charAnim.squash(c), at(1.12 + Math.abs(i - (chars.length - 1) / 2) * 0.12));
    });
    // Squeezed so tight the one in the middle pops up.
    const pop = chars[1];
    if (pop && !calm) tl.add(charAnim.hop(pop, { height: 60, duration: 0.5 }), at(1.35));
    if (!countdown) return;
    const digits = Array.from(root.querySelectorAll<HTMLElement>('[data-digit]'));
    const cam = root.querySelector('[data-timer-cam]');
    const ring = root.querySelector('[data-timer-ring]');
    if (cam) tl.fromTo(cam, { scale: 1, opacity: 1 }, { scale: 0.3, opacity: 0, duration: at(0.25), ease: 'power2.in' }, at(COUNT_AT - 0.2));
    if (ring) tl.fromTo(ring, { drawSVG: '0% 100%' }, { drawSVG: '0% 0%', duration: at(3), ease: 'none' }, at(COUNT_AT));
    const aside = root.querySelectorAll('[data-el="title"] [data-fit], [data-el="eyebrow"] > *');
    if (aside.length) tl.to(aside, { opacity: 0, y: -16, duration: at(0.22), ease: 'power2.in' }, at(COUNT_AT - 0.25));
    digits.forEach((d, k) => {
      const t = COUNT_AT + k;
      tl.fromTo(d, { scale: 1.9, opacity: 0 }, { scale: 1, opacity: 1, duration: at(0.32), ease: BE.back }, at(t));
      tl.to(d, { scale: 0.6, opacity: 0, duration: at(0.2), ease: 'power2.in' }, at(t + 0.78));
      chars.forEach((c) => tl.add(charAnim.squash(c), at(t + 0.05)));
    });
    chars.forEach((c) => tl.add(charAnim.look(c, 0, 0.2, 0.2), at(COUNT_AT)));
    const shot = COUNT_AT + 3;
    const flash = root.querySelector('[data-photo-flash]');
    if (flash && !still) tl.fromTo(flash, { opacity: 0 }, { keyframes: { '0%': { opacity: 0 }, '8%': { opacity: calm ? 0.55 : 0.92 }, '100%': { opacity: 0 } }, duration: at(1), ease: 'power2.out' }, at(shot));
    const eyes = root.querySelectorAll('[data-photo-char] .bc-eye');
    if (eyes.length) tl.fromTo(eyes, { scaleY: 1 }, { keyframes: { '0%': { scaleY: 1 }, '15%': { scaleY: 0.08 }, '70%': { scaleY: 0.08 }, '100%': { scaleY: 1 } }, duration: at(0.6), ease: 'none' }, at(shot));
    const develop = root.querySelector('[data-develop]');
    if (develop) tl.fromTo(develop, { opacity: 0 }, { keyframes: { '0%': { opacity: 0 }, '5%': { opacity: 1 }, '30%': { opacity: 1 }, '100%': { opacity: 0 } }, duration: at(2.6), ease: 'power1.inOut' }, at(shot + 0.05));
    if (cam) tl.fromTo(cam, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: at(0.5), ease: BE.back, immediateRender: false }, at(shot + 0.4));
    const note = root.querySelector('[data-after]');
    if (note) {
      tl.fromTo(note, { scale: 0.4, opacity: 0, rotation: -10 }, { scale: 1, opacity: 1, rotation: -3, duration: at(0.45), ease: 'back.out(2)' }, at(shot + 0.45));
      tl.to(note, { opacity: 0, scale: 0.8, duration: at(0.3), ease: 'power2.in' }, at(shot + 2.4));
    }
    if (aside.length) tl.fromTo(aside, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: at(0.45), ease: BE.out, immediateRender: false }, at(shot + 2.6));
    if (!calm) chars.forEach((c, i) => tl.add(charAnim.cheer(c, { height: 26, spin: i % 2 === 0 }), at(shot + 0.7 + i * 0.07)));
  });

  useIdle((root, { calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-photo-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c));
    const anims: gsap.core.Animation[] = chars.flatMap((c, i) => charAnim.idle(c, { calm, seed: i * 2 + 5 }));
    const flash = root.querySelector('[data-photo-flash]');
    if (flash) gsap.set(flash, { opacity: 0 });
    // Every few seconds they shuffle in a little tighter, like people do when told to squeeze.
    const squeeze = gsap.timeline({ repeat: -1, repeatDelay: 4.5, delay: 2 });
    chars.forEach((c) => {
      const side = Number(c.dataset.side ?? 1);
      squeeze.to(c, { x: -side * (calm ? 6 : 14), duration: 0.35, ease: 'power2.out' }, 0).to(c, { x: 0, duration: 0.6, ease: 'back.out(2)' }, 0.9);
    });
    anims.push(squeeze);
    const brackets = root.querySelector('[data-el="frame"] > div');
    if (brackets) anims.push(gsap.fromTo(brackets, { scale: 1 }, { scale: calm ? 1.004 : 1.01, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    const cam = root.querySelector('[data-timer-cam]');
    if (cam) anims.push(gsap.fromTo(cam, { rotation: -4 }, { rotation: 4, duration: 1.8, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    const pol = root.querySelector('[data-polaroid]');
    if (pol) anims.push(gsap.fromTo(pol, { rotation: -0.6 }, { rotation: 0.6, duration: 4.2, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
    };
  });

  const timerBox = polaroid ? { x: 1600, y: 104, w: 200, h: 200 } : { x: 1530, y: 168, w: 200, h: 200 };
  const center = !polaroid;

  const timer = (
    <El id="timer" label="Self-timer" box={timerBox} enter="pop" order={5} lockAspect>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', background: overCam ? 'rgba(14,17,22,0.55)' : polaroid ? PAPER : ctx.colors.dark ? 'rgba(255,255,255,0.08)' : PAPER, boxShadow: polaroid ? `8px 8px 0 ${INK}` : undefined }}>
        <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden="true">
          <circle cx="50" cy="50" r="45" fill="none" stroke={polaroid ? INK : fg} strokeOpacity={0.14} strokeWidth="7" />
          <circle data-timer-ring="" cx="50" cy="50" r="45" fill="none" stroke={polaroid ? ctx.colors.accentHex : ringColor} strokeWidth="7" strokeLinecap="round" transform="rotate(-90 50 50)" />
        </svg>
        <div data-timer-cam="" style={{ position: 'absolute', left: '22%', top: '22%', width: '56%', height: '56%' }}>
          <Sticker name="camera" />
        </div>
      </div>
    </El>
  );

  return (
    <>
      {center ? (
        <El id="frame" label="Viewfinder" box={{ x: 150, y: 120, w: 1620, h: 840 }} enter="fade" order={0} locked>
          <div style={{ position: 'absolute', inset: 0 }}>
            <Brackets color={fg} focus={ringColor} shadow={overCam} />
          </div>
        </El>
      ) : (
        <El id="polaroid" label="Polaroid" box={{ x: 1060, y: 170, w: 744, h: 830 }} enter="fade" order={0} lockAspect>
          <div data-polaroid="" style={{ position: 'absolute', inset: 0 }}>
            <div style={{ position: 'absolute', inset: 0, rotate: '3deg', background: PAPER, borderRadius: 18, boxShadow: overCam ? '0 22px 60px rgba(14,17,22,0.45)' : ctx.colors.dark ? `14px 14px 0 ${ctx.colors.accentHex}` : `14px 14px 0 ${INK}`, border: ctx.colors.dark || overCam ? undefined : `4px solid ${INK}`, boxSizing: 'border-box' }}>
              <div style={{ position: 'absolute', left: 44, right: 44, top: 44, height: 560, borderRadius: 6, background: ctx.colors.accentHex, overflow: 'hidden' }}>
                {/* The floor they stand on, so the shot reads like a room and not a swatch. */}
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 86, background: ctx.colors.accentDeep }} />
                {cast.length ? (
                  <div style={{ position: 'absolute', left: 20, right: 20, bottom: 40, height: 300 }}>
                    <Crew cast={cast as ShapeName[]} colorFor={colorFor} />
                  </div>
                ) : null}
                <div data-develop="" style={{ position: 'absolute', inset: 0, background: INK, opacity: 0, zIndex: 5 }} />
              </div>
              <div style={{ position: 'absolute', left: 44, right: 44, bottom: 48, height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ ...fontStyle('display', { weight: 800, casl: 1, tracking: -0.01 }), fontSize: 76, color: INK, rotate: '-2deg' }}>{hashtag}</span>
              </div>
            </div>
          </div>
        </El>
      )}
      {center && cast.length ? (
        <El id="crew" label="Characters" box={{ x: 520, y: 432, w: 880, h: 330 }} enter="fade" order={1} lockAspect>
          <Crew cast={cast as ShapeName[]} colorFor={colorFor} />
        </El>
      ) : null}
      <El id="eyebrow" label="Eyebrow" box={center ? { x: 360, y: 168, w: 1200, h: 56 } : { x: 140, y: 262, w: 860, h: 56 }} align={center ? 'center' : 'start'} enter="wipe" order={1}>
        <Eyebrow size={32} shape="circle" color={fg} style={{ textShadow: shadow }}>
          {eyebrow}
        </Eyebrow>
      </El>
      <El id="title" label="Title" box={center ? { x: 300, y: 228, w: 1320, h: 190 } : { x: 130, y: 330, w: 880, h: 230 }} align={center ? 'center' : 'start'} enter="split-chars" order={2}>
        <FitText max={center ? 180 : 190} min={70} casl={1} lineHeight={0.9} valign={center ? 'center' : 'start'} style={{ color: fg, textShadow: shadow }}>
          {title}
        </FitText>
        {countdown ? (
          <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 0, display: 'flex', alignItems: 'center', justifyContent: center ? 'center' : 'flex-start', pointerEvents: 'none' }}>
            {['3', '2', '1'].map((d) => (
              <span key={d} data-digit="" style={{ position: 'absolute', opacity: 0, ...fontStyle('display', { weight: 1000, casl: 0.7, tracking: -0.04 }), fontSize: center ? 330 : 360, lineHeight: 1, color: accentText, textShadow: shadow, left: center ? undefined : 0 }}>
                {d}
              </span>
            ))}
            {after ? (
              <span data-after="" style={{ position: 'absolute', opacity: 0, left: center ? undefined : 0, whiteSpace: 'nowrap' }}>
                <Pill icon="camera" bg={chip.fill} fg={chip.text} size={center ? 96 : 84}>
                  {after}
                </Pill>
              </span>
            ) : null}
          </div>
        ) : null}
      </El>
      {body ? (
        <El id="body" label="Line" box={center ? { x: 420, y: 790, w: 1080, h: 60 } : { x: 140, y: 600, w: 820, h: 130 }} align={center ? 'center' : 'start'} enter="rise" order={4}>
          <FitText max={center ? 38 : 44} min={22} font="body" weight={600} lineHeight={1.3} valign="center" style={{ color: overCam ? PAPER : ctx.colors.fg2, textShadow: shadow }}>
            {body}
          </FitText>
        </El>
      ) : null}
      {center && hashtag ? (
        <El id="hashtag" label="Hashtag" box={{ x: 560, y: 872, w: 800, h: 90 }} align="center" valign="center" enter="pop" order={6}>
          <Pill icon="camera" bg={chip.fill} fg={chip.text} size={40}>
            {hashtag}
          </Pill>
        </El>
      ) : null}
      {timer}
      <div data-photo-flash="" aria-hidden="true" style={{ position: 'absolute', inset: 0, background: '#ffffff', opacity: 0, zIndex: 44, pointerEvents: 'none' }} />
    </>
  );
}

export default defineTemplate({
  kind: 'photo',
  variants: [
    { key: 'viewfinder', label: 'Viewfinder' },
    { key: 'polaroid', label: 'Polaroid' },
  ],
  fields: [
    f.eyebrow((ctx) => (ctx.event?.number != null ? `Group photo, Zemi ${eventNumberLabel(ctx.event)}` : 'Group photo')),
    f.title('Squeeze in!', 'Title', 60),
    f.body('Everyone in the frame. Front row, crouch a little.', 'Line', 140),
    { key: 'hashtag', label: 'Hashtag', type: 'text', max: 40, default: (ctx) => (ctx.event?.number != null ? `#zemi${ctx.event.number}` : '#zemi') },
    { key: 'countdown', label: 'Run a 3, 2, 1 with a flash', type: 'toggle', default: true, hint: 'Starts two seconds after the bumper shows. Replay it for another take.' },
    { key: 'after', label: 'After the flash', type: 'text', max: 30, default: 'Got it', group: 'options' },
  ],
  describe: (ctx) => `Group photo${ctx.text('hashtag') ? `, ${ctx.text('hashtag')}` : ''}`,
  headline: () => 'Cheese',
  Render,
});
