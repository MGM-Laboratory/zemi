'use client';

import { formatJakarta, SHAPE_ORDER, type BumperBox, type ImageRef, type ShapeName } from '@zemi/shared';
import { Fragment } from 'react';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { shapeForName } from '../../engine/palette';
import { eventNumberLabel } from '../../engine/resolve';
import type { BumperPerson, ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BumperAvatar } from '../../parts/shapes';
import { accentLabel, castIdle, charOutline, faceOutline, killAll, popSwatch, portraitBack, usePrimedCast } from '../_tpl-talks-kit';
import { defineTemplate, Eyebrow, f, Portrait, useMascots } from '../kit';

/**
 * Lineup: everyone speaking today in one frame (lineup order, moderator last). The frame draws
 * itself, the four characters hop onto its corners, the cards flip in, and a soft spotlight
 * walks from card to card while the corner crew watches.
 */

const MAX = 8;
const ROLE: Record<string, string> = { keynote: 'Keynote', speaker: 'Speaker', moderator: 'Moderator', panelist: 'Panelist' };

interface Row {
  key: string;
  id: string | null;
  name: string;
  talk: string;
  role: string;
  avatar: ImageRef | null;
  shape: ShapeName;
  time: string;
}

function lineupPeople(ctx: ResolveCtx): BumperPerson[] {
  return [...ctx.lineup.filter((p) => p.role !== 'moderator'), ...ctx.lineup.filter((p) => p.role === 'moderator')];
}

function timeFor(ctx: ResolveCtx, id: string | null): string {
  if (!id) return '';
  return ctx.rundown.find((r) => r.speakerId === id && !/welcome|doors|q\s*(and|&)\s*a|question/i.test(r.agenda))?.time ?? '';
}

function rowsOf(ctx: ResolveCtx): Row[] {
  if (ctx.slide.items.length) {
    return ctx.slide.items.slice(0, MAX).map((it) => ({
      key: it.id,
      id: null,
      name: ctx.fill(it.title) || 'Someone great',
      talk: ctx.fill(it.body),
      role: ctx.fill(it.meta),
      avatar: it.assetId ? (ctx.data.images[it.assetId] ?? null) : null,
      shape: shapeForName(it.title || it.id),
      time: '',
    }));
  }
  return lineupPeople(ctx)
    .slice(0, MAX)
    .map((p) => ({ key: p.id ?? p.name, id: p.id, name: p.name, talk: p.talkTitle ?? '', role: ROLE[p.role ?? ''] ?? p.role ?? '', avatar: p.avatar, shape: p.shape, time: timeFor(ctx, p.id) }));
}

function gridFrame(n: number): BumperBox {
  return n <= 4 ? { x: 110, y: 356, w: 1700, h: 580 } : { x: 110, y: 300, w: 1700, h: 700 };
}

interface Cell {
  photo: BumperBox;
  text: BumperBox;
  glow: BumperBox;
  size: number;
  horizontal: boolean;
}

function gridCells(n: number): Cell[] {
  const frame = gridFrame(n);
  const cols = n <= 4 ? Math.max(1, n) : Math.ceil(n / 2);
  const rows = n <= 4 ? 1 : 2;
  const pad = 36;
  const cw = (frame.w - pad * 2) / cols;
  const ch = (frame.h - pad * 2) / rows;
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, n - r * cols);
    const shift = ((cols - inRow) * cw) / 2;
    const c = i % cols;
    const x = frame.x + pad + shift + c * cw;
    const y = frame.y + pad + r * ch;
    if (rows === 1) {
      const size = n <= 2 ? 250 : n === 3 ? 240 : 220;
      return { size, horizontal: false, glow: { x: x + 10, y: y + 6, w: cw - 20, h: ch - 12 }, photo: { x: x + cw / 2 - size / 2 - 10, y: y + 34, w: size + 26, h: size + 22 }, text: { x: x + 24, y: y + size + 74, w: cw - 48, h: ch - size - 90 } };
    }
    const size = 150;
    return { size, horizontal: true, glow: { x: x + 8, y: y + 6, w: cw - 16, h: ch - 12 }, photo: { x: x + 24, y: y + ch / 2 - size / 2 - 8, w: size + 22, h: size + 18 }, text: { x: x + size + 60, y: y + 26, w: cw - size - 84, h: ch - 52 } };
  });
}

function listCells(n: number): Cell[] {
  const h = Math.min(150, 820 / Math.max(1, n));
  const top = Math.max(150, Math.round(560 - (n * h) / 2));
  const size = Math.min(110, h - 24);
  return Array.from({ length: n }, (_, i) => {
    const y = top + i * h;
    return { size, horizontal: true, glow: { x: 718, y: y + 4, w: 1088, h: h - 8 }, photo: { x: 850, y: y + (h - size) / 2 - 4, w: size + 16, h: size + 12 }, text: { x: 850 + size + 40, y: y + 8, w: 1824 - (850 + size + 40) - 30, h: h - 16 } };
  });
}

function Render() {
  const ctx = useSlide();
  usePrimedCast();
  const list = ctx.slide.style.variant === 'list';
  const rows = rowsOf(ctx);
  const empty = rows.length === 0;
  const cast = useMascots([...SHAPE_ORDER]);
  const pop = popSwatch(ctx);
  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title');
  const n = rows.length;
  const cells = list ? listCells(n) : gridCells(n);
  const lastCell = cells[cells.length - 1];
  const firstCell = cells[0];
  // The running order hugs its rows; with nobody on the lineup yet it frames the note beside the title.
  const frame: BumperBox = !list ? gridFrame(n) : firstCell && lastCell ? { x: 700, y: firstCell.glow.y - 22, w: 1124, h: Math.max(240, lastCell.glow.y + lastCell.glow.h - firstCell.glow.y + 44) } : { x: 700, y: 360, w: 1124, h: 400 };
  const corners: Array<{ shape: ShapeName; x: number; y: number }> = [
    { shape: 'circle', x: frame.x, y: frame.y },
    { shape: 'triangle', x: frame.x + frame.w, y: frame.y },
    { shape: 'arch', x: frame.x + frame.w, y: frame.y + frame.h },
    { shape: 'square', x: frame.x, y: frame.y + frame.h },
  ];
  const corner = list ? 96 : 110;
  const glowFill = ctx.background === 'accent' ? (ctx.colors.fg === '#ffffff' ? '#ffffff24' : '#0e11161a') : ctx.colors.dark ? '#ffffff12' : ctx.colors.accentSoft;

  useEnter((tl, root, { at, calm }) => {
    if (ctx.theme.motion === 'still') return;
    const titleEl = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleEl) tl.fromTo(titleEl, { '--casl': 0 }, { '--casl': 0.75, duration: at(1.5), ease: 'power2.out' }, at(0.2));
    const rect = root.querySelector('[data-lu-frame]');
    if (rect) tl.from(rect, { drawSVG: '0%', duration: at(1.2), ease: 'zemiInOut' }, at(0.15));
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-lu-char]'));
    chars.forEach((c, i) => {
      const t = at(0.55 + i * 0.16);
      tl.from(c, { scale: 0, rotation: (i % 2 ? 1 : -1) * 90, duration: at(0.6), ease: 'back.out(2)' }, t);
      tl.add(charAnim.squash(c), t + at(0.45));
    });
    const cards = root.querySelectorAll('[data-lu-card]');
    if (cards.length) tl.from(cards, { rotationY: 72, transformPerspective: 1200, transformOrigin: '0% 50%', opacity: 0, duration: at(0.8), ease: 'zemiOut', stagger: at(0.1) }, at(0.5));
    chars.forEach((c) => tl.add(charAnim.look(c, 0, 0, 0.3), at(2)));
    if (!calm) chars.forEach((c, i) => tl.add(charAnim.hop(c, { height: 14 }), at(2.1 + i * 0.1)));
  });

  useIdle((root, { calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-lu-char]'));
    const glows = Array.from(root.querySelectorAll<HTMLElement>('[data-lu-glow]'));
    const stop = castIdle(chars, calm, 3);
    const walk = gsap.timeline({ repeat: -1, delay: 0.8 });
    glows.forEach((g, i) => {
      const t = i * 2.6;
      walk.to(g, { opacity: 1, duration: 0.6, ease: 'sine.inOut' }, t).to(g, { opacity: 0, duration: 0.8, ease: 'sine.inOut' }, t + 2.1);
      // The corner crew glances at whoever has the light.
      const gr = g.getBoundingClientRect();
      chars.forEach((c) => {
        const cr = c.getBoundingClientRect();
        const dx = gr.left + gr.width / 2 - (cr.left + cr.width / 2);
        const dy = gr.top + gr.height / 2 - (cr.top + cr.height / 2);
        const len = Math.hypot(dx, dy) || 1;
        walk.add(charAnim.look(c, dx / len, (dy / len) * 0.9, 0.4), t + 0.1);
      });
    });
    if (glows.length) chars.forEach((c) => walk.add(charAnim.look(c, 0, 0, 0.5), glows.length * 2.6));
    walk.to({}, { duration: 1.2 }, glows.length * 2.6);
    return () => {
      stop();
      killAll([walk]);
      gsap.set(glows, { opacity: 0 });
    };
  });

  return (
    <>
      {eyebrow ? (
        <El id="eyebrow" label="Eyebrow" box={list ? { x: 130, y: 330, w: 540, h: 56 } : { x: 160, y: n <= 4 ? 150 : 110, w: 1600, h: 56 }} align={list ? 'start' : 'center'} enter="wipe" order={0}>
          <Eyebrow size={list ? 24 : 30}>{eyebrow}</Eyebrow>
        </El>
      ) : null}
      <El id="title" label="Title" box={list ? { x: 130, y: 390, w: 520, h: 400 } : { x: 260, y: n <= 4 ? 206 : 164, w: 1400, h: 116 }} align={list ? 'start' : 'center'} enter="split-lines" order={1}>
        <FitText max={list ? 140 : 108} min={48} casl={0.75} weight={900} lineHeight={0.92} valign={list ? 'start' : 'center'}>
          {title}
        </FitText>
      </El>
      <El id="frame" label="Frame" box={frame} enter="fade" order={1} locked>
        <svg viewBox={`0 0 ${frame.w} ${frame.h}`} width={frame.w} height={frame.h} style={{ overflow: 'visible', display: 'block' }} aria-hidden="true">
          <rect data-lu-frame="" x={2} y={2} width={frame.w - 4} height={frame.h - 4} rx={44} fill="none" stroke={ctx.colors.fg} strokeWidth={4} strokeOpacity={ctx.colors.dark ? 0.5 : 0.9} />
        </svg>
      </El>
      {cells.map((cell, i) => (
        <El key={`glow-${rows[i]!.key}`} id={`glow-${i}`} label={`Spotlight ${i + 1}`} box={cell.glow} enter="none" locked>
          <div data-lu-glow="" style={{ width: '100%', height: '100%', borderRadius: 30, background: glowFill, opacity: 0 }} />
        </El>
      ))}
      {rows.map((r, i) => {
        const cell = cells[i]!;
        const person = { avatar: r.avatar, shape: r.shape };
        return (
          <Fragment key={r.key}>
            {list && r.time ? (
              <El id={`time-${i}`} label={`${r.name.split(' ')[0]}'s time`} box={{ x: 728, y: cell.glow.y, w: 118, h: cell.glow.h }} valign="center" enter="fade" order={3 + i * 0.5}>
                <span style={{ ...fontStyle('mono', { weight: 700 }), fontSize: 34, color: accentLabel(ctx), lineHeight: 1 }}>{r.time}</span>
              </El>
            ) : null}
            <El id={`photo-${i}`} label={`${r.name.split(' ')[0]}'s photo`} box={cell.photo} enter="pop" order={3 + i * 0.5} lockAspect morph={r.id ? `person:${r.id}:photo` : null}>
              <div style={faceOutline(ctx, person, 4)}>
                {cell.size >= 150 ? (
                  <Portrait person={{ ...personFor(r) }} size={cell.size} shape={r.shape} color={portraitBack(ctx, person)} />
                ) : (
                  <BumperAvatar image={r.avatar} name={r.name} clip={r.shape} size={cell.size} />
                )}
              </div>
            </El>
            <El id={`card-${i}`} label={`${r.name.split(' ')[0]}'s card`} box={cell.text} align={cell.horizontal ? 'start' : 'center'} valign={cell.horizontal ? 'center' : 'start'} enter="fade" order={3.2 + i * 0.5} morph={r.id ? `person:${r.id}:name` : null}>
              <div data-lu-card="" style={{ display: 'flex', flexDirection: list ? 'row' : 'column', alignItems: list ? 'center' : cell.horizontal ? 'flex-start' : 'center', gap: list ? 28 : 12, width: '100%', height: list ? '100%' : undefined }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: list ? 6 : 12, alignItems: cell.horizontal ? 'flex-start' : 'center', minWidth: 0, width: '100%' }}>
                  {r.role ? <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.1 }), fontSize: 20, textTransform: 'uppercase', padding: '6px 14px', borderRadius: 999, background: r.role === 'Moderator' ? 'transparent' : pop.fill, color: r.role === 'Moderator' ? ctx.colors.fg : pop.text, border: `2px solid ${r.role === 'Moderator' ? ctx.colors.fg : pop.fill}`, lineHeight: 1 }}>{r.role}</span> : null}
                  <div style={{ width: '100%', height: list ? 50 : 52 }}>
                    <FitText max={list ? 46 : n > 4 ? 36 : 42} min={22} casl={0.5} weight={900} lineHeight={1.05} valign="center">
                      {r.name}
                    </FitText>
                  </div>
                  {r.talk ? (
                    <div style={{ width: '100%', height: list ? 34 : n > 4 ? 76 : 110 }}>
                      <FitText max={list ? 29 : n > 4 ? 25 : 28} min={16} font="body" weight={600} lineHeight={1.25} style={{ color: ctx.colors.fg2 }}>
                        {r.talk}
                      </FitText>
                    </div>
                  ) : null}
                </div>
              </div>
            </El>
          </Fragment>
        );
      })}
      {empty ? (
        <El id="empty" label="Empty note" box={{ x: frame.x + 100, y: frame.y + frame.h / 2 - 60, w: frame.w - 200, h: 120 }} align="center" valign="center" enter="rise" order={3}>
          <FitText max={56} min={28} casl={0.6} weight={800} lineHeight={1.1} style={{ color: ctx.colors.fg2 }}>
            The lineup shows up here once speakers are added to the event.
          </FitText>
        </El>
      ) : null}
      {cast.length
        ? corners
            .filter((c) => cast.includes(c.shape))
            .map((c) => (
              <El key={c.shape} id={`char-${c.shape}`} label="Character" box={{ x: c.x - corner / 2, y: c.y - corner / 2 - (c.y === frame.y ? corner * 0.28 : 0), w: corner, h: corner }} enter="fade" order={0} lockAspect>
                <div data-lu-char="" style={{ width: '100%', height: '100%' }}>
                  <BumperCharacter shape={c.shape} mood={c.shape === 'triangle' ? 'wink' : 'happy'} lookX={c.x === frame.x ? 0.6 : -0.6} lookY={c.y === frame.y ? 0.6 : -0.6} style={charOutline(ctx, c.shape)} />
                </div>
              </El>
            ))
        : null}
    </>
  );
}

function personFor(r: Row): BumperPerson {
  return { kind: 'manual', id: r.id, name: r.name, first: r.name.split(' ')[0] ?? r.name, nickname: null, headline: null, avatar: r.avatar, organization: null, position: null, role: null, talkTitle: null, url: null, shape: r.shape };
}

export default defineTemplate({
  kind: 'lineup',
  background: 'paper',
  variants: [
    { key: 'grid', label: 'Grid', hint: 'Portraits in a framed grid' },
    { key: 'list', label: 'Running order', hint: 'Title left, a list with times on the right' },
  ],
  fields: [
    f.eyebrow((ctx) => (ctx.event ? [eventNumberLabel(ctx.event) ? `Zemi ${eventNumberLabel(ctx.event)}` : '', `${formatJakarta(ctx.event.startsAt, 'weekday')}, ${formatJakarta(ctx.event.startsAt, 'date-short')}`].filter(Boolean).join('  ·  ') : 'This Friday')),
    f.title(() => "Today's lineup"),
  ],
  items: {
    label: 'People',
    itemLabel: 'Person',
    max: MAX,
    fields: [
      { key: 'title', label: 'Name', type: 'text', placeholder: 'Rani Kusuma' },
      { key: 'body', label: 'Talk title', type: 'longtext', placeholder: 'What the talk is about' },
      { key: 'meta', label: 'Role', type: 'text', placeholder: 'Speaker' },
      { key: 'assetId', label: 'Photo', type: 'image' },
    ],
    fallback: (ctx) =>
      lineupPeople(ctx)
        .slice(0, MAX)
        .map((p, i) => ({ id: `lineup-${i}`, title: p.name, body: p.talkTitle ?? '', meta: ROLE[p.role ?? ''] ?? p.role ?? '', icon: null, assetId: null, url: null })),
  },
  describe: (ctx) => {
    const n = ctx.slide.items.length || ctx.lineup.length;
    return n ? `Lineup, ${n} ${n === 1 ? 'person' : 'people'}` : 'Lineup';
  },
  headline: () => 'Lineup',
  Render,
});
