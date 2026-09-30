'use client';

import { SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { useEnter, useIdle } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { firstName, manualPerson } from '../../engine/resolve';
import type { BumperPerson, ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandShape } from '../../parts/shapes';
import { defineTemplate, f, useMascots } from '../kit';
import { accentFill, charColor, Label, moves, PersonPortrait, useOpenCtx } from '../_tpl-open-kit';

/**
 * Opening remarks: dignified and roomy. "Opening remarks by", the name, their position, and an
 * accent underline that draws itself in slowly. The four characters sit in the front row,
 * politely, blinking. Everything moves slower here. The person is the pick, else whoever the
 * rundown gives the opening to, else the first keynote.
 */

const OPENING_RE = /opening|remarks|sambutan|welcome speech/i;

function openerBase(ctx: ResolveCtx): BumperPerson | null {
  if (ctx.person) return ctx.person;
  const item = ctx.rundown.find((r) => OPENING_RE.test(r.agenda) && r.speaker);
  if (item?.speaker) return item.speaker;
  return ctx.lineup.find((p) => p.role === 'keynote') ?? null;
}

function useOpener(): BumperPerson | null {
  const { ctx } = useOpenCtx();
  const base = openerBase(ctx);
  const name = ctx.text('name');
  if (!base && !name) return null;
  const who = base ?? manualPerson(name);
  return { ...who, name: name || who.name, position: ctx.text('role') || null, organization: ctx.text('org') || null };
}

/** A hand-drawn underline (drawn in with DrawSVG). */
function Underline({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 600 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }} aria-hidden="true">
      <path data-op-line="" data-draw="" d="M6 26 C 120 12, 260 10, 380 16 S 560 26, 594 14" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
    </svg>
  );
}

function FrontRow({ cast }: { cast: ShapeName[] }) {
  const { ctx } = useOpenCtx();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 26, height: '100%' }}>
      {cast.map((s, i) => (
        <div key={s} data-op-char="" style={{ width: 92, height: 92 }}>
          <BumperCharacter shape={s} mood="idle" color={charColor(ctx, s)} lookY={-0.9} lookX={(i - (cast.length - 1) / 2) * -0.25} name={`opening-${s}`} />
        </div>
      ))}
    </div>
  );
}

function Render() {
  const { ctx } = useOpenCtx();
  const side = ctx.slide.style.variant === 'side';
  const person = useOpener();
  const cast = useMascots([...SHAPE_ORDER]);
  const pid = person?.id ?? null;
  const name = person?.name || ctx.text('placeholder');
  const meta = [ctx.text('role'), ctx.text('org')].filter(Boolean).join('  ·  ');
  const line = accentFill(ctx);

  useEnter((tl, root, { at, calm }) => {
    if (!moves(ctx)) return;
    // Everything is a little slower and softer here.
    const slow = (t: number) => at(t * 1.35);
    const back = root.querySelector('[data-portrait-back]');
    const photo = root.querySelector('[data-portrait]');
    if (back) tl.fromTo(back, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: slow(1.2), ease: BE.out }, slow(0.1));
    if (photo) tl.fromTo(photo, { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)', duration: slow(1.3), ease: BE.inOut, clearProps: 'clipPath' }, slow(0.15));
    const avatar = root.querySelector('[data-op-avatar]');
    if (avatar) tl.fromTo(avatar, { scale: 0.8, opacity: 0, y: 20 }, { scale: 1, opacity: 1, y: 0, duration: slow(1.1), ease: BE.out }, slow(0.05));
    const nameFit = root.querySelector<HTMLElement>('[data-el="name"] [data-fit]');
    if (nameFit) tl.fromTo(nameFit, { '--casl': 0 }, { '--casl': 0.45, duration: slow(2.2), ease: 'power1.out' }, slow(0.6));
    const ul = root.querySelector('[data-op-line]');
    if (ul) tl.fromTo(ul, { drawSVG: '0%' }, { drawSVG: '100%', duration: slow(1.4), ease: BE.inOut }, slow(1.0));
    root.querySelectorAll<HTMLElement>('[data-op-char]').forEach((c, i) => {
      tl.fromTo(c, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: slow(0.9), ease: BE.out }, slow(1.3 + i * 0.12));
      if (!calm) tl.add(charAnim.look(c, 0, -0.9, 0.5), slow(1.8 + i * 0.1));
    });
  });

  useIdle((root, { calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-op-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c, { min: 3, max: 7 }));
    const anims: gsap.core.Animation[] = chars.flatMap((c, i) => charAnim.idle(c, { calm: true, seed: i * 2 }));
    // Once in a while the front row nods along, one after the other.
    const nod = gsap.timeline({ repeat: -1, repeatDelay: calm ? 9 : 6, delay: 4 });
    chars.forEach((c, i) => {
      const body = c.querySelector('.bc-body');
      if (body) nod.to(body, { scaleY: 0.93, scaleX: 1.04, duration: 0.35, ease: 'sine.inOut', yoyo: true, repeat: 1 }, i * 0.25);
    });
    anims.push(nod);
    const back = root.querySelector('[data-portrait-back]');
    if (back) anims.push(gsap.fromTo(back, { rotation: 0 }, { rotation: 4, duration: 8, ease: 'sine.inOut', yoyo: true, repeat: -1, transformOrigin: '50% 50%' }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
    };
  });

  if (side) {
    return (
      <>
        <El id="photo" label="Photo" box={{ x: 150, y: 210, w: 580, h: 580 }} enter="fade" lockAspect morph={pid ? `person:${pid}:photo` : null}>
          {person ? (
            <PersonPortrait person={person} size={520} />
          ) : (
            <div style={{ width: 520, height: 520, opacity: 0.2 }}>
              <BrandShape shape="arch" color={ctx.colors.fg} />
            </div>
          )}
        </El>
        <El id="eyebrow" label="Eyebrow" box={{ x: 880, y: 330, w: 900, h: 44 }} enter="fade" order={1}>
          <Label color={ctx.colors.fg2} bullet={line} size={30}>
            {ctx.text('eyebrow')}
          </Label>
        </El>
        <El id="name" label="Name" box={{ x: 874, y: 390, w: 920, h: 250 }} enter="rise" order={3} morph={pid ? `person:${pid}:name` : null}>
          <FitText max={140} min={56} casl={0} weight={850} lineHeight={0.95} valign="end" style={{ color: person ? ctx.colors.fg : ctx.colors.fg2 }}>
            {name}
          </FitText>
        </El>
        <El id="underline" label="Underline" box={{ x: 880, y: 662, w: 520, h: 40 }} enter="fade" order={4}>
          <Underline color={line} />
        </El>
        {meta ? (
          <El id="meta" label="Position" box={{ x: 880, y: 730, w: 900, h: 110 }} enter="rise" order={6}>
            <FitText max={42} min={24} font="body" weight={500} lineHeight={1.3} style={{ color: ctx.colors.fg2 }}>
              {meta}
            </FitText>
          </El>
        ) : null}
        {cast.length ? (
          <El id="cast" label="Front row" box={{ x: 1300, y: 880, w: 500, h: 110 }} align="end" enter="fade" order={7} lockAspect>
            <FrontRow cast={cast} />
          </El>
        ) : null}
      </>
    );
  }

  return (
    <>
      <El id="photo" label="Photo" box={{ x: 850, y: 150, w: 220, h: 220 }} enter="fade" lockAspect morph={pid ? `person:${pid}:photo` : null}>
        <div data-op-avatar="" style={{ width: 220, height: 220 }}>
          {person ? <PersonPortrait person={person} size={220} back={false} /> : <BrandShape shape="arch" color={ctx.colors.fg} style={{ opacity: 0.2 }} />}
        </div>
      </El>
      <El id="eyebrow" label="Eyebrow" box={{ x: 360, y: 424, w: 1200, h: 44 }} align="center" enter="fade" order={1}>
        <Label color={ctx.colors.fg2} bullet={line} size={30}>
          {ctx.text('eyebrow')}
        </Label>
      </El>
      <El id="name" label="Name" box={{ x: 160, y: 484, w: 1600, h: 170 }} align="center" enter="rise" order={3} morph={pid ? `person:${pid}:name` : null}>
        <FitText max={148} min={60} casl={0} weight={850} lineHeight={0.95} valign="center" style={{ color: person ? ctx.colors.fg : ctx.colors.fg2 }}>
          {name}
        </FitText>
      </El>
      <El id="underline" label="Underline" box={{ x: 700, y: 668, w: 520, h: 40 }} align="center" enter="fade" order={4}>
        <Underline color={line} />
      </El>
      {meta ? (
        <El id="meta" label="Position" box={{ x: 260, y: 736, w: 1400, h: 60 }} align="center" enter="rise" order={6}>
          <FitText max={42} min={24} font="body" weight={500} lineHeight={1.3} valign="center" style={{ color: ctx.colors.fg2 }}>
            {meta}
          </FitText>
        </El>
      ) : null}
      {cast.length ? (
        <El id="cast" label="Front row" box={{ x: 660, y: 872, w: 600, h: 110 }} align="center" enter="fade" order={7} lockAspect>
          <FrontRow cast={cast} />
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'opening',
  background: 'paper',
  variants: [
    { key: 'center', label: 'Centered' },
    { key: 'side', label: 'Photo left', hint: 'A bigger portrait with lots of room around the name.' },
  ],
  fields: [
    f.eyebrow('Opening remarks by'),
    f.name((ctx) => openerBase(ctx)?.name ?? ''),
    f.role((ctx) => {
      const p = openerBase(ctx);
      return p?.kind === 'team' ? (p.role ?? '') : (p?.position ?? p?.headline ?? '');
    }, 'Position'),
    f.org((ctx) => openerBase(ctx)?.organization ?? ''),
    { key: 'placeholder', label: 'Without a person', type: 'text', max: 60, default: 'Someone wonderful', group: 'options' },
  ],
  describe: (ctx) => (ctx.text('name') ? `Opening remarks: ${ctx.text('name')}` : 'Opening remarks'),
  headline: (ctx) => (ctx.text('name') ? firstName(ctx.text('name')) : 'Opening'),
  Render,
});
