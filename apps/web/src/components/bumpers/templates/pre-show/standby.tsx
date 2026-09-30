'use client';

import { formatJakarta, jakartaTimeInput, SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { useEffect, useRef } from 'react';
import { useBumperNow } from '../../engine/clock';
import { useElScope, useEnter, useIdle } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { eventNumberLabel, eventRoom } from '../../engine/resolve';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { countdownTarget } from '../../parts/countdown';
import { defineTemplate, Eyebrow, f, useMascots } from '../kit';
import { accentText, charColor, Label, MONO_ADVANCE, moves, plate, plateStyle, TickDigit, timeLeft, two, useOpenCtx, type Plate } from '../_tpl-open-kit';

/**
 * Starting soon: a big live countdown on a card the crew uses as a bench. The four characters
 * land on it, glance at the clock and doze off; as the last minute runs down they wake up one by
 * one, and at zero everyone is up ("Any second now"). More than a day out it shows the day and
 * time instead of a silly hour count. Loops happily for as long as doors are open.
 */

function standbyTarget(ctx: ResolveCtx): number | null {
  const to = ctx.text('to');
  if (to) return countdownTarget(to, ctx.event?.startsAt ?? null);
  return ctx.event ? Date.parse(ctx.event.startsAt) : null;
}

/** Seconds left at which character i (of n) wakes up: spread over the last minute. */
function wakeAt(i: number, n: number) {
  return 60 - i * (60 / Math.max(1, n));
}

function awakeFlags(left: number | null, n: number): boolean[] {
  return Array.from({ length: n }, (_, i) => left != null && Math.ceil(left / 1000) <= wakeAt(i, n));
}

interface Layout {
  plate: { x: number; y: number; w: number; h: number };
  eyebrow: { x: number; y: number; w: number; h: number };
  cast: { x: number; y: number; w: number; h: number };
  charSize: number;
  maxDigit: number;
}

const HERO: Layout = {
  plate: { x: 310, y: 272, w: 1300, h: 486 },
  eyebrow: { x: 372, y: 310, w: 900, h: 44 },
  cast: { x: 400, y: 124, w: 780, h: 150 },
  charSize: 150,
  maxDigit: 330,
};

const SPLIT: Layout = {
  plate: { x: 1100, y: 390, w: 700, h: 420 },
  eyebrow: { x: 1150, y: 424, w: 600, h: 40 },
  cast: { x: 1130, y: 262, w: 640, h: 130 },
  charSize: 128,
  maxDigit: 210,
};

/** The clock readout inside the card: days, h:mm:ss, mm:ss, or the done line. */
function Readout({ target, box, maxDigit, p, doneText, idleText }: { target: number | null; box: { w: number; h: number }; maxDigit: number; p: Plate; doneText: string; idleText: string }) {
  const { ctx, live, calm } = useOpenCtx();
  const { scale } = useElScope();
  const now = useBumperNow(1000, ctx.mode !== 'thumb' && target != null);
  const left = target == null ? null : target - now;
  const wrap = { width: box.w, height: box.h, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center' };

  if (left == null || left <= 0) {
    return (
      <div style={wrap} data-sb-readout="">
        <div data-sb-group="" style={{ width: '100%', height: '78%' }}>
          <FitText max={maxDigit * 0.62} min={40} casl={1} weight={900} lineHeight={0.95} valign="center" style={{ textAlign: 'center' }}>
            {left == null ? idleText : doneText}
          </FitText>
        </div>
      </div>
    );
  }

  const t = timeLeft(left);
  if (t.d >= 1) {
    return (
      <div style={{ ...wrap, gap: 18 }} data-sb-readout="">
        <div data-sb-group="" style={{ ...fontStyle('display', { weight: 900, casl: 0.6 }), fontSize: Math.min(maxDigit * 0.8, box.w / 4.2) * scale, lineHeight: 0.9, whiteSpace: 'nowrap' }}>
          {t.d} {t.d === 1 ? 'day' : 'days'}
        </div>
        <div data-sb-group="" style={{ ...fontStyle('mono', { weight: 600 }), fontSize: Math.max(22, maxDigit * 0.15) * scale, color: p.fg2, whiteSpace: 'nowrap' }}>
          {formatJakarta(target!, 'weekday')} at {jakartaTimeInput(target!)} WIB
        </div>
      </div>
    );
  }

  const groups: Array<[string, string]> = t.h > 0 ? [[String(t.h), 'hr'], [two(t.m), 'min'], [two(t.s), 'sec']] : [[two(t.m), 'min'], [two(t.s), 'sec']];
  const chars = groups.reduce((n, [v]) => n + v.length, 0) + (groups.length - 1) * 0.7;
  const size = Math.min(maxDigit, (box.w * 0.94) / (chars * MONO_ADVANCE)) * scale;
  const label = Math.max(18, size * 0.1);
  return (
    <div style={wrap} data-sb-readout="">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
        {groups.map(([v, l], gi) => (
          <div key={l} style={{ display: 'flex', alignItems: 'flex-start' }}>
            {gi > 0 ? (
              <span data-sb-colon="" style={{ ...fontStyle('mono', { weight: 700, tracking: 0 }), fontSize: size, lineHeight: 0.92, width: size * MONO_ADVANCE, margin: `0 ${-size * MONO_ADVANCE * 0.15}px`, textAlign: 'center', color: ctx.colors.accentHex }}>
                :
              </span>
            ) : null}
            <div data-sb-group="" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ ...fontStyle('mono', { weight: 700, tracking: 0 }), fontSize: size, lineHeight: 0.92, display: 'flex', overflow: 'hidden', paddingBottom: size * 0.02 }}>
                {v.split('').map((d, i) => (
                  <TickDigit key={`${l}-${v.length - i}`} value={d} live={live && moves(ctx)} calm={calm} style={{ width: size * MONO_ADVANCE, textAlign: 'center' }} />
                ))}
              </div>
              <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.16 }), fontSize: label, textTransform: 'uppercase', color: p.fg2, marginTop: label * 0.5 }}>{l}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The crew on the bench. Each character stacks a sleepy and an awake version so waking up never swaps SVG nodes. */
function Bench({ cast, target, size }: { cast: ShapeName[]; target: number | null; size: number }) {
  const { ctx, live, calm } = useOpenCtx();
  const rootRef = useRef<HTMLDivElement>(null);
  const now = useBumperNow(1000, ctx.mode !== 'thumb' && target != null);
  const left = target == null ? null : target - now;
  const awake = awakeFlags(left, cast.length);
  const key = awake.map((a) => (a ? 1 : 0)).join('');
  const prev = useRef<string | null>(null);

  useEffect(() => {
    const was = prev.current;
    prev.current = key;
    const root = rootRef.current;
    if (was === null || was === key || !live || !moves(ctx) || !root) return;
    const chars = root.querySelectorAll<HTMLElement>('[data-sb-char]');
    const allUp = !key.includes('0');
    key.split('').forEach((flag, i) => {
      if (flag !== '1' || was[i] === '1') return;
      const c = chars[i];
      const up = c?.querySelector<HTMLElement>('[data-sb-awake]');
      const down = c?.querySelector<HTMLElement>('[data-sb-sleepy]');
      const z = c?.querySelector<HTMLElement>('[data-sb-z]');
      const bang = c?.querySelector<HTMLElement>('[data-sb-bang]');
      if (!c || !up || !down) return;
      const tl = gsap.timeline({ delay: i * 0.08 });
      tl.fromTo(down, { opacity: 1 }, { opacity: 0, duration: 0.18, ease: 'power1.out' }, 0)
        .fromTo(up, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: 'power1.out' }, 0)
        .fromTo(c, { y: 0 }, { y: calm ? -18 : -54, duration: 0.24, ease: 'power2.out' }, 0)
        .to(c, { y: 0, duration: 0.3, ease: 'bounce.out' }, 0.24)
        .add(charAnim.squash(up), 0.5)
        .add(charAnim.look(up, (i % 2 ? -1 : 1) * 0.5, 1, 0.3), 0.55);
      if (z) tl.fromTo(z, { opacity: 1 }, { opacity: 0, duration: 0.2 }, 0);
      if (bang) tl.fromTo(bang, { opacity: 0, scale: 0.2, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: BE.back }, 0.05).to(bang, { opacity: 0, y: -16, duration: 0.35, ease: 'power1.in' }, 1.1);
    });
    if (allUp && !calm) {
      Array.from(chars).forEach((c, i) => {
        const up = c.querySelector<HTMLElement>('[data-sb-awake]');
        if (up) charAnim.cheer(up, { height: 26, spin: i % 2 === 0 }).delay(0.9 + i * 0.09);
      });
    }
  }, [key, live, calm, ctx]);

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: size * 0.2 }}>
      {cast.map((s, i) => {
        const up = awake[i]!;
        return (
          <div key={s} data-sb-char="" data-awake={up ? '1' : '0'} style={{ position: 'relative', width: size, height: size, marginBottom: -3 }}>
            <div data-sb-breathe="" style={{ position: 'absolute', inset: 0, transformOrigin: '50% 100%' }}>
              <div data-sb-sleepy="" style={{ position: 'absolute', inset: 0, opacity: up ? 0 : 1 }}>
                <BumperCharacter shape={s} mood="sleepy" color={charColor(ctx, s)} name={`standby-sleepy-${s}`} />
              </div>
              <div data-sb-awake="" style={{ position: 'absolute', inset: 0, opacity: up ? 1 : 0 }}>
                <BumperCharacter shape={s} mood={i === 1 ? 'surprised' : 'idle'} color={charColor(ctx, s)} lookY={0.8} lookX={i % 2 ? -0.4 : 0.4} name={`standby-awake-${s}`} />
              </div>
            </div>
            <div data-sb-z="" aria-hidden="true" style={{ position: 'absolute', left: '72%', top: '-34%', width: size * 0.6, height: size * 0.6, opacity: up ? 0 : 1, pointerEvents: 'none' }}>
              {[0, 1, 2].map((k) => (
                <span
                  key={k}
                  data-sb-zz=""
                  style={{
                    ...fontStyle('display', { weight: 900, casl: 1 }),
                    position: 'absolute',
                    left: k * size * 0.14,
                    top: size * (0.36 - k * 0.2),
                    fontSize: size * (0.24 - k * 0.04),
                    lineHeight: 1,
                    color: ctx.colors.fg2,
                    opacity: 0.95 - k * 0.28,
                  }}
                >
                  z
                </span>
              ))}
            </div>
            <span data-sb-bang="" aria-hidden="true" style={{ ...fontStyle('display', { weight: 900, casl: 1 }), position: 'absolute', left: '50%', top: -size * 0.42, marginLeft: -size * 0.08, fontSize: size * 0.34, lineHeight: 1, color: accentText(ctx), opacity: 0 }}>
              !
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Render() {
  const { ctx } = useOpenCtx();
  const split = ctx.slide.style.variant === 'split';
  const L = split ? SPLIT : HERO;
  const cast = useMascots([...SHAPE_ORDER]);
  const p = plate(ctx);
  const target = standbyTarget(ctx);
  const title = ctx.text('title');
  const meta = ctx.text('subtitle');
  const line = ctx.text('line');
  const kicker = ctx.text('kicker');

  useEnter((tl, root, { at, calm: c }) => {
    if (!moves(ctx)) return;
    const card = root.querySelector('[data-sb-card]');
    if (card) tl.fromTo(card, { rotation: c ? -1.5 : -4, scale: c ? 0.97 : 0.9, transformOrigin: '50% 100%' }, { rotation: 0, scale: 1, duration: at(1.0), ease: BE.back }, at(0));
    const groups = root.querySelectorAll('[data-sb-readout] [data-sb-group]');
    if (groups.length) tl.fromTo(groups, { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, duration: at(0.8), ease: BE.out, stagger: at(0.1) }, at(0.25));
    const colon = root.querySelectorAll('[data-sb-colon]');
    if (colon.length) tl.fromTo(colon, { opacity: 0 }, { opacity: 1, duration: at(0.4) }, at(0.5));
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-sb-char]'));
    chars.forEach((ch, i) => {
      const up = ch.querySelector<HTMLElement>('[data-sb-awake]');
      const down = ch.querySelector<HTMLElement>('[data-sb-sleepy]');
      const z = ch.querySelector<HTMLElement>('[data-sb-z]');
      const stays = ch.dataset.awake === '1';
      const t0 = 0.45 + i * 0.13;
      tl.fromTo(ch, { y: c ? -200 : -420, rotation: (i % 2 ? 1 : -1) * (c ? 8 : 24) }, { y: 0, rotation: 0, duration: at(c ? 0.9 : 0.78), ease: 'bounce.out' }, at(t0));
      if (!up || !down) return;
      tl.add(charAnim.squash(up), at(t0 + 0.55));
      if (stays) return;
      // Land awake, look at the clock, then nod off one after another.
      tl.add(charAnim.look(up, 0, 1, 0.3), at(t0 + 0.8));
      const nod = 2.1 + i * 0.24;
      tl.fromTo(up, { opacity: 1 }, { opacity: 0, duration: at(0.35), ease: 'power1.inOut' }, at(nod));
      tl.fromTo(down, { opacity: 0 }, { opacity: 1, duration: at(0.35), ease: 'power1.inOut' }, at(nod));
      const breathe = ch.querySelector('[data-sb-breathe]');
      if (breathe) tl.fromTo(breathe, { scaleY: 1, scaleX: 1 }, { scaleY: 0.9, scaleX: 1.06, duration: at(0.3), yoyo: true, repeat: 1, ease: 'sine.inOut' }, at(nod));
      if (z) tl.fromTo(z, { opacity: 0 }, { opacity: 1, duration: at(0.5) }, at(nod + 0.3));
    });
    const titleFit = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleFit) tl.fromTo(titleFit, { '--casl': 0 }, { '--casl': 0.7, duration: at(1.6), ease: 'power2.out' }, at(0.9));
    const tag = root.querySelector('[data-sb-tag]');
    if (tag) tl.fromTo(tag, { rotation: -22, scale: 0.6 }, { rotation: split ? 0 : 5, scale: 1, duration: at(0.7), ease: BE.back }, at(1.5));
  });

  useIdle((root, { calm: c }) => {
    const anims: gsap.core.Animation[] = [];
    const stops: Array<() => void> = [];
    root.querySelectorAll('[data-sb-colon]').forEach((el) => anims.push(gsap.fromTo(el, { opacity: 1 }, { opacity: 0.3, duration: 0.5, ease: 'sine.inOut', yoyo: true, repeat: -1, repeatDelay: 0 })));
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-sb-char]'));
    chars.forEach((ch, i) => {
      const up = ch.querySelector<HTMLElement>('[data-sb-awake]');
      const breathe = ch.querySelector<HTMLElement>('[data-sb-breathe]');
      if (up) {
        stops.push(charAnim.blinkLoop(up));
        anims.push(...charAnim.idle(up, { calm: c, seed: i * 3 }));
      }
      if (breathe) anims.push(gsap.fromTo(breathe, { scaleY: 1, scaleX: 1 }, { scaleY: c ? 0.97 : 0.94, scaleX: c ? 1.015 : 1.03, duration: 2.4 + i * 0.35, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
      ch.querySelectorAll<HTMLElement>('[data-sb-zz]').forEach((z, k) => {
        const drift = gsap.timeline({ repeat: -1, repeatDelay: 0.4, delay: i * 0.7 + k * 1.0 });
        drift
          .fromTo(z, { y: 24, x: 0, opacity: 0, scale: 0.6 }, { y: -10, x: 6, opacity: 0.9, scale: 1, duration: c ? 1.8 : 1.2, ease: 'sine.out' })
          .to(z, { y: -60, x: -4, opacity: 0, scale: 1.2, duration: c ? 2.4 : 1.8, ease: 'sine.in' });
        anims.push(drift);
      });
    });
    // Now and then a sleeper stirs (a little squash, like a snore).
    let n = 0;
    const stir = gsap.delayedCall(5.5, function loop() {
      const sleepers = chars.filter((ch) => ch.dataset.awake !== '1');
      const ch = sleepers[n++ % Math.max(1, sleepers.length)];
      const down = ch?.querySelector<HTMLElement>('[data-sb-sleepy]');
      if (down) charAnim.squash(down);
      stir.restart(true);
    });
    const tag = root.querySelector('[data-sb-tag]');
    if (tag) anims.push(gsap.fromTo(tag, { rotation: split ? 0 : 5 }, { rotation: split ? -2 : 2, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
      stir.kill();
    };
  });

  const inner = { w: L.plate.w - 80, h: L.plate.h - (L.eyebrow.y - L.plate.y) - L.eyebrow.h - 40 };
  const readout = (
    <El id="clock" label="Clock card" box={L.plate} align="center" enter="rise" order={0}>
      <div data-sb-card="" style={{ ...plateStyle(p, { radius: 36, lift: split ? 14 : 18 }), position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', padding: '0 40px 32px' }}>
        <Readout target={target} box={inner} maxDigit={L.maxDigit} p={p} doneText={ctx.text('done')} idleText={ctx.text('idle')} />
      </div>
    </El>
  );

  // On a clear background (an OBS overlay over the room camera) the words sit on a paper card.
  const clear = ctx.background === 'transparent';
  const clearPlate = clear ? (
    <El id="plate" label="Card behind the title" box={split ? { x: 90, y: 214, w: 960, h: 752 } : { x: 170, y: 784, w: 1580, h: 216 }} enter="fade" order={2}>
      <div aria-hidden="true" style={{ ...plateStyle(p, { radius: 36, lift: 0 }), width: '100%', height: '100%' }} />
    </El>
  ) : null;

  return (
    <>
      {clearPlate}
      {readout}
      <El id="eyebrow" label="Above the clock" box={L.eyebrow} enter="wipe" order={3}>
        <Label size={split ? 26 : 30} color={p.fg} bullet={ctx.colors.accentHex}>
          {ctx.text('eyebrow')}
        </Label>
      </El>
      {cast.length ? (
        <El id="cast" label="Characters" box={L.cast} enter="fade" order={0} lockAspect>
          <Bench cast={cast} target={target} size={cast.length > 2 ? L.charSize : L.charSize * 1.15} />
        </El>
      ) : null}
      {split ? (
        <>
          {kicker ? (
            <El id="kicker" label="Kicker" box={{ x: 130, y: 250, w: 880, h: 50 }} enter="wipe" order={2}>
              <Eyebrow size={30}>{kicker}</Eyebrow>
            </El>
          ) : null}
          <El id="title" label="Title" box={{ x: 124, y: 316, w: 900, h: 400 }} enter="split-words" order={4} morph={ctx.event ? `event:${ctx.event.id}:title` : null}>
            <FitText max={150} min={60} casl={0} lineHeight={0.9} valign="end">
              {title}
            </FitText>
          </El>
          {meta ? (
            <El id="subtitle" label="Date and room" box={{ x: 130, y: 744, w: 880, h: 96 }} enter="rise" order={7}>
              <FitText max={34} min={20} font="mono" lineHeight={1.35}>
                {meta.split(/\s+·\s+/).map((part, i) => (
                  <span key={i} style={{ display: 'block' }}>
                    {part}
                  </span>
                ))}
              </FitText>
            </El>
          ) : null}
          {line ? (
            <El id="line" label="Cheeky line" box={{ x: 130, y: 868, w: 880, h: 64 }} enter="rise" order={9}>
              <div data-sb-tag="" style={{ width: '100%', height: '100%', transformOrigin: '0% 50%' }}>
                <FitText max={44} min={26} casl={1} weight={800} lineHeight={1.1} style={{ color: accentText(ctx) }}>
                  {line}
                </FitText>
              </div>
            </El>
          ) : null}
        </>
      ) : (
        <>
          <El id="title" label="Title" box={{ x: 200, y: 800, w: 1520, h: 120 }} align="center" enter="split-words" order={5} morph={ctx.event ? `event:${ctx.event.id}:title` : null}>
            <FitText max={104} min={48} casl={0} lineHeight={0.95} valign="center">
              {title}
            </FitText>
          </El>
          {meta ? (
            <El id="subtitle" label="Date and room" box={{ x: 260, y: 934, w: 1400, h: 48 }} align="center" enter="rise" order={7}>
              <FitText max={32} min={20} font="mono" lineHeight={1.3} valign="center" style={{ color: ctx.colors.fg2 }}>
                {meta}
              </FitText>
            </El>
          ) : null}
          {line ? (
            <El id="line" label="Cheeky line" box={{ x: 1260, y: 184, w: 520, h: 104 }} align="end" valign="end" enter="pop" order={10}>
              <span
                data-sb-tag=""
                style={{
                  ...fontStyle('display', { weight: 800, casl: 1 }),
                  display: 'inline-block',
                  fontSize: 38,
                  lineHeight: 1.1,
                  padding: '14px 28px',
                  borderRadius: 999,
                  background: ctx.background === 'accent' ? p.bg : ctx.colors.accentHex,
                  color: ctx.background === 'accent' ? p.fg : ctx.colors.onAccent,
                  border: ctx.background === 'accent' ? `4px solid ${p.border}` : undefined,
                  maxWidth: '100%',
                  textAlign: 'center',
                  transformOrigin: '80% 100%',
                }}
              >
                {line}
              </span>
            </El>
          ) : null}
        </>
      )}
    </>
  );
}

export default defineTemplate({
  kind: 'standby',
  background: 'paper',
  variants: [
    { key: 'countdown-hero', label: 'Big clock', hint: 'The countdown front and center, the title under it.' },
    { key: 'split', label: 'Title left, clock right' },
  ],
  fields: [
    f.eyebrow('We start in', 'Above the clock'),
    f.title((ctx) => ctx.event?.title ?? 'Make yourself at home'),
    f.subtitle((ctx) => (ctx.event ? [formatJakarta(ctx.event.startsAt, 'date-long'), eventRoom(ctx.event)].filter(Boolean).join('  ·  ') : ''), 'Date and room'),
    { key: 'line', label: 'Cheeky line', type: 'text', max: 80, default: "Grab a coffee, we'll wait." },
    { key: 'to', label: 'Count down to', type: 'time', tokens: false, default: (ctx) => (ctx.event ? jakartaTimeInput(ctx.event.startsAt) : ''), hint: 'HH:mm in WIB on the event day. Starts at the event time.' },
    { key: 'done', label: 'At zero', type: 'text', max: 40, default: 'Any second now', group: 'options' },
    { key: 'idle', label: 'Without a start time', type: 'text', max: 40, default: 'Soon', group: 'options' },
    { key: 'kicker', label: 'Kicker (split layout)', type: 'text', max: 60, default: (ctx) => (ctx.event?.number != null ? `Zemi ${eventNumberLabel(ctx.event)}` : 'Zemi'), group: 'options' },
  ],
  describe: (ctx) => (ctx.event?.number != null ? `Starting soon, ${eventNumberLabel(ctx.event)}` : 'Starting soon'),
  headline: () => 'Starting soon',
  sample: () => ({ fields: { to: new Date(Date.now() + (4 * 60 + 48) * 1000).toISOString() } }),
  Render,
});
