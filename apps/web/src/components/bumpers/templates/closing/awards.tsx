'use client';

import { SHAPE_COLORS, SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { INK, PAPER, SHAPE_ACCENT } from '../../engine/palette';
import type { BumperPerson } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { stageConfetti } from '../../parts/confetti';
import { BrandShape, BumperAvatar } from '../../parts/shapes';
import { Sticker } from '../../parts/stickers';
import { charColor, rest, restChars, textInk } from '../_tpl-mid-kit';
import { defineTemplate, Eyebrow, f, personName, personRole, useMascots, usePerson } from '../kit';

/** Sunburst rays behind the winner (viewBox 1000, centered). */
function Rays({ color }: { color: string }) {
  const n = 18;
  return (
    <svg viewBox="-500 -500 1000 1000" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const a0 = ((i * 2) / (n * 2)) * Math.PI * 2;
        const a1 = ((i * 2 + 1) / (n * 2)) * Math.PI * 2;
        // Rounded so the server and the browser print the same path (their trig can differ in the last digit).
        const p = (v: number) => (v * 520).toFixed(2);
        return <path key={i} d={`M0 0 L${p(Math.cos(a0))} ${p(Math.sin(a0))} L${p(Math.cos(a1))} ${p(Math.sin(a1))} Z`} fill={color} />;
      })}
    </svg>
  );
}

/** The winner's photo in their shape, with an offset shape behind that never melts into the background. */
function WinnerPortrait({ person, size, back, ring }: { person: BumperPerson; size: number; back: string; ring?: string }) {
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div data-award-back="" style={{ position: 'absolute', left: size * 0.08, top: size * 0.07, width: size, height: size }}>
        <BrandShape shape={person.shape} color={back} />
      </div>
      <div data-award-photo="" style={{ position: 'relative' }}>
        <BumperAvatar image={person.avatar} name={person.name} clip={person.shape} size={size} ring={ring ? size * 0.03 : undefined} ringColor={ring} />
      </div>
    </div>
  );
}

/** Podium blocks: 2, 1, 3 (viewBox 1200 x 260). */
function Podium({ fill, text }: { fill: string; text: string }) {
  const steps = [
    { x: 0, y: 90, w: 380, label: '2' },
    { x: 400, y: 0, w: 400, label: '1' },
    { x: 820, y: 140, w: 380, label: '3' },
  ];
  return (
    <svg viewBox="0 0 1200 260" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      {steps.map((s) => (
        <g key={s.label} data-step="">
          <rect x={s.x} y={s.y} width={s.w} height={260 - s.y + 40} rx={22} fill={fill} />
          <text x={s.x + s.w / 2} y={s.y + (s.label === '1' ? 150 : 110)} textAnchor="middle" fill={text} style={{ ...fontStyle('display', { weight: 900, casl: 0.6 }), fontSize: s.label === '1' ? 130 : 90 }}>
            {s.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * An award: "And the award goes to", the award name, the winner with their portrait, a trophy
 * that drops in, a WINNER stamp that slams onto the photo (the screen shakes a little), confetti
 * cannons from both corners and the crew cheering. The podium variant puts the winner on top.
 */
function Render() {
  const ctx = useSlide();
  const podium = ctx.slide.style.variant === 'podium';
  const cast = useMascots([...SHAPE_ORDER]);
  const person = usePerson();
  const pid = person?.id ?? 'manual';
  const eyebrow = ctx.text('eyebrow');
  const award = ctx.text('award');
  const name = person?.name || 'Pick a winner';
  const role = ctx.text('role');
  const reason = ctx.text('reason');
  const stamp = ctx.text('stamp');
  const ink = textInk(ctx);
  const accent = ink.accent;
  const onAccent = ctx.background === 'accent';
  const face: BumperPerson = person ?? { kind: 'manual', id: null, name: '?', first: '?', nickname: null, headline: null, avatar: null, organization: null, position: null, role: null, talkTitle: null, url: null, shape: 'circle' };
  // The offset shape must differ from the portrait's own color, or the two melt into one blob.
  const faceColor = face.avatar ? null : SHAPE_COLORS[face.shape];
  const nextShape = SHAPE_ORDER[(SHAPE_ORDER.indexOf(face.shape) + 1) % SHAPE_ORDER.length]!;
  const back = onAccent ? (ctx.accent === 'yellow' ? INK : PAPER) : faceColor === ctx.colors.accentHex ? SHAPE_COLORS[nextShape] : ctx.colors.accentHex;
  // A portrait the same color as the accent background gets a paper outline so it keeps its edge.
  const ring = onAccent && !face.avatar && SHAPE_ACCENT[face.shape] === ctx.accent ? PAPER : undefined;
  const stampColor = onAccent ? ctx.colors.fg : SHAPE_COLORS.triangle;
  const rayColor = ink.cam ? 'rgba(255,255,255,0.1)' : ctx.colors.dark ? (onAccent ? 'rgba(255,255,255,0.1)' : `${ctx.colors.accentHex}2e`) : onAccent ? 'rgba(14,17,22,0.07)' : ctx.colors.accentSoft;

  useEnter((tl, root, { at, calm }) => {
    rest(root, '[data-glint]', { opacity: 0, scale: 1, rotation: 0 });
    const rays = root.querySelector('[data-rays]');
    if (rays) tl.fromTo(rays, { scale: 0.3, opacity: 0, rotation: -40 }, { scale: 1, opacity: 1, rotation: 0, duration: at(1.4), ease: BE.out }, at(0));
    const backShape = root.querySelector('[data-award-back]');
    if (backShape) tl.fromTo(backShape, { scale: 0.2, rotation: -40, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: at(1.1), ease: BE.pop }, at(0.05));
    const photo = root.querySelector('[data-award-photo]');
    if (photo) tl.fromTo(photo, { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)', duration: at(1.0), ease: BE.inOut, clearProps: 'clipPath' }, at(0.2));
    const awardFit = root.querySelector<HTMLElement>('[data-el="award"] [data-fit]');
    if (awardFit) tl.fromTo(awardFit, { '--casl': 0 }, { '--casl': 0.9, duration: at(1.6), ease: 'power2.out' }, at(0.35));
    const trophy = root.querySelector('[data-trophy]');
    if (trophy) {
      tl.fromTo(trophy, { y: calm ? -140 : -760, rotation: calm ? 0 : -30, opacity: 0 }, { y: 0, rotation: 0, opacity: 1, duration: at(0.8), ease: 'bounce.out' }, at(0.95));
      tl.fromTo(trophy, { scaleY: 0.82, scaleX: 1.12 }, { scaleY: 1, scaleX: 1, duration: at(0.5), ease: 'elastic.out(1, 0.4)', transformOrigin: '50% 100%', immediateRender: false }, at(1.33));
    }
    const st = root.querySelector('[data-stamp]');
    if (st) {
      tl.fromTo(st, { scale: calm ? 1.3 : 3, opacity: 0, rotation: calm ? -6 : -30 }, { scale: 1, opacity: 0.95, rotation: 0, duration: at(calm ? 0.4 : 0.26), ease: calm ? BE.out : 'back.out(1.4)' }, at(1.6));
      const portrait = root.querySelector('[data-el="photo"] > div');
      if (portrait && !calm) tl.fromTo(portrait, { x: 0 }, { keyframes: { x: [0, -9, 8, -5, 3, 0] }, duration: at(0.35), ease: 'none' }, at(1.84));
      const dots = root.querySelectorAll('[data-splash]');
      if (dots.length) tl.fromTo(dots, { scale: 0, opacity: 0 }, { scale: 1, opacity: 0.9, duration: at(0.25), ease: BE.back, stagger: at(0.03) }, at(1.84));
    }
    const nameFit = root.querySelector<HTMLElement>('[data-el="name"] [data-fit]');
    if (nameFit) tl.fromTo(nameFit, { '--casl': 0 }, { '--casl': 0.7, duration: at(1.2), ease: 'power2.out' }, at(0.9));
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-award-char]'));
    restChars(chars);
    chars.forEach((c, i) => {
      tl.fromTo(c, { y: calm ? 60 : 240, opacity: 0 }, { y: 0, opacity: 1, duration: at(0.6), ease: BE.back }, at(0.7 + i * 0.08));
      tl.add(charAnim.cheer(c, { height: calm ? 12 : 34, spin: !calm && i % 2 === 0 }), at(1.9 + i * 0.08));
    });
    if (!calm) {
      tl.add(stageConfetti(root, { x: 60, y: 1100, angle: -62, spread: 18, velocity: 1750, count: 44, gravity: 1400 }), at(1.78));
      tl.add(stageConfetti(root, { x: 1860, y: 1100, angle: -118, spread: 18, velocity: 1750, count: 44, gravity: 1400 }), at(1.86));
    }
  });

  useIdle((root, { calm }) => {
    const anims: gsap.core.Animation[] = [];
    const rays = root.querySelector('[data-rays]');
    if (rays) anims.push(gsap.fromTo(rays, { rotation: 0 }, { rotation: 360, duration: calm ? 140 : 90, ease: 'none', repeat: -1 }));
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-award-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c));
    anims.push(...chars.flatMap((c, i) => charAnim.idle(c, { calm, seed: i * 3 })));
    if (chars.length) {
      let n = 0;
      const hop = gsap.timeline({ repeat: -1, repeatDelay: 2.6 });
      hop.call(() => {
        const c = chars[n++ % chars.length];
        if (c) charAnim.hop(c, { height: calm ? 8 : 20 });
      });
      anims.push(hop);
    }
    const trophy = root.querySelector('[data-trophy]');
    if (trophy) anims.push(gsap.fromTo(trophy, { y: 0, rotation: -2 }, { y: calm ? -5 : -12, rotation: 2, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    const glint = root.querySelector('[data-glint]');
    if (glint) anims.push(gsap.timeline({ repeat: -1, repeatDelay: 2.8, delay: 0.6 }).fromTo(glint, { scale: 0, rotation: -40, opacity: 0 }, { scale: 1, rotation: 20, opacity: 1, duration: 0.35, ease: BE.back }).to(glint, { scale: 0, rotation: 60, opacity: 0, duration: 0.4, ease: 'power2.in' }, '+=0.25'));
    const backShape = root.querySelector('[data-award-back]');
    if (backShape) anims.push(gsap.fromTo(backShape, { rotation: -3 }, { rotation: 4, duration: 5, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
    };
  });

  const size = podium ? 330 : 520;
  const photoBox = podium ? { x: 780, y: 440, w: 370, h: 370 } : { x: 160, y: 210, w: 570, h: 570 };
  const raysBox = podium ? { x: 460, y: 120, w: 1000, h: 1000 } : { x: -60, y: -30, w: 1000, h: 1000 };
  const stampBox = podium ? { x: 1000, y: 690, w: 340, h: 120 } : { x: 250, y: 690, w: 460, h: 160 };
  const trophyBox = podium ? { x: 1070, y: 452, w: 160, h: 160 } : { x: 570, y: 120, w: 220, h: 220 };
  const podiumBox = { x: 360, y: 790, w: 1200, h: 260 };
  const charSize = podium ? 128 : 112;
  const castBox = podium ? null : { x: 180, y: 900, w: cast.length * charSize + Math.max(0, cast.length - 1) * 18, h: charSize };
  // Podium: two characters on step 2 (left), the rest on step 3 (right).
  const podiumSpots = [
    { x: 400, y: 880 - charSize },
    { x: 570, y: 880 - charSize },
    { x: 1220, y: 930 - charSize },
    { x: 1390, y: 930 - charSize },
  ];
  const splash = [
    [-0.08, 0.1, 18],
    [1.04, -0.05, 14],
    [0.95, 1.12, 20],
    [0.1, 1.08, 12],
    [1.1, 0.62, 10],
  ] as const;

  return (
    <>
      <El id="rays" label="Rays" box={raysBox} enter="fade" order={0} locked lockAspect>
        <div data-rays="" style={{ width: '100%', height: '100%' }}>
          <Rays color={rayColor} />
        </div>
      </El>
      <El id="photo" label="Winner photo" box={photoBox} enter="fade" order={1} lockAspect morph={`person:${pid}:photo`}>
        <div style={{ position: 'relative' }}>
          <WinnerPortrait person={face} size={size} back={back} ring={ring} />
        </div>
      </El>
      {stamp ? (
        <El id="stamp" label="Stamp" box={stampBox} enter="fade" order={8} align="center" valign="center">
          <div data-stamp="" style={{ position: 'relative', rotate: '-12deg' }}>
            <span style={{ display: 'inline-block', border: `${podium ? 8 : 10}px solid ${stampColor}`, borderRadius: podium ? 20 : 26, padding: podium ? '4px 24px' : '6px 34px', color: stampColor, ...fontStyle('display', { weight: 1000, casl: 0.2, tracking: 0.08 }), fontSize: podium ? 64 : 88, lineHeight: 1.05, textTransform: 'uppercase', whiteSpace: 'nowrap', background: onAccent ? ctx.colors.accentHex : ink.cam ? PAPER : ctx.colors.dark ? 'rgba(14,17,22,0.35)' : 'rgba(255,255,255,0.55)' }}>{stamp}</span>
            {splash.map(([x, y, r], i) => (
              <span key={i} data-splash="" style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: r, height: r, borderRadius: '50%', background: stampColor }} />
            ))}
          </div>
        </El>
      ) : null}
      <El id="trophy" label="Trophy" box={trophyBox} enter="fade" order={6} lockAspect>
        <div data-trophy="" style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', background: PAPER, border: ctx.colors.dark && !onAccent ? undefined : `4px solid ${INK}`, boxSizing: 'border-box', boxShadow: onAccent ? `8px 8px 0 ${INK}` : `8px 8px 0 ${ctx.colors.accentHex}` }}>
          <div style={{ position: 'absolute', inset: '14%' }}>
            <Sticker name="trophy" />
          </div>
          <div data-glint="" style={{ position: 'absolute', right: '-6%', top: '-6%', width: '34%', height: '34%', opacity: 0 }}>
            <Sticker name="spark" />
          </div>
        </div>
      </El>
      <El id="eyebrow" label="Eyebrow" box={podium ? { x: 360, y: 92, w: 1200, h: 52 } : { x: 880, y: 248, w: 920, h: 56 }} align={podium ? 'center' : 'start'} enter="wipe" order={2}>
        <Eyebrow size={podium ? 28 : 32} shape="square" color={ink.fg} style={{ textShadow: ink.shadow }}>
          {eyebrow}
        </Eyebrow>
      </El>
      <El id="award" label="Award name" box={podium ? { x: 260, y: 150, w: 1400, h: 150 } : { x: 870, y: 318, w: 940, h: 290 }} align={podium ? 'center' : 'start'} enter="split-words" order={3}>
        <FitText max={podium ? 120 : 136} min={56} casl={0.9} lineHeight={0.92} valign={podium ? 'center' : 'end'} style={{ color: ink.fg, textShadow: ink.shadow }}>
          {award}
        </FitText>
      </El>
      <El id="name" label="Winner" box={podium ? { x: 360, y: 312, w: 1200, h: 84 } : { x: 876, y: 640, w: 930, h: 120 }} align={podium ? 'center' : 'start'} enter="split-words" order={5} morph={`person:${pid}:name`}>
        <FitText max={podium ? 76 : 96} min={40} casl={0.7} weight={900} lineHeight={0.95} valign="center" style={{ color: person ? accent : ink.fg2, textShadow: ink.shadow }}>
          {name}
        </FitText>
      </El>
      {role ? (
        <El id="role" label="Role" box={podium ? { x: 460, y: 398, w: 1000, h: 40 } : { x: 880, y: 772, w: 920, h: 56 }} align={podium ? 'center' : 'start'} enter="rise" order={6}>
          <FitText max={podium ? 30 : 38} min={20} font="body" weight={600} lineHeight={1.2} valign="center" style={{ color: ink.fg2, textShadow: ink.shadow }}>
            {role}
          </FitText>
        </El>
      ) : null}
      {reason && !podium ? (
        <El id="reason" label="Why" box={{ x: 880, y: 850, w: 920, h: 110 }} enter="rise" order={7}>
          <FitText max={40} min={22} font="body" weight={500} lineHeight={1.3} style={{ color: ink.fg, fontStyle: 'italic', textShadow: ink.shadow }}>
            {reason}
          </FitText>
        </El>
      ) : null}
      {podium ? (
        <El id="podium" label="Podium" box={podiumBox} enter="rise" order={1}>
          <Podium fill={ctx.colors.fg} text={ctx.background === 'transparent' ? PAPER : ctx.colors.bg} />
        </El>
      ) : null}
      {cast.length && castBox ? (
        <El id="cast" label="Characters" box={castBox} enter="fade" order={4} lockAspect>
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', height: '100%' }}>
            {cast.map((s) => (
              <div key={s} data-award-char="" style={{ width: charSize, height: charSize, flex: 'none' }}>
                <BumperCharacter shape={s as ShapeName} color={charColor(ctx, s as ShapeName)} mood="happy" lookX={0.7} lookY={-0.6} />
              </div>
            ))}
          </div>
        </El>
      ) : null}
      {podium
        ? cast.map((s, i) => (
            <El key={s} id={`char-${i}`} label={`Character ${i + 1}`} box={{ ...podiumSpots[i]!, w: charSize, h: charSize }} enter="fade" order={4} lockAspect>
              <div data-award-char="" style={{ width: '100%', height: '100%' }}>
                <BumperCharacter shape={s as ShapeName} color={charColor(ctx, s as ShapeName)} mood="happy" lookX={i < 2 ? 0.8 : -0.8} lookY={-0.6} />
              </div>
            </El>
          ))
        : null}
    </>
  );
}

export default defineTemplate({
  kind: 'awards',
  background: 'ink',
  variants: [
    { key: 'spotlight', label: 'Winner left, award right' },
    { key: 'podium', label: 'On the podium' },
  ],
  fields: [
    f.eyebrow('And the award goes to'),
    { key: 'award', label: 'Award', type: 'text', max: 100, default: 'Best question of the day' },
    { ...f.name(personName), placeholder: 'Pick a person or type a name' },
    f.role(personRole),
    { key: 'reason', label: 'Why they won', type: 'longtext', max: 160, default: '', placeholder: 'For asking what everyone was thinking.' },
    { key: 'stamp', label: 'Stamp', type: 'text', max: 16, default: 'Winner', group: 'options' },
  ],
  presets: [
    { key: 'best-question', label: 'Best question', description: 'For the question that made the room go "ooh".', slide: { fields: { award: 'Best question of the day' } } },
    { key: 'best-talk', label: 'Best talk', description: 'The talk everyone keeps quoting.', slide: { fields: { award: 'Talk of the day' } } },
    { key: 'best-paper', label: 'Paper of the month', description: 'For the paper that got everyone reading.', slide: { fields: { award: 'Paper of the month', stamp: 'Accepted' } } },
    { key: 'peoples-choice', label: "People's choice", description: 'Voted by the room.', slide: { fields: { award: "People's choice", eyebrow: 'The room has spoken' } } },
  ],
  sample: () => ({ fields: { reason: 'For asking what everyone was thinking.' } }),
  describe: (ctx) => {
    const who = ctx.text('name');
    return who ? `${ctx.text('award')}: ${who}` : ctx.text('award');
  },
  headline: (ctx) => ctx.text('stamp') || 'Winner',
  Render,
});
