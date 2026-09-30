'use client';

import type { BumperBox } from '@zemi/shared';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { GRAPH } from '../../engine/palette';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { Sticker } from '../../parts/stickers';
import { accentInk, cardSurface, castIdle, charOutline, killAll, portraitBack, usePrimedCast } from '../_tpl-talks-kit';
import { defineTemplate, Eyebrow, f, personName, personOrg, personRole, Portrait, useMascots, usePerson } from '../kit';

/**
 * Talk title: the talk, huge, word by word. The speaker sits underneath with a small portrait.
 * A paper plane loops over the title leaving a dashed trail and lands at the end of the last
 * line, while Hunch (the spark) follows it with its eyes and hops when it touches down.
 */

const PLANE = 150;

type Variant = 'left' | 'center' | 'card';

interface Layout {
  eyebrow: BumperBox;
  title: BumperBox;
  titleMax: number;
  card: BumperBox | null;
  face: BumperBox;
  name: BumperBox;
  hunch: BumperBox;
  align: 'start' | 'center';
}

const FACE = 128;

const LAYOUTS: Record<Variant, Layout> = {
  left: {
    eyebrow: { x: 130, y: 176, w: 1200, h: 56 },
    title: { x: 130, y: 250, w: 1560, h: 520 },
    titleMax: 190,
    card: null,
    face: { x: 130, y: 836, w: FACE + 16, h: FACE + 12 },
    name: { x: 310, y: 832, w: 1180, h: 144 },
    hunch: { x: 1590, y: 800, w: 190, h: 190 },
    align: 'start',
  },
  center: {
    eyebrow: { x: 160, y: 140, w: 1600, h: 56 },
    title: { x: 160, y: 210, w: 1600, h: 500 },
    titleMax: 180,
    card: null,
    face: { x: 960 - (FACE + 16) / 2, y: 752, w: FACE + 16, h: FACE + 12 },
    name: { x: 360, y: 900, w: 1200, h: 110 },
    hunch: { x: 1600, y: 800, w: 170, h: 170 },
    align: 'center',
  },
  card: {
    eyebrow: { x: 210, y: 196, w: 1100, h: 56 },
    title: { x: 210, y: 270, w: 1440, h: 470 },
    titleMax: 150,
    card: { x: 140, y: 150, w: 1640, h: 670 },
    face: { x: 200, y: 856, w: FACE + 16, h: FACE + 12 },
    name: { x: 380, y: 852, w: 1100, h: 140 },
    hunch: { x: 1560, y: 812, w: 180, h: 180 },
    align: 'start',
  },
};

/** "Talk 2 of 3" from the lineup, else a plain label. */
function talkLabel(ctx: ResolveCtx): string {
  const p = ctx.person;
  const talks = ctx.lineup.filter((s) => s.role === 'speaker' || s.role === 'keynote');
  const i = p ? talks.findIndex((s) => s.id === p.id) : -1;
  if (p?.role === 'keynote') return 'The keynote';
  if (i >= 0 && talks.length > 1) return `Talk ${i + 1} of ${talks.length}`;
  return 'The talk';
}

/** Where the plane rests: after the last word on its baseline, or perched on top of the last word when there is no room. */
function planeBox(land: { right: number; top: number; bottom: number } | null, fallback: BumperBox): BumperBox {
  if (!land) return fallback;
  const lh = land.bottom - land.top;
  const baseline = land.top + lh * 0.87;
  if (land.right + 18 + PLANE <= 1870) return { x: Math.round(land.right + 18), y: Math.round(baseline - PLANE * 0.86), w: PLANE, h: PLANE };
  // Belly on the x-height of the last letters.
  const xTop = land.top + lh * 0.31;
  return { x: Math.round(land.right - PLANE * 0.92), y: Math.round(xTop - PLANE * 0.84), w: PLANE, h: PLANE };
}

/** The flight, relative to the resting spot (it ends at 0,0 so the plane lands exactly where it rests). */
function flightPath(box: BumperBox): { rel: string; abs: string } {
  const pts: Array<[number, number]> = [
    [-260, 760],
    [260, 520],
    [620, 150],
    [980, 120],
    [1180, 250],
    [1060, 420],
    [880, 330],
    [960, 170],
  ];
  const ex = box.x + PLANE * 0.5;
  const ey = box.y + PLANE * 0.5;
  const segs: string[] = [];
  const all: Array<[number, number]> = [...pts, [ex - 260, ey - 150], [ex, ey]];
  // Catmull-Rom to cubic bezier, for a smooth loop through every point.
  const toPath = (dx: number, dy: number) => {
    const p = all.map(([x, y]) => [x - dx, y - dy] as [number, number]);
    let d = `M${p[0]![0].toFixed(1)} ${p[0]![1].toFixed(1)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] ?? p[i]!;
      const p1 = p[i]!;
      const p2 = p[i + 1]!;
      const p3 = p[i + 2] ?? p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0]!.toFixed(1)} ${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)} ${c2[1]!.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };
  segs.push(toPath(ex, ey), toPath(0, 0));
  return { rel: segs[0]!, abs: segs[1]! };
}

interface Land {
  right: number;
  top: number;
  bottom: number;
  first: number;
}

/**
 * Canvas position of the end of the title's last line and the top of its first line, read from
 * layout offsets (not client rects) so it works before the stage is scaled and while the words
 * are split and moving during the entrance.
 */
function titleLand(wrap: HTMLElement): Land | null {
  const el = wrap.closest<HTMLElement>('[data-el]');
  const span = wrap.querySelector<HTMLElement>('[data-fit]');
  if (!el || !span) return null;
  const offsets = (from: HTMLElement): { x: number; y: number } | null => {
    let x = 0;
    let y = 0;
    let node: HTMLElement | null = from;
    while (node && node !== el) {
      x += node.offsetLeft;
      y += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    return node === el ? { x, y } : null;
  };
  const [bx, by] = (el.dataset.box ?? '0,0').split(',').map(Number) as [number, number];
  const first = offsets(span);
  if (!first) return null;
  // While the entrance has the title split into words, read the last word and its line.
  const words = span.querySelectorAll<HTMLElement>('.b-word');
  const lastWord = words[words.length - 1];
  const line = lastWord?.closest<HTMLElement>('.b-line-mask, .b-line');
  if (lastWord && line) {
    const w = offsets(lastWord);
    const l = offsets(line);
    if (!w || !l) return null;
    return { right: Math.round(bx + w.x + lastWord.offsetWidth), top: Math.round(by + l.y), bottom: Math.round(by + l.y + line.offsetHeight), first: Math.round(by + first.y) };
  }
  const end = span.querySelector<HTMLElement>('[data-tt-end]');
  const e = end ? offsets(end) : null;
  if (!end || !e) return null;
  const size = parseFloat(getComputedStyle(span).fontSize) || 100;
  const lh = size * 0.94;
  // The marker is an empty inline box centered on its line box.
  const lineTop = e.y + end.offsetHeight / 2 - lh / 2;
  return { right: Math.round(bx + e.x), top: Math.round(by + lineTop), bottom: Math.round(by + lineTop + lh), first: Math.round(by + first.y) };
}

function Render() {
  const ctx = useSlide();
  usePrimedCast();
  const person = usePerson();
  const variant: Variant = ctx.slide.style.variant === 'center' ? 'center' : ctx.slide.style.variant === 'card' ? 'card' : 'left';
  const L = LAYOUTS[variant];
  const cast = useMascots(['triangle']);
  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title') || 'Add the talk title';
  const meta = [ctx.text('role'), ctx.text('org')].filter(Boolean).join('  ·  ');
  const name = person?.name || 'Pick a speaker';
  const pid = person?.id ?? 'manual';
  const surface = cardSurface(ctx);
  const onCard = !!L.card;
  const titleColor = onCard ? surface.fg : ctx.colors.fg;
  const measureRef = useRef<HTMLDivElement>(null);
  const maskId = `tt-${useId().replace(/[:]/g, '')}`;
  const [land, setLand] = useState<Land | null>(null);
  const moved = !!ctx.slide.layers.plane?.box;
  const fallback: BumperBox = { x: L.title.x + L.title.w - PLANE, y: L.title.y + L.title.h - PLANE, w: PLANE, h: PLANE };
  const plane = moved ? ctx.slide.layers.plane!.box! : planeBox(land, fallback);
  // The eyebrow hugs the first line of the title (the title is centered in its box).
  const eyebrowBox: BumperBox = land && variant !== 'card' ? { ...L.eyebrow, y: Math.max(110, land.first - L.eyebrow.h - 26) } : L.eyebrow;

  // Find where the title's lines start and end (after fonts load and FitText settles).
  useLayoutEffect(() => {
    const wrap = measureRef.current;
    if (!wrap) return;
    let alive = true;
    const measure = () => {
      const next = alive ? titleLand(wrap) : null;
      if (next) setLand((cur) => (cur && cur.right === next.right && cur.top === next.top && cur.bottom === next.bottom && cur.first === next.first ? cur : next));
    };
    measure();
    const span = wrap.querySelector('[data-fit]');
    const ro = new ResizeObserver(measure);
    if (span) ro.observe(span);
    // Glyph widths change when the web font arrives without the box changing size, so measure again then.
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    void fonts?.ready.then(measure);
    fonts?.addEventListener?.('loadingdone', measure);
    return () => {
      alive = false;
      ro.disconnect();
      fonts?.removeEventListener?.('loadingdone', measure);
    };
  }, [title, variant]);

  useEnter((tl, root, { at, calm }) => {
    if (ctx.theme.motion === 'still') return;
    const titleEl = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleEl) tl.fromTo(titleEl, { '--casl': 0 }, { '--casl': 0.8, duration: at(1.7), ease: 'power2.out' }, at(0.25));
    const card = root.querySelector('[data-tt-card]');
    if (card) tl.from(card, { rotate: 3, y: 60, scale: 0.96, duration: at(1), ease: 'back.out(1.3)' }, at(0));
    const hunch = root.querySelector<HTMLElement>('[data-tt-hunch]');
    if (hunch) {
      tl.from(hunch, { y: 260, duration: at(0.8), ease: 'back.out(1.6)' }, at(0.55));
      tl.add(charAnim.look(hunch, -1, -0.8, 0.3), at(0.9));
    }
    const planeEl = root.querySelector<HTMLElement>('[data-tt-plane]');
    const trail = root.querySelector<SVGPathElement>('[data-tt-trail]');
    const wrap = root.querySelector<HTMLElement>('[data-tt-measure]');
    // Fonts may have landed after the last render: place the plane (and eyebrow) from the live layout.
    const fresh = wrap ? titleLand(wrap) : null;
    const planeHost = planeEl?.closest<HTMLElement>('[data-el="plane"]');
    const box = moved || !fresh ? plane : planeBox(fresh, fallback);
    if (planeHost && !moved) {
      planeHost.style.left = `${box.x}px`;
      planeHost.style.top = `${box.y}px`;
    }
    const eyebrowHost = root.querySelector<HTMLElement>('[data-el="eyebrow"]');
    if (eyebrowHost && fresh && variant !== 'card' && !ctx.slide.layers.eyebrow?.box) eyebrowHost.style.top = `${Math.max(110, fresh.first - L.eyebrow.h - 26)}px`;
    if (planeEl) {
      const path = flightPath(box);
      const fly = calm ? 2.2 : 1.9;
      const t0 = at(0.8);
      const dots = root.querySelector('[data-tt-dots]');
      const layer = root.querySelector('[data-tt-trail-layer]');
      if (trail && dots && layer) {
        trail.setAttribute('d', path.abs);
        dots.setAttribute('d', path.abs);
        tl.set(layer, { opacity: 1 }, 0);
        tl.fromTo(trail, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: at(fly), ease: 'power1.inOut' }, t0);
        tl.to(trail, { drawSVG: '100% 100%', duration: at(0.8), ease: 'power2.in' }, t0 + at(fly) - at(0.1));
      }
      tl.fromTo(
        planeEl,
        { opacity: 1 },
        { motionPath: { path: path.rel, autoRotate: 24 }, duration: at(fly), ease: 'power1.inOut', immediateRender: true },
        t0,
      );
      tl.to(planeEl, { rotation: -6, duration: at(0.5), ease: 'back.out(2)' }, t0 + at(fly));
      tl.fromTo(planeEl, { scaleY: 0.78, scaleX: 1.12 }, { scaleY: 1, scaleX: 1, duration: at(0.6), ease: 'elastic.out(1, 0.4)', immediateRender: false }, t0 + at(fly));
      if (hunch) {
        tl.add(charAnim.look(hunch, 0.2, -1, at(fly * 0.5)), t0 + at(fly * 0.3));
        tl.add(charAnim.look(hunch, variant === 'center' ? -0.4 : -0.9, -0.7, at(fly * 0.4)), t0 + at(fly * 0.62));
        tl.add(calm ? charAnim.hop(hunch, { height: 10 }) : charAnim.cheer(hunch, { height: 24, spin: false }), t0 + at(fly) + at(0.05));
      }
    }
  });

  useIdle((root, { calm }) => {
    const hunch = root.querySelector<HTMLElement>('[data-tt-hunch]');
    const stop = hunch ? castIdle([hunch], calm, 1) : () => {};
    const planeEl = root.querySelector('[data-tt-plane]');
    const bob = planeEl ? gsap.to(planeEl, { y: calm ? -4 : -9, rotation: calm ? -4 : -1, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: -1 }) : null;
    const glance = hunch ? gsap.timeline({ repeat: -1, repeatDelay: 5, delay: 2.5 }) : null;
    if (hunch && glance) glance.add(charAnim.look(hunch, 0, 0, 0.4), 0).add(charAnim.look(hunch, variant === 'center' ? -0.4 : -0.9, -0.7, 0.4), 2.6);
    return () => {
      stop();
      killAll([bob, glance]);
    };
  });

  return (
    <>
      {L.card ? (
        <El id="card" label="Card" box={L.card} enter="fade" order={0} locked>
          <div
            data-tt-card=""
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 40,
              background: surface.bg,
              backgroundImage: surface.fg === ctx.colors.fg && ctx.colors.dark ? undefined : `linear-gradient(to right, ${GRAPH} 2px, transparent 2px), linear-gradient(to bottom, ${GRAPH} 2px, transparent 2px)`,
              backgroundSize: '40px 40px',
              border: `4px solid ${surface.border}`,
              boxShadow: surface.shadow ? surface.shadow.replace('10px 10px', '18px 18px') : undefined,
              rotate: '-1.2deg',
            }}
          />
        </El>
      ) : null}
      {eyebrow ? (
        <El id="eyebrow" label="Eyebrow" box={eyebrowBox} align={L.align} enter="wipe" order={0}>
          <Eyebrow size={32} color={onCard ? surface.fg : undefined}>
            {eyebrow}
          </Eyebrow>
        </El>
      ) : null}
      <El id="title" label="Talk title" box={L.title} align={L.align} enter="split-words" order={1} morph={person ? `person:${pid}:talk` : null}>
        <div ref={measureRef} data-tt-measure="" style={{ width: '100%', height: '100%' }}>
          <FitText max={L.titleMax} min={64} casl={0.8} weight={900} lineHeight={0.94} valign="center" style={{ color: titleColor }}>
            {title}
            <span data-tt-end="" />
          </FitText>
        </div>
      </El>
      <div aria-hidden="true" data-tt-trail-layer="" style={{ position: 'absolute', inset: 0, zIndex: 9, pointerEvents: 'none', opacity: 0 }}>
        <svg viewBox="0 0 1920 1080" width={1920} height={1080} style={{ overflow: 'visible', display: 'block' }}>
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x={-600} y={-600} width={3120} height={2280}>
              <path data-tt-trail="" d="M0 0" fill="none" stroke="#ffffff" strokeWidth={16} strokeLinecap="round" />
            </mask>
          </defs>
          <path data-tt-dots="" d="M0 0" fill="none" stroke={onCard ? surface.fg : accentInk(ctx)} strokeWidth={6} strokeLinecap="round" strokeDasharray="1 18" mask={`url(#${maskId})`} />
        </svg>
      </div>
      <El id="plane" label="Paper plane" box={plane} enter="fade" delay={0.8} lockAspect>
        <div data-tt-plane="" style={{ width: '100%', height: '100%', transformOrigin: '50% 60%', transform: 'rotate(-6deg)' }}>
          <Sticker name="plane" />
        </div>
      </El>
      {person ? (
        <El id="face" label="Photo" box={L.face} enter="pop" order={5} lockAspect morph={`person:${pid}:photo`}>
          <Portrait person={person} size={FACE} shape={person.shape} color={portraitBack(ctx, person)} />
        </El>
      ) : null}
      <El id="name" label="Name" box={L.name} align={L.align} valign={variant === 'center' ? 'start' : 'center'} enter="rise" order={6} morph={person ? `person:${pid}:name` : null}>
        <div style={{ width: '100%', height: 66 }}>
          <FitText max={variant === 'center' ? 54 : 60} min={32} casl={0.5} weight={900} lineHeight={1.05} valign="center">
            {name}
          </FitText>
        </div>
        {meta ? (
          <div style={{ width: '100%', height: 42, marginTop: 6 }}>
            <FitText max={30} min={20} font="body" weight={600} lineHeight={1.3} style={{ color: ctx.colors.fg2 }}>
              {meta}
            </FitText>
          </div>
        ) : null}
      </El>
      {cast.length ? (
        <El id="hunch" label="Character" box={L.hunch} enter="fade" order={4} lockAspect>
          <div data-tt-hunch="" style={{ width: '100%', height: '100%' }}>
            <BumperCharacter shape={cast[0]!} mood="happy" lookX={variant === 'center' ? -0.4 : -0.9} lookY={-0.7} style={charOutline(ctx, cast[0]!)} />
          </div>
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'talk-title',
  background: 'paper',
  variants: [
    { key: 'left', label: 'Big and left', hint: 'The title fills the screen, speaker underneath' },
    { key: 'center', label: 'Centered' },
    { key: 'card', label: 'On a card', hint: 'The title on a graph-paper card' },
  ],
  fields: [
    f.eyebrow((ctx) => talkLabel(ctx)),
    f.title((ctx) => ctx.person?.talkTitle ?? '', 'Talk title', 300),
    f.name(personName),
    f.role(personRole, 'Position'),
    f.org(personOrg),
  ],
  describe: (ctx) => ctx.text('title') || ctx.person?.talkTitle || 'Talk title',
  headline: (ctx) => ctx.person?.first ?? 'The talk',
  Render,
});
