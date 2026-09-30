'use client';

import { formatJakarta, SHAPE_ORDER } from '@zemi/shared';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { eventNumberLabel, eventRoom } from '../../engine/resolve';
import { BumperCharacter, charAnim } from '../../parts/character';
import { stageConfetti } from '../../parts/confetti';
import { BrandShape } from '../../parts/shapes';
import { defineTemplate, Eyebrow, f, useMascots } from '../kit';

/**
 * Welcome: the big hello. A huge title that loosens up (CASL 0 to 1) as it lands, the date and
 * room, and the four characters dropping onto a shelf one by one before they cheer together.
 */
function Render() {
  const ctx = useSlide();
  const variant = ctx.slide.style.variant === 'center' ? 'center' : 'split';
  const cast = useMascots([...SHAPE_ORDER]);
  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title');
  const subtitle = ctx.text('subtitle');
  const center = variant === 'center';

  useEnter((tl, root, { at, calm }) => {
    const title = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (title) tl.fromTo(title, { '--casl': 0 }, { '--casl': 1, duration: at(1.6), ease: 'power2.out' }, at(0.35));
    const chars = root.querySelectorAll<HTMLElement>('[data-welcome-char]');
    chars.forEach((c, i) => {
      tl.from(c, { y: -520, rotation: (i % 2 ? 1 : -1) * 30, duration: at(0.75), ease: 'bounce.out' }, at(0.55 + i * 0.12));
      tl.add(charAnim.squash(c), at(1.1 + i * 0.12));
    });
    chars.forEach((c, i) => tl.add(charAnim.cheer(c, { height: calm ? 16 : 30, spin: !calm }), at(1.75 + i * 0.07)));
    const shelf = root.querySelector('[data-welcome-shelf]');
    if (shelf) tl.from(shelf, { scaleX: 0, transformOrigin: '0% 50%', duration: at(0.8), ease: 'zemiOut' }, at(0.4));
    const disc = root.querySelector('[data-welcome-disc]');
    if (disc) tl.from(disc, { scale: 0, duration: at(1.1), ease: 'zemiPop' }, at(0.2));
    if (!calm && ctx.theme.mascots) tl.add(stageConfetti(root, { x: center ? 960 : 1420, y: center ? 760 : 720, count: 48, velocity: 1250 }), at(1.85));
  });

  useIdle((root, { calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-welcome-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c));
    const anims = chars.flatMap((c, i) => charAnim.idle(c, { calm, seed: i * 3 }));
    // Every so often one of them hops, like they cannot sit still.
    let n = 0;
    const hop = gsap.delayedCall(4.5, function loop() {
      const c = chars[n++ % Math.max(1, chars.length)];
      if (c) charAnim.hop(c, { height: calm ? 8 : 18 });
      hop.restart(true);
    });
    const disc = root.querySelector('[data-welcome-disc]');
    const spin = disc ? gsap.to(disc, { rotation: '+=360', duration: 80, ease: 'none', repeat: -1 }) : null;
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
      hop.kill();
      spin?.kill();
    };
  });

  const castBox = center ? { x: 560, y: 690, w: 800, h: 230 } : { x: 1150, y: 520, w: 660, h: 260 };
  const size = cast.length > 2 ? (center ? 170 : 150) : 200;
  return (
    <>
      <El id="disc" label="Color disc" box={center ? { x: 1320, y: -260, w: 820, h: 820 } : { x: 1080, y: 120, w: 820, h: 820 }} enter="none" locked>
        <div data-welcome-disc="" style={{ width: '100%', height: '100%', opacity: ctx.colors.dark ? 0.35 : 1 }}>
          <BrandShape shape={center ? 'arch' : 'circle'} color={ctx.colors.accentSoft} />
        </div>
      </El>
      <El id="eyebrow" label="Eyebrow" box={center ? { x: 160, y: 150, w: 1600, h: 60 } : { x: 140, y: 200, w: 1000, h: 60 }} align={center ? 'center' : 'start'} enter="wipe" order={0}>
        <Eyebrow size={34}>{eyebrow}</Eyebrow>
      </El>
      <El id="title" label="Title" box={center ? { x: 140, y: 240, w: 1640, h: 400 } : { x: 130, y: 280, w: 1060, h: 520 }} align={center ? 'center' : 'start'} enter="split-chars" order={1} morph={ctx.event ? `event:${ctx.event.id}:title` : null}>
        <FitText max={center ? 210 : 190} min={64} casl={0} lineHeight={0.9} valign={center ? 'center' : 'start'}>
          {title}
        </FitText>
      </El>
      {subtitle ? (
        <El id="subtitle" label="Date and room" box={center ? { x: 260, y: 640, w: 1400, h: 60 } : { x: 140, y: 820, w: 1000, h: 110 }} align={center ? 'center' : 'start'} enter="rise" order={5}>
          <FitText max={40} min={24} font="mono" lineHeight={1.3}>
            {subtitle}
          </FitText>
        </El>
      ) : null}
      {cast.length ? (
        <El id="cast" label="Characters" box={castBox} enter="none" lockAspect>
          <div data-welcome-shelf="" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, borderRadius: 10, background: ctx.colors.fg, opacity: 0.9 }} />
          <div style={{ position: 'absolute', inset: 0, bottom: 10, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 20 }}>
            {cast.map((s, i) => (
              <div key={s} data-welcome-char="" style={{ width: size, height: size }}>
                <BumperCharacter shape={s} mood={i === 1 ? 'wink' : 'happy'} lookX={center ? 0 : -0.6} shadow />
              </div>
            ))}
          </div>
        </El>
      ) : null}
      <El id="tag" label="Hello tag" box={center ? { x: 1440, y: 900, w: 340, h: 90 } : { x: 1470, y: 850, w: 340, h: 90 }} enter="pop" order={9} align="end">
        <span style={{ ...fontStyle('display', { weight: 800, casl: 1 }), fontSize: 44, padding: '10px 26px', borderRadius: 999, background: ctx.colors.accentHex, color: ctx.colors.onAccent, rotate: '-4deg', display: 'inline-block', whiteSpace: 'nowrap' }}>{ctx.text('tag')}</span>
      </El>
    </>
  );
}

export default defineTemplate({
  kind: 'welcome',
  background: 'paper',
  variants: [
    { key: 'split', label: 'Title left, crew right' },
    { key: 'center', label: 'Centered' },
  ],
  fields: [
    f.eyebrow((ctx) => (ctx.event?.number != null ? `Welcome to Zemi ${eventNumberLabel(ctx.event)}` : 'Welcome to Zemi')),
    f.title((ctx) => ctx.event?.title ?? 'Hello, Friday.'),
    f.subtitle((ctx) => (ctx.event ? [formatJakarta(ctx.event.startsAt, 'date-long'), eventRoom(ctx.event)].filter(Boolean).join('  ·  ') : '')),
    { key: 'tag', label: 'Sticker', type: 'text', max: 30, default: 'Glad you came', group: 'options' },
  ],
  describe: (ctx) => (ctx.event ? `Welcome to ${eventNumberLabel(ctx.event) || ctx.event.title}` : 'Welcome'),
  headline: () => 'Welcome',
  Render,
});
