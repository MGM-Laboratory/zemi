'use client';

import { jakartaTimeInput, type ShapeName } from '@zemi/shared';
import { useLayoutEffect, useRef, useState } from 'react';
import { useBumperNow } from '../../engine/clock';
import { useElScope, useEnter, useIdle } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { INK, INK_2, PAPER, SHAPE_ORDER } from '../../engine/palette';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { defineTemplate, useAccentShape, useMascots } from '../kit';
import { accentFill, charColor, MONO_ADVANCE, moves, piePath, plate, plateStyle, r2d, TickDigit, timeLeft, todayAt, two, useOpenCtx } from '../_tpl-open-kit';

/**
 * Countdown: a timer to a time of day (`to`, HH:mm today) or N minutes from when the bumper
 * appears (`minutes`). The remaining time is a progress ring (a clock wipe) with a character
 * riding its tip, or a row of flip cells with a small pie. At zero the done line pops in and the
 * rider cheers. Minutes count from when the bumper came on screen (the server's slideSince, the
 * same on every output); outside playback they count from when the preview mounted.
 */

interface Clock {
  target: number;
  total: number;
  /** HH:mm the timer ends at. */
  until: string;
}

function useClock(ctx: ResolveCtx): Clock {
  const [mounted] = useState(() => ctx.now());
  // Minutes count from the server's "on screen since" in live playback, so every screen agrees.
  const mountedAt = ctx.liveSince() ?? mounted;
  const to = ctx.text('to');
  const fixed = to ? todayAt(to, mountedAt) : null;
  if (fixed != null) return { target: fixed, total: Math.max(1000, fixed - mountedAt), until: jakartaTimeInput(new Date(fixed)) };
  const ms = Math.max(1, ctx.num('minutes', 5)) * 60_000;
  return { target: mountedAt + ms, total: ms, until: jakartaTimeInput(new Date(mountedAt + ms)) };
}

function trackColor(ctx: ResolveCtx): string {
  if (ctx.background === 'accent') return ctx.accent === 'yellow' ? '#0e11161f' : '#ffffff38';
  return ctx.colors.dark ? '#ffffff1f' : '#e4e7ed';
}

/** Big mono digits (or the done line), sized to a width without measuring every second. */
function Digits({ left, width, max, done, live, calm, color }: { left: number; width: number; max: number; done: string; live: boolean; calm: boolean; color: string }) {
  const { scale } = useElScope();
  const { ctx } = useOpenCtx();
  const moving = moves(ctx);
  if (left <= 0) {
    return (
      <div data-cd-done="" style={{ width, height: max * 1.1, display: 'flex', alignItems: 'center' }}>
        <FitText max={max * 0.62} min={40} casl={1} lineHeight={0.95} valign="center" style={{ textAlign: 'center', color }}>
          {done}
        </FitText>
      </div>
    );
  }
  const t = timeLeft(left);
  const hours = t.d * 24 + t.h;
  const text = hours > 0 ? `${hours}:${two(t.m)}:${two(t.s)}` : `${two(t.m)}:${two(t.s)}`;
  const size = Math.min(max, width / (text.length * MONO_ADVANCE)) * scale;
  return (
    <div data-cd-digits="" style={{ ...fontStyle('mono', { weight: 700, tracking: 0 }), fontSize: size, lineHeight: 0.92, color, display: 'flex', justifyContent: 'center', overflow: 'hidden', paddingBottom: size * 0.03 }}>
      {text.split('').map((ch, i) =>
        ch === ':' ? (
          <span key={`c${text.length - i}`} data-cd-colon="" style={{ width: size * MONO_ADVANCE, margin: `0 ${-size * MONO_ADVANCE * 0.16}px`, textAlign: 'center', opacity: 0.9 }}>
            :
          </span>
        ) : (
          <TickDigit key={`d${text.length - i}`} value={ch} live={live && moving} calm={calm} style={{ width: size * MONO_ADVANCE, textAlign: 'center' }} />
        ),
      )}
    </div>
  );
}

/** Fires `onZero` once when a live timer crosses zero (not when it mounts already done). */
function useZero(left: number, live: boolean, onZero: () => void) {
  const { ctx } = useOpenCtx();
  const on = live && moves(ctx);
  const was = useRef(left);
  const cb = useRef(onZero);
  useLayoutEffect(() => {
    cb.current = onZero;
  });
  useLayoutEffect(() => {
    const prev = was.current;
    was.current = left;
    if (on && prev > 0 && left <= 0) cb.current();
  }, [left, on]);
}

/* ---------------------------------------------------------------- ring variant */

const RING = { x: 872, y: 100, size: 880, stroke: 40 };

/** Soft clock-wipe fill inside the ring. */
function wipeColor(ctx: ResolveCtx): string {
  if (ctx.background === 'accent') return ctx.accent === 'yellow' ? '#ffffff8c' : '#ffffff24';
  if (ctx.background === 'transparent') return ctx.colors.accentSoft;
  return ctx.colors.dark ? `${ctx.colors.accentHex}2e` : ctx.colors.accentSoft;
}

function RingClock({ clock, rider }: { clock: Clock; rider: ShapeName | null }) {
  const { ctx, live, calm } = useOpenCtx();
  const now = useBumperNow(1000, live);
  const [mountedAt] = useState(() => ctx.now());
  const left = clock.target - (live ? now : mountedAt);
  const frac = fracLeft(left, clock.total);
  const rootRef = useRef<HTMLDivElement>(null);
  const shown = useRef<{ f: number } | null>(null);
  const size = RING.size;
  const c = size / 2;
  const r = (size - RING.stroke) / 2;
  const inner = r - RING.stroke / 2 - 18;

  // One proxy value drives the arc, the soft wipe, the rider and its gaze, eased on every tick.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const arc = root.querySelector<SVGCircleElement>('[data-cd-arc]');
    const pie = root.querySelector<SVGPathElement>('[data-cd-wipe]');
    const rotor = root.querySelector<HTMLElement>('[data-cd-rotor]');
    const face = root.querySelector<HTMLElement>('[data-cd-rider-face]');
    const apply = (f: number) => {
      arc?.setAttribute('stroke-dasharray', `${Math.max(0.001, f * 1000)} 1000`);
      if (arc) arc.style.opacity = f > 0.0005 ? '1' : '0';
      pie?.setAttribute('d', piePath(c, c, inner, f));
      if (rotor) gsap.set(rotor, { rotation: f * 360 });
      if (face) gsap.set(face, { rotation: -f * 360 });
    };
    const animate = live && moves(ctx) && shown.current !== null;
    if (!shown.current) shown.current = { f: frac };
    const st = shown.current;
    if (animate) gsap.to(st, { f: frac, duration: calm ? 0.8 : 0.6, ease: BE.out, overwrite: true, onUpdate: () => apply(st.f) });
    else {
      st.f = frac;
      apply(frac);
    }
    if (face) {
      const l = lookFor(frac * 360);
      charAnim.look(face, l.x, l.y, animate ? 0.4 : 0);
    }
  }, [frac, live, calm, c, inner, ctx]);

  useZero(left, live, () => {
    const face = rootRef.current?.querySelector<HTMLElement>('[data-cd-rider-face]');
    if (face && !calm) charAnim.cheer(face, { height: 44 });
    const d = rootRef.current?.querySelector('[data-cd-done]');
    if (d) gsap.fromTo(d, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: BE.back });
  });

  const riderSize = 124;
  const onClear = ctx.background === 'transparent';
  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0 }}>
      <div data-cd-ring="" style={{ position: 'absolute', inset: 0 }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
          {onClear ? <circle cx={c} cy={c} r={r} fill={PAPER} /> : null}
          <path data-cd-wipe="" fill={wipeColor(ctx)} />
          <circle cx={c} cy={c} r={r} fill="none" stroke={trackColor(ctx)} strokeWidth={RING.stroke} />
          <circle data-cd-arc="" cx={c} cy={c} r={r} fill="none" stroke={accentFill(ctx)} strokeWidth={RING.stroke} strokeLinecap="round" pathLength={1000} transform={`rotate(-90 ${c} ${c})`} />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * 30 * Math.PI) / 180;
            const r1 = inner - 14;
            const r2 = r1 - (i % 3 === 0 ? 30 : 14);
            return (
              <line
                key={i}
                data-cd-tick=""
                x1={r2d(c + r1 * Math.sin(a))}
                y1={r2d(c - r1 * Math.cos(a))}
                x2={r2d(c + r2 * Math.sin(a))}
                y2={r2d(c - r2 * Math.cos(a))}
                stroke={onClear ? INK : ctx.colors.fg}
                strokeOpacity={i % 3 === 0 ? 0.55 : 0.25}
                strokeWidth={i % 3 === 0 ? 7 : 4}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      </div>
      <div data-cd-center="" style={{ position: 'absolute', left: 110, right: 110, top: c - 200, height: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <Digits left={left} width={size - 250} max={240} done={ctx.text('done')} live={live} calm={calm} color={onClear ? INK : ctx.colors.fg} />
        {ctx.flag('showUntil', true) && left > 0 ? (
          <span data-cd-until="" suppressHydrationWarning style={{ ...fontStyle('mono', { weight: 700, tracking: 0.14 }), fontSize: 32, textTransform: 'uppercase', color: onClear ? INK_2 : ctx.colors.fg2 }}>
            until {clock.until}
          </span>
        ) : null}
      </div>
      {rider ? (
        <div data-cd-rotor="" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div data-cd-rider="" style={{ position: 'absolute', left: c - riderSize / 2, top: RING.stroke / 2 - riderSize / 2, width: riderSize, height: riderSize }}>
            <div data-cd-rider-face="" style={{ width: '100%', height: '100%' }}>
              <BumperCharacter shape={rider} mood="happy" color={charColor(ctx, rider)} lookX={-0.9} name="countdown-rider" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Remaining fraction in whole seconds (stable between the server render and hydration). */
function fracLeft(left: number, total: number) {
  return Math.max(0, Math.min(1, timeLeft(left).total / Math.max(1, Math.round(total / 1000))));
}

/** Where the rider looks: along the arc, the way the tip is travelling (counterclockwise). */
function lookFor(angle: number) {
  const t = (angle * Math.PI) / 180;
  return { x: -Math.cos(t) * 0.9, y: -Math.sin(t) * 0.9 };
}

/* ---------------------------------------------------------------- cells variant */

function Cells({ clock, width, watcher }: { clock: Clock; width: number; watcher: ShapeName | null }) {
  const { ctx, live, calm } = useOpenCtx();
  const { scale } = useElScope();
  const now = useBumperNow(1000, live);
  const [mountedAt] = useState(() => ctx.now());
  const left = clock.target - (live ? now : mountedAt);
  const p = plate(ctx);
  const rootRef = useRef<HTMLDivElement>(null);
  useZero(left, live, () => {
    const d = rootRef.current?.querySelector('[data-cd-done]');
    if (d) gsap.fromTo(d, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: BE.back });
  });
  if (left <= 0) {
    return (
      <div ref={rootRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div data-cd-done="" style={{ ...plateStyle(p, { radius: 40, lift: 16 }), width: '86%', height: '78%', display: 'flex', alignItems: 'center', padding: '0 60px' }}>
          <FitText max={200} min={48} casl={1} valign="center" style={{ textAlign: 'center' }}>
            {ctx.text('done')}
          </FitText>
        </div>
      </div>
    );
  }
  const t = timeLeft(left);
  const hours = t.d * 24 + t.h;
  const groups = hours > 0 ? [String(hours), two(t.m), two(t.s)] : [two(t.m), two(t.s)];
  const digits = groups.join('').length;
  const colonW = 70;
  const gap = 22;
  const cellW = Math.min(250, (width - (groups.length - 1) * colonW - (digits - groups.length) * gap) / digits) * scale;
  const cellH = cellW * 1.36;
  return (
    <div ref={rootRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {groups.map((g, gi) => (
        <div key={gi} style={{ display: 'flex', alignItems: 'center' }}>
          {gi > 0 ? (
            <div data-cd-colon="" style={{ width: colonW * scale, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: cellH * 0.18 }}>
              {[0, 1].map((k) => (
                <span key={k} style={{ width: 22 * scale, height: 22 * scale, borderRadius: 7 * scale, background: accentFill(ctx) }} />
              ))}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: gap * scale }}>
            {g.split('').map((d, i) => {
              const last = gi === groups.length - 1 && i === g.length - 1;
              const w = cellW * 0.62;
              return (
                <div key={`${gi}-${g.length - i}`} data-cd-cell="" style={{ position: 'relative', width: cellW, height: cellH }}>
                  {last && watcher ? (
                    <div data-cd-watch="" style={{ position: 'absolute', width: w, height: w, right: cellW * 0.08, top: -w + 6 }}>
                      <BumperCharacter shape={watcher} mood="happy" color={charColor(ctx, watcher)} lookX={-0.8} lookY={0.7} name="countdown-watch" />
                    </div>
                  ) : null}
                  <div style={{ ...plateStyle(p, { radius: 30, lift: 10 }), position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <TickDigit value={d} kind="flip" live={live && moves(ctx)} calm={calm} style={{ ...fontStyle('mono', { weight: 700, tracking: 0 }), fontSize: cellW * 1.18, lineHeight: 1, color: p.fg }} />
                    <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 4, marginTop: -2, background: p.dark ? '#0e1116' : '#0e11161a' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Pie({ clock }: { clock: Clock }) {
  const { ctx, live } = useOpenCtx();
  const now = useBumperNow(1000, live);
  const [mountedAt] = useState(() => ctx.now());
  const left = clock.target - (live ? now : mountedAt);
  const frac = fracLeft(left, clock.total);
  const fill = accentFill(ctx);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, height: '100%' }}>
      <svg viewBox="0 0 100 100" width={78} height={78} style={{ display: 'block', flex: 'none' }} aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="none" stroke={ctx.colors.fg} strokeOpacity="0.3" strokeWidth="5" />
        {frac > 0 ? <path data-cd-pie="" suppressHydrationWarning d={piePath(50, 50, 38, frac)} fill={fill} /> : null}
      </svg>
      <span suppressHydrationWarning style={{ ...fontStyle('mono', { weight: 700, tracking: 0.14 }), fontSize: 32, textTransform: 'uppercase', color: ctx.colors.fg2, whiteSpace: 'nowrap' }}>{left > 0 ? `until ${clock.until}` : `${clock.until} WIB`}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- template */

function Render() {
  const { ctx } = useOpenCtx();
  const cells = ctx.slide.style.variant === 'cells';
  const accentShape = useAccentShape();
  // The rider sits on the accent arc, so it gets the next shape's color to stand out.
  const cast = useMascots([SHAPE_ORDER[(SHAPE_ORDER.indexOf(accentShape) + 1) % SHAPE_ORDER.length]!]);
  const clock = useClock(ctx);
  const label = ctx.text('label');
  const onClear = ctx.background === 'transparent';
  const labelPlate = onClear ? { ...plateStyle(plate(ctx), { radius: 28, lift: 0, border: 0 }), padding: '18px 34px' } : null;

  useEnter((tl, root, { at, calm }) => {
    if (!moves(ctx)) return;
    const labelFit = root.querySelector<HTMLElement>('[data-el="label"] [data-fit]');
    if (labelFit) tl.fromTo(labelFit, { '--casl': 0 }, { '--casl': 0.8, duration: at(1.6), ease: 'power2.out' }, at(0.35));
    const ring = root.querySelector('[data-cd-ring]');
    if (ring) tl.fromTo(ring, { rotation: calm ? -30 : -120, scale: calm ? 0.94 : 0.7, opacity: 0, transformOrigin: '50% 50%' }, { rotation: 0, scale: 1, opacity: 1, duration: at(1.2), ease: BE.out }, at(0.05));
    const ticks = root.querySelectorAll('[data-cd-tick]');
    if (ticks.length) tl.fromTo(ticks, { opacity: 0 }, { opacity: 1, duration: at(0.3), stagger: at(0.04) }, at(0.5));
    const center = root.querySelector('[data-cd-center]');
    if (center) tl.fromTo(center, { scale: calm ? 0.96 : 0.82, opacity: 0 }, { scale: 1, opacity: 1, duration: at(0.9), ease: BE.back }, at(0.45));
    const rider = root.querySelector<HTMLElement>('[data-cd-rider]');
    if (rider) {
      tl.fromTo(rider, { y: calm ? -140 : -420, opacity: 0 }, { y: 0, opacity: 1, duration: at(0.8), ease: 'bounce.out' }, at(0.95));
      const face = rider.querySelector<HTMLElement>('[data-cd-rider-face]');
      if (face) tl.add(charAnim.squash(face), at(1.6));
    }
    const cellsEls = root.querySelectorAll('[data-cd-cell]');
    const watch = root.querySelector<HTMLElement>('[data-cd-cell] [data-cd-watch]');
    if (watch) {
      tl.fromTo(watch, { y: calm ? -120 : -360, opacity: 0 }, { y: 0, opacity: 1, duration: at(0.8), ease: 'bounce.out' }, at(1.35));
      tl.add(charAnim.squash(watch), at(1.95));
    }
    if (cellsEls.length) tl.fromTo(cellsEls, { rotationX: calm ? -40 : -100, transformPerspective: 900, transformOrigin: '50% 100%', opacity: 0 }, { rotationX: 0, opacity: 1, duration: at(0.8), ease: BE.back, stagger: at(0.09) }, at(0.3));
    const watchers = root.querySelectorAll<HTMLElement>('[data-el="cast"] [data-cd-watch]');
    watchers.forEach((w, i) => tl.fromTo(w, { y: 90, opacity: 0 }, { y: 0, opacity: 1, duration: at(0.6), ease: BE.back }, at(1.2 + i * 0.1)));
  });

  useIdle((root, { calm }) => {
    const anims: gsap.core.Animation[] = [];
    const stops: Array<() => void> = [];
    root.querySelectorAll('[data-cd-colon]').forEach((c) => anims.push(gsap.fromTo(c, { opacity: 1 }, { opacity: 0.35, duration: 0.5, ease: 'sine.inOut', yoyo: true, repeat: -1 })));
    const faces = root.querySelectorAll<HTMLElement>('[data-cd-rider-face], [data-cd-watch]');
    faces.forEach((f, i) => {
      stops.push(charAnim.blinkLoop(f));
      anims.push(...charAnim.idle(f, { calm, seed: i * 5 }));
    });
    const arcCap = root.querySelector('[data-cd-arc]');
    if (arcCap) anims.push(gsap.fromTo(arcCap, { strokeWidth: RING.stroke }, { strokeWidth: RING.stroke + (calm ? 4 : 8), duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
      if (arcCap) gsap.set(arcCap, { strokeWidth: RING.stroke });
    };
  });

  const watchers = cast.slice(1);
  if (cells) {
    return (
      <>
        <El id="label" label="Label" box={{ x: 160, y: 118, w: 1600, h: 190 }} align="center" enter="split-words" order={0}>
          <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ ...labelPlate, maxWidth: '100%', height: '100%', flex: onClear ? 'none' : 1, minWidth: 0 }}>
              <FitText max={150} min={60} casl={0} lineHeight={0.95} valign="center">
                {label}
              </FitText>
            </div>
          </div>
        </El>
        <El id="clock" label="Flip clock" box={{ x: 160, y: 346, w: 1600, h: 440 }} align="center" enter="fade" order={1}>
          <Cells clock={clock} width={1500} watcher={cast[0] ?? null} />
        </El>
        <El id="until" label="Time and pie" box={{ x: 560, y: 846, w: 800, h: 90 }} align="center" enter="rise" order={8}>
          <div style={{ ...(labelPlate ?? {}), height: '100%', display: 'flex', alignItems: 'center' }}>
            <Pie clock={clock} />
          </div>
        </El>
      </>
    );
  }

  return (
    <>
      <El id="label" label="Label" box={{ x: 130, y: 250, w: 700, h: 420 }} enter="split-words" order={2}>
        <div style={{ ...labelPlate, width: onClear ? 'fit-content' : '100%', maxWidth: '100%', height: '100%' }}>
          <FitText max={150} min={60} casl={0} lineHeight={0.92} valign="end">
            {label}
          </FitText>
        </div>
      </El>
      <El id="clock" label="Ring clock" box={{ x: RING.x, y: RING.y, w: RING.size, h: RING.size }} align="center" enter="fade" order={0} lockAspect>
        <RingClock clock={clock} rider={cast[0] ?? null} />
      </El>
      {watchers.length ? (
        <El id="cast" label="Characters" box={{ x: 140, y: 740, w: 660, h: 140 }} enter="fade" order={6} lockAspect>
          <div style={{ display: 'flex', gap: 22, alignItems: 'flex-end', height: '100%' }}>
            {watchers.map((s) => (
              <div key={s} data-cd-watch="" style={{ width: 118, height: 118 }}>
                <BumperCharacter shape={s} mood="idle" color={charColor(ctx, s)} lookX={1} lookY={-0.3} name={`countdown-watch-${s}`} />
              </div>
            ))}
          </div>
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'countdown',
  background: 'paper',
  variants: [
    { key: 'ring', label: 'Big clock ring', hint: 'The label on the left, the time in a shrinking ring.' },
    { key: 'cells', label: 'Flip cells', hint: 'Centered split-flap digits and a small clock wipe.' },
  ],
  presets: [
    { key: 'start', label: 'We start in', description: 'Five minutes to go.', slide: { fields: { label: 'We start in', minutes: 5, done: 'Here we go' } } },
    { key: 'back', label: 'Back in', description: 'Ten minute break timer.', slide: { fields: { label: 'Back in', minutes: 10, done: "We're back" } } },
    { key: 'talk', label: 'Talk time left', description: 'A speaker timer in flip cells.', slide: { fields: { label: 'Talk time left', minutes: 15, done: "Time's up", showUntil: false }, style: { variant: 'cells' } } },
  ],
  fields: [
    { key: 'label', label: 'Label', type: 'text', max: 60, default: 'We start in' },
    { key: 'minutes', label: 'Minutes', type: 'minutes', default: 5, min: 1, max: 240, hint: 'Counted from when the bumper shows up.' },
    { key: 'to', label: 'Or count down to', type: 'time', tokens: false, default: '', hint: 'HH:mm in WIB, today. Overrides the minutes and keeps every screen in sync.' },
    { key: 'done', label: 'At zero', type: 'text', max: 40, default: 'Here we go' },
    { key: 'showUntil', label: 'Show the end time', type: 'toggle', default: true, group: 'options' },
  ],
  describe: (ctx) => {
    const to = ctx.text('to');
    return `${ctx.text('label') || 'Countdown'} ${to ? `(${to})` : `(${ctx.num('minutes', 5)} min)`}`;
  },
  headline: (ctx) => ctx.text('label') || 'Countdown',
  Render,
});
