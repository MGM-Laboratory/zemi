'use client';

import { SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { useId } from 'react';
import { useElScope, useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { INK, PAPER } from '../../engine/palette';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandShape } from '../../parts/shapes';
import { accentInk, accentLabel, castIdle, charOutline, ghostFill, killAll, portraitBack, shapeOn, usePrimedCast } from '../_tpl-talks-kit';
import { defineTemplate, Eyebrow, f, personName, personOrg, personRole, Portrait, useMascots, usePerson } from '../kit';

/**
 * Keynote: the grand intro. The lights come down on a spotlight, a giant "Keynote" rises as a
 * watermark, the portrait (bigger than the speaker card) opens up, and the four shapes swoop onto
 * a tilted ring and keep orbiting it like a halo, passing behind and in front of the photo.
 */

interface Orbit {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  tilt: number;
}

interface Layout {
  light: { x: number; y: number; w: number; h: number };
  photo: { x: number; y: number; w: number; h: number };
  portrait: { left: number; top: number; size: number };
  orbit: Orbit;
  orb: number;
  word: { x: number; y: number; w: number; h: number };
  wordMax: number;
  eyebrow: { x: number; y: number; w: number; h: number };
  name: { x: number; y: number; w: number; h: number };
  nameMax: number;
  meta: { x: number; y: number; w: number; h: number };
  talk: { x: number; y: number; w: number; h: number };
  align: 'start' | 'center';
}

const STAGE: Layout = {
  light: { x: 1030, y: 0, w: 800, h: 900 },
  photo: { x: 980, y: 96, w: 900, h: 800 },
  portrait: { left: 130, top: 40, size: 640 },
  orbit: { cx: 450, cy: 540, rx: 420, ry: 108, tilt: -0.08 },
  orb: 112,
  word: { x: 40, y: 826, w: 1840, h: 254 },
  wordMax: 470,
  eyebrow: { x: 130, y: 228, w: 820, h: 56 },
  name: { x: 130, y: 300, w: 820, h: 290 },
  nameMax: 150,
  meta: { x: 130, y: 606, w: 820, h: 60 },
  talk: { x: 130, y: 700, w: 800, h: 170 },
  align: 'start',
};

const CENTER: Layout = {
  light: { x: 560, y: 0, w: 800, h: 640 },
  photo: { x: 480, y: 66, w: 960, h: 560 },
  portrait: { left: 255, top: 16, size: 450 },
  orbit: { cx: 480, cy: 390, rx: 420, ry: 82, tilt: -0.05 },
  orb: 92,
  word: { x: 60, y: 110, w: 1800, h: 440 },
  wordMax: 420,
  eyebrow: { x: 160, y: 616, w: 1600, h: 50 },
  name: { x: 160, y: 668, w: 1600, h: 140 },
  nameMax: 128,
  meta: { x: 160, y: 812, w: 1600, h: 52 },
  talk: { x: 260, y: 884, w: 1400, h: 104 },
  align: 'center',
};

/** Where on the ring angle `a` sits (El-local px), and how near it is (1 = front of the ring). */
function orbitAt(o: Orbit, a: number) {
  const ex = Math.cos(a) * o.rx;
  const ey = Math.sin(a) * o.ry;
  const c = Math.cos(o.tilt);
  const s = Math.sin(o.tilt);
  const depth = Math.sin(a);
  return { x: o.cx + ex * c - ey * s, y: o.cy + ex * s + ey * c, depth, scale: 0.8 + 0.14 * (depth + 1) };
}

/** Half of the ring as an SVG path (front = the near half, drawn over the photo). */
function ringPath(o: Orbit, front: boolean): string {
  const steps = 40;
  const from = front ? 0 : Math.PI;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const p = orbitAt(o, from + (Math.PI * i) / steps);
    d += `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return d;
}

/** Starting angles: two in front, one to the side, one tucked behind the photo. */
const START = [0.52, 2.62, 3.67, 5.76];

/** The giant word, one span per letter so they can rise in turn. Fixed size so it bleeds off the canvas on purpose. */
function BigWord({ word, size, color, center }: { word: string; size: number; color: string; center: boolean }) {
  const { scale } = useElScope();
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: center ? 'center' : 'flex-start', justifyContent: 'center' }}>
      <span style={{ ...fontStyle('display', { weight: 1000, casl: 1, tracking: -0.03 }), fontSize: size * scale, lineHeight: 0.78, whiteSpace: 'nowrap', color }}>
        {Array.from(word).map((ch, i) => (
          <span key={i} data-kn-letter="" style={{ display: 'inline-block', whiteSpace: 'pre' }}>
            {ch}
          </span>
        ))}
      </span>
    </div>
  );
}

function Render() {
  const ctx = useSlide();
  usePrimedCast();
  const person = usePerson();
  const L = ctx.slide.style.variant === 'center' ? CENTER : STAGE;
  const cast = useMascots([...SHAPE_ORDER]);
  const gradId = `kn-${useId().replace(/[:]/g, '')}`;
  const eyebrow = ctx.text('eyebrow');
  const word = ctx.text('word');
  const name = person?.name || 'Pick a speaker';
  const meta = [ctx.text('role'), ctx.text('org')].filter(Boolean).join('  ·  ');
  const talk = ctx.flag('showTalk', true) ? ctx.text('talk') : '';
  const pid = person?.id ?? 'manual';
  const center = L.align === 'center';
  // Over a camera (transparent) the spotlight and the giant word would just be noise.
  const clear = ctx.background === 'transparent';
  const onDark = ctx.colors.dark && ctx.background !== 'accent';
  const beam = ctx.background === 'accent' ? (ctx.colors.fg === PAPER ? PAPER : INK) : onDark ? ctx.colors.accentSoft : ctx.colors.accentHex;
  const beamOpacity = ctx.background === 'accent' ? 0.12 : onDark ? 0.11 : 0.08;
  const ringColor = ctx.colors.fg;
  const wordColor = ctx.background === 'accent' ? (ctx.colors.fg === PAPER ? '#ffffff2e' : '#0e11161a') : onDark ? '#ffffff12' : ctx.colors.accentSoft;

  useEnter((tl, root, { at, calm }) => {
    if (ctx.theme.motion === 'still') return;
    const light = root.querySelector('[data-kn-light]');
    if (light) tl.from(light, { scaleX: 0.15, opacity: 0, transformOrigin: '50% 0%', duration: at(1.1), ease: 'zemiOut' }, at(0));
    const letters = root.querySelectorAll('[data-kn-letter]');
    if (letters.length) tl.from(letters, { yPercent: 70, opacity: 0, duration: at(1.2), ease: 'zemiOut', stagger: at(0.07) }, at(0.1));
    const back = root.querySelector('[data-el="photo"] [data-portrait-back]');
    const photo = root.querySelector('[data-el="photo"] [data-portrait]');
    if (back) tl.from(back, { scale: 0.2, rotation: -50, opacity: 0, duration: at(1.2), ease: 'zemiPop' }, at(0.15));
    if (photo) tl.fromTo(photo, { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)', duration: at(1.1), ease: 'zemiInOut', clearProps: 'clipPath' }, at(0.3));
    const rings = root.querySelectorAll('[data-kn-ring]');
    if (rings.length) tl.from(rings, { drawSVG: '0%', duration: at(1), ease: 'zemiInOut', stagger: at(0.15) }, at(0.55));
    // The shapes swoop onto the ring from behind the photo and settle at their spots.
    const orbs = Array.from(root.querySelectorAll<HTMLElement>('[data-kn-orb]'));
    const proxy = { k: 1 };
    const place = () => {
      orbs.forEach((el, i) => {
        const p = orbitAt(L.orbit, START[i]! - proxy.k * 2.4);
        const base = orbitAt(L.orbit, START[i]!);
        gsap.set(el, { x: p.x - base.x, y: p.y - base.y, scale: p.scale });
        el.style.zIndex = p.depth > 0 ? '4' : '1';
      });
    };
    if (orbs.length) {
      tl.fromTo(orbs, { opacity: 0 }, { opacity: 1, duration: at(0.4), stagger: at(0.08) }, at(0.7));
      tl.fromTo(proxy, { k: 1 }, { k: 0, duration: at(calm ? 1.6 : 1.4), ease: 'power3.out', onUpdate: place, onStart: place }, at(0.7));
      const chars = orbs.filter((o) => o.querySelector('.bc'));
      chars.forEach((c, i) => {
        tl.add(charAnim.squash(c), at(2.05 + i * 0.07));
        tl.add(charAnim.look(c, center ? 0 : -1, 0.3, 0.3), at(2.3 + i * 0.06));
      });
      if (!calm && chars[0]) tl.add(charAnim.hop(chars[0], { height: 16 }), at(2.7));
      chars.forEach((c) => tl.add(charAnim.look(c, 0, 0, 0.4), at(3.3)));
    }
    const nameEl = root.querySelector<HTMLElement>('[data-el="name"] [data-fit]');
    if (nameEl) tl.fromTo(nameEl, { '--casl': 0 }, { '--casl': 0.9, duration: at(1.5), ease: 'power2.out' }, at(0.6));
    const bar = root.querySelector('[data-kn-bar]');
    if (bar) tl.from(bar, { scaleY: 0, transformOrigin: '50% 0%', duration: at(0.7), ease: 'zemiOut' }, at(1.05));
  });

  useIdle((root, { calm }) => {
    const orbs = Array.from(root.querySelectorAll<HTMLElement>('[data-kn-orb]'));
    const chars = orbs.filter((o) => o.querySelector('.bc'));
    const stop = castIdle(chars, calm, 2);
    const state = { a: 0 };
    const spin = gsap.to(state, {
      a: Math.PI * 2,
      duration: calm ? 90 : 56,
      ease: 'none',
      repeat: -1,
      onUpdate: () => {
        orbs.forEach((el, i) => {
          const base = orbitAt(L.orbit, START[i]!);
          const p = orbitAt(L.orbit, START[i]! + state.a);
          gsap.set(el, { x: p.x - base.x, y: p.y - base.y, scale: p.scale });
          el.style.zIndex = p.depth > 0 ? '4' : '1';
        });
      },
    });
    // Every so often the crew turns to look at the keynote, then back at the room.
    const glance = gsap.timeline({ repeat: -1, repeatDelay: 6, delay: 3 });
    chars.forEach((c, i) => glance.add(charAnim.look(c, center ? 0 : 0.4, -0.8, 0.45), i * 0.08));
    chars.forEach((c, i) => glance.add(charAnim.look(c, 0, 0, 0.45), 2.4 + i * 0.08));
    const light = root.querySelector('[data-kn-light]');
    const sway = light ? gsap.to(light, { rotation: calm ? 1.2 : 2.4, transformOrigin: '50% 0%', duration: 6.5, ease: 'sine.inOut', yoyo: true, repeat: -1 }) : null;
    const back = root.querySelector('[data-el="photo"] [data-portrait-back]');
    const tilt = back ? gsap.to(back, { rotation: calm ? 3 : 6, transformOrigin: '50% 50%', duration: 5.5, ease: 'sine.inOut', yoyo: true, repeat: -1 }) : null;
    const letters = Array.from(root.querySelectorAll('[data-kn-letter]'));
    const wave = letters.map((l, i) => gsap.to(l, { y: calm ? -4 : -9, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: i * 0.22 }));
    return () => {
      stop();
      killAll([spin, glance, sway, tilt, ...wave]);
      orbs.forEach((el, i) => {
        const p = orbitAt(L.orbit, START[i]!);
        gsap.set(el, { x: 0, y: 0, scale: p.scale });
        el.style.zIndex = p.depth > 0 ? '4' : '1';
      });
    };
  });

  const P = L.portrait.size;
  return (
    <>
      {clear ? null : (
      <El id="light" label="Spotlight" box={L.light} enter="fade" order={0} locked>
        <svg data-kn-light="" viewBox={`0 0 ${L.light.w} ${L.light.h}`} width="100%" height="100%" style={{ overflow: 'visible', display: 'block' }} aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={beam} stopOpacity={1} />
              <stop offset="0.55" stopColor={beam} stopOpacity={0.45} />
              <stop offset="0.92" stopColor={beam} stopOpacity={0} />
            </linearGradient>
          </defs>
          {[1, 0.78, 0.56].map((k) => (
            <path key={k} d={`M${L.light.w * (0.5 - 0.07 * k)} -40 L${L.light.w * (0.5 + 0.07 * k)} -40 L${L.light.w * (0.5 + 0.5 * k)} ${L.light.h} L${L.light.w * (0.5 - 0.5 * k)} ${L.light.h} Z`} fill={`url(#${gradId})`} opacity={beamOpacity} />
          ))}
        </svg>
      </El>
      )}
      {word && !clear ? (
        <El id="word" label="Keynote word" box={L.word} enter="fade" order={0} align="center" locked>
          <BigWord word={word} size={L.wordMax} color={wordColor} center={center} />
        </El>
      ) : null}
      <El id="photo" label="Photo and halo" box={L.photo} enter="fade" order={1} lockAspect>
        <div style={{ position: 'absolute', inset: 0 }}>
          <svg viewBox={`0 0 ${L.photo.w} ${L.photo.h}`} width={L.photo.w} height={L.photo.h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', zIndex: 1 }} aria-hidden="true">
            <path data-kn-ring="" d={ringPath(L.orbit, false)} fill="none" stroke={ringColor} strokeOpacity={0.28} strokeWidth={3} strokeLinecap="round" />
          </svg>
          {/* The morph key sits on the square portrait, not the halo box, so a magic move lands the face exactly. */}
          <div data-morph={person ? `person:${pid}:photo` : undefined} style={{ position: 'absolute', left: L.portrait.left, top: L.portrait.top, width: P, height: P, zIndex: 2 }}>
            {person ? (
              <Portrait person={person} size={P} shape={person.shape} color={portraitBack(ctx, person)} />
            ) : (
              <div style={{ width: P, height: P }}>
                <BrandShape shape="circle" color={ghostFill(ctx)} />
              </div>
            )}
          </div>
          <svg viewBox={`0 0 ${L.photo.w} ${L.photo.h}`} width={L.photo.w} height={L.photo.h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', zIndex: 3, pointerEvents: 'none' }} aria-hidden="true">
            <path data-kn-ring="" d={ringPath(L.orbit, true)} fill="none" stroke={ringColor} strokeOpacity={0.5} strokeWidth={3.5} strokeLinecap="round" />
          </svg>
          {SHAPE_ORDER.map((s: ShapeName, i) => {
            const p = orbitAt(L.orbit, START[i]!);
            const size = L.orb;
            const live = cast.includes(s);
            return (
              <div
                key={s}
                data-kn-orb=""
                style={{ position: 'absolute', left: p.x - size / 2, top: p.y - size / 2, width: size, height: size, zIndex: p.depth > 0 ? 4 : 1, transform: `scale(${p.scale.toFixed(3)})` }}
              >
                {live ? (
                  <BumperCharacter shape={s} mood={i === 2 ? 'wink' : 'happy'} style={charOutline(ctx, s)} />
                ) : (
                  <div style={{ width: size * 0.6, height: size * 0.6, margin: size * 0.2 }}>
                    <BrandShape shape={s} color={shapeOn(ctx, s)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </El>
      {eyebrow ? (
        <El id="eyebrow" label="Eyebrow" box={L.eyebrow} align={L.align} enter="wipe" order={3}>
          <Eyebrow size={center ? 28 : 32}>{eyebrow}</Eyebrow>
        </El>
      ) : null}
      <El id="name" label="Name" box={L.name} align={L.align} enter="split-words" order={4} morph={person ? `person:${pid}:name` : null}>
        <FitText max={L.nameMax} min={56} casl={0.9} lineHeight={0.92} valign={center ? 'center' : 'end'}>
          {name}
        </FitText>
      </El>
      {meta ? (
        <El id="meta" label="Position and affiliation" box={L.meta} align={L.align} enter="rise" order={6}>
          <FitText max={center ? 34 : 38} min={22} font="body" weight={600} lineHeight={1.3} style={{ color: ctx.colors.fg2 }}>
            {meta}
          </FitText>
        </El>
      ) : null}
      {talk ? (
        <El id="talk" label="Talk title" box={L.talk} align={L.align} enter="rise" order={7} morph={person ? `person:${pid}:talk` : null}>
          {center ? (
            <FitText max={50} min={26} casl={0.4} weight={800} lineHeight={1.05} valign="center">
              {`“${talk}”`}
            </FitText>
          ) : (
            <div style={{ display: 'flex', gap: 30, width: '100%', height: '100%' }}>
              <div data-kn-bar="" style={{ width: 10, borderRadius: 10, background: accentInk(ctx), flex: 'none' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 0, paddingTop: 4 }}>
                <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.14 }), fontSize: 22, textTransform: 'uppercase', color: accentLabel(ctx), lineHeight: 1 }}>The talk</span>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <FitText max={58} min={28} casl={0.35} weight={800} lineHeight={1.04}>
                    {talk}
                  </FitText>
                </div>
              </div>
            </div>
          )}
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'keynote',
  background: 'ink',
  variants: [
    { key: 'stage', label: 'Spotlight', hint: 'Name left, portrait and halo right' },
    { key: 'center', label: 'Centered', hint: 'Portrait on top, name below' },
  ],
  fields: [
    f.eyebrow(() => "Today's keynote"),
    f.name(personName),
    f.role(personRole, 'Position'),
    f.org(personOrg),
    { key: 'talk', label: 'Talk title', type: 'longtext', max: 300, default: (ctx) => ctx.person?.talkTitle ?? '', hint: 'From the event lineup. Type to override.' },
    { key: 'word', label: 'Big word', type: 'text', max: 16, default: 'Keynote', group: 'options', hint: 'The giant word behind everything.' },
    { key: 'showTalk', label: 'Show the talk title', type: 'toggle', default: true, group: 'options' },
  ],
  describe: (ctx) => (ctx.person ? `Keynote: ${ctx.person.name}` : 'Keynote'),
  headline: () => 'Keynote',
  Render,
});
