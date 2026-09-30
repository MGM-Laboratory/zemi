'use client';

import { SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { GRAPH } from '../../engine/palette';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandShape } from '../../parts/shapes';
import { defineTemplate, Eyebrow, f, personName, personOrg, personRole, Portrait, useMascots, usePerson } from '../kit';

const ROLE_LABEL: Record<string, string> = { keynote: 'Keynote', moderator: 'Moderator', panelist: 'Panelist', speaker: 'Speaker' };

/** "Speaker 2 of 3" from the event lineup (speakers and keynotes, in lineup order). */
export function speakerOrdinal(ctx: ResolveCtx): string {
  const p = ctx.person;
  if (!p) return 'Up now';
  const talks = ctx.lineup.filter((s) => s.role === 'speaker' || s.role === 'keynote');
  const i = talks.findIndex((s) => s.id === p.id);
  if (p.role && p.role !== 'speaker') return ROLE_LABEL[p.role] ?? 'Up now';
  if (i >= 0 && talks.length > 1) return `Speaker ${i + 1} of ${talks.length}`;
  return 'Up now';
}

/**
 * Speaker intro: the portrait in their shape with an offset accent shape behind it, their
 * character peeking over the frame, the name loosening up, affiliation and the talk title on a
 * graph-paper card (work in progress, like the rest of Zemi).
 */
function Render() {
  const ctx = useSlide();
  const person = usePerson();
  const variant = ctx.slide.style.variant ?? 'left';
  const right = variant === 'right';
  const center = variant === 'center';
  const shape: ShapeName = person?.shape ?? 'circle';
  // A different shape peeks from behind the portrait, so the two never blur into one blob.
  const peekShape = SHAPE_ORDER[(SHAPE_ORDER.indexOf(shape) + 1) % SHAPE_ORDER.length]!;
  const cast = useMascots([peekShape]);
  const talk = ctx.flag('showTalk', true) ? ctx.text('talk') : '';
  const eyebrow = ctx.text('eyebrow');
  const name = person?.name || 'Pick a speaker';
  const role = [ctx.text('role'), ctx.text('org')].filter(Boolean);
  const pid = person?.id ?? 'manual';

  useEnter((tl, root, { at, calm }) => {
    const back = root.querySelector('[data-portrait-back]');
    const photo = root.querySelector('[data-portrait]');
    if (back) tl.from(back, { scale: 0.2, rotation: -40, opacity: 0, duration: at(1.1), ease: 'zemiPop' }, at(0.05));
    if (photo) tl.fromTo(photo, { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)', duration: at(1.05), ease: 'zemiInOut', clearProps: 'clipPath' }, at(0.18));
    const nameEl = root.querySelector<HTMLElement>('[data-el="name"] [data-fit]');
    if (nameEl) tl.fromTo(nameEl, { '--casl': 0 }, { '--casl': 0.85, duration: at(1.4), ease: 'power2.out' }, at(0.5));
    const peek = root.querySelector<HTMLElement>('[data-peek]');
    if (peek) {
      tl.from(peek, { y: 190, duration: at(0.8), ease: 'back.out(1.6)' }, at(1.05));
      tl.add(charAnim.look(peek, right ? -1 : 1, 0.4, 0.3), at(1.5));
      if (!calm) tl.add(charAnim.hop(peek, { height: 16 }), at(1.7));
    }
    const card = root.querySelector('[data-talk-card]');
    if (card) tl.from(card, { rotation: right ? 6 : -6, y: 40, opacity: 0, duration: at(0.9), ease: 'back.out(1.4)' }, at(0.8));
  });

  useIdle((root, { calm }) => {
    const peek = root.querySelector<HTMLElement>('[data-peek]');
    const back = root.querySelector('[data-portrait-back]');
    const out: Array<() => void> = [];
    const anims: gsap.core.Animation[] = [];
    if (peek) {
      out.push(charAnim.blinkLoop(peek));
      anims.push(...charAnim.idle(peek, { calm }));
      // Glance at the name now and then.
      const glance = gsap.timeline({ repeat: -1, repeatDelay: 5 });
      glance.add(charAnim.look(peek, right ? 1 : -1, -0.2, 0.4), 3).add(charAnim.look(peek, right ? -1 : 1, 0.4, 0.4), 5.2);
      anims.push(glance);
    }
    if (back) anims.push(gsap.to(back, { rotation: 6, duration: 5, ease: 'sine.inOut', yoyo: true, repeat: -1, transformOrigin: '50% 50%' }));
    return () => {
      out.forEach((s) => s());
      anims.forEach((a) => a.kill());
    };
  });

  const photoSize = center ? 420 : 620;
  const photoBox = center ? { x: 750, y: 130, w: 460, h: 460 } : right ? { x: 1180, y: 190, w: 680, h: 680 } : { x: 110, y: 190, w: 680, h: 680 };
  const textX = center ? 160 : right ? 130 : 880;
  const textW = center ? 1600 : 920;
  const align = center ? 'center' : 'start';

  return (
    <>
      {person ? (
        <El id="photo" label="Photo" box={photoBox} enter="none" lockAspect morph={`person:${pid}:photo`}>
          {cast.length ? (
            <div data-peek="" style={{ position: 'absolute', width: center ? 130 : 190, height: center ? 130 : 190, left: right ? photoSize * 0.08 : photoSize * 0.62, top: center ? -62 : -96, zIndex: 0 }}>
              <BumperCharacter shape={cast[0]!} mood="happy" lookX={right ? -0.7 : 0.7} lookY={0.5} />
            </div>
          ) : null}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <Portrait person={person} size={photoSize} shape={shape} />
          </div>
        </El>
      ) : (
        <El id="photo" label="Photo" box={photoBox} enter="pop" lockAspect>
          <div style={{ width: photoSize, height: photoSize, opacity: 0.25 }}>
            <BrandShape shape="circle" color={ctx.colors.fg} />
          </div>
        </El>
      )}
      <El id="eyebrow" label="Eyebrow" box={{ x: textX, y: center ? 620 : 210, w: textW, h: 56 }} align={align} enter="wipe" order={1}>
        <Eyebrow size={32}>{eyebrow}</Eyebrow>
      </El>
      <El id="name" label="Name" box={{ x: textX, y: center ? 690 : 290, w: textW, h: center ? 170 : 290 }} align={align} enter="split-words" order={2} morph={`person:${pid}:name`}>
        <FitText max={center ? 150 : 170} min={60} casl={0} lineHeight={0.92} valign={center ? 'center' : 'end'}>
          {name}
        </FitText>
      </El>
      {role.length ? (
        <El id="meta" label="Role and affiliation" box={{ x: textX, y: center ? 870 : 600, w: textW, h: center ? 60 : 100 }} align={align} enter="rise" order={4}>
          <FitText max={40} min={24} font="body" weight={600} lineHeight={1.3} style={{ color: ctx.colors.fg2 }}>
            {role.join('  ·  ')}
          </FitText>
        </El>
      ) : null}
      {talk && !center ? (
        <El id="talk" label="Talk title" box={{ x: textX, y: 730, w: textW, h: 220 }} enter="none" order={5} morph={`person:${pid}:talk`}>
          <div data-talk-card="" style={{ width: '100%', height: '100%', borderRadius: 28, padding: '26px 34px', backgroundColor: ctx.colors.dark ? 'rgba(255,255,255,0.06)' : '#fff', backgroundImage: ctx.colors.dark ? undefined : `linear-gradient(to right, ${GRAPH} 2px, transparent 2px), linear-gradient(to bottom, ${GRAPH} 2px, transparent 2px)`, backgroundSize: '32px 32px', border: `3px solid ${ctx.colors.dark ? 'rgba(255,255,255,0.16)' : ctx.colors.fg}`, boxShadow: ctx.colors.dark ? undefined : `10px 10px 0 ${ctx.colors.accentHex}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.12 }), fontSize: 22, textTransform: 'uppercase', color: ctx.colors.accentHex === '#f7bf33' ? ctx.colors.fg : ctx.colors.accentHex }}>The talk</span>
            <div style={{ flex: 1, minHeight: 0 }}>
              <FitText max={60} min={28} casl={0.3} weight={800} lineHeight={1.02}>
                {talk}
              </FitText>
            </div>
          </div>
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'speaker',
  background: 'paper',
  variants: [
    { key: 'left', label: 'Photo left' },
    { key: 'right', label: 'Photo right' },
    { key: 'center', label: 'Centered, no talk card' },
  ],
  fields: [
    f.eyebrow((ctx) => speakerOrdinal(ctx)),
    f.name(personName),
    f.role(personRole, 'Position'),
    f.org(personOrg),
    { key: 'talk', label: 'Talk title', type: 'longtext', max: 300, default: (ctx) => ctx.person?.talkTitle ?? '', hint: 'From the event lineup. Type to override.' },
    { key: 'showTalk', label: 'Show the talk card', type: 'toggle', default: true, group: 'options' },
  ],
  describe: (ctx) => ctx.person?.name ?? null,
  headline: (ctx) => ctx.person?.first ?? ctx.text('name') ?? 'Speaker',
  Render,
});
