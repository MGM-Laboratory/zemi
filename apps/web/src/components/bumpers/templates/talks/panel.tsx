'use client';

import type { BumperBox } from '@zemi/shared';
import { Fragment } from 'react';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import type { BumperPerson, ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandShape } from '../../parts/shapes';
import { accentLabel, castIdle, charOutline, faceOutline, ghostFill, killAll, popSwatch, portraitBack, usePrimedCast } from '../_tpl-talks-kit';
import { defineTemplate, Eyebrow, f, Portrait, useMascots } from '../kit';

/**
 * Panel: two to six people at one table. The topic sits on top, the panel drops in and bounces
 * like the characters do, and Bridge (the conversation) sits at the end of the table following
 * the talk from face to face. Whoever it looks at gives a little nod.
 */

const MAX = 6;

/** The people on stage: picked speakers, else the lineup's panelists, else the lineup minus keynotes. */
export function panelPeople(ctx: ResolveCtx): BumperPerson[] {
  if (ctx.people.length) return ctx.people.slice(0, MAX);
  const panelists = ctx.lineup.filter((p) => p.role === 'panelist' || p.role === 'moderator');
  if (panelists.some((p) => p.role === 'panelist')) return sortModeratorLast(panelists).slice(0, MAX);
  return [];
}

function sortModeratorLast(list: BumperPerson[]): BumperPerson[] {
  return [...list.filter((p) => p.role !== 'moderator'), ...list.filter((p) => p.role === 'moderator')];
}

function panelTopic(ctx: ResolveCtx): string {
  const item = ctx.rundown.find((r) => /panel/i.test(r.agenda));
  return item?.agenda ?? ctx.event?.title ?? 'The panel';
}

interface Seat {
  photo: BumperBox;
  label: BumperBox;
  size: number;
}

function rowSeats(n: number): { seats: Seat[]; table: BumperBox; bridge: BumperBox } {
  const size = [0, 320, 300, 290, 250, 220, 190][n] ?? 190;
  const gap = n <= 3 ? 110 : n === 4 ? 80 : 60;
  const colW = Math.min(440, size + gap);
  const total = n * size + (n - 1) * gap;
  const x0 = 960 - total / 2 - 60;
  const top = 460;
  const seats = Array.from({ length: n }, (_, i) => {
    const x = x0 + i * (size + gap);
    return { size, photo: { x, y: top + (320 - size), w: size + 30, h: size + 24 }, label: { x: x + size / 2 - colW / 2, y: top + 362, w: colW, h: 160 } };
  });
  const tableW = total + 300;
  return { seats, table: { x: x0 - 40, y: top + 330, w: tableW, h: 18 }, bridge: { x: x0 - 40 + tableW - 150, y: top + 330 - 138, w: 140, h: 140 } };
}

function gridSeats(n: number): { seats: Seat[]; bridge: BumperBox } {
  const cols = n <= 3 ? n : n === 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const size = rows === 1 ? (n <= 2 ? 300 : 262) : n === 4 ? 210 : 180;
  const areaX = 880;
  const areaW = 944;
  const cellW = areaW / cols;
  const labelH = 130;
  const cellH = size + 40 + labelH + (rows === 1 ? 0 : 36);
  const gridH = rows * cellH - (rows === 1 ? 0 : 36);
  const y0 = Math.max(120, Math.round(560 - gridH / 2));
  const seats = Array.from({ length: n }, (_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, n - r * cols);
    const shift = ((cols - inRow) * cellW) / 2;
    const cx = areaX + shift + c * cellW + cellW / 2;
    const y = y0 + r * cellH;
    return { size, photo: { x: cx - size / 2 - 10, y, w: size + 30, h: size + 24 }, label: { x: cx - cellW / 2 + 10, y: y + size + 40, w: cellW - 20, h: labelH } };
  });
  return { seats, bridge: { x: 130, y: 800, w: 150, h: 150 } };
}

function Render() {
  const ctx = useSlide();
  usePrimedCast();
  const split = ctx.slide.style.variant === 'split';
  const people = panelPeople(ctx);
  const empty = people.length === 0;
  const n = empty ? 3 : Math.max(2, Math.min(MAX, people.length));
  const cast = useMascots(['arch']);
  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title');
  const pop = popSwatch(ctx);
  const row = rowSeats(n);
  const grid = gridSeats(n);
  const seats = split ? grid.seats : row.seats;
  const bridgeBox = split ? grid.bridge : row.bridge;
  const list: Array<BumperPerson | null> = empty ? [null, null, null] : people.slice(0, n);
  const moderator = people.find((p) => p.role === 'moderator');
  const countLine = empty ? 'Pick the panel' : moderator ? `Moderated by ${moderator.name}` : `${list.length} voices, one table`;

  useEnter((tl, root, { at, calm }) => {
    if (ctx.theme.motion === 'still') return;
    const titleEl = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleEl) tl.fromTo(titleEl, { '--casl': 0 }, { '--casl': 0.7, duration: at(1.5), ease: 'power2.out' }, at(0.2));
    const table = root.querySelector('[data-pn-table]');
    if (table) tl.from(table, { scaleX: 0, transformOrigin: '50% 50%', duration: at(0.8), ease: 'zemiOut' }, at(0.3));
    const drops = Array.from(root.querySelectorAll<HTMLElement>('[data-pn-drop]'));
    drops.forEach((d, i) => {
      const t = at(0.45 + i * 0.12);
      tl.from(d, { y: calm ? -200 : -460, rotation: (i % 2 ? 1 : -1) * (calm ? 6 : 16), duration: at(0.8), ease: 'bounce.out' }, t);
      tl.fromTo(d, { scaleY: 0.86, scaleX: 1.08 }, { scaleY: 1, scaleX: 1, duration: at(0.55), ease: 'elastic.out(1, 0.4)', immediateRender: false, transformOrigin: '50% 100%' }, t + at(0.5));
    });
    const tags = root.querySelectorAll('[data-pn-tag]');
    if (tags.length) tl.from(tags, { scale: 0, rotation: -14, duration: at(0.55), ease: 'back.out(2.4)' }, at(1.35));
    const bridge = root.querySelector<HTMLElement>('[data-pn-bridge]');
    if (bridge) {
      tl.from(bridge, { x: 380, opacity: 0, duration: at(0.9), ease: 'power3.out' }, at(0.9));
      if (!calm) [0, 1, 2].forEach((k) => tl.add(charAnim.hop(bridge, { height: 22, duration: 0.3 }), at(0.9 + k * 0.3)));
      tl.add(charAnim.squash(bridge), at(1.85));
      tl.add(charAnim.look(bridge, -1, -0.2, 0.3), at(2.1));
    }
  });

  useIdle((root, { calm }) => {
    const bridge = root.querySelector<HTMLElement>('[data-pn-bridge]');
    const drops = Array.from(root.querySelectorAll<HTMLElement>('[data-pn-drop]'));
    const stop = bridge ? castIdle([bridge], calm, 6) : () => {};
    const anims: gsap.core.Animation[] = [];
    // Bridge follows the conversation: it looks at one panelist, who nods, then the next one.
    if (bridge && drops.length) {
      const b = bridge.getBoundingClientRect();
      const bx = b.left + b.width / 2;
      const by = b.top + b.height / 2;
      const talk = gsap.timeline({ repeat: -1, delay: 0.6 });
      // Nearest first: Bridge sits at the right end of the table.
      const order = drops.map((_, i) => drops.length - 1 - i);
      order.forEach((i, k) => {
        const r = drops[i]!.getBoundingClientRect();
        const dx = r.left + r.width / 2 - bx;
        const dy = r.top + r.height / 2 - by;
        const len = Math.hypot(dx, dy) || 1;
        talk.add(charAnim.look(bridge, dx / len, (dy / len) * 0.8, 0.35), k * 2.2);
        talk.to(drops[i]!, { y: calm ? -6 : -14, duration: 0.22, ease: 'power2.out', yoyo: true, repeat: 3 }, k * 2.2 + 0.35);
      });
      talk.add(charAnim.look(bridge, 0, 0, 0.4), order.length * 2.2);
      talk.to({}, { duration: 2.4 }, order.length * 2.2);
      anims.push(talk);
    }
    drops.forEach((d, i) => {
      // Empty seats are a plain shape (no offset back), they breathe instead.
      const back = d.querySelector('[data-portrait-back]');
      anims.push(back ? gsap.to(back, { rotation: (i % 2 ? 1 : -1) * (calm ? 3 : 6), duration: 4 + i * 0.4, ease: 'sine.inOut', yoyo: true, repeat: -1, transformOrigin: '50% 50%' }) : gsap.to(d, { scale: calm ? 1.02 : 1.04, duration: 2.4 + i * 0.3, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    });
    return () => {
      stop();
      killAll(anims);
      gsap.set(drops, { y: 0, scale: 1 });
    };
  });

  return (
    <>
      {!split ? (
        <El id="table" label="Table" box={row.table} enter="fade" order={2} locked>
          <div data-pn-table="" style={{ width: '100%', height: '100%', borderRadius: 18, background: ctx.colors.fg, opacity: 0.92 }} />
        </El>
      ) : null}
      {list.map((p, i) => {
        const seat = seats[i]!;
        const mod = p?.role === 'moderator';
        const meta = p ? [p.position, p.organization].filter(Boolean).join(', ') : '';
        return (
          <Fragment key={p?.id ?? `seat-${i}`}>
            <El id={`photo-${i}`} label={p ? `${p.first}'s photo` : `Seat ${i + 1}`} box={seat.photo} enter="fade" order={2 + i * 0.4} lockAspect morph={p?.id ? `person:${p.id}:photo` : null}>
              <div data-pn-drop="" style={{ width: seat.size, height: seat.size, transformOrigin: '50% 100%', ...(p ? faceOutline(ctx, p) : null) }}>
                {p ? (
                  <Portrait person={p} size={seat.size} shape={p.shape} color={portraitBack(ctx, p)} />
                ) : (
                  <div style={{ width: seat.size, height: seat.size }}>
                    <BrandShape shape={(['circle', 'square', 'arch'] as const)[i % 3]} color={ghostFill(ctx)} />
                  </div>
                )}
              </div>
            </El>
            <El id={`name-${i}`} label={p ? `${p.first}'s name` : `Seat ${i + 1} name`} box={seat.label} align="center" enter="rise" order={4 + i * 0.5} morph={p?.id ? `person:${p.id}:name` : null}>
              {mod ? (
                // A tent card on the table (or a badge on the portrait in the grid), so every name keeps the same baseline.
                <span data-pn-tag="" style={{ position: 'absolute', left: '50%', top: -44, translate: '-50% 0', ...fontStyle('mono', { weight: 700, tracking: 0.12 }), fontSize: 20, textTransform: 'uppercase', padding: '7px 16px', borderRadius: 999, background: pop.fill, color: pop.text, border: `3px solid ${ctx.colors.bg === 'transparent' ? pop.fill : ctx.colors.bg}`, lineHeight: 1, whiteSpace: 'nowrap' }}>
                  Moderator
                </span>
              ) : null}
              <div style={{ width: '100%', height: n >= 5 ? 50 : 58 }}>
                <FitText max={n >= 5 ? 40 : 46} min={24} casl={0.5} weight={900} lineHeight={1.05} valign="center">
                  {p?.name ?? 'Pick a panelist'}
                </FitText>
              </div>
              {meta ? (
                <div style={{ width: '100%', height: n >= 5 ? 58 : 64, marginTop: 4 }}>
                  <FitText max={n >= 5 ? 24 : 27} min={18} font="body" weight={600} lineHeight={1.2} style={{ color: ctx.colors.fg2 }}>
                    {meta}
                  </FitText>
                </div>
              ) : null}
            </El>
          </Fragment>
        );
      })}
      {eyebrow ? (
        <El id="eyebrow" label="Eyebrow" box={split ? { x: 130, y: 220, w: 700, h: 56 } : { x: 160, y: 132, w: 1600, h: 56 }} align={split ? 'start' : 'center'} enter="wipe" order={0}>
          <Eyebrow size={32}>{eyebrow}</Eyebrow>
        </El>
      ) : null}
      <El id="title" label="Topic" box={split ? { x: 130, y: 294, w: 700, h: 440 } : { x: 200, y: 200, w: 1520, h: 230 }} align={split ? 'start' : 'center'} enter="split-lines" order={1}>
        <FitText max={split ? 110 : 112} min={48} casl={0.7} weight={900} lineHeight={0.95} valign={split ? 'start' : 'center'}>
          {title}
        </FitText>
      </El>
      {cast.length ? (
        <El id="bridge" label="Character" box={bridgeBox} enter="fade" order={6} lockAspect>
          <div data-pn-bridge="" style={{ width: '100%', height: '100%' }}>
            <BumperCharacter shape={cast[0]!} mood="happy" lookX={-1} lookY={split ? -0.6 : -0.2} style={charOutline(ctx, cast[0]!)} />
          </div>
        </El>
      ) : null}
      {split ? (
        <El id="count" label="Moderator line" box={{ x: cast.length ? 310 : 130, y: 850, w: cast.length ? 540 : 720, h: 60 }} valign="center" enter="rise" order={3}>
          <FitText max={28} min={18} font="mono" weight={700} lineHeight={1.2} uppercase style={{ color: accentLabel(ctx) }}>
            {countLine}
          </FitText>
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'panel',
  background: 'paper',
  variants: [
    { key: 'row', label: 'At the table', hint: 'Topic on top, everyone in a row' },
    { key: 'split', label: 'Topic left', hint: 'Topic on the left, the panel in a grid' },
  ],
  fields: [
    f.eyebrow(() => 'Panel discussion'),
    f.title((ctx) => panelTopic(ctx), 'Topic', 200),
  ],
  describe: (ctx) => {
    const people = panelPeople(ctx);
    return people.length ? `Panel: ${people.map((p) => p.first).join(', ')}` : 'Panel';
  },
  headline: () => 'Panel',
  Render,
});
