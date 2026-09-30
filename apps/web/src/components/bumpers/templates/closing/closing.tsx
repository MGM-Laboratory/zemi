'use client';

import { formatJakarta, SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { eventNumberLabel } from '../../engine/resolve';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { StaticMark } from '../../parts/shapes';
import { accentText, drizzle, itemKind, onAccentBg, popFill, resetCast, shapeTint, siteSocialItems, SocialGlyph } from '../_tpl-end-kit';
import { defineTemplate, Eyebrow, f, useMascots } from '../kit';

interface Stat {
  key: string;
  n: number;
  label: string;
}

function stats(ctx: ResolveCtx): Stat[] {
  const s = ctx.site.stats;
  return [
    { key: 'talks', n: s.talks, label: s.talks === 1 ? 'talk' : 'talks' },
    { key: 'speakers', n: s.speakers, label: s.speakers === 1 ? 'speaker' : 'speakers' },
    { key: 'hours', n: s.hoursOfTalk, label: 'hours of talk' },
  ].filter((x) => x.n > 0);
}

/** Bottom row first: the solid ones hold up the rest (split variant stack). */
const STACK_WEIGHT: Record<ShapeName, number> = { square: 0, arch: 1, circle: 2, triangle: 3 };
/** Stack spots inside the 664x790 cast box, by cast size: [x, y, size]. */
const STACK: Record<number, Array<[number, number, number]>> = {
  1: [[152, 430, 360]],
  2: [
    [42, 510, 280],
    [342, 510, 280],
  ],
  3: [
    [62, 540, 250],
    [352, 540, 250],
    [212, 300, 240],
  ],
  4: [
    [62, 540, 250],
    [352, 540, 250],
    [217, 310, 230],
    [237, 130, 190],
  ],
};

/**
 * Thanks for coming: "That's a wrap" loosening all the way to Friday chat, the event number,
 * a few stats, the socials, and the four characters waving goodbye by bouncing while shape
 * confetti drizzles down. Center: the crew rolls in from both sides. Split: they stack up.
 */
function Render() {
  const ctx = useSlide();
  const split = ctx.slide.style.variant === 'split';
  const cast = useMascots([...SHAPE_ORDER]);
  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title');
  const subtitle = ctx.text('subtitle');
  const list = ctx.flag('showStats', true) ? stats(ctx) : [];
  const socials = ctx.flag('showSocials', true) ? siteSocialItems(ctx.site, false).slice(0, 3) : [];
  const still = ctx.theme.motion === 'still';
  const stacked = split ? [...cast].sort((a, b) => STACK_WEIGHT[a] - STACK_WEIGHT[b]) : cast;

  useEnter((tl, root, { at, calm }) => {
    const t = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (t) tl.fromTo(t, { '--casl': 0 }, { '--casl': 1, duration: at(2), ease: 'power2.out' }, at(0.4));
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-closing-char]'));
    resetCast(chars);
    if (still) return;
    if (split) {
      chars.forEach((c, i) => {
        tl.fromTo(c, { y: -900, rotation: (i % 2 ? 1 : -1) * 24 }, { y: 0, rotation: 0, duration: at(0.7), ease: 'bounce.out' }, at(0.45 + i * 0.22));
        tl.add(charAnim.squash(c), at(0.95 + i * 0.22));
      });
    } else {
      chars.forEach((c, i) => {
        const fromLeft = i < Math.ceil(chars.length / 2);
        tl.add(charAnim.rollIn(c, fromLeft ? -1300 : 1300, { duration: at(calm ? 1.2 : 1), shape: c.dataset.shape as ShapeName }), at(0.35 + (fromLeft ? i : chars.length - 1 - i) * 0.12));
        tl.add(charAnim.look(c, fromLeft ? 1 : -1, 0, 0.3), at(1.35));
        tl.add(charAnim.look(c, 0, -0.4, 0.3), at(1.85));
      });
    }
    const wave = at(split ? 0.9 + chars.length * 0.22 : 1.9);
    chars.forEach((c, i) => tl.add(charAnim.cheer(c, { height: calm ? 14 : 34, spin: !calm && i % 2 === 0 }), wave + at(i * 0.09)));
    const mark = root.querySelectorAll<SVGGElement>('[data-closing-mark] [data-shape]');
    if (mark.length) tl.fromTo(mark, { scale: 0, rotation: -90 }, { scale: 1, rotation: 0, duration: at(0.7), ease: 'back.out(1.8)', stagger: at(0.1) }, at(0.5));
  });

  useIdle((root, { calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-closing-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c));
    const anims: gsap.core.Animation[] = chars.flatMap((c, i) => charAnim.idle(c, { calm, seed: i * 5 + 1 }));
    // Goodbye: a little bouncing wave runs through the crew every few seconds (on the wrappers,
    // so it never fights the sway and bob inside the characters).
    const wave = gsap.timeline({ repeat: -1, repeatDelay: calm ? 5 : 3.2, delay: 1.2 });
    chars.forEach((c, i) => {
      const tilt = (i % 2 ? 1 : -1) * (calm ? 5 : 10);
      wave.to(c, { y: calm ? -10 : -26, rotation: tilt, transformOrigin: '50% 100%', duration: 0.24, ease: 'power2.out', yoyo: true, repeat: 1 }, i * 0.14);
    });
    anims.push(wave);
    const mark = root.querySelectorAll('[data-closing-mark] [data-shape]');
    if (mark.length) {
      const hop = gsap.timeline({ repeat: -1, repeatDelay: 4, delay: 1 });
      hop.to(mark, { y: -10, duration: 0.3, ease: 'power2.out', yoyo: true, repeat: 1, stagger: 0.08 });
      anims.push(hop);
    }
    const stopRain = drizzle(root, { calm, tint: (shape) => shapeTint(ctx.colors, shape) });
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
      stopRain();
    };
  });

  const center = !split;
  const align = center ? 'center' : 'start';
  const castBox = center ? { x: 420, y: 548, w: 1080, h: 250 } : { x: 1160, y: 120, w: 664, h: 800 };
  const rowSize = cast.length > 2 ? 200 : 230;
  const spots = STACK[stacked.length] ?? [];
  const chip = onAccentBg(ctx.colors) ? (ctx.colors.dark ? '#ffffff26' : '#0e11161a') : ctx.background === 'image' ? '#0e1116b3' : ctx.colors.dark ? '#ffffff14' : ctx.colors.accentSoft;
  const statInk = ctx.colors.dark ? ctx.colors.fg : accentText(ctx.colors);
  const markTone = ctx.background === 'accent' ? (ctx.colors.dark ? 'paper' : 'ink') : 'color';

  return (
    <>
      <El id="eyebrow" label="Eyebrow" box={center ? { x: 260, y: 118, w: 1400, h: 56 } : { x: 130, y: 170, w: 980, h: 56 }} align={align} enter="wipe">
        <Eyebrow size={32}>{eyebrow}</Eyebrow>
      </El>
      <El id="title" label="Title" box={center ? { x: 140, y: 186, w: 1640, h: 254 } : { x: 120, y: 236, w: 1010, h: 440 }} align={align} enter={center ? 'split-words' : 'split-chars'} order={1}>
        <FitText max={center ? 210 : 240} min={90} casl={0} lineHeight={center ? 1 : 0.88} valign={center ? 'center' : 'end'}>
          {title}
        </FitText>
      </El>
      {subtitle ? (
        <El id="subtitle" label="Line" box={center ? { x: 260, y: 450, w: 1400, h: 66 } : { x: 130, y: 694, w: 980, h: 72 }} align={align} enter="rise" order={5}>
          <FitText max={52} min={28} weight={750} casl={0.9} tracking={-0.01} lineHeight={1.1} style={{ color: ctx.colors.fg2 }}>
            {subtitle}
          </FitText>
        </El>
      ) : null}
      {cast.length ? (
        <El id="cast" label="Characters" box={castBox} enter="fade" lockAspect>
          {split ? (
            <>
              <div style={{ position: 'absolute', left: 20, right: 20, bottom: 0, height: 12, borderRadius: 12, background: ctx.colors.fg, opacity: 0.9 }} />
              {stacked.map((s, i) => {
                const [x, y, size] = spots[i] ?? [0, 0, 200];
                return (
                  <div key={s} data-closing-char="" data-shape={s} style={{ position: 'absolute', left: x, top: y - 12, width: size, height: size }}>
                    <BumperCharacter shape={s} color={shapeTint(ctx.colors, s)} mood={i === 1 ? 'wink' : 'happy'} lookX={-0.4} lookY={-0.2} />
                  </div>
                );
              })}
            </>
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 50 }}>
              {cast.map((s, i) => (
                <div key={s} data-closing-char="" data-shape={s} style={{ width: rowSize, height: rowSize }}>
                  <BumperCharacter shape={s} color={shapeTint(ctx.colors, s)} mood={i === 1 ? 'wink' : 'happy'} lookY={-0.3} shadow />
                </div>
              ))}
            </div>
          )}
        </El>
      ) : (
        <El id="mark" label="Zemi mark" box={center ? { x: 845, y: 560, w: 230, h: 230 } : { x: 1230, y: 250, w: 520, h: 520 }} enter="fade" lockAspect>
          <div data-closing-mark="" style={{ width: '100%', height: '100%' }}>
            <StaticMark tone={markTone} />
          </div>
        </El>
      )}
      {center && list.length ? (
        <El id="stats" label="Stats" box={{ x: 400, y: 836, w: 1120, h: 78 }} align="center" valign="center" enter="rise" order={7}>
          <div style={{ height: '100%', maxWidth: '100%', display: 'flex', alignItems: 'center', padding: '0 40px', borderRadius: 999, background: chip }}>
            <div style={{ height: 44, width: '100%' }}>
              <FitText max={36} min={20} font="body" weight={600} lineHeight={1.2} valign="center" balance={false} style={{ whiteSpace: 'nowrap' }}>
                {list.map((s, i) => (
                  <span key={s.key}>
                    {i > 0 ? <span style={{ opacity: 0.4, margin: '0 0.55em' }}>·</span> : null}
                    <span style={{ ...fontStyle('display', { weight: 950, casl: 0.5 }), color: statInk }}>{s.n}</span> {s.label}
                  </span>
                ))}
              </FitText>
            </div>
          </div>
        </El>
      ) : null}
      {split
        ? list.map((s, i) => (
            <El key={s.key} id={`stat-${s.key}`} label={`Stat: ${s.label}`} box={{ x: 130 + i * 320, y: 800, w: 300, h: 128 }} enter="count" order={6 + i * 0.7}>
              <div style={{ width: '100%', height: 92 }}>
                <FitText max={100} min={30} weight={950} casl={0.5} lineHeight={0.95} style={{ color: ctx.colors.dark || onAccentBg(ctx.colors) ? popFill(ctx.colors) : accentText(ctx.colors) }}>
                  {String(s.n)}
                </FitText>
              </div>
              <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.1 }), fontSize: 24, marginTop: 6, textTransform: 'uppercase', color: ctx.colors.fg2, whiteSpace: 'nowrap' }}>{s.label}</span>
            </El>
          ))
        : null}
      {socials.length ? (
        <El id="socials" label="Socials" box={center ? { x: 420, y: 950, w: 1080, h: 46 } : { x: 1160, y: 950, w: 664, h: 46 }} align="center" valign="center" enter="fade" order={9}>
          <div style={{ display: 'flex', gap: 40, alignItems: 'center', justifyContent: 'center', flexWrap: 'nowrap', color: ctx.colors.fg }}>
            {socials.map((it) => (
              <span key={it.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap' }}>
                <span style={{ width: 32, height: 32, flex: 'none' }}>
                  <SocialGlyph kind={itemKind(it)} />
                </span>
                <span style={{ ...fontStyle('body', { weight: 700 }), fontSize: 28, lineHeight: 1 }}>{it.title}</span>
              </span>
            ))}
          </div>
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'closing',
  background: 'paper',
  variants: [
    { key: 'center', label: 'Centered, crew in a row' },
    { key: 'split', label: 'Title left, crew stacked' },
  ],
  fields: [
    f.eyebrow((ctx) => (ctx.event?.number != null ? `Thanks for coming to Zemi ${eventNumberLabel(ctx.event)}` : 'Thanks for coming')),
    f.title("That's a wrap"),
    f.subtitle((ctx) => {
      const n = ctx.nextEvent;
      if (!n || (ctx.event && n.id === ctx.event.id)) return 'See you next Friday.';
      return `See you next ${formatJakarta(n.startsAt, 'weekday')}, ${formatJakarta(n.startsAt, 'date-short')}.`;
    }, 'Line'),
    { key: 'showStats', label: 'Show Zemi stats', type: 'toggle', default: true, group: 'options', hint: 'Talks, speakers and hours so far, from the site.' },
    { key: 'showSocials', label: 'Show socials', type: 'toggle', default: true, group: 'options' },
  ],
  describe: (ctx) => (ctx.event?.number != null ? `Thanks for coming to ${eventNumberLabel(ctx.event)}` : 'Thanks for coming'),
  headline: () => 'Thanks',
  Render,
});
