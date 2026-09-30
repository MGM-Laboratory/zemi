'use client';

import { SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { useState, type ReactNode } from 'react';
import { useBumperNow } from '../../engine/clock';
import { useEnter, useIdle } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { INK } from '../../engine/palette';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim, type CharMood } from '../../parts/character';
import { stageConfetti } from '../../parts/confetti';
import { Sticker, STICKERS } from '../../parts/stickers';
import { defineTemplate, useMascots } from '../kit';
import { accentFill, charColor, Label, moves, ProgressRing, softFill, useOpenCtx } from '../_tpl-open-kit';

/**
 * A moment: an icon in a soft halo, a title and a line. Prayer, the national anthem and a
 * minute of silence are calm (slow fades, closed or still eyes, an optional one-minute ring);
 * a round of applause brings confetti and the crew clapping in little bursts; an ice breaker has
 * two of them hopping back and forth like they are chatting.
 */

type Moment = 'prayer' | 'anthem' | 'silence' | 'applause' | 'icebreaker' | 'custom';

interface MomentDef {
  label: string;
  icon: string;
  eyebrow: string;
  /** Eyebrow used instead when the title already says the same thing. */
  altEyebrow: string;
  title: string;
  line: string;
  mood: CharMood;
  calm: boolean;
}

const MOMENTS: Record<Moment, MomentDef> = {
  prayer: { label: 'Opening prayer', icon: 'candle', eyebrow: 'A quiet moment', altEyebrow: 'Before we begin', title: 'Opening prayer', line: "Let's pray, each in our own way.", mood: 'closed', calm: true },
  anthem: { label: 'National anthem', icon: 'merah-putih', eyebrow: 'National anthem', altEyebrow: 'Please rise', title: 'Indonesia Raya', line: 'Please rise for Indonesia Raya.', mood: 'idle', calm: true },
  silence: { label: 'A minute of silence', icon: 'hourglass', eyebrow: 'Together', altEyebrow: 'A quiet moment', title: 'A minute of silence', line: "Let's take a quiet moment together.", mood: 'closed', calm: true },
  applause: { label: 'A round of applause', icon: 'popper', eyebrow: 'Make some noise', altEyebrow: 'Hands up', title: 'A round of applause', line: 'For everyone who made today happen.', mood: 'happy', calm: false },
  icebreaker: { label: 'Ice breaker', icon: 'chat', eyebrow: 'Ice breaker', altEyebrow: 'Warm up', title: 'Say hi to a stranger', line: "Turn to someone you haven't met yet. Two minutes, go.", mood: 'happy', calm: false },
  custom: { label: 'Something else', icon: 'spark', eyebrow: 'A moment', altEyebrow: 'Together', title: 'A moment', line: '', mood: 'happy', calm: true },
};

/** Words that give the moment away when a slide arrives without one (a generator or a typed label). */
const INFER: Array<[RegExp, Moment]> = [
  [/prayer|pray|doa/i, 'prayer'],
  [/anthem|indonesia raya|kebangsaan/i, 'anthem'],
  [/silence|hening/i, 'silence'],
  [/applause|tepuk/i, 'applause'],
  [/ice ?breaker/i, 'icebreaker'],
];

/** The moment: the field, the generator's `preset` field, else a guess from the label or title. */
function momentOf(ctx: ResolveCtx): Moment {
  for (const v of [ctx.slide.fields.moment, ctx.slide.fields.preset]) {
    if (typeof v === 'string' && v in MOMENTS) return v as Moment;
  }
  const hint = [ctx.slide.label, ctx.slide.fields.title].filter((x) => typeof x === 'string').join(' ');
  return INFER.find(([re]) => re.test(hint))?.[1] ?? 'custom';
}

/** Default eyebrow, never a repeat of the title (a generated "National anthem" title keeps "Please rise" above it). */
function eyebrowOf(ctx: ResolveCtx): string {
  const def = MOMENTS[momentOf(ctx)];
  const title = ctx.text('title').trim().toLowerCase();
  return title === def.eyebrow.toLowerCase() ? def.altEyebrow : def.eyebrow;
}

/** Default line: the generator writes it as `body`, the inspector as `line`. */
function lineOf(ctx: ResolveCtx): string {
  const body = ctx.slide.fields.body;
  return typeof body === 'string' && body.trim() ? body : MOMENTS[momentOf(ctx)].line;
}

const S = { stroke: INK, strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/** Icons the sticker set does not have, drawn in the same style (64 grid, ink outline, brand fills). */
const EXTRA_ICONS: Record<string, { label: string; draw: ReactNode }> = {
  candle: {
    label: 'Candle',
    draw: (
      <>
        <path data-cm-flame="" d="M32 6c6 7 8 11 8 14.5a8 8 0 0 1-16 0C24 17 26 13 32 6Z" fill="#f7bf33" {...S} style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }} />
        <path d="M32 14c2.4 3.4 3.4 5.6 3.4 7.2a3.4 3.4 0 0 1-6.8 0c0-1.6 1-3.8 3.4-7.2Z" fill="#f94141" />
        <path d="M32 28v4" {...S} />
        <rect x="23" y="32" width="18" height="24" rx="3" fill="#ffffff" {...S} />
        <path d="M14 58h36" {...S} />
      </>
    ),
  },
  'merah-putih': {
    label: 'Merah Putih',
    draw: (
      <>
        <path d="M14 60V6" {...S} />
        <g data-cm-flag="" style={{ transformBox: 'fill-box', transformOrigin: '0% 50%' }}>
          <path d="M14 9c10-3 18 3 28 0s10-2 12-2v16c-2 0-4-1-12 2s-18-3-28 0Z" fill="#f94141" {...S} />
          <path d="M14 25c10-3 18 3 28 0s10-2 12-2v16c-2 0-4-1-12 2s-18-3-28 0Z" fill="#ffffff" {...S} />
        </g>
      </>
    ),
  },
  hourglass: {
    label: 'Hourglass',
    draw: (
      <>
        <path d="M16 7h32M16 57h32" {...S} />
        <path d="M20 7c0 14 12 17 12 25S20 43 20 57h24c0-14-12-17-12-25s12-11 12-25Z" fill="#ffffff" {...S} />
        <path d="M26 14h12c-1.4 4-4 6.6-6 7.6-2-1-4.6-3.6-6-7.6Z" fill="#f7bf33" />
        <path d="M24.6 52c2-5.4 5-7.6 7.4-8.6 2.4 1 5.4 3.2 7.4 8.6Z" fill="#f7bf33" />
      </>
    ),
  },
  popper: {
    label: 'Party popper',
    draw: (
      <>
        <path d="M8 58 20 24l20 20Z" fill="#f7bf33" {...S} />
        <path d="M14 42l8 8M17 33l14 14" {...S} />
        <path d="M30 20q1-9 10-10M42 30q9-1 12 5M36 22l8-8" fill="none" {...S} />
        <circle cx="50" cy="12" r="3.4" fill="#3a6dc5" />
        <rect x="52" y="22" width="6" height="6" rx="1.5" fill="#f94141" transform="rotate(20 55 25)" />
        <path d="M44 44l4-7 4 7Z" fill="#0f8657" />
        <circle cx="28" cy="10" r="2.6" fill="#f94141" />
      </>
    ),
  },
};

const ICON_KEYS = [...Object.keys(EXTRA_ICONS), ...Object.keys(STICKERS)];

function Icon({ name }: { name: string }) {
  const extra = EXTRA_ICONS[name];
  if (!extra) return <Sticker name={name} />;
  return (
    <svg viewBox="0 0 64 64" style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }} aria-hidden="true">
      {extra.draw}
    </svg>
  );
}

/** The one-minute ring around the halo (silence), counted from when the bumper shows up. */
function SilenceRing({ seconds, size, color, track }: { seconds: number; size: number; color: string; track: string }) {
  const { ctx, live } = useOpenCtx();
  const [mounted] = useState(() => ctx.now());
  // The server's "on screen since" keeps the ring identical on the room screen and in OBS.
  const start = ctx.liveSince() ?? mounted;
  const now = useBumperNow(1000, live);
  const left = Math.max(0, seconds * 1000 - ((live ? now : start) - start));
  const frac = Math.round((left / (seconds * 1000)) * 1000) / 1000;
  return <ProgressRing frac={frac} size={size} stroke={12} color={color} track={track} />;
}

function Render() {
  const { ctx } = useOpenCtx();
  const side = ctx.slide.style.variant === 'side';
  const moment = momentOf(ctx);
  const def = MOMENTS[moment];
  const calmMoment = def.calm;
  const cast = useMascots([...SHAPE_ORDER]);
  const icon = ctx.text('icon') || def.icon;
  const line = ctx.text('line');
  const timer = moment === 'silence' && ctx.flag('timer', true);
  const seconds = Math.max(5, ctx.num('seconds', 60));
  const halo = softFill(ctx);

  useEnter((tl, root, { at, calm }) => {
    if (!moves(ctx)) return;
    const soft = calm || calmMoment;
    const t = (s: number) => at(soft ? s * 1.35 : s);
    const haloEl = root.querySelector('[data-cm-halo]');
    if (haloEl) tl.fromTo(haloEl, { scale: soft ? 0.85 : 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: t(soft ? 1.3 : 0.9), ease: soft ? BE.out : BE.pop }, t(0));
    const iconEl = root.querySelector('[data-cm-icon]');
    if (iconEl) tl.fromTo(iconEl, { scale: soft ? 0.9 : 0.2, rotation: soft ? 0 : -30, opacity: 0, y: soft ? 16 : 0 }, { scale: 1, rotation: 0, opacity: 1, y: 0, duration: t(soft ? 1.2 : 0.8), ease: soft ? BE.out : BE.back }, t(0.25));
    const ring = root.querySelector('[data-cm-ring]');
    if (ring) tl.fromTo(ring, { rotation: -90, opacity: 0 }, { rotation: 0, opacity: 1, duration: t(1.2), ease: BE.out }, t(0.4));
    const titleFit = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleFit) tl.fromTo(titleFit, { '--casl': 0 }, { '--casl': soft ? 0.35 : 1, duration: t(1.6), ease: 'power2.out' }, t(0.5));
    root.querySelectorAll<HTMLElement>('[data-cm-char]').forEach((c, i) => {
      tl.fromTo(c, { y: soft ? 50 : 200, opacity: 0 }, { y: 0, opacity: 1, duration: t(soft ? 1.0 : 0.7), ease: soft ? BE.out : BE.back }, t(0.9 + i * 0.12));
      if (!soft) tl.add(charAnim.cheer(c, { height: 30, spin: i % 2 === 0 }), t(1.6 + i * 0.08));
    });
    if (moment === 'applause' && !calm && ctx.theme.mascots) {
      tl.add(stageConfetti(root, { x: 560, y: 900, angle: -70, spread: 30, count: 34, velocity: 1500 }), t(1.3));
      tl.add(stageConfetti(root, { x: 1360, y: 900, angle: -110, spread: 30, count: 34, velocity: 1500 }), t(1.4));
    }
  });

  useIdle((root, { calm }) => {
    const anims: gsap.core.Animation[] = [];
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-cm-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c, calmMoment ? { min: 3.5, max: 7 } : undefined));
    const soft = calm || calmMoment;
    if (moment !== 'anthem') chars.forEach((c, i) => anims.push(...charAnim.idle(c, { calm: soft, seed: i * 3 })));
    const haloEl = root.querySelector('[data-cm-halo]');
    if (haloEl) anims.push(gsap.fromTo(haloEl, { scale: 1 }, { scale: soft ? 1.04 : 1.07, duration: soft ? 3.2 : 1.8, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    const flame = root.querySelector('[data-cm-flame]');
    if (flame) anims.push(gsap.fromTo(flame, { scaleY: 1, skewX: 0 }, { scaleY: 1.08, skewX: 3, duration: 1.1, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    const flag = root.querySelector('[data-cm-flag]');
    if (flag) anims.push(gsap.fromTo(flag, { skewY: -2, scaleX: 1 }, { skewY: 2, scaleX: 0.96, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    const iconEl = root.querySelector('[data-cm-icon]');
    if (iconEl && !soft) anims.push(gsap.fromTo(iconEl, { rotation: -5 }, { rotation: 5, duration: 1.3, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    if (moment === 'applause') {
      // Claps in bursts: three quick squashes (2.5 a second), then a breather.
      chars.forEach((c, i) => {
        const body = c.querySelector('.bc-body');
        if (!body) return;
        const burst = gsap.timeline({ repeat: -1, repeatDelay: soft ? 2.4 : 1.3, delay: i * 0.12 });
        for (let k = 0; k < 3; k++) burst.to(body, { scaleX: 1.14, scaleY: 0.84, duration: 0.12, ease: 'power2.out' }).to(body, { scaleX: 1, scaleY: 1, duration: 0.28, ease: 'power2.out' });
        anims.push(burst);
      });
      if (!calm && ctx.theme.mascots) {
        const pop = gsap.delayedCall(6, function again() {
          stageConfetti(root, { x: 960, y: 1000, angle: -90, spread: 40, count: 30, velocity: 1400 });
          pop.restart(true);
        });
        anims.push(pop);
      }
    }
    if (moment === 'icebreaker' && chars.length >= 2) {
      const a = chars[0]!;
      const b = chars[chars.length - 1]!;
      const chat = gsap.timeline({ repeat: -1, repeatDelay: 0.6 });
      chat.add(charAnim.look(a, 1, 0, 0.3), 0).add(charAnim.look(b, -1, 0, 0.3), 0).add(charAnim.hop(a, { height: 14 }), 0.4).add(charAnim.hop(b, { height: 14 }), 1.2).add(charAnim.hop(a, { height: 10 }), 2.0).add(charAnim.hop(b, { height: 18 }), 2.6);
      anims.push(chat);
    }
    return () => {
      stops.forEach((s) => s());
      anims.forEach((x) => x.kill());
      chars.forEach((c) => {
        const body = c.querySelector('.bc-body');
        if (body) gsap.set(body, { scaleX: 1, scaleY: 1 });
      });
    };
  });

  const haloSize = side ? 520 : 340;
  const haloBox = side ? { x: 180, y: 250, w: 560, h: 560 } : { x: 780, y: 100, w: 360, h: 360 };
  const iconSize = haloSize * 0.56;
  const castSize = cast.length > 2 ? 108 : 140;
  const mood = def.mood;
  const lookX = (i: number) => (moment === 'icebreaker' ? (i === 0 ? 1 : i === cast.length - 1 ? -1 : 0) : 0);

  return (
    <>
      <El id="icon" label="Icon" box={haloBox} enter="fade" order={0} lockAspect>
        <div style={{ position: 'absolute', inset: (haloBox.w - haloSize) / 2 }}>
          <div data-cm-halo="" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: halo }} />
          {timer ? (
            <div data-cm-ring="" style={{ position: 'absolute', inset: -22 }}>
              <SilenceRing seconds={seconds} size={haloSize + 44} color={accentFill(ctx)} track={ctx.colors.dark ? '#ffffff1f' : ctx.background === 'accent' ? '#ffffff38' : '#e4e7ed'} />
            </div>
          ) : null}
          <div data-cm-icon="" style={{ position: 'absolute', left: (haloSize - iconSize) / 2, top: (haloSize - iconSize) / 2, width: iconSize, height: iconSize }}>
            {ctx.colors.dark || ctx.background === 'accent' ? <span aria-hidden="true" style={{ position: 'absolute', inset: -iconSize * 0.12, borderRadius: '50%', background: '#ffffff' }} /> : null}
            <div style={{ position: 'absolute', inset: ctx.colors.dark || ctx.background === 'accent' ? iconSize * 0.06 : 0 }}>
              <Icon name={icon} />
            </div>
          </div>
        </div>
      </El>
      <El id="eyebrow" label="Eyebrow" box={side ? { x: 860, y: 300, w: 940, h: 44 } : { x: 360, y: 476, w: 1200, h: 44 }} align={side ? 'start' : 'center'} enter="fade" order={1}>
        <Label color={ctx.colors.fg2} bullet={accentFill(ctx)} size={30}>
          {ctx.text('eyebrow')}
        </Label>
      </El>
      <El id="title" label="Title" box={side ? { x: 854, y: 356, w: 950, h: 330 } : { x: 160, y: 530, w: 1600, h: 180 }} align={side ? 'start' : 'center'} enter={calmMoment ? 'rise' : 'split-words'} order={2}>
        <FitText max={side ? 150 : 156} min={60} casl={0} lineHeight={0.92} valign={side ? 'end' : 'center'}>
          {ctx.text('title')}
        </FitText>
      </El>
      {line ? (
        <El id="line" label="Line" box={side ? { x: 860, y: 712, w: 940, h: 120 } : { x: 260, y: 728, w: 1400, h: 72 }} align={side ? 'start' : 'center'} enter="rise" order={4}>
          <FitText max={48} min={26} font="body" weight={500} lineHeight={1.25} valign={side ? 'start' : 'center'} style={{ color: ctx.colors.fg2 }}>
            {line}
          </FitText>
        </El>
      ) : null}
      {cast.length ? (
        <El id="cast" label="Characters" box={side ? { x: 1180, y: 860, w: 620, h: castSize + 10 } : { x: 560, y: 1000 - castSize - 16, w: 800, h: castSize + 10 }} align={side ? 'end' : 'center'} enter="fade" order={5} lockAspect>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: side ? 'flex-end' : 'center', gap: moment === 'icebreaker' ? 60 : 24, height: '100%' }}>
            {cast.map((s: ShapeName, i) => (
              <div key={s} data-cm-char="" style={{ width: castSize, height: castSize }}>
                <BumperCharacter shape={s} mood={mood} color={charColor(ctx, s)} lookX={lookX(i)} lookY={moment === 'anthem' ? -0.6 : 0} name={`moment-${s}`} />
              </div>
            ))}
          </div>
        </El>
      ) : null}
    </>
  );
}

const MOMENT_OPTIONS = (Object.keys(MOMENTS) as Moment[]).map((k) => ({ value: k, label: MOMENTS[k].label }));

export default defineTemplate({
  kind: 'ceremony',
  background: 'paper',
  variants: [
    { key: 'center', label: 'Centered' },
    { key: 'side', label: 'Icon left', hint: 'A big halo on the left, the words on the right.' },
  ],
  presets: [
    { key: 'prayer', label: 'Opening prayer', description: "Let's pray, each in our own way.", slide: { fields: { moment: 'prayer' } } },
    { key: 'anthem', label: 'National anthem', description: 'Please rise for Indonesia Raya.', slide: { fields: { moment: 'anthem' } } },
    { key: 'silence', label: 'A minute of silence', description: 'With a gentle one-minute ring.', slide: { fields: { moment: 'silence' } } },
    { key: 'applause', label: 'A round of applause', description: 'Confetti and a clapping crew.', slide: { fields: { moment: 'applause' } } },
    { key: 'icebreaker', label: 'Ice breaker', description: 'Say hi to someone new.', slide: { fields: { moment: 'icebreaker' } } },
  ],
  fields: [
    { key: 'moment', label: 'Moment', type: 'select', default: (ctx) => momentOf(ctx), options: MOMENT_OPTIONS },
    { key: 'eyebrow', label: 'Eyebrow', type: 'text', max: 80, default: eyebrowOf },
    { key: 'title', label: 'Title', type: 'text', max: 120, default: (ctx) => MOMENTS[momentOf(ctx)].title },
    { key: 'line', label: 'Line', type: 'longtext', max: 200, default: lineOf },
    { key: 'icon', label: 'Icon', type: 'select', default: (ctx) => MOMENTS[momentOf(ctx)].icon, options: ICON_KEYS.map((k) => ({ value: k, label: EXTRA_ICONS[k]?.label ?? STICKERS[k]?.label ?? k })), group: 'options' },
    { key: 'timer', label: 'Show the one-minute ring (silence)', type: 'toggle', default: true, group: 'options' },
    { key: 'seconds', label: 'Ring length (seconds)', type: 'number', default: 60, min: 5, max: 600, group: 'options' },
  ],
  describe: (ctx) => ctx.text('title') || MOMENTS[momentOf(ctx)].label,
  headline: (ctx) => ctx.text('title') || 'A moment',
  sample: () => ({ fields: { moment: 'applause' } }),
  Render,
});
