'use client';

import { SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { useEnter, useIdle } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { firstName, manualPerson, teamPerson } from '../../engine/resolve';
import type { BumperPerson, ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandShape } from '../../parts/shapes';
import { Sticker } from '../../parts/stickers';
import { defineTemplate, f, useMascots } from '../kit';
import { charColor, Label, moves, PersonPortrait, useOpenCtx } from '../_tpl-open-kit';

/**
 * Your host: the portrait in their shape with an accent shape behind it, "Your host today", the
 * name loosening up, their role, and a little stage where a microphone stands and the crew bops
 * to a beat only they can hear. The person is the picked speaker or team member, else the
 * event's moderator, else a team member whose role says host or MC, else a typed name.
 */

/** Who hosts: the pick, the lineup's moderator, or a team member whose role says host or MC. */
function hostBase(ctx: ResolveCtx): BumperPerson | null {
  if (ctx.person) return ctx.person;
  const mod = ctx.lineup.find((p) => p.role === 'moderator');
  if (mod) return mod;
  const team = Object.values(ctx.data.team).find((t) => /\b(host|mc|emcee|moderator)\b/i.test(t.role ?? ''));
  return team ? teamPerson(team) : null;
}

function useHost(): BumperPerson | null {
  const { ctx } = useOpenCtx();
  const base = hostBase(ctx);
  const name = ctx.text('name');
  if (!base && !name) return null;
  const who = base ?? manualPerson(name);
  return { ...who, name: name || who.name, position: ctx.text('role') || null, organization: ctx.text('org') || null };
}

/** A microphone on a little stage, with the crew bopping on both sides. */
function MicStage({ cast, align }: { cast: ShapeName[]; align: 'start' | 'center' | 'end' }) {
  const { ctx } = useOpenCtx();
  const left = cast.filter((_, i) => i % 2 === 0);
  const right = cast.filter((_, i) => i % 2 === 1);
  const size = cast.length > 2 ? 104 : 136;
  const dieCut = ctx.colors.dark || ctx.background === 'accent';
  const char = (s: ShapeName, i: number) => (
    <div key={s} data-mc-char="" data-beat={i % 2} style={{ width: size, height: size, flex: 'none' }}>
      <BumperCharacter shape={s} mood={i % 2 ? 'happy' : 'idle'} color={charColor(ctx, s)} lookX={i % 2 ? -0.7 : 0.7} lookY={-0.3} name={`mc-${s}`} />
    </div>
  );
  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start', gap: 18 }}>
      {left.map((s, i) => char(s, i * 2))}
      <div
        data-mc-mic=""
        style={{
          width: 190,
          height: 220,
          flex: 'none',
          transformOrigin: '50% 100%',
          // Ink outlines vanish on dark and colored slides: give the mic a die-cut white edge, like a real sticker.
          filter: dieCut ? 'drop-shadow(5px 0 0 #ffffff) drop-shadow(-5px 0 0 #ffffff) drop-shadow(0 5px 0 #ffffff) drop-shadow(0 -5px 0 #ffffff)' : undefined,
        }}
      >
        <Sticker name="mic" />
      </div>
      {right.map((s, i) => char(s, i * 2 + 1))}
      <span data-mc-floor="" aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: -8, height: 8, borderRadius: 8, background: ctx.colors.fg, opacity: 0.85, transformOrigin: align === 'end' ? '100% 50%' : align === 'center' ? '50% 50%' : '0% 50%' }} />
    </div>
  );
}

function Render() {
  const { ctx } = useOpenCtx();
  const variant = ctx.slide.style.variant === 'right' ? 'right' : ctx.slide.style.variant === 'center' ? 'center' : 'left';
  const person = useHost();
  const shape: ShapeName = person?.shape ?? 'circle';
  const accentShape = SHAPE_ORDER[(SHAPE_ORDER.indexOf(shape) + 2) % 4]!;
  const cast = useMascots([accentShape, SHAPE_ORDER[(SHAPE_ORDER.indexOf(shape) + 3) % 4]!]);
  const pid = person?.id ?? null;
  const name = person?.name || ctx.text('placeholder');
  const meta = [ctx.text('role'), ctx.text('org')].filter(Boolean).join('  ·  ');
  const center = variant === 'center';
  const right = variant === 'right';

  useEnter((tl, root, { at, calm }) => {
    if (!moves(ctx)) return;
    const back = root.querySelector('[data-portrait-back]');
    const photo = root.querySelector('[data-portrait]');
    if (back) tl.fromTo(back, { scale: 0.2, rotation: -45, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: at(1.1), ease: BE.pop }, at(0.05));
    if (photo) tl.fromTo(photo, { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)', duration: at(1.05), ease: BE.inOut, clearProps: 'clipPath' }, at(0.2));
    const nameFit = root.querySelector<HTMLElement>('[data-el="name"] [data-fit]');
    if (nameFit) tl.fromTo(nameFit, { '--casl': 0 }, { '--casl': 0.9, duration: at(1.5), ease: 'power2.out' }, at(0.55));
    const floor = root.querySelector('[data-mc-floor]');
    if (floor) tl.fromTo(floor, { scaleX: 0 }, { scaleX: 1, duration: at(0.7), ease: BE.out }, at(0.7));
    const mic = root.querySelector('[data-mc-mic]');
    if (mic) {
      tl.fromTo(mic, { y: calm ? -120 : -420, rotation: calm ? -6 : -24, opacity: 0 }, { y: 0, rotation: 0, opacity: 1, duration: at(0.8), ease: 'bounce.out' }, at(0.9));
      if (!calm) tl.to(mic, { keyframes: { rotation: [-8, 6, -3, 0] }, duration: at(0.6), ease: 'power1.inOut' }, at(1.7));
    }
    root.querySelectorAll<HTMLElement>('[data-mc-char]').forEach((c, i) => {
      const from = (Number(c.dataset.beat) ? 1 : -1) * (calm ? 120 : 360);
      tl.fromTo(c, { x: from, opacity: 0 }, { x: 0, opacity: 1, duration: at(0.8), ease: 'power3.out' }, at(1.1 + i * 0.1));
      tl.add(charAnim.hop(c, { height: calm ? 10 : 24 }), at(1.9 + i * 0.1));
    });
  });

  useIdle((root, { calm }) => {
    const anims: gsap.core.Animation[] = [];
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-mc-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c));
    // The crew bops on alternate beats (a squash and a little hop every 0.7 s, well under 3 a second).
    chars.forEach((c, i) => {
      const body = c.querySelector('.bc-body');
      const jump = c.querySelector('.bc-jump');
      if (!body || !jump) return;
      const beat = gsap.timeline({ repeat: -1, delay: (Number(c.dataset.beat) || 0) * 0.35 + i * 0.05 });
      const k = calm ? 0.5 : 1;
      beat
        .to(body, { scaleX: 1 + 0.12 * k, scaleY: 1 - 0.14 * k, duration: 0.12, ease: 'power2.out' })
        .to(jump, { y: -14 * k, duration: 0.2, ease: 'power2.out' })
        .to(body, { scaleX: 1, scaleY: 1, duration: 0.2, ease: 'power2.out' }, '<')
        .to(jump, { y: 0, duration: 0.18, ease: 'power2.in' })
        .to({}, { duration: 0.7 });
      anims.push(beat);
    });
    const mic = root.querySelector('[data-mc-mic]');
    if (mic) anims.push(gsap.fromTo(mic, { rotation: -2 }, { rotation: 2, duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    const back = root.querySelector('[data-portrait-back]');
    if (back) anims.push(gsap.fromTo(back, { rotation: 0 }, { rotation: calm ? 3 : 7, duration: 5.5, ease: 'sine.inOut', yoyo: true, repeat: -1, transformOrigin: '50% 50%' }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
      chars.forEach((c) => {
        const body = c.querySelector('.bc-body');
        const jump = c.querySelector('.bc-jump');
        if (body) gsap.set(body, { scaleX: 1, scaleY: 1 });
        if (jump) gsap.set(jump, { y: 0 });
      });
    };
  });

  const photoSize = center ? 360 : 600;
  const photoBox = center ? { x: 760, y: 96, w: 400, h: 400 } : right ? { x: 1160, y: 200, w: 660, h: 660 } : { x: 120, y: 200, w: 660, h: 660 };
  const textX = center ? 160 : right ? 124 : 860;
  const textW = center ? 1600 : 940;
  const align = center ? 'center' : 'start';
  const stageBox = center ? { x: 1320, y: 780, w: 480, h: 230 } : { x: textX, y: 752, w: 700, h: 230 };

  return (
    <>
      <El id="photo" label="Photo" box={photoBox} enter={person ? 'fade' : 'pop'} lockAspect morph={pid ? `person:${pid}:photo` : null}>
        {person ? (
          <PersonPortrait person={person} size={photoSize} shape={shape} />
        ) : (
          <div style={{ width: photoSize, height: photoSize, opacity: 0.22 }}>
            <BrandShape shape="circle" color={ctx.colors.fg} />
          </div>
        )}
      </El>
      <El id="eyebrow" label="Eyebrow" box={{ x: textX, y: center ? 530 : 250, w: textW, h: 48 }} align={align} enter="wipe" order={1}>
        <Label color={ctx.colors.fg} bullet={ctx.background === 'accent' ? ctx.colors.onAccent : ctx.colors.accentHex} size={32}>
          {ctx.text('eyebrow')}
        </Label>
      </El>
      <El id="name" label="Name" box={{ x: textX - 6, y: center ? 592 : 316, w: textW, h: center ? 190 : 300 }} align={align} enter="split-words" order={2} morph={pid ? `person:${pid}:name` : null}>
        <FitText max={center ? 160 : 176} min={60} casl={0} lineHeight={0.9} valign={center ? 'center' : 'end'} style={{ color: person ? ctx.colors.fg : ctx.colors.fg2 }}>
          {name}
        </FitText>
      </El>
      {meta ? (
        <El id="meta" label="Role" box={{ x: textX, y: center ? 790 : 636, w: center ? 1600 : 940, h: center ? 60 : 90 }} align={align} enter="rise" order={4}>
          <FitText max={42} min={24} font="body" weight={600} lineHeight={1.25} style={{ color: ctx.colors.fg2 }}>
            {meta}
          </FitText>
        </El>
      ) : null}
      <El id="stage" label="Mic and crew" box={stageBox} align={center ? 'end' : 'start'} enter="fade" order={3}>
        <MicStage cast={cast} align={center ? 'end' : 'start'} />
      </El>
    </>
  );
}

export default defineTemplate({
  kind: 'mc',
  background: 'paper',
  variants: [
    { key: 'left', label: 'Photo left' },
    { key: 'right', label: 'Photo right' },
    { key: 'center', label: 'Centered' },
  ],
  fields: [
    f.eyebrow('Your host today'),
    f.name((ctx) => hostBase(ctx)?.name ?? ''),
    f.role((ctx) => {
      const p = hostBase(ctx);
      return p?.kind === 'team' ? (p.role ?? '') : (p?.position ?? p?.headline ?? '');
    }),
    f.org((ctx) => hostBase(ctx)?.organization ?? ''),
    { key: 'placeholder', label: 'Without a host', type: 'text', max: 60, default: 'Your friendly host', group: 'options' },
  ],
  describe: (ctx) => (ctx.text('name') ? `Host: ${ctx.text('name')}` : 'Your host'),
  headline: (ctx) => (ctx.text('name') ? firstName(ctx.text('name')) : 'Your host'),
  Render,
});
