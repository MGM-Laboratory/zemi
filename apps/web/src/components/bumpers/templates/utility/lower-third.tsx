'use client';

import { SHAPE_COLORS, type ShapeName } from '@zemi/shared';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { INK, INK_3, PAPER } from '../../engine/palette';
import { eventNumberLabel } from '../../engine/resolve';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandShape } from '../../parts/shapes';
import { resetCast } from '../_tpl-end-kit';
import { defineTemplate, f, personName, personOrg, personRole, useMascots, usePerson } from '../kit';

const ROLE_TAG: Record<string, string> = { keynote: 'Keynote', moderator: 'Moderator', panelist: 'Panelist', speaker: 'Now speaking' };

function defaultTag(ctx: ResolveCtx): string {
  const role = ctx.person?.kind === 'speaker' ? ctx.person.role : null;
  if (role && ROLE_TAG[role]) return ROLE_TAG[role]!;
  return ctx.event?.number != null ? `Zemi ${eventNumberLabel(ctx.event)}` : '';
}

/**
 * Lower third: a name strip for the camera feed in OBS, on a clear background. The person's
 * shape is a tiny character that rolls in, spins once and lands on the plate's edge; the plate
 * wipes open behind it and the role band slides out from underneath. Always white and ink, so
 * it reads over any picture.
 */
function Render() {
  const ctx = useSlide();
  const person = usePerson();
  const variant = ctx.slide.style.variant === 'right' ? 'right' : ctx.slide.style.variant === 'center' ? 'center' : 'left';
  const right = variant === 'right';
  const center = variant === 'center';
  const shape: ShapeName = person?.shape ?? 'circle';
  const cast = useMascots([shape]);
  const face = cast[0] ?? null;
  const name = person?.name || 'Pick a person';
  const meta = [ctx.text('role'), ctx.text('org')].filter(Boolean).join('  ·  ');
  const tag = ctx.flag('showTag', true) ? ctx.text('tag') : '';
  const pid = person?.id ?? 'manual';
  const band = ctx.colors.accentHex;
  const onBand = ctx.colors.onAccent;
  const still = ctx.theme.motion === 'still';
  const bulletShape = face ?? shape;
  const bulletColor = SHAPE_COLORS[bulletShape];

  useEnter((tl, root, { at, calm }) => {
    const bullet = root.querySelector<HTMLElement>('[data-lt-bullet]');
    const plate = root.querySelector<HTMLElement>('[data-lt-plate]');
    const bandEl = root.querySelector<HTMLElement>('[data-lt-band]');
    const tagEl = root.querySelector<HTMLElement>('[data-lt-tag]');
    const nameEl = root.querySelector<HTMLElement>('[data-el="strip"] [data-fit]');
    if (bullet) resetCast([bullet]);
    if (still) return;
    const from = center ? 'inset(0% 50% 0% 50% round 28px)' : right ? 'inset(0% 0% 0% 100% round 28px)' : 'inset(0% 100% 0% 0% round 28px)';
    if (plate) tl.fromTo(plate, { clipPath: from }, { clipPath: 'inset(0% 0% 0% 0% round 28px)', duration: at(0.6), ease: 'zemiOut', clearProps: 'clipPath' }, at(0.2));
    if (nameEl) {
      tl.fromTo(nameEl, { x: right ? 40 : center ? 0 : -40, opacity: 0 }, { x: 0, opacity: 1, duration: at(0.5), ease: 'zemiOut' }, at(0.35));
      tl.fromTo(nameEl, { '--casl': 0 }, { '--casl': 0.6, duration: at(1.1), ease: 'power2.out' }, at(0.4));
    }
    if (bandEl) tl.fromTo(bandEl, { yPercent: -110, clipPath: 'inset(100% 0% 0% 0%)' }, { yPercent: 0, clipPath: 'inset(0% 0% 0% 0%)', duration: at(0.45), ease: 'zemiOut' }, at(0.6));
    if (tagEl) tl.fromTo(tagEl, { y: 24, opacity: 0, scale: 0.8 }, { y: 0, opacity: 1, scale: 1, duration: at(0.45), ease: 'back.out(2)' }, at(0.7));
    if (bullet) {
      if (center) tl.fromTo(bullet, { y: -300, rotation: -200, opacity: 0 }, { y: 0, rotation: 0, opacity: 1, duration: at(0.7), ease: 'bounce.out' }, at(0.2));
      else tl.fromTo(bullet, { x: right ? 700 : -700, rotation: right ? 360 : -360, opacity: 0 }, { x: 0, rotation: 0, opacity: 1, duration: at(calm ? 0.8 : 0.7), ease: 'power3.out' }, at(0));
      tl.add(charAnim.squash(bullet), at(center ? 0.8 : 0.66));
      if (face) tl.add(charAnim.look(bullet, center ? 0 : right ? -1 : 1, 0.3, 0.3), at(0.9));
    }
  });

  useIdle((root, { calm }) => {
    const bullet = root.querySelector<HTMLElement>('[data-lt-bullet]');
    if (!bullet) return;
    const stops: Array<() => void> = [];
    const anims: gsap.core.Animation[] = [];
    if (face) {
      stops.push(charAnim.blinkLoop(bullet));
      anims.push(...charAnim.idle(bullet, { calm: true }));
      // Glance at the camera, then back at the name. Calm: it is sitting on someone's shoulder.
      const glance = gsap.timeline({ repeat: -1, repeatDelay: calm ? 9 : 6, delay: 3 });
      glance.add(charAnim.look(bullet, 0, 0, 0.4), 0).add(charAnim.look(bullet, center ? 0 : right ? -1 : 1, 0.3, 0.4), 2.4);
      anims.push(glance);
    } else {
      anims.push(gsap.to(bullet, { rotation: '+=360', duration: calm ? 60 : 40, ease: 'none', repeat: -1 }));
    }
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
    };
  });

  const bulletSize = center ? 116 : 136;
  const plateH = 118;
  const bullet = (
    <div
      data-lt-bullet=""
      style={{
        position: 'absolute',
        width: bulletSize,
        height: bulletSize,
        zIndex: 2,
        ...(center ? { left: -bulletSize * 0.32, top: -bulletSize * 0.6, rotate: '-10deg' } : right ? { right: -bulletSize * 0.36, top: (plateH - bulletSize) / 2 } : { left: -bulletSize * 0.36, top: (plateH - bulletSize) / 2 }),
      }}
    >
      {face ? <BumperCharacter shape={face} color={bulletColor} mood="happy" lookX={center ? 0 : right ? -0.8 : 0.8} lookY={0.3} /> : <BrandShape shape={shape} color={bulletColor} />}
    </div>
  );

  const box = center ? { x: 310, y: 740, w: 1300, h: 276 } : right ? { x: 624, y: 760, w: 1200, h: 256 } : { x: 96, y: 760, w: 1200, h: 256 };
  const align = center ? 'center' : right ? 'end' : 'start';
  const pad = center ? `0 56px 0 ${bulletSize * 0.62}px` : right ? `0 ${bulletSize * 0.78}px 0 48px` : `0 48px 0 ${bulletSize * 0.78}px`;

  return (
    <El id="strip" label="Name strip" box={box} align={align} valign="end" enter="fade" morph={`person:${pid}:name`}>
      {tag ? (
        <div data-lt-tag="" style={{ margin: center ? '0 0 14px' : right ? '0 26px 12px 0' : '0 0 12px 26px', padding: '8px 18px', borderRadius: 999, background: INK, color: PAPER, ...fontStyle('mono', { weight: 700, tracking: 0.14 }), fontSize: 22, lineHeight: 1, textTransform: 'uppercase', whiteSpace: 'nowrap', order: center ? 1 : 0 }}>
          {tag}
        </div>
      ) : null}
      <div style={{ position: 'relative', maxWidth: '100%', display: 'flex', flexDirection: 'column', alignItems: align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : 'center', order: center ? 2 : 1 }}>
        <div style={{ position: 'relative', maxWidth: '100%' }}>
          {bullet}
          <div data-lt-plate="" style={{ position: 'relative', height: plateH, width: 'fit-content', maxWidth: '100%', minWidth: 360, padding: pad, borderRadius: 28, background: PAPER, boxShadow: `0 10px 30px ${INK}33, 0 2px 0 ${INK}14`, display: 'flex', alignItems: 'center', zIndex: 1 }}>
            <div style={{ height: 84, width: '100%', minWidth: 0 }}>
              <FitText max={74} min={34} casl={0} weight={900} lineHeight={1.02} valign="center" balance={false} style={{ color: person ? INK : INK_3, whiteSpace: 'nowrap' }}>
                {name}
              </FitText>
            </div>
          </div>
        </div>
        {meta ? (
          <div style={{ overflow: 'hidden', maxWidth: '100%', margin: center ? '0' : right ? `0 ${bulletSize * 0.5}px 0 0` : `0 0 0 ${bulletSize * 0.5}px` }}>
            <div data-lt-band="" style={{ padding: '12px 28px 14px', borderRadius: '0 0 20px 20px', background: band, color: onBand, ...fontStyle('body', { weight: 700 }), fontSize: 30, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {meta}
            </div>
          </div>
        ) : null}
      </div>
    </El>
  );
}

export default defineTemplate({
  kind: 'lower-third',
  overlay: true,
  noBug: true,
  background: 'transparent',
  variants: [
    { key: 'left', label: 'Bottom left' },
    { key: 'right', label: 'Bottom right' },
    { key: 'center', label: 'Bottom center' },
  ],
  fields: [
    f.name(personName),
    f.role(personRole, 'Position'),
    f.org(personOrg),
    { key: 'tag', label: 'Tag above the name', type: 'text', max: 40, default: defaultTag, placeholder: 'Now speaking', hint: 'From their role today. Type to override.' },
    { key: 'showTag', label: 'Show the tag', type: 'toggle', default: true, group: 'options' },
  ],
  describe: (ctx) => (ctx.person?.name ? `${ctx.person.name} (lower third)` : 'Lower third'),
  headline: (ctx) => ctx.person?.first ?? (ctx.text('name') || 'Hello'),
  Render,
});
