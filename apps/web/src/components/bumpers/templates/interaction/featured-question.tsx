'use client';

import { SHAPE_ORDER, type BumperBox, type BumperThreadData, type ShapeName } from '@zemi/shared';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { INK, PAPER, shapeForName } from '../../engine/palette';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandShape } from '../../parts/shapes';
import { accentLabel, cardSurface, castIdle, charOutline, killAll, usePrimedCast } from '../_tpl-talks-kit';
import { defineTemplate, Eyebrow, f, useMascots } from '../kit';

/**
 * Question from the room: a thread from the discussion page as a big speech bubble coming out of
 * the asker (a character in their shape), with a little upvote counter that counts up. With two
 * or three questions they stack like cards.
 */

interface Q {
  key: string;
  title: string;
  excerpt: string;
  asker: string;
  score: number;
  replies: number;
  shape: ShapeName;
}

/** Picked threads, else the event's most upvoted ones (one by default). */
function threadsOf(ctx: ResolveCtx): BumperThreadData[] {
  if (ctx.threads.length) return ctx.threads.slice(0, 3);
  const eventId = ctx.event?.id;
  if (!eventId) return [];
  const count = Math.max(1, Math.min(3, Math.round(ctx.num('count', 1))));
  return Object.values(ctx.data.threads)
    .filter((t) => t.eventId === eventId)
    .sort((a, b) => b.score - a.score || b.commentCount - a.commentCount)
    .slice(0, count);
}

function questionsOf(ctx: ResolveCtx): Q[] {
  const list = threadsOf(ctx).map((t) => ({ key: t.id, title: t.title, excerpt: t.excerpt, asker: t.authorLabel, score: t.score, replies: t.commentCount, shape: shapeForName(t.authorLabel || t.id) }));
  const typed = ctx.text('title');
  const asker = ctx.text('asker');
  if (list[0]) {
    list[0] = { ...list[0], title: typed || list[0].title, asker: asker || list[0].asker, shape: asker ? shapeForName(asker) : list[0].shape };
  } else if (typed) {
    list.push({ key: 'typed', title: typed, excerpt: '', asker: asker || 'Someone in the room', score: 0, replies: 0, shape: shapeForName(asker || typed) });
  }
  return list;
}

/** The upvote counter. It sits on the white bubble, so it always uses the accent with its own text color. */
function Votes({ score, big }: { score: number; big: boolean }) {
  const ctx = useSlide();
  const fill = ctx.colors.accentHex;
  const text = ctx.colors.onAccent;
  const onDark = ctx.colors.dark && ctx.background !== 'accent';
  const s = big ? 1 : 0.72;
  return (
    <span data-fq-votes="" style={{ display: 'inline-flex', alignItems: 'center', gap: 14 * s, padding: `${12 * s}px ${26 * s}px ${12 * s}px ${20 * s}px`, borderRadius: 999, background: fill, color: text, border: `${4 * s}px solid ${onDark ? fill : INK}`, lineHeight: 1 }}>
      <span data-fq-up="" style={{ width: 34 * s, height: 34 * s, display: 'block' }}>
        <BrandShape shape="triangle" color={text} />
      </span>
      <span data-fq-score={score} style={{ ...fontStyle('mono', { weight: 800, tracking: 0 }), fontSize: 46 * s, minWidth: `${String(score).length * 0.62}em` }}>
        {score}
      </span>
    </span>
  );
}

/** A speech bubble (rounded box plus a tail), drawn as one SVG path so the outline is continuous. */
function Bubble({ w, h, tail, drop, color, stroke }: { w: number; h: number; tail: 'left' | 'right'; drop: number; color: string; stroke: string | null }) {
  const r = Math.min(56, h / 3);
  const tx = tail === 'left' ? 120 : w - 120;
  const tw = drop > 70 ? 70 : 56;
  const d =
    tail === 'left'
      ? `M${r} 0 H${w - r} Q${w} 0 ${w} ${r} V${h - r} Q${w} ${h} ${w - r} ${h} H${tx + tw} L${tx - 50} ${h + drop} L${tx} ${h} H${r} Q0 ${h} 0 ${h - r} V${r} Q0 0 ${r} 0 Z`
      : `M${r} 0 H${w - r} Q${w} 0 ${w} ${r} V${h - r} Q${w} ${h} ${w - r} ${h} H${tx} L${tx + 50} ${h + drop} L${tx - tw} ${h} H${r} Q0 ${h} 0 ${h - r} V${r} Q0 0 ${r} 0 Z`;
  return (
    <svg viewBox={`-6 -6 ${w + 12} ${h + drop + 12}`} width={w + 12} height={h + drop + 12} style={{ position: 'absolute', left: -6, top: -6, overflow: 'visible' }} aria-hidden="true">
      <path d={d} fill={color} stroke={stroke ?? 'none'} strokeWidth={stroke ? 5 : 0} strokeLinejoin="round" />
    </svg>
  );
}

interface Slot {
  bubble: BumperBox;
  asker: BumperBox;
  label: BumperBox;
  votes: BumperBox;
  tail: 'left' | 'right';
  /** How far the tail reaches below the bubble. */
  drop: number;
  tilt: number;
  titleMax: number;
}

function slotsFor(n: number): Slot[] {
  if (n <= 1) {
    return [{ bubble: { x: 130, y: 196, w: 1560, h: 520 }, asker: { x: 150, y: 812, w: 190, h: 190 }, label: { x: 370, y: 836, w: 900, h: 140 }, votes: { x: 1490, y: 150, w: 260, h: 96 }, tail: 'left', drop: 90, tilt: -1, titleMax: 124 }];
  }
  const h = n === 2 ? 330 : 218;
  const gap = n === 2 ? 110 : 88;
  const top = n === 2 ? 150 : 112;
  const drop = n === 2 ? 90 : 60;
  return Array.from({ length: n }, (_, i) => {
    const y = top + i * (h + gap);
    const left = i % 2 === 0;
    const bx = left ? 280 : 150;
    const w = 1480;
    return {
      bubble: { x: bx, y, w, h },
      asker: left ? { x: 110, y: y + h - 30, w: 130, h: 130 } : { x: 1680, y: y + h - 30, w: 130, h: 130 },
      label: left ? { x: bx + 210, y: y + h + 10, w: 800, h: 50 } : { x: bx + w - 1010, y: y + h + 10, w: 800, h: 50 },
      votes: { x: bx + w - 230, y: y + h / 2 - 40, w: 190, h: 80 },
      tail: left ? 'left' : 'right',
      drop,
      tilt: [-0.8, 0.7, -0.5][i] ?? 0,
      titleMax: n === 2 ? 72 : 56,
    };
  });
}

function Render() {
  const ctx = useSlide();
  usePrimedCast();
  const qs = questionsOf(ctx);
  const card = ctx.slide.style.variant === 'card';
  const empty = qs.length === 0;
  const shown: Q[] = empty ? [{ key: 'empty', title: `No questions yet. Ask the first one at ${ctx.site.qnaShort}`, excerpt: '', asker: 'Q is waiting', score: 0, replies: 0, shape: 'circle' }] : qs;
  const n = shown.length;
  const slots = slotsFor(n);
  const cast = useMascots(['circle']);
  // The listener on the right is Q, unless the asker already is a circle.
  const listener: ShapeName | null = cast[0] ? (cast[0] === shown[0]?.shape && cast.length === 1 ? SHAPE_ORDER[(SHAPE_ORDER.indexOf(cast[0]) + 1) % 4]! : cast[0]) : null;
  const surface = cardSurface(ctx);
  const eyebrow = ctx.text('eyebrow');
  const footer = ctx.text('footer');
  // The Q and A link glides here from the Q and A slide (magic move) when the footer carries it.
  const linkMorph = footer.includes(ctx.site.qnaShort) ? 'site:qna' : null;
  const excerpt = ctx.flag('showExcerpt', true);
  const bubbleStroke = ctx.colors.dark && ctx.background !== 'accent' ? null : INK;
  const bubbleFill = ctx.colors.dark && ctx.background !== 'accent' ? PAPER : surface.bg;

  useEnter((tl, root, { at, calm }) => {
    if (ctx.theme.motion === 'still') return;
    const askers = Array.from(root.querySelectorAll<HTMLElement>('[data-fq-asker]'));
    askers.forEach((a, i) => {
      tl.from(a, { y: 220, duration: at(0.7), ease: 'back.out(1.6)' }, at(0.05 + i * 0.22));
      tl.add(charAnim.look(a, a.dataset.side === 'right' ? -0.6 : 0.6, -1, 0.3), at(0.4 + i * 0.22));
    });
    const bubbles = Array.from(root.querySelectorAll<HTMLElement>('[data-fq-bubble]'));
    bubbles.forEach((b, i) => {
      tl.from(b, { scale: 0.2, opacity: 0, rotation: b.dataset.side === 'right' ? 6 : -6, transformOrigin: b.dataset.side === 'right' ? '92% 100%' : '8% 100%', duration: at(0.75), ease: 'back.out(1.5)' }, at(0.25 + i * 0.22));
      const a = askers[i];
      if (a && !calm) tl.add(charAnim.hop(a, { height: 14 }), at(0.3 + i * 0.22));
    });
    const ups = root.querySelectorAll('[data-fq-up]');
    if (ups.length) tl.from(ups, { y: 18, scale: 0.5, duration: at(0.5), ease: 'back.out(2.5)', stagger: at(0.15) }, at(1));
    // Votes count up from zero (reset first, so a replay never starts from a half-counted number).
    root.querySelectorAll<HTMLElement>('[data-fq-score]').forEach((el, i) => {
      const to = Number(el.dataset.fqScore) || 0;
      el.textContent = '0';
      const o = { v: 0 };
      tl.to(o, { v: to, duration: at(1.1), ease: 'power2.out', onUpdate: () => (el.textContent = String(Math.round(o.v))) }, at(0.95 + i * 0.2));
    });
    const q = root.querySelector<HTMLElement>('[data-fq-q]');
    if (q) {
      tl.from(q, { x: 220, rotation: 90, duration: at(0.8), ease: 'power3.out' }, at(0.9));
      tl.add(charAnim.look(q, -1, 0.2, 0.3), at(1.6));
    }
  });

  useIdle((root, { calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-fq-asker], [data-fq-q]'));
    const stop = castIdle(chars, calm, 7);
    const bubbles = Array.from(root.querySelectorAll('[data-fq-bubble]'));
    const float = bubbles.map((b, i) => gsap.to(b, { y: calm ? -3 : -7, rotation: `+=${(i % 2 ? -1 : 1) * (calm ? 0.2 : 0.45)}`, duration: 3.4 + i * 0.5, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    // The upvote arrows bump now and then, like someone just voted.
    const ups = Array.from(root.querySelectorAll('[data-fq-up]'));
    const bump = ups.length ? gsap.timeline({ repeat: -1, repeatDelay: 4.5, delay: 2 }) : null;
    ups.forEach((u, i) => bump?.to(u, { y: calm ? -5 : -12, duration: 0.2, ease: 'power2.out', yoyo: true, repeat: 1 }, i * 0.5));
    return () => {
      stop();
      killAll([bump, ...float]);
    };
  });

  const titleColor = ctx.colors.dark && ctx.background !== 'accent' ? INK : surface.fg;
  const fg2 = ctx.colors.dark && ctx.background !== 'accent' ? '#3b4150' : surface.fg2;

  if (card) {
    const rowH = n === 1 ? 560 : n === 2 ? 320 : 224;
    const gap = n === 1 ? 0 : 34;
    const top = n === 1 ? 250 : n === 2 ? 220 : 190;
    return (
      <>
        {eyebrow ? (
          <El id="eyebrow" label="Eyebrow" box={{ x: 130, y: n === 1 ? 150 : 120, w: 1200, h: 56 }} enter="wipe" order={0}>
            <Eyebrow size={32} shape="circle">
              {eyebrow}
            </Eyebrow>
          </El>
        ) : null}
        {shown.map((q, i) => {
          const y = top + i * (rowH + gap);
          const big = n === 1;
          return (
            <El key={q.key} id={`q-${i}`} label={`Question ${i + 1}`} box={{ x: 130, y, w: 1660, h: rowH }} enter="rise" order={1 + i * 0.6}>
              <div data-fq-bubble="" style={{ width: '100%', height: '100%', display: 'flex', gap: big ? 44 : 30, padding: big ? '44px 56px' : '26px 40px', borderRadius: 40, background: bubbleFill, border: bubbleStroke ? `5px solid ${bubbleStroke}` : undefined, boxShadow: surface.shadow ?? '0 24px 60px #00000059' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: 'none', width: big ? 150 : 110, paddingTop: 6 }}>
                  <span data-fq-up="" style={{ width: big ? 84 : 56, height: big ? 84 : 56, display: 'block' }}>
                    <BrandShape shape="triangle" color={ctx.accent === 'yellow' ? ctx.colors.accentDeep : ctx.colors.accentHex} />
                  </span>
                  <span style={{ ...fontStyle('mono', { weight: 800, tracking: 0 }), fontSize: big ? 64 : 44, color: titleColor, lineHeight: 1 }}>{q.score}</span>
                  <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.1 }), fontSize: big ? 20 : 16, color: fg2, textTransform: 'uppercase' }}>{q.score === 1 ? 'vote' : 'votes'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: big ? 20 : 10 }}>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <FitText max={big ? 96 : n === 2 ? 62 : 50} min={30} casl={0.5} weight={900} lineHeight={1.02} valign="center" style={{ color: titleColor }}>
                      {q.title}
                    </FitText>
                  </div>
                  {big && excerpt && q.excerpt ? (
                    <div style={{ height: 96 }}>
                      <FitText max={36} min={22} font="body" weight={500} lineHeight={1.35} style={{ color: fg2 }}>
                        {q.excerpt}
                      </FitText>
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, flex: 'none' }}>
                    <span style={{ width: big ? 56 : 42, height: big ? 56 : 42, flex: 'none' }}>
                      <BumperCharacter shape={q.shape} mood="happy" />
                    </span>
                    <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.06 }), fontSize: big ? 30 : 24, color: titleColor }}>{q.asker}</span>
                    {q.replies ? <span style={{ ...fontStyle('body', { weight: 600 }), fontSize: big ? 28 : 22, color: fg2 }}>{q.replies === 1 ? '1 reply' : `${q.replies} replies`}</span> : null}
                  </div>
                </div>
              </div>
            </El>
          );
        })}
        {footer ? (
          <El id="footer" label="Footer" box={{ x: 130, y: 960, w: 1660, h: 50 }} align="end" enter="fade" order={6} morph={linkMorph}>
            <FitText max={28} min={18} font="mono" weight={700} lineHeight={1.2} style={{ color: accentLabel(ctx) }}>
              {footer}
            </FitText>
          </El>
        ) : null}
      </>
    );
  }

  return (
    <>
      {eyebrow ? (
        <El id="eyebrow" label="Eyebrow" box={n === 1 ? { x: 170, y: 110, w: 1100, h: 56 } : { x: 440, y: 56, w: 1040, h: 50 }} align={n === 1 ? 'start' : 'center'} enter="wipe" order={0}>
          <Eyebrow size={n === 1 ? 32 : 26} shape="circle">
            {eyebrow}
          </Eyebrow>
        </El>
      ) : null}
      {shown.map((q, i) => {
        const s = slots[i]!;
        const big = n === 1;
        return (
          <El key={q.key} id={`q-${i}`} label={`Question ${i + 1}`} box={s.bubble} enter="fade" order={1 + i * 0.6}>
            <div style={{ width: '100%', height: '100%', rotate: `${s.tilt}deg` }}>
            <div data-fq-bubble="" data-side={s.tail} style={{ position: 'relative', width: '100%', height: '100%', filter: bubbleStroke ? undefined : 'drop-shadow(0 22px 40px #00000066)' }}>
              <Bubble w={s.bubble.w} h={s.bubble.h} tail={s.tail} drop={s.drop} color={bubbleFill} stroke={bubbleStroke} />
              <div style={{ position: 'absolute', inset: big ? '56px 70px' : '28px 260px 28px 48px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <FitText max={s.titleMax} min={30} casl={0.55} weight={900} lineHeight={1.02} valign="center" style={{ color: titleColor }}>
                    {q.title}
                  </FitText>
                </div>
                {big && excerpt && q.excerpt ? (
                  <div style={{ height: 100, flex: 'none' }}>
                    <FitText max={38} min={22} font="body" weight={500} lineHeight={1.35} style={{ color: fg2 }}>
                      {q.excerpt}
                    </FitText>
                  </div>
                ) : null}
              </div>
            </div>
            </div>
          </El>
        );
      })}
      {!empty
        ? shown.map((q, i) => (
            <El key={`v-${q.key}`} id={`votes-${i}`} label={`Votes ${i + 1}`} box={slots[i]!.votes} align="end" valign="center" enter="pop" order={5 + i * 0.4}>
              <Votes score={q.score} big={n === 1} />
            </El>
          ))
        : null}
      {shown.map((q, i) => {
        const s = slots[i]!;
        return (
          <El key={`a-${q.key}`} id={`asker-${i}`} label={`Asker ${i + 1}`} box={s.asker} enter="fade" order={0} lockAspect>
            <div data-fq-asker="" data-side={s.tail} style={{ width: '100%', height: '100%' }}>
              <BumperCharacter shape={q.shape} mood={empty ? 'sleepy' : 'happy'} lookX={s.tail === 'right' ? -0.6 : 0.6} lookY={-1} style={charOutline(ctx, q.shape)} />
            </div>
          </El>
        );
      })}
      {shown.map((q, i) => {
        const s = slots[i]!;
        const big = n === 1;
        return (
          <El key={`l-${q.key}`} id={`label-${i}`} label={`Asker ${i + 1} name`} box={s.label} align={s.tail === 'right' ? 'end' : 'start'} valign="center" enter="rise" order={4 + i * 0.4}>
            <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.06 }), fontSize: big ? 36 : 24, color: ctx.colors.fg, lineHeight: 1.2 }}>
              {q.asker}
              {big ? <span style={{ color: ctx.colors.fg2 }}>{empty ? '' : ' asks'}</span> : null}
            </span>
            {big && q.replies ? <span style={{ ...fontStyle('body', { weight: 600 }), fontSize: 30, color: ctx.colors.fg2, marginTop: 10 }}>{q.replies === 1 ? '1 reply so far' : `${q.replies} replies so far`}</span> : null}
          </El>
        );
      })}
      {footer && n === 1 ? (
        <El id="footer" label="Footer" box={{ x: 1100, y: 900, w: 700, h: 60 }} align="end" valign="center" enter="fade" order={7} morph={linkMorph}>
          <FitText max={30} min={18} font="mono" weight={700} lineHeight={1.2} style={{ color: accentLabel(ctx) }}>
            {footer}
          </FitText>
        </El>
      ) : null}
      {listener && n === 1 ? (
        <El id="q" label="Character" box={{ x: 1640, y: 740, w: 150, h: 150 }} enter="fade" order={3} lockAspect morph={`char:${listener}`}>
          <div data-fq-q="" style={{ width: '100%', height: '100%' }}>
            <BumperCharacter shape={listener} mood="happy" lookX={-1} lookY={-0.4} style={charOutline(ctx, listener)} />
          </div>
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'featured-question',
  background: 'paper',
  variants: [
    { key: 'bubble', label: 'Speech bubbles' },
    { key: 'card', label: 'Discussion cards', hint: 'Like the discussion page, with the vote count' },
  ],
  fields: [
    f.eyebrow((ctx) => (threadsOf(ctx).length > 1 ? 'Questions from the room' : 'A question from the room')),
    { key: 'title', label: 'Question', type: 'longtext', max: 300, default: (ctx) => threadsOf(ctx)[0]?.title ?? '', hint: 'From the discussion page. Type to show a question asked out loud.' },
    { key: 'asker', label: 'Asked by', type: 'text', max: 60, default: (ctx) => threadsOf(ctx)[0]?.authorLabel ?? '' },
    { key: 'footer', label: 'Footer', type: 'text', max: 80, default: (ctx) => `Ask yours at ${ctx.site.qnaShort}` },
    { key: 'count', label: 'How many questions', type: 'select', default: '1', options: [{ value: '1', label: 'The top one' }, { value: '2', label: 'Top two' }, { value: '3', label: 'Top three' }], hint: 'Used when no questions are picked: the most upvoted ones of the event.', group: 'options' },
    { key: 'showExcerpt', label: 'Show the details', type: 'toggle', default: true, group: 'options' },
  ],
  presets: [
    { key: 'top-three', label: 'Top three', description: 'The three most upvoted questions, stacked.', slide: { fields: { count: '3' }, refs: { threadIds: [] } } },
    { key: 'top-two', label: 'Top two', slide: { fields: { count: '2' }, refs: { threadIds: [] } } },
  ],
  describe: (ctx) => {
    const t = threadsOf(ctx);
    if (t.length > 1) return `${t.length} questions`;
    const title = ctx.text('title') || t[0]?.title;
    return title ? (title.length > 44 ? `${title.slice(0, 43).trimEnd()}...` : title) : 'Question from the room';
  },
  headline: () => 'Question',
  Render,
});
