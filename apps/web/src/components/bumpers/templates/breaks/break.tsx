'use client';

import { jakartaTimeInput, MARK_PATHS, SHAPE_COLORS, SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { useState } from 'react';
import { useBumperNow } from '../../engine/clock';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { INK, PAPER } from '../../engine/palette';
import { currentRundownIndex, isDefaultField, rundownInstant } from '../../engine/resolve';
import type { ResolveCtx, ResolvedRundownItem } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { Countdown, countdownTarget } from '../../parts/countdown';
import { charColor, Pill, rest, restChars, textInk } from '../_tpl-mid-kit';
import { defineTemplate, Eyebrow, f, useMascots } from '../kit';

const BREAK_RE = /break|coffee|istirahat|ishoma|networking|lunch|rehat/i;
/** Beyond this the digits would be noise (rehearsals, a break planned for later): show the time instead. */
const FAR_MS = 3 * 3600_000;

/** The break this slide is about: the picked rundown item, else the break on now, the next one, or the first. */
function breakItem(ctx: ResolveCtx): ResolvedRundownItem | null {
  if (ctx.rundownItem) return ctx.rundownItem;
  const list = ctx.rundown.filter((r) => BREAK_RE.test(r.agenda));
  if (!list.length) return null;
  const now = currentRundownIndex(ctx.event, ctx.now());
  return list.find((r) => r.index === now) ?? list.find((r) => r.index > now) ?? list[0]!;
}

/** When the break ends by the rundown: its end time, else the next item's start. */
function rundownBack(ctx: ResolveCtx): string {
  const b = breakItem(ctx);
  if (!b) return '';
  return b.endTime ?? ctx.rundown[b.index + 1]?.time ?? '';
}

function nextAfterBreak(ctx: ResolveCtx): ResolvedRundownItem | null {
  const b = breakItem(ctx);
  return b ? (ctx.rundown[b.index + 1] ?? null) : null;
}

/** Planned length in minutes (rundown start to end), or null. */
function breakLength(ctx: ResolveCtx): number | null {
  const b = breakItem(ctx);
  const back = rundownBack(ctx);
  if (!b || !back || !ctx.event) return null;
  const m = Math.round((rundownInstant(ctx.event, back) - rundownInstant(ctx.event, b.time)) / 60000);
  return m > 0 ? m : null;
}

/** Target instant: a typed "back at" wins, then typed minutes, then the rundown, then the default minutes. */
function useBreakTarget(ctx: ResolveCtx): { target: number; minutesMode: boolean } {
  const [mounted] = useState(() => ctx.now());
  const mount = ctx.liveSince() ?? mounted;
  const untilTyped = !isDefaultField(ctx.slide, 'until');
  const minutesTyped = !isDefaultField(ctx.slide, 'minutes');
  const until = ctx.text('until');
  const parsed = until ? countdownTarget(until, ctx.event?.startsAt ?? null) : null;
  const minutesMode = parsed == null || (minutesTyped && !untilTyped);
  const minutes = Math.max(1, ctx.num('minutes', 15));
  return { target: minutesMode ? mount + minutes * 60_000 : parsed!, minutesMode };
}

/** A big mug with the Zemi mark, a saucer and three curls of steam (viewBox 680 x 780). */
function Cup({ cupFill, line, steam }: { cupFill: string; line: string; steam: string }) {
  // The mark prints in color on a paper mug, in ink on a yellow one, in paper on any other color.
  const markFill = (s: ShapeName) => (cupFill === PAPER ? SHAPE_COLORS[s] : cupFill === SHAPE_COLORS.square ? INK : PAPER);
  const steamPaths = [
    'M232 300 C 196 250, 268 214, 232 164 S 196 76, 236 24',
    'M320 296 C 284 240, 356 206, 320 150 S 284 58, 324 6',
    'M408 300 C 372 250, 444 214, 408 164 S 372 76, 412 24',
  ];
  return (
    <svg viewBox="0 0 680 780" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      <g data-steam="">
        {steamPaths.map((d, i) => (
          <path key={i} data-steam-curl="" d={d} fill="none" stroke={steam} strokeWidth={18} strokeLinecap="round" opacity={0.55} />
        ))}
      </g>
      <g data-saucer="" style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}>
        <ellipse cx="320" cy="690" rx="304" ry="56" fill={PAPER} stroke={line} strokeWidth="10" />
        <ellipse cx="320" cy="680" rx="170" ry="24" fill="none" stroke={line} strokeWidth="6" opacity="0.35" />
      </g>
      <g data-cup="" style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
        <path d="M546 404 C 650 400, 662 560, 530 586" fill="none" stroke={line} strokeWidth="58" strokeLinecap="round" />
        <path d="M546 404 C 650 400, 662 560, 530 586" fill="none" stroke={cupFill} strokeWidth="38" strokeLinecap="round" />
        <path d="M104 340 L 146 612 Q 154 672 214 672 L 426 672 Q 486 672 494 612 L 536 340 Z" fill={cupFill} stroke={line} strokeWidth="10" strokeLinejoin="round" />
        <ellipse cx="320" cy="340" rx="216" ry="44" fill={cupFill} stroke={line} strokeWidth="10" />
        <ellipse data-coffee="" cx="320" cy="344" rx="186" ry="30" fill={INK} />
        <ellipse cx="282" cy="338" rx="70" ry="9" fill={PAPER} opacity="0.18" />
        <g transform="translate(262 440) scale(1.16)">
          {SHAPE_ORDER.map((s) => (
            <path key={s} d={MARK_PATHS[s]} fill={markFill(s)} />
          ))}
        </g>
      </g>
    </svg>
  );
}

/**
 * Coffee break: "Back at 15:10" from the rundown (or a typed time, or N minutes), a live
 * countdown, what comes after the break, and a big mug whose steam curls forever while Block
 * leans on it. Built to loop on screen for the whole break.
 */
function Render() {
  const ctx = useSlide();
  const clock = ctx.slide.style.variant === 'clock';
  const cast = useMascots(['square']).slice(0, 2);
  const live = ctx.mode === 'live';
  const { target, minutesMode } = useBreakTarget(ctx);
  const now = useBumperNow(30_000, live);
  const reference = live ? now : ctx.now();
  const far = target - reference > FAR_MS;
  const showDigits = live && !far;
  const back = jakartaTimeInput(new Date(target));
  const title = ctx.text('title').replace(/\{back\}/g, back);
  const eyebrow = ctx.text('eyebrow');
  const body = ctx.text('body');
  const next = ctx.flag('showNext', true) ? ctx.text('next') : '';
  const nextItem = nextAfterBreak(ctx);
  const length = minutesMode ? Math.max(1, ctx.num('minutes', 15)) : breakLength(ctx);
  const lengthLabel = length ? `A ${length} minute break` : 'Short break';
  const ink = textInk(ctx);
  const accent = ink.accent;
  const cupFill = ctx.background === 'accent' ? PAPER : ctx.colors.accentHex;
  const line = ctx.colors.dark && ctx.background !== 'accent' ? PAPER : INK;

  useEnter((tl, root, { at, calm }) => {
    const saucer = root.querySelector('[data-saucer]');
    const cup = root.querySelector('[data-cup]');
    const curls = root.querySelectorAll('[data-steam-curl]');
    // A replay can catch the steam mid curl: start every wisp from rest.
    rest(root, '[data-steam-curl]', { x: 0, y: 0, opacity: 0.55 });
    rest(root, '[data-coffee]', { attr: { rx: 186 } });
    if (saucer) tl.fromTo(saucer, { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: at(0.6), ease: BE.out }, at(0.15));
    if (cup) {
      tl.fromTo(cup, { y: calm ? -140 : -620, rotation: calm ? 0 : -8 }, { y: 0, rotation: 0, duration: at(0.8), ease: 'power3.in' }, at(0.3));
      tl.fromTo(cup, { scaleY: 0.86, scaleX: 1.08 }, { scaleY: 1, scaleX: 1, duration: at(0.7), ease: 'elastic.out(1, 0.4)' }, at(1.1));
    }
    const coffee = root.querySelector('[data-coffee]');
    if (coffee) tl.fromTo(coffee, { attr: { ry: 14 } }, { attr: { ry: 30 }, duration: at(0.9), ease: 'elastic.out(1, 0.3)' }, at(1.1));
    if (curls.length) tl.fromTo(curls, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: at(1.2), ease: BE.inOut, stagger: at(0.18) }, at(1.3));
    const titleFit = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleFit) tl.fromTo(titleFit, { '--casl': 0 }, { '--casl': 0.8, duration: at(1.5), ease: 'power2.out' }, at(0.35));
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-break-char]'));
    restChars(chars);
    chars.forEach((c, i) => {
      const from = Number(c.dataset.from ?? -1);
      tl.fromTo(c, { x: from * (calm ? 80 : 300), opacity: 0 }, { x: 0, opacity: 1, duration: at(0.7), ease: BE.out }, at(1.05 + i * 0.2));
      tl.add(charAnim.hop(c, { height: calm ? 8 : 24 }), at(1.1 + i * 0.2));
      tl.add(charAnim.look(c, Number(c.dataset.look ?? 0.8), -0.9, 0.4), at(1.9));
    });
  });

  useIdle((root, { calm }) => {
    const anims: gsap.core.Animation[] = [];
    root.querySelectorAll('[data-steam-curl]').forEach((p, i) => {
      // Each curl rises, lets go at the bottom and fades, then grows again: steam that never stops.
      const tl = gsap.timeline({ repeat: -1, delay: i * 0.9 });
      tl.fromTo(p, { drawSVG: '0% 100%', y: 0, opacity: 0.55 }, { drawSVG: '100% 100%', y: calm ? -20 : -44, opacity: 0, duration: calm ? 3.2 : 2.4, ease: 'sine.in' })
        .set(p, { drawSVG: '0% 0%', y: 20, opacity: 0.55 })
        .to(p, { drawSVG: '0% 100%', y: 0, duration: calm ? 2.2 : 1.6, ease: 'sine.out' });
      anims.push(tl);
      anims.push(gsap.fromTo(p, { x: -6 }, { x: 6, duration: 1.9 + i * 0.3, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    });
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-break-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c, { min: 3.2, max: 6.5 }));
    chars.forEach((c, i) => {
      anims.push(...charAnim.idle(c, { calm: true, seed: i * 2 + 1 }));
      // Now and then a slow glance at the room, then back to the steam.
      const glance = gsap.timeline({ repeat: -1, repeatDelay: 5 + i });
      glance.add(charAnim.look(c, 0, 0.3, 0.5), 4).add(charAnim.look(c, Number(c.dataset.look ?? 0.8), -0.9, 0.6), 6.5);
      anims.push(glance);
    });
    const coffee = root.querySelector('[data-coffee]');
    if (coffee) anims.push(gsap.fromTo(coffee, { attr: { rx: 186 } }, { attr: { rx: 180 }, duration: 2.8, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
    };
  });

  const cupBox = clock ? { x: 1490, y: 590, w: 320, h: 367 } : { x: 1150, y: 176, w: 640, h: 734 };
  const charSize = clock ? 130 : 210;
  const charSpots = [
    { x: cupBox.x - charSize * (clock ? 0.7 : 0.62), y: cupBox.y + cupBox.h * 0.9 - charSize, from: -1, look: 0.8 },
    { x: cupBox.x + cupBox.w * 0.8, y: cupBox.y + cupBox.h * 0.9 - charSize * 0.85, from: 1, look: -0.8 },
  ];
  const digits = (size: number, color: string) => <Countdown to={target} variant="big" size={size} done={ctx.text('done')} color={color} style={{ textShadow: ink.shadow }} />;

  return (
    <>
      <El id="cup" label="Coffee cup" box={cupBox} enter="fade" order={0} lockAspect>
        <Cup cupFill={cupFill} line={line} steam={ink.fg} />
      </El>
      {cast.map((s, i) => {
        const spot = charSpots[i]!;
        return (
          <El key={s} id={`char-${i}`} label={i ? 'Second character' : 'Character'} box={{ x: Math.round(spot.x), y: Math.round(spot.y), w: charSize, h: charSize }} enter="fade" order={4} lockAspect>
            <div data-break-char="" data-from={spot.from} data-look={spot.look} style={{ width: '100%', height: '100%', rotate: i ? '6deg' : '-7deg' }}>
              <BumperCharacter shape={s as ShapeName} color={charColor(ctx, s as ShapeName)} mood="happy" lookX={spot.look} lookY={-0.9} />
            </div>
          </El>
        );
      })}
      <El id="eyebrow" label="Eyebrow" box={clock ? { x: 160, y: 150, w: 1600, h: 56 } : { x: 140, y: 196, w: 980, h: 56 }} align={clock ? 'center' : 'start'} enter="wipe" order={1}>
        <Eyebrow size={32} shape="square" color={ink.fg} style={{ textShadow: ink.shadow }}>
          {eyebrow}
        </Eyebrow>
      </El>
      {clock ? (
        <>
          <El id="countdown" label="Countdown" box={{ x: 160, y: 236, w: 1600, h: 380 }} align="center" valign="center" enter="zoom" order={2}>
            {showDigits ? digits(340, ink.fg) : <span style={{ ...fontStyle('mono', { weight: 700, tracking: -0.02 }), fontSize: 340, lineHeight: 0.9, color: ink.fg, textShadow: ink.shadow }}>{back}</span>}
          </El>
          <El id="title" label="Back at" box={{ x: 260, y: 630, w: 1400, h: 130 }} align="center" enter="rise" order={3}>
            <FitText max={110} min={48} casl={0.8} lineHeight={0.95} valign="center" style={{ color: accent, textShadow: ink.shadow }}>
              {showDigits ? title : lengthLabel}
            </FitText>
          </El>
        </>
      ) : (
        <>
          <El id="title" label="Back at" box={{ x: 130, y: 268, w: 990, h: 390 }} enter="split-words" order={2}>
            <FitText max={200} min={80} casl={0.8} lineHeight={0.9} style={{ color: ink.fg, textShadow: ink.shadow }}>
              {title}
            </FitText>
          </El>
          <El id="countdown" label="Countdown" box={{ x: 140, y: 686, w: 980, h: 140 }} enter="rise" order={3} valign="center">
            {showDigits ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 22 }}>
                {digits(132, accent)}
                <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.12 }), fontSize: 28, color: ink.fg2, textShadow: ink.shadow, textTransform: 'uppercase' }}>to go</span>
              </div>
            ) : (
              <Pill icon="clock" bg={ctx.colors.dark ? 'rgba(255,255,255,0.1)' : ctx.background === 'accent' ? PAPER : ctx.colors.accentSoft} fg={ctx.colors.dark ? PAPER : INK} size={46}>
                {lengthLabel}
              </Pill>
            )}
          </El>
        </>
      )}
      {body ? (
        <El id="body" label="Line" box={clock ? { x: 360, y: 800, w: 1000, h: 60 } : { x: 140, y: 846, w: 980, h: 60 }} align={clock ? 'center' : 'start'} enter="rise" order={5}>
          <FitText max={40} min={22} font="body" weight={500} lineHeight={1.3} valign="center" style={{ color: ink.fg2, textShadow: ink.shadow }}>
            {body}
          </FitText>
        </El>
      ) : null}
      {next ? (
        <El id="next" label="After the break" box={clock ? { x: 360, y: 884, w: 1000, h: 64 } : { x: 140, y: 926, w: 980, h: 64 }} align={clock ? 'center' : 'start'} enter="rise" order={6} morph={nextItem ? `rundown:${nextItem.index}` : null}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, height: '100%', maxWidth: '100%' }}>
            <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.12 }), fontSize: 26, textTransform: 'uppercase', color: ink.fg2, textShadow: ink.shadow, flex: 'none' }}>Then</span>
            {nextItem ? <span style={{ ...fontStyle('mono', { weight: 700 }), fontSize: 30, padding: '6px 14px', borderRadius: 12, background: ink.fg, color: ink.cam ? INK : ctx.colors.bg, flex: 'none' }}>{nextItem.time}</span> : null}
            <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
              <FitText max={36} min={20} casl={0.5} weight={800} lineHeight={1.1} valign="center" balance={false} style={{ color: ink.fg, textShadow: ink.shadow }}>
                {next}
              </FitText>
            </div>
          </div>
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'break',
  background: 'ink',
  variants: [
    { key: 'cup', label: 'Big mug, text left' },
    { key: 'clock', label: 'Countdown in the middle' },
  ],
  fields: [
    f.eyebrow((ctx) => breakItem(ctx)?.agenda ?? 'Coffee break'),
    { ...f.title('Back at {back}', 'Title', 80), hint: '{back} is the time we start again.' },
    { key: 'until', label: 'Back at', type: 'time', tokens: false, default: rundownBack, hint: 'HH:mm in WIB. From the rundown when there is a break in it.' },
    { ...f.minutes(15, 'Or a number of minutes'), hint: 'Counts from when this bumper shows. For a looping break, set "Back at" instead.' },
    f.body('Grab a coffee, stretch, say hi to someone new.', 'Line', 160),
    { key: 'next', label: 'After the break', type: 'text', max: 160, default: (ctx) => nextAfterBreak(ctx)?.agenda ?? '' },
    { key: 'showNext', label: 'Show what comes next', type: 'toggle', default: true, group: 'options' },
    { key: 'done', label: 'When time is up', type: 'text', max: 40, default: 'Find your seat', group: 'options' },
  ],
  presets: [
    { key: 'coffee', label: 'Coffee break', description: 'Follows the rundown when there is a break in it.', slide: {} },
    { key: 'lunch', label: 'Lunch break', description: 'Longer, with prayer time.', slide: { fields: { eyebrow: 'Lunch break', body: 'Eat, pray, stretch. We will keep your seat warm.' } } },
    { key: 'quick', label: 'Five minutes', description: 'A quick stretch between talks.', slide: { fields: { eyebrow: 'Quick stretch', minutes: 5, body: 'Stand up, refill, come right back.', showNext: false } } },
  ],
  describe: (ctx) => {
    const back = isDefaultField(ctx.slide, 'minutes') || !isDefaultField(ctx.slide, 'until') ? ctx.text('until') : '';
    return back ? `${ctx.text('eyebrow')}, back at ${back}` : `${ctx.text('eyebrow')}, ${Math.max(1, ctx.num('minutes', 15))} minutes`;
  },
  headline: (ctx) => {
    const e = ctx.text('eyebrow');
    return e.length <= 14 ? e : 'Break';
  },
  Render,
});
