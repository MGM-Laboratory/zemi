'use client';

import { jakartaTimeInput, SHAPE_ORDER } from '@zemi/shared';
import { useEnter, useIdle } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { INK } from '../../engine/palette';
import { currentRundownIndex, manualPerson } from '../../engine/resolve';
import type { BumperPerson, ResolveCtx, ResolvedRundownItem } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { defineTemplate, f, useMascots } from '../kit';
import { accentFill, charColor, ClockFace, handAngles, Label, moves, PersonPortrait, plate, useOpenCtx } from '../_tpl-open-kit';

/**
 * Up next: one agenda item, big. "Up next" and its time, the agenda in huge type, the speaker's
 * portrait and name, and a clock face whose hands sweep round to the start time while a
 * character perches on top. The title carries `rundown:<index>` so it magic-moves out of the
 * agenda row. Default item: the one after whatever is on now (the first one before the day).
 */

/** The referenced item, else the next one by the clock (the first before the event starts). */
function nextItem(ctx: ResolveCtx): ResolvedRundownItem | null {
  if (ctx.rundownItem) return ctx.rundownItem;
  if (!ctx.rundown.length) return null;
  const i = currentRundownIndex(ctx.event, ctx.now());
  return ctx.rundown[i + 1] ?? (i < 0 ? ctx.rundown[0]! : null);
}

/** The picked person, else the item's speaker, with typed overrides applied. */
function upNextPerson(ctx: ResolveCtx, item: ResolvedRundownItem | null): BumperPerson | null {
  const base = ctx.person ?? item?.speaker ?? null;
  const name = ctx.text('name');
  if (!base && !name) return null;
  const who = base ?? manualPerson(name);
  return { ...who, name: name || who.name, position: ctx.text('role') || who.position, organization: ctx.text('org') || who.organization };
}

function Render() {
  const { ctx } = useOpenCtx();
  const item = nextItem(ctx);
  const person = upNextPerson(ctx, item);
  const portraitVariant = ctx.slide.style.variant === 'portrait' && !!person;
  const time = ctx.text('time');
  const title = ctx.text('title');
  const eyebrow = ctx.text('eyebrow');
  const perchShape = SHAPE_ORDER[((item?.index ?? 0) + 1) % 4]!;
  const cast = useMascots([perchShape]);
  const p = plate(ctx);
  // Without a start time the clock simply shows the time now.
  const clockTime = time || jakartaTimeInput(new Date(ctx.now()));
  const hands = handAngles(clockTime);
  const pid = person?.id ?? null;
  const showClock = ctx.flag('showClock', true);
  const meta = [ctx.text('role'), ctx.text('org')].filter(Boolean).join('  ·  ');

  useEnter((tl, root, { at, calm }) => {
    if (!moves(ctx)) return;
    const titleFit = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleFit) tl.fromTo(titleFit, { '--casl': 0 }, { '--casl': 0.75, duration: at(1.6), ease: 'power2.out' }, at(0.35));
    const face = root.querySelector('[data-un-face]');
    if (face) tl.fromTo(face, { scale: calm ? 0.9 : 0.4, rotation: calm ? -20 : -80, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: at(1.0), ease: BE.back }, at(0.1));
    if (hands) {
      const hour = root.querySelector('[data-hand="hour"]');
      const minute = root.querySelector('[data-hand="minute"]');
      // Sweep from noon: the minute hand does a full lap first, like the clock is winding up.
      if (hour) tl.fromTo(hour, { rotation: -hands.hour, svgOrigin: '100 100' }, { rotation: 0, svgOrigin: '100 100', duration: at(calm ? 1.6 : 1.9), ease: BE.inOut }, at(0.45));
      if (minute) tl.fromTo(minute, { rotation: -(hands.minute + (calm ? 0 : 360)), svgOrigin: '100 100' }, { rotation: 0, svgOrigin: '100 100', duration: at(calm ? 1.6 : 1.9), ease: BE.inOut }, at(0.45));
    }
    const perch = root.querySelector<HTMLElement>('[data-un-perch]');
    if (perch) {
      tl.fromTo(perch, { y: calm ? -100 : -360, opacity: 0 }, { y: 0, opacity: 1, duration: at(0.8), ease: 'bounce.out' }, at(0.9));
      tl.add(charAnim.squash(perch), at(1.55));
      tl.add(charAnim.look(perch, -0.9, 0.3, 0.3), at(1.8));
    }
    const back = root.querySelector('[data-portrait-back]');
    const photo = root.querySelector('[data-portrait]');
    if (back) tl.fromTo(back, { scale: 0.2, rotation: -40, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: at(1.1), ease: BE.pop }, at(0.2));
    if (photo) tl.fromTo(photo, { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)', duration: at(1.0), ease: BE.inOut, clearProps: 'clipPath' }, at(0.35));
    const badge = root.querySelector('[data-un-badge]');
    if (badge) tl.fromTo(badge, { scale: 0, rotation: -30, opacity: 0 }, { scale: 1, rotation: -6, opacity: 1, duration: at(0.6), ease: BE.back }, at(1.2));
  });

  useIdle((root, { calm }) => {
    const anims: gsap.core.Animation[] = [];
    const stops: Array<() => void> = [];
    const sec = root.querySelector('[data-un-second]');
    if (sec) anims.push(gsap.fromTo(sec, { rotation: 0, svgOrigin: '100 100' }, { rotation: 360, svgOrigin: '100 100', duration: 60, ease: 'none', repeat: -1 }));
    const perch = root.querySelector<HTMLElement>('[data-un-perch]');
    if (perch) {
      stops.push(charAnim.blinkLoop(perch));
      anims.push(...charAnim.idle(perch, { calm, seed: 5 }));
      const glance = gsap.timeline({ repeat: -1, repeatDelay: 3.5 });
      glance.add(charAnim.look(perch, 0.2, 1, 0.4), 2.5).add(charAnim.look(perch, -0.9, 0.3, 0.4), 4.6);
      anims.push(glance);
    }
    const back = root.querySelector('[data-portrait-back]');
    if (back) anims.push(gsap.fromTo(back, { rotation: 0 }, { rotation: calm ? 3 : 6, duration: 5, ease: 'sine.inOut', yoyo: true, repeat: -1, transformOrigin: '50% 50%' }));
    const badge = root.querySelector('[data-un-badge]');
    if (badge) anims.push(gsap.fromTo(badge, { rotation: -6 }, { rotation: -2, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
      if (sec) gsap.set(sec, { rotation: 0, svgOrigin: '100 100' });
    };
  });

  const clockColors = {
    face: p.bg,
    rim: p.dark ? '#ffffff38' : INK,
    ink: p.fg,
    hand: !p.dark && ctx.accent === 'yellow' ? INK : ctx.colors.accentHex,
    pin: ctx.accent === 'yellow' ? '#f7bf33' : ctx.colors.accentHex,
  };
  const clock = (size: number, withSecond: boolean) => (
    <div data-un-face="" style={{ position: 'relative', width: size, height: size, borderRadius: '50%', boxShadow: p.dark ? `18px 18px 0 ${p.shadow}` : `18px 18px 0 ${p.shadow}` }}>
      <ClockFace time={hands ? clockTime : null} {...clockColors} />
      {withSecond ? (
        <svg viewBox="0 0 200 200" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }} aria-hidden="true">
          <g data-un-second="">
            <path d="M100 120 L100 22" stroke={ctx.accent === 'red' ? '#0f8657' : '#f94141'} strokeWidth="2.6" strokeLinecap="round" />
          </g>
        </svg>
      ) : null}
    </div>
  );

  const textW = portraitVariant ? 1000 : showClock ? 960 : 1600;
  return (
    <>
      <El id="eyebrow" label="Up next" box={{ x: 130, y: 196, w: textW, h: 60 }} enter="wipe" order={0}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <Label color={ctx.colors.fg} bullet={ctx.background === 'accent' ? ctx.colors.onAccent : ctx.colors.accentHex} size={34}>
            {eyebrow}
          </Label>
          {time ? (
            <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.04 }), fontSize: 34, lineHeight: 1, padding: '10px 20px', borderRadius: 999, background: accentFill(ctx), color: ctx.background === 'accent' ? ctx.colors.accentHex : ctx.colors.onAccent }}>{time}</span>
          ) : null}
        </div>
      </El>
      <El id="title" label="What's next" box={{ x: 124, y: 280, w: textW, h: 430 }} enter="split-words" order={1} morph={item ? `rundown:${item.index}` : null}>
        <FitText max={156} min={60} casl={0} lineHeight={0.92} valign="center">
          {title}
        </FitText>
      </El>
      {person && !portraitVariant ? (
        <El id="speaker" label="Speaker" box={{ x: 130, y: 760, w: textW, h: 170 }} enter="rise" order={6}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 30, height: '100%' }}>
            <div data-morph={pid ? `person:${pid}:photo` : undefined} style={{ flex: 'none' }}>
              <PersonPortrait person={person} size={150} back={false} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span data-morph={pid ? `person:${pid}:name` : undefined} style={{ ...fontStyle('display', { weight: 900, casl: 0.4 }), fontSize: 62, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {person.name}
              </span>
              {meta ? <span style={{ ...fontStyle('body', { weight: 600 }), fontSize: 34, color: ctx.colors.fg2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</span> : null}
            </div>
          </div>
        </El>
      ) : null}
      {portraitVariant && person ? (
        <>
          <El id="photo" label="Photo" box={{ x: 1170, y: 210, w: 620, h: 620 }} enter="fade" lockAspect morph={pid ? `person:${pid}:photo` : null}>
            <PersonPortrait person={person} size={560} />
            {showClock && hands ? (
              <div data-un-badge="" style={{ position: 'absolute', left: -60, top: -40, width: 220, height: 220, rotate: '-6deg' }}>
                {clock(220, false)}
              </div>
            ) : null}
          </El>
          <El id="name" label="Name" box={{ x: 130, y: 760, w: 1000, h: 90 }} enter="rise" order={5} morph={pid ? `person:${pid}:name` : null}>
            <FitText max={70} min={36} casl={0.4} valign="center">
              {person.name}
            </FitText>
          </El>
          {meta ? (
            <El id="meta" label="Role and affiliation" box={{ x: 130, y: 860, w: 1000, h: 60 }} enter="rise" order={6}>
              <FitText max={36} min={22} font="body" weight={600} style={{ color: ctx.colors.fg2 }}>
                {meta}
              </FitText>
            </El>
          ) : null}
        </>
      ) : null}
      {!portraitVariant && showClock ? (
        <El id="clock" label="Clock" box={{ x: 1170, y: 250, w: 600, h: 600 }} enter="fade" order={0} lockAspect>
          {cast[0] ? (
            <div data-un-perch="" style={{ position: 'absolute', left: 300 - 72, top: -132, width: 144, height: 144, zIndex: 2 }}>
              <BumperCharacter shape={cast[0]} mood="happy" color={charColor(ctx, cast[0])} lookX={-0.9} lookY={0.3} name={`upnext-${cast[0]}`} />
            </div>
          ) : null}
          {clock(600, true)}
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'up-next',
  background: 'paper',
  variants: [
    { key: 'clock', label: 'Big clock' },
    { key: 'portrait', label: 'Speaker photo', hint: 'The speaker big on the right, the clock as a badge.' },
  ],
  fields: [
    f.eyebrow('Up next'),
    f.time((ctx) => nextItem(ctx)?.time ?? '', 'Starts at'),
    f.title((ctx) => nextItem(ctx)?.agenda ?? 'Coming right up', "What's next", 200),
    f.name((ctx) => ctx.person?.name ?? nextItem(ctx)?.speaker?.name ?? ''),
    f.role((ctx) => ctx.person?.position ?? nextItem(ctx)?.speaker?.position ?? '', 'Position'),
    f.org((ctx) => ctx.person?.organization ?? nextItem(ctx)?.speaker?.organization ?? ''),
    { key: 'showClock', label: 'Show the clock', type: 'toggle', default: true, group: 'options' },
  ],
  describe: (ctx) => {
    const it = nextItem(ctx);
    return it ? `Up next: ${it.agenda}` : 'Up next';
  },
  headline: () => 'Up next',
  Render,
});

