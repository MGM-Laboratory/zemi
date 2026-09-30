'use client';

import { formatJakarta, jakartaTimeInput, SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { useEnter, useIdle } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { INK, PAPER, SHAPE_ACCENT } from '../../engine/palette';
import { eventNumberLabel, eventRoom } from '../../engine/resolve';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandShape, BumperImage } from '../../parts/shapes';
import { Sticker } from '../../parts/stickers';
import { defineTemplate, f, useMascots } from '../kit';
import { accentFill, Chip, hashOf, Label, moves, useOpenCtx } from '../_tpl-open-kit';

/**
 * Event poster: the 4:5 cover in an accent frame (tossed on the table at a slight angle), or,
 * without a cover, the whole crew squeezed into the frame like a cast photo. Next to it the
 * title loosens up, with the date, time, room, the mode chip and tags. The full-bleed variant
 * uses the cover as the whole backdrop with a slow Ken Burns.
 */

const MODE_LABEL: Record<string, string> = { hybrid: 'Hybrid', online: 'Online', offline: 'In person' };

/** Where each character sits in the cover collage (percent of the frame), so every silhouette reads. */
const COLLAGE: Record<ShapeName, { x: number; y: number; s: number; r: number; look: [number, number] }> = {
  square: { x: -7, y: 7, s: 56, r: -8, look: [0.7, 0.5] },
  triangle: { x: 45, y: 3, s: 58, r: 7, look: [-0.6, 0.7] },
  circle: { x: -9, y: 49, s: 60, r: 0, look: [0.7, -0.4] },
  arch: { x: 43, y: 50, s: 64, r: -5, look: [-0.7, -0.5] },
};

/** On the full-bleed accent field the character of the same color turns white. */
function fieldColor(ctx: ResolveCtx, shape: ShapeName): string | undefined {
  return SHAPE_ACCENT[shape] === ctx.accent ? PAPER : undefined;
}

function Collage({ event, withEyes, big }: { event: ResolveCtx['event']; withEyes: boolean; big?: boolean }) {
  const { ctx } = useOpenCtx();
  // Mirror the arrangement for some events so two posters in a row never look identical.
  const flip = hashOf(event?.id ?? 'zemi') % 2 === 1;
  return (
    <div data-et-collage="" style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: big ? 'transparent' : ctx.colors.dark ? '#181d26' : PAPER, borderRadius: big ? 0 : 22 }}>
      {!big ? (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(to right, ${ctx.colors.dark ? '#ffffff12' : '#eef1f6'} 2px, transparent 2px), linear-gradient(to bottom, ${ctx.colors.dark ? '#ffffff12' : '#eef1f6'} 2px, transparent 2px)`, backgroundSize: '36px 36px' }} />
      ) : null}
      {SHAPE_ORDER.map((shape) => {
        const c = COLLAGE[shape];
        const x = flip ? 100 - c.x - c.s : c.x;
        return (
          <div key={shape} data-et-cast="" style={{ position: 'absolute', left: `${x}%`, top: `${c.y}%`, width: `${c.s}%`, aspectRatio: '1 / 1', rotate: `${flip ? -c.r : c.r}deg` }}>
            {withEyes ? (
              <BumperCharacter shape={shape} mood={shape === 'circle' ? 'happy' : 'idle'} color={big ? fieldColor(ctx, shape) : undefined} lookX={flip ? -c.look[0] : c.look[0]} lookY={c.look[1]} name={`poster-${shape}`} />
            ) : (
              <BrandShape shape={shape} color={big ? fieldColor(ctx, shape) : undefined} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A canvas box in content coordinates. The theme's safe area shrinks content to 95% around the
 * center, so full-bleed art and the plate behind the (unscaled) corner bug are mapped back out.
 */
function canvasBox(ctx: ResolveCtx, b: { x: number; y: number; w: number; h: number }) {
  if (!ctx.theme.safeArea) return b;
  const k = 0.95;
  const r = (n: number) => Math.round(n * 100) / 100;
  return { x: r((b.x - 960 * (1 - k)) / k), y: r((b.y - 540 * (1 - k)) / k), w: r(b.w / k), h: r(b.h / k) };
}

/** A white pill that sits exactly behind the corner bug (mark, wordmark and number) over a photo. */
function bugPlate(ctx: ResolveCtx) {
  const n = ctx.event?.number;
  const chars = n != null ? String(n).length + 1 : 0;
  const right = 196 + (chars ? 18 + chars * 13.2 : 0);
  return canvasBox(ctx, { x: 42, y: 32, w: right + 22 - 42, h: 76 });
}

function Details({ light }: { light?: { fg: string; fg2: string } }) {
  const { ctx } = useOpenCtx();
  const fg = light?.fg ?? ctx.colors.fg;
  const fg2 = light?.fg2 ?? ctx.colors.fg2;
  const rows: Array<[string, string]> = [
    ['calendar', ctx.text('date')],
    ['clock', ctx.text('time')],
    ['pin', ctx.text('room')],
  ].filter(([, v]) => v) as Array<[string, string]>;
  const badge = ctx.colors.dark || ctx.background === 'accent' || !!light;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20, width: '100%', height: '100%' }}>
      {rows.map(([icon, v], i) => (
        <div key={icon} data-et-row="" style={{ display: 'flex', alignItems: 'center', gap: 22, minWidth: 0 }}>
          <div style={{ width: 54, height: 54, flex: 'none', position: 'relative' }}>
            {badge ? <span aria-hidden="true" style={{ position: 'absolute', inset: -6, borderRadius: '50%', background: '#ffffff' }} /> : null}
            <div style={{ position: 'absolute', inset: badge ? 4 : 0 }}>
              <Sticker name={icon} />
            </div>
          </div>
          <span style={{ ...(i === 0 ? fontStyle('display', { weight: 800, casl: 0.3 }) : fontStyle('body', { weight: 600 })), fontSize: i === 0 ? 46 : 36, lineHeight: 1.1, color: i === 0 ? fg : fg2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function Chips({ light }: { light?: boolean }) {
  const { ctx } = useOpenCtx();
  const e = ctx.event;
  if (!e) return null;
  const mode = ctx.flag('showMode', true) ? MODE_LABEL[e.mode] : null;
  const tags = ctx.flag('showTags', true) ? e.tags.slice(0, 3) : [];
  if (!mode && !tags.length) return null;
  const onAccent = ctx.background === 'accent' && !light;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
      {mode ? (
        <span data-et-chip="" style={{ display: 'inline-block' }}>
          <Chip bg={onAccent ? ctx.colors.onAccent : light ? PAPER : accentFill(ctx)} fg={onAccent ? ctx.colors.accentHex : light ? INK : ctx.colors.onAccent} size={26}>
            {e.mode !== 'offline' ? <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', background: onAccent ? ctx.colors.accentHex : light ? '#f94141' : ctx.colors.onAccent, display: 'inline-block' }} /> : null}
            {mode}
          </Chip>
        </span>
      ) : null}
      {tags.map((t) => (
        <span key={t} data-et-chip="" style={{ display: 'inline-block' }}>
          <Chip bg="#00000000" fg={light ? PAPER : ctx.colors.fg} border={light ? '#ffffff80' : ctx.colors.dark || ctx.background === 'accent' ? `${ctx.colors.fg}66` : '#0e111633'} size={24}>
            {t}
          </Chip>
        </span>
      ))}
    </div>
  );
}

function Render() {
  const { ctx } = useOpenCtx();
  const variant = ctx.slide.style.variant === 'poster-right' ? 'right' : ctx.slide.style.variant === 'full-bleed' ? 'bleed' : 'left';
  const e = ctx.event;
  const cover = e?.cover ?? null;
  const cast = useMascots([...SHAPE_ORDER]);
  const withEyes = cast.length > 0;
  const title = ctx.text('title');
  const frameColor = ctx.background === 'accent' ? (ctx.accent === 'yellow' ? INK : PAPER) : ctx.colors.accentHex;

  useEnter((tl, root, { at, calm }) => {
    if (!moves(ctx)) return;
    const frame = root.querySelector('[data-et-frame]');
    if (frame) tl.fromTo(frame, { rotation: variant === 'right' ? -9 : 9, y: calm ? -30 : -120, scale: calm ? 0.97 : 0.86, opacity: 0 }, { rotation: variant === 'right' ? 2.5 : -2.5, y: 0, scale: 1, opacity: 1, duration: at(1.1), ease: BE.back }, at(0));
    const img = root.querySelector('[data-et-cover]');
    if (img) tl.fromTo(img, { clipPath: 'inset(100% 0% 0% 0%)', scale: 1.15 }, { clipPath: 'inset(0% 0% 0% 0%)', scale: 1, duration: at(1.2), ease: BE.inOut }, at(0.25));
    const castEls = root.querySelectorAll<HTMLElement>('[data-et-cast]');
    castEls.forEach((c, i) => {
      tl.fromTo(c, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: at(0.7), ease: 'back.out(2)' }, at(0.45 + i * 0.12));
      if (!calm) tl.add(charAnim.squash(c), at(1.0 + i * 0.12));
    });
    const titleFit = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleFit) tl.fromTo(titleFit, { '--casl': 0 }, { '--casl': 0.8, duration: at(1.7), ease: 'power2.out' }, at(0.5));
    const rows = root.querySelectorAll('[data-et-row]');
    if (rows.length) tl.fromTo(rows, { x: variant === 'right' ? 40 : -40, opacity: 0 }, { x: 0, opacity: 1, duration: at(0.7), ease: BE.out, stagger: at(0.1) }, at(0.9));
    const chips = root.querySelectorAll('[data-et-chip]');
    if (chips.length) tl.fromTo(chips, { scale: 0.4, opacity: 0, rotation: -8 }, { scale: 1, opacity: 1, rotation: 0, duration: at(0.5), ease: BE.back, stagger: at(0.07) }, at(1.3));
    const tag = root.querySelector('[data-et-mode-tag]');
    if (tag) tl.fromTo(tag, { scale: 0.2, rotation: -40, opacity: 0 }, { scale: 1, rotation: 8, opacity: 1, duration: at(0.6), ease: BE.back }, at(1.2));
  });

  useIdle((root, { calm }) => {
    const anims: gsap.core.Animation[] = [];
    const stops: Array<() => void> = [];
    const frame = root.querySelector('[data-et-frame]');
    const rest = variant === 'right' ? 2.5 : -2.5;
    if (frame) anims.push(gsap.fromTo(frame, { rotation: rest }, { rotation: rest + (calm ? 0.6 : 1.4) * (variant === 'right' ? -1 : 1), duration: 6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    const img = root.querySelector('[data-et-cover]');
    if (img) anims.push(gsap.fromTo(img, { scale: 1 }, { scale: calm ? 1.03 : 1.07, duration: 16, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    const bleed = root.querySelector('[data-et-bleed-img]');
    if (bleed) anims.push(gsap.fromTo(bleed, { scale: 1.02, xPercent: 0 }, { scale: calm ? 1.06 : 1.12, xPercent: -1.5, duration: 20, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    root.querySelectorAll<HTMLElement>('[data-et-cast]').forEach((c, i) => {
      stops.push(charAnim.blinkLoop(c));
      anims.push(...charAnim.idle(c, { calm, seed: i * 3 }));
    });
    const tag = root.querySelector('[data-et-mode-tag]');
    if (tag) anims.push(gsap.fromTo(tag, { rotation: 8 }, { rotation: 3, duration: 2.8, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
    };
  });

  const eyebrow = ctx.text('eyebrow');
  const morph = e ? `event:${e.id}:title` : null;

  if (variant === 'bleed') {
    const light = cover ? { fg: PAPER, fg2: '#f5f6f8d9' } : ctx.background === 'accent' ? undefined : { fg: ctx.colors.onAccent, fg2: ctx.accent === 'yellow' ? '#3b4150' : '#ffffffd9' };
    const fieldColor = ctx.background === 'accent' ? ctx.colors.bg : ctx.colors.accentHex;
    const txt = light?.fg ?? ctx.colors.fg;
    return (
      <>
        <El id="cover" label="Cover" box={canvasBox(ctx, { x: 0, y: 0, w: 1920, h: 1080 })} enter="fade" order={0} locked>
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: cover ? INK : fieldColor }}>
            {cover ? (
              <>
                <div data-et-bleed-img="" style={{ position: 'absolute', inset: -30 }}>
                  <BumperImage image={cover} width={1980} alt={cover.alt ?? title} />
                </div>
                <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, #0e1116e6 0%, #0e1116b3 38%, #0e111633 75%, #0e111600 100%)' }} />
                <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, #0e1116cc 0%, #0e111600 45%)' }} />
              </>
            ) : (
              <div style={{ position: 'absolute', left: 1010, top: 40, width: 1100, height: 1100 }}>
                <Collage event={e} withEyes={withEyes} big />
              </div>
            )}
          </div>
        </El>
        {cover && !ctx.colors.dark && ctx.theme.bug ? (
          // The bug paints in ink on a paper slide; over the dark photo it gets a paper pill to sit on.
          <El id="bug-plate" label="Plate behind the logo" box={bugPlate(ctx)} enter="fade" order={1} locked>
            <div aria-hidden="true" style={{ width: '100%', height: '100%', borderRadius: 999, background: PAPER, boxShadow: '0 12px 30px -12px #0e111680' }} />
          </El>
        ) : null}
        <El id="eyebrow" label="Eyebrow" box={{ x: 130, y: 250, w: 900, h: 44 }} enter="wipe" order={2}>
          <Label color={txt} bullet={cover ? ctx.colors.accentHex : ctx.background === 'accent' ? ctx.colors.onAccent : ctx.colors.onAccent} size={30}>
            {eyebrow}
          </Label>
        </El>
        <El id="title" label="Title" box={{ x: 124, y: 306, w: cover ? 1300 : 900, h: 400 }} enter="split-words" order={3} morph={morph}>
          <FitText max={164} min={64} casl={0} lineHeight={0.9} valign="end" style={{ color: txt }}>
            {title}
          </FitText>
        </El>
        <El id="details" label="Date, time and room" box={{ x: 130, y: 740, w: cover ? 1100 : 860, h: 196 }} enter="fade" order={5}>
          <Details light={light} />
        </El>
        <El id="chips" label="Mode and tags" box={{ x: 130, y: 950, w: 1200, h: 60 }} enter="fade" order={7}>
          <Chips light={!!cover || ctx.background !== 'accent'} />
        </El>
      </>
    );
  }

  const right = variant === 'right';
  const frameBox = right ? { x: 1180, y: 150, w: 620, h: 775 } : { x: 120, y: 150, w: 620, h: 775 };
  const textX = right ? 124 : 860;
  return (
    <>
      <El id="poster" label="Poster" box={frameBox} enter="fade" order={0} lockAspect>
        <div data-et-frame="" style={{ position: 'absolute', inset: 0, borderRadius: 36, padding: 18, background: frameColor, boxShadow: ctx.colors.dark ? '0 40px 80px -30px #000000cc' : '0 40px 70px -34px #0e111659, 0 10px 22px -12px #0e111633' }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 22, overflow: 'hidden' }}>
            {cover ? (
              <div data-et-cover="" style={{ position: 'absolute', inset: 0 }}>
                <BumperImage image={cover} width={600} alt={cover.alt ?? title} />
              </div>
            ) : (
              <Collage event={e} withEyes={withEyes} />
            )}
          </div>
          {e && ctx.flag('showMode', true) && e.mode !== 'offline' ? (
            <span data-et-mode-tag="" style={{ ...fontStyle('display', { weight: 850, casl: 1 }), position: 'absolute', right: right ? undefined : -34, left: right ? -34 : undefined, top: -26, fontSize: 38, padding: '10px 24px', borderRadius: 999, background: ctx.background === 'accent' ? INK : ctx.colors.dark ? PAPER : INK, color: ctx.background === 'accent' ? PAPER : ctx.colors.dark ? INK : PAPER, whiteSpace: 'nowrap', rotate: '8deg' }}>
              {e.mode === 'online' ? 'Online' : 'Also online'}
            </span>
          ) : null}
        </div>
      </El>
      <El id="eyebrow" label="Eyebrow" box={{ x: textX, y: 184, w: 920, h: 44 }} enter="wipe" order={1}>
        <Label color={ctx.colors.fg} bullet={ctx.background === 'accent' ? ctx.colors.onAccent : ctx.colors.accentHex} size={30}>
          {eyebrow}
        </Label>
      </El>
      <El id="title" label="Title" box={{ x: textX - 6, y: 240, w: 940, h: 420 }} enter="split-words" order={2} morph={morph}>
        <FitText max={150} min={60} casl={0} lineHeight={0.9} valign="end">
          {title}
        </FitText>
      </El>
      <El id="details" label="Date, time and room" box={{ x: textX, y: 690, w: 920, h: 210 }} enter="fade" order={4}>
        <Details />
      </El>
      <El id="chips" label="Mode and tags" box={{ x: textX, y: 920, w: 920, h: 60 }} enter="fade" order={6}>
        <Chips />
      </El>
    </>
  );
}

export default defineTemplate({
  kind: 'event-title',
  background: 'paper',
  variants: [
    { key: 'poster-left', label: 'Poster left' },
    { key: 'poster-right', label: 'Poster right' },
    { key: 'full-bleed', label: 'Cover as backdrop', hint: 'The cover fills the screen (or the crew does, without one).' },
  ],
  fields: [
    f.eyebrow((ctx) => (ctx.event?.number != null ? `Zemi ${eventNumberLabel(ctx.event)}` : 'Zemi')),
    f.title((ctx) => ctx.event?.title ?? 'This Friday at Zemi'),
    { key: 'date', label: 'Date', type: 'text', max: 80, default: (ctx) => (ctx.event ? formatJakarta(ctx.event.startsAt, 'date-long') : '') },
    { key: 'time', label: 'Time', type: 'text', max: 60, default: (ctx) => (ctx.event ? `${jakartaTimeInput(ctx.event.startsAt)} to ${jakartaTimeInput(ctx.event.endsAt)} WIB` : '') },
    { key: 'room', label: 'Room', type: 'text', max: 120, default: (ctx) => eventRoom(ctx.event) },
    { key: 'showMode', label: 'Show hybrid or online', type: 'toggle', default: true, group: 'options' },
    { key: 'showTags', label: 'Show tags', type: 'toggle', default: true, group: 'options' },
  ],
  describe: (ctx) => ctx.event?.title ?? 'Event poster',
  headline: (ctx) => (ctx.event?.number != null ? `Zemi ${eventNumberLabel(ctx.event)}` : 'Zemi'),
  Render,
});
