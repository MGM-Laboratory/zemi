'use client';

import { formatJakarta, fromJakartaInput, jakartaDateInput, SHAPE_ORDER, type BumperItem, type ShapeName } from '@zemi/shared';
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { useBumperNow } from '../../engine/clock';
import { useEnter, useIdle } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { eventNumberLabel } from '../../engine/resolve';
import type { BumperPerson, ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandShape, BumperAvatar } from '../../parts/shapes';
import { defineTemplate, f, useMascots } from '../kit';
import { accentFill, accentText, charColor, Label, marker, moves, useOpenCtx } from '../_tpl-open-kit';

/**
 * Today's rundown: time, agenda and a speaker chip per row, up to nine rows (two columns past
 * six). The highlighted row (the one on now, or a row you pick) gets a marker swipe and a tiny
 * character leaning in from the gutter to look at it. Rows slide in on a stagger; each row's title
 * carries `rundown:<index>` so the next "Up next" can magic-move out of it.
 */

const MAX = 9;

interface Row {
  key: string;
  index: number;
  time: string;
  agenda: string;
  who: string;
  person: BumperPerson | null;
  /** Straight from the event rundown (so it can carry the `rundown:<index>` morph key). */
  fromRundown: boolean;
}

function rundownItems(ctx: ResolveCtx): BumperItem[] {
  return ctx.rundown.slice(0, MAX).map((r) => ({ id: `rundown-${r.index}`, title: r.agenda, meta: r.time, body: r.speaker?.name ?? '', icon: null, assetId: null, url: null }));
}

function useRows(): Row[] {
  const { ctx } = useOpenCtx();
  if (!ctx.slide.items.length) {
    return ctx.rundown.slice(0, MAX).map((r) => ({ key: `r${r.index}`, index: r.index, time: r.time, agenda: r.agenda, who: r.speaker?.name ?? '', person: r.speaker, fromRundown: true }));
  }
  return ctx.slide.items
    .filter((it) => it.title.trim())
    .slice(0, MAX)
    .map((it, i) => ({ key: it.id, index: i, time: it.meta.trim(), agenda: ctx.fill(it.title), who: ctx.fill(it.body), person: null, fromRundown: false }));
}

/** Which row is lit: a picked row number, none, or (auto) whatever is on now by the clock. */
function useHighlight(rows: Row[]): number {
  const { ctx, live } = useOpenCtx();
  const pick = String(ctx.field('highlight') ?? 'auto');
  const now = useBumperNow(15_000, live && pick === 'auto');
  if (pick === 'none') return -1;
  if (pick !== 'auto') {
    const n = Number(pick);
    return Number.isInteger(n) && n >= 1 && n <= rows.length ? n - 1 : -1;
  }
  return autoRow(rows, ctx.event, live ? now : ctx.now());
}

/** The row on now by the clock; before the first one starts, the first row; after the event, none. */
function autoRow(rows: Row[], event: ResolveCtx['event'], t: number): number {
  if (!event) return -1;
  const day = jakartaDateInput(event.startsAt);
  const starts = rows.map((r) => (/^\d{1,2}:\d{2}$/.test(r.time) ? fromJakartaInput(day, r.time.padStart(5, '0')).getTime() : NaN));
  const first = starts.findIndex((n) => !Number.isNaN(n));
  if (first < 0) return -1;
  if (t < starts[first]!) return first;
  if (t > Date.parse(event.endsAt)) return -1;
  let found = -1;
  starts.forEach((n, i) => {
    if (!Number.isNaN(n) && n <= t) found = i;
  });
  return found;
}

function Chip({ person, who, size, fg, fg2 }: { person: BumperPerson | null; who: string; size: number; fg: string; fg2: string }) {
  if (!who) return null;
  const shape: ShapeName = person?.shape ?? 'circle';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.3, minWidth: 0 }}>
      <div style={{ flex: 'none' }}>
        <BumperAvatar image={person?.avatar ?? null} name={who} clip={shape} size={size} />
      </div>
      <span style={{ ...fontStyle('body', { weight: 700 }), fontSize: size * 0.5, color: fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
        {who}
        {person?.organization ? <span style={{ color: fg2, fontWeight: 500 }}>{`  ·  ${person.organization}`}</span> : null}
      </span>
    </div>
  );
}

interface ColSpec {
  x: number;
  w: number;
  rows: Row[];
}

function Rows({ hi, cols, timeline }: { hi: number; cols: ColSpec[]; timeline: boolean }) {
  const { ctx, live, calm } = useOpenCtx();
  const m = marker(ctx);
  const rootRef = useRef<HTMLDivElement>(null);
  const prevHi = useRef(hi);
  const two = cols.length > 1;
  const perCol = Math.max(...cols.map((c) => c.rows.length));
  // Short lists get roomier rows; long ones pack in. Titles always keep clear of the row above.
  const rowH = Math.min(two ? 152 : perCol <= 4 ? 150 : 112, 650 / Math.max(1, perCol));
  const roomy = !two && rowH >= 140;
  const clear = two ? 14 : 20;
  const padTop = Math.max(0, (650 - perCol * rowH) / 2);
  const markStyle = (on: boolean): CSSProperties => ({
    backgroundImage: `linear-gradient(${m.color}, ${m.color})`,
    backgroundSize: on ? '100% 44%' : '0% 44%',
    backgroundPosition: '0% 88%',
    backgroundRepeat: 'no-repeat',
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
    padding: '0 0.14em',
    margin: '0 -0.14em',
    mixBlendMode: m.blend,
    borderRadius: 6,
  });
  const gutter = 96;
  const timeW = two ? 150 : 190;

  // The highlight moved (auto mode crossing into the next item): glide the pointer over.
  useLayoutEffect(() => {
    const was = prevHi.current;
    prevHi.current = hi;
    const root = rootRef.current;
    if (!live || !moves(ctx) || was === hi || !root) return;
    const mark = root.querySelector(`[data-ag-row="${hi}"] [data-ag-mark]`);
    if (mark) gsap.fromTo(mark, { backgroundSize: '0% 44%' }, { backgroundSize: '100% 44%', duration: 0.7, ease: BE.inOut });
    const ptr = root.querySelector<HTMLElement>('[data-ag-pointer]');
    if (ptr) {
      gsap.fromTo(ptr, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.5, ease: BE.back });
      if (!calm) charAnim.hop(ptr, { height: 16 });
    }
  }, [hi, live, calm, ctx]);

  let flat = 0;
  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0 }}>
      {cols.map((col, ci) => (
        <div key={ci} style={{ position: 'absolute', left: col.x, width: col.w, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: padTop }}>
          {timeline ? <span data-ag-rail="" aria-hidden="true" style={{ position: 'absolute', left: gutter + timeW + 22, top: padTop + rowH / 2, height: Math.max(0, (col.rows.length - 1) * rowH), width: 6, marginLeft: -3, borderRadius: 6, background: ctx.colors.dark || ctx.background === 'accent' ? `${ctx.colors.fg}40` : '#0e111626', transformOrigin: '50% 0%' }} /> : null}
          {col.rows.map((r) => {
            const i = flat++;
            const on = i === hi;
            const shape = SHAPE_ORDER[i % 4]!;
            return (
              <div key={r.key} data-ag-row={i} style={{ position: 'relative', display: 'flex', alignItems: 'center', height: rowH, gap: 0 }}>
                <div style={{ width: gutter, flex: 'none', height: '100%', position: 'relative' }}>{on ? <Pointer size={Math.min(76, rowH * 0.7)} /> : null}</div>
                <span data-ag-time="" style={{ ...fontStyle('mono', { weight: 700, tracking: 0.02 }), width: timeW, flex: 'none', fontSize: two ? 36 : roomy ? 48 : 42, color: on ? accentText(ctx) : ctx.colors.fg2 }}>
                  {r.time}
                </span>
                {timeline ? (
                  <div style={{ width: 44, flex: 'none', display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
                    <div data-ag-node="" style={{ width: on ? 34 : 24, height: on ? 34 : 24 }}>
                      <BrandShape shape={shape} color={on ? accentFill(ctx) : ctx.background === 'accent' ? ctx.colors.onAccent : undefined} />
                    </div>
                  </div>
                ) : null}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: two ? 'column' : 'row', alignItems: two ? 'flex-start' : 'center', gap: two ? 8 : 30, paddingLeft: timeline ? 22 : 0, height: '100%', justifyContent: 'center' }}>
                  <div data-morph={r.fromRundown ? `rundown:${r.index}` : undefined} style={{ flex: two ? 'none' : 1, minWidth: 0, width: two ? '100%' : undefined, height: two ? rowH - (r.who ? 54 : 16) - clear : rowH - clear, isolation: 'isolate' }}>
                    <FitText max={two ? 46 : roomy ? 66 : 56} min={22} weight={on ? 900 : 800} casl={on ? 0.6 : 0.25} lineHeight={1.08} valign={two && r.who ? 'end' : 'center'}>
                      <span data-ag-mark="" style={markStyle(on)}>
                        {r.agenda}
                      </span>
                    </FitText>
                  </div>
                  {r.who ? (
                    <div data-ag-who="" style={{ flex: 'none', maxWidth: two ? '100%' : 520, display: 'flex', justifyContent: two ? 'flex-start' : 'flex-end' }}>
                      <Chip person={r.person} who={r.who} size={two ? 38 : 52} fg={ctx.colors.fg} fg2={ctx.colors.fg2} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** The tiny character in the gutter, leaning toward the lit row (no limbs: a lean and a look). */
function Pointer({ size }: { size: number }) {
  const { ctx } = useOpenCtx();
  const cast = useMascots(['triangle']);
  const shape = cast[0];
  if (!shape) return null;
  return (
    <div data-ag-pointer="" style={{ position: 'absolute', left: -2, top: '50%', width: size, height: size, marginTop: -size / 2, rotate: '12deg', transformOrigin: '50% 100%' }}>
      <BumperCharacter shape={shape} mood="happy" color={charColor(ctx, shape)} lookX={1} lookY={0.2} name="agenda-pointer" />
    </div>
  );
}

function Render() {
  const { ctx } = useOpenCtx();
  const timeline = ctx.slide.style.variant === 'timeline';
  const rows = useRows();
  const hi = useHighlight(rows);
  const two = rows.length > 6;
  const split = Math.ceil(rows.length / 2);
  const cols: ColSpec[] = two
    ? [
        { x: 0, w: 840, rows: rows.slice(0, split) },
        { x: 860, w: 840, rows: rows.slice(split) },
      ]
    : [{ x: 0, w: 1700, rows }];

  useEnter((tl, root, { at, calm }) => {
    if (!moves(ctx)) return;
    const titleFit = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleFit) tl.fromTo(titleFit, { '--casl': 0 }, { '--casl': 0.8, duration: at(1.5), ease: 'power2.out' }, at(0.25));
    const rails = root.querySelectorAll('[data-ag-rail]');
    if (rails.length) tl.fromTo(rails, { scaleY: 0 }, { scaleY: 1, duration: at(1.1), ease: BE.inOut }, at(0.3));
    const rowEls = Array.from(root.querySelectorAll<HTMLElement>('[data-ag-row]'));
    rowEls.forEach((row, i) => {
      const t = 0.35 + i * (calm ? 0.1 : 0.08);
      tl.fromTo(row, { x: calm ? -30 : -90, opacity: 0 }, { x: 0, opacity: 1, duration: at(0.75), ease: BE.out }, at(t));
      const node = row.querySelector('[data-ag-node]');
      if (node) tl.fromTo(node, { scale: 0, rotation: -90 }, { scale: 1, rotation: 0, duration: at(0.5), ease: BE.back }, at(t + 0.15));
    });
    const end = 0.5 + rowEls.length * 0.08;
    const mark = root.querySelector(`[data-ag-row="${hi}"] [data-ag-mark]`);
    if (mark) tl.fromTo(mark, { backgroundSize: '0% 44%' }, { backgroundSize: '100% 44%', duration: at(0.7), ease: BE.inOut }, at(end + 0.2));
    const ptr = root.querySelector<HTMLElement>('[data-ag-pointer]');
    if (ptr) {
      tl.fromTo(ptr, { x: -120, opacity: 0 }, { x: 0, opacity: 1, duration: at(0.6), ease: BE.back }, at(end + 0.35));
      tl.add(charAnim.squash(ptr), at(end + 0.9));
    }
  });

  useIdle((root, { calm }) => {
    const anims: gsap.core.Animation[] = [];
    const stops: Array<() => void> = [];
    const ptr = root.querySelector<HTMLElement>('[data-ag-pointer]');
    if (ptr) {
      stops.push(charAnim.blinkLoop(ptr));
      // Lean in, look, lean back: an eager little nudge toward the lit row.
      anims.push(gsap.fromTo(ptr, { x: 0 }, { x: calm ? 5 : 12, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: -1, repeatDelay: 0.3 }));
      anims.push(...charAnim.idle(ptr, { calm, seed: 2 }));
    }
    const lit = root.querySelector(`[data-ag-row="${hi}"] [data-ag-node]`);
    if (lit) anims.push(gsap.fromTo(lit, { scale: 1 }, { scale: 1.18, duration: 1.2, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    const nodes = Array.from(root.querySelectorAll('[data-ag-node]')).filter((n) => n !== lit);
    nodes.forEach((n, i) => anims.push(gsap.fromTo(n, { rotation: -6 }, { rotation: 6, duration: 3 + (i % 3) * 0.5, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: i * 0.2 })));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
    };
  });

  return (
    <>
      <El id="eyebrow" label="Eyebrow" box={{ x: 130, y: 118, w: 1200, h: 40 }} enter="wipe" order={0}>
        <Label color={ctx.colors.fg} bullet={ctx.background === 'accent' ? ctx.colors.onAccent : ctx.colors.accentHex} size={28}>
          {ctx.text('eyebrow')}
        </Label>
      </El>
      <El id="title" label="Title" box={{ x: 124, y: 164, w: 1300, h: 150 }} enter="split-words" order={1}>
        <FitText max={130} min={56} casl={0} lineHeight={0.95} valign="center">
          {ctx.text('title')}
        </FitText>
      </El>
      {rows.length ? (
        <El id="rows" label="Rundown" box={{ x: 110, y: 340, w: 1700, h: 650 }} enter="fade" order={1}>
          <Rows hi={hi} cols={cols} timeline={timeline} />
        </El>
      ) : (
        <El id="empty" label="Empty note" box={{ x: 130, y: 420, w: 1400, h: 200 }} enter="rise" order={2}>
          <FitText max={64} min={30} casl={0.8} weight={800} style={{ color: ctx.colors.fg2 }}>
            {ctx.text('empty')}
          </FitText>
        </El>
      )}
    </>
  );
}

const HIGHLIGHT_OPTIONS = [
  { value: 'auto', label: 'What is on now' },
  { value: 'none', label: 'Nothing' },
  ...Array.from({ length: MAX }, (_, i) => ({ value: String(i + 1), label: `Row ${i + 1}` })),
];

export default defineTemplate({
  kind: 'agenda',
  background: 'paper',
  variants: [
    { key: 'list', label: 'Rows' },
    { key: 'timeline', label: 'Timeline', hint: 'A rail with a little shape at every stop.' },
  ],
  fields: [
    f.eyebrow((ctx) => (ctx.event ? [ctx.event.number != null ? `Zemi ${eventNumberLabel(ctx.event)}` : null, formatJakarta(ctx.event.startsAt, 'date-long')].filter(Boolean).join('  ·  ') : 'Today')),
    f.title("Here's the plan"),
    { key: 'highlight', label: 'Highlight', type: 'select', default: 'auto', options: HIGHLIGHT_OPTIONS, hint: 'What is on now uses the clock on the day.' },
    { key: 'empty', label: 'Without a rundown', type: 'text', max: 120, default: 'The rundown is still cooking. Check back soon.', group: 'options' },
  ],
  items: {
    label: 'Rundown rows',
    itemLabel: 'Row',
    max: MAX,
    fields: [
      { key: 'meta', label: 'Time', type: 'text', placeholder: '13:30' },
      { key: 'title', label: 'What happens', type: 'text', placeholder: 'Opening remarks' },
      { key: 'body', label: 'Who', type: 'text', placeholder: 'Speaker name' },
    ],
    fallback: rundownItems,
  },
  describe: (ctx) => (ctx.rundown.length || ctx.slide.items.length ? `Agenda (${Math.min(MAX, ctx.slide.items.length || ctx.rundown.length)})` : 'Agenda'),
  headline: () => 'Agenda',
  Render,
});
