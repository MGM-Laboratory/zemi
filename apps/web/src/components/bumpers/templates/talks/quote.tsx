'use client';

import type { BumperBox } from '@zemi/shared';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { isDefaultField } from '../../engine/resolve';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { StaticMark } from '../../parts/shapes';
import { accentInk, castIdle, charOutline, faceOutline, highlighter, killAll, portraitBack, usePrimedCast } from '../_tpl-talks-kit';
import { defineTemplate, f, personOrg, personRole, Portrait, useMascots, usePerson } from '../kit';

/**
 * Quote: a line worth repeating. Two giant quote marks draw themselves in, the quote lands word
 * by word, a highlighter swipes across the chosen words, and Hunch (the spark) reads along and
 * nods in agreement.
 */

const HOUSE_RULE = 'Bring the messy version. Nobody expects slides to be perfect.';

/** The quote is our house rule (typed or the default). */
function isHouseRule(ctx: ResolveCtx): boolean {
  return isDefaultField(ctx.slide, 'quote') || String(ctx.slide.fields.quote ?? '').trim() === HOUSE_RULE;
}

/** One "6" shaped quote mark in a 100x120 box: a round head with a tail sweeping up and right. */
const MARK = 'M72 10 C42 18 16 42 12 76 C9 99 24 114 44 114 C63 114 78 100 78 81 C78 62 63 50 46 50 C41 50 37 51 33 53 C39 38 53 27 78 23 Z';

function Marks({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 196 124" width="100%" height="100%" style={{ overflow: 'visible', display: 'block' }} aria-hidden="true">
      {[0, 96].map((dx) => (
        <path key={dx} data-qt-mark="" d={MARK} transform={`translate(${dx} 0)`} fill={color} stroke={color} strokeWidth={5} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/** The quote with the highlighted words wrapped (first match, case-insensitive). */
function withHighlight(text: string, hl: string, fill: string, ink: string): ReactNode {
  const needle = hl.trim();
  const at = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (at < 0) return text;
  // Keep trailing punctuation inside the swipe so it never wraps onto a line of its own.
  let end = at + needle.length;
  while (end < text.length && /[.,;:!?"'\u201d\u2019)]/.test(text[end]!)) end++;
  return (
    <>
      {text.slice(0, at)}
      <span
        data-qt-hl=""
        style={{
          color: ink,
          backgroundImage: `linear-gradient(${fill}, ${fill})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: '100% 78%',
          backgroundPosition: '0% 70%',
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
          padding: '0 0.08em',
          margin: '0 -0.04em',
          borderRadius: '0.12em',
        }}
      >
        {text.slice(at, end)}
      </span>
      {text.slice(end)}
    </>
  );
}

interface Layout {
  marks: BumperBox;
  quote: BumperBox;
  quoteMax: number;
  face: BumperBox | null;
  faceSize: number;
  who: BumperBox;
  hunch: BumperBox;
}

const CENTER: Layout = {
  marks: { x: 110, y: 236, w: 176, h: 112 },
  quote: { x: 320, y: 236, w: 1300, h: 520 },
  quoteMax: 150,
  face: { x: 320, y: 808, w: 136, h: 130 },
  faceSize: 116,
  who: { x: 480, y: 806, w: 1000, h: 130 },
  hunch: { x: 1600, y: 790, w: 180, h: 180 },
};

const SIDE: Layout = {
  marks: { x: 130, y: 150, w: 200, h: 128 },
  quote: { x: 130, y: 300, w: 1040, h: 500 },
  quoteMax: 124,
  face: { x: 1250, y: 250, w: 560, h: 540 },
  faceSize: 500,
  who: { x: 130, y: 830, w: 1040, h: 130 },
  hunch: { x: 1600, y: 150, w: 170, h: 170 },
};

/**
 * Center the quote and its byline as one block, from the measured height of the quote text: a
 * short line sits in the middle with its byline right under it instead of leaving a hole. The
 * quote box keeps its size (so the text fit never changes), only the positions move.
 */
function placeBlock(L: Layout, side: boolean, qh: number | null): Layout {
  if (qh == null) return L;
  if (side) {
    const top = 150 + Math.max(0, (810 - (qh + 316)) / 2);
    const qy = Math.round(top + 150);
    return { ...L, marks: { ...L.marks, y: Math.round(top) }, quote: { ...L.quote, y: qy }, who: { ...L.who, y: Math.round(qy + qh + 36) } };
  }
  const top = Math.round(196 + Math.max(0, (764 - (qh + 186)) / 2));
  const whoY = Math.round(top + qh + 56);
  const dy = whoY - L.who.y;
  const move = (b: BumperBox): BumperBox => ({ ...b, y: b.y + dy });
  return { ...L, marks: { ...L.marks, y: top }, quote: { ...L.quote, y: top }, who: { ...L.who, y: whoY }, face: L.face ? move(L.face) : null, hunch: move(L.hunch) };
}

function Render() {
  const ctx = useSlide();
  usePrimedCast();
  const person = usePerson();
  const side = ctx.slide.style.variant === 'side';
  const quoteRef = useRef<HTMLDivElement>(null);
  const [qh, setQh] = useState<number | null>(null);
  // The quote moved in the builder: its measured height no longer says where the block sits, keep the fixed layout.
  const moved = !!ctx.slide.layers.quote?.box;
  const L = placeBlock(side ? SIDE : CENTER, side, moved ? null : qh);
  const cast = useMascots(['triangle']);
  const quote = ctx.text('quote') || HOUSE_RULE;
  const hl = highlighter(ctx);
  const name = ctx.text('name');
  const role = [ctx.text('role'), ctx.text('org')].filter(Boolean).join('  ·  ');
  const markColor = accentInk(ctx);
  const pid = person?.id ?? null;
  // A face only for a real profile; a quote signed "Zemi" gets the mark instead of initials.
  const showFace = !!ctx.person && !!L.face;
  const zemiSigned = !ctx.person && /zemi/i.test(name) && !!L.face && !side;
  const whoBox = showFace || zemiSigned || side ? L.who : { ...L.who, x: L.face?.x ?? L.who.x, w: L.who.w + (L.who.x - (L.face?.x ?? L.who.x)) };

  // Measure the quote text once it has its size (and again whenever it changes: fonts, edits).
  useLayoutEffect(() => {
    const span = quoteRef.current?.querySelector<HTMLElement>('[data-fit]');
    if (!span) return;
    const measure = () => setQh((cur) => (cur === span.offsetHeight ? cur : span.offsetHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(span);
    return () => ro.disconnect();
  }, []);

  useEnter((tl, root, { at, calm }) => {
    if (ctx.theme.motion === 'still') return;
    const marks = root.querySelectorAll<SVGPathElement>('[data-qt-mark]');
    if (marks.length) {
      tl.fromTo(marks, { drawSVG: '0%', fillOpacity: 0 }, { drawSVG: '100%', duration: at(0.9), ease: 'zemiInOut', stagger: at(0.12) }, at(0));
      tl.to(marks, { fillOpacity: 1, duration: at(0.4), ease: 'power1.out', stagger: at(0.08) }, at(0.75));
    }
    const box = root.querySelector('[data-el="marks"] svg');
    if (box && !calm) tl.from(box, { scale: 0.7, rotation: -8, transformOrigin: '30% 70%', duration: at(1), ease: 'back.out(1.6)' }, at(0));
    const quoteEl = root.querySelector<HTMLElement>('[data-el="quote"] [data-fit]');
    if (quoteEl) tl.fromTo(quoteEl, { '--casl': 0 }, { '--casl': 0.6, duration: at(1.6), ease: 'power2.out' }, at(0.3));
    const swipes = root.querySelectorAll('[data-qt-hl]');
    if (swipes.length) tl.fromTo(swipes, { backgroundSize: '0% 78%' }, { backgroundSize: '100% 78%', duration: at(0.75), ease: 'power2.inOut', stagger: at(0.2) }, at(1.35));
    const hunch = root.querySelector<HTMLElement>('[data-qt-hunch]');
    if (hunch) {
      tl.from(hunch, { y: side ? -220 : 240, duration: at(0.8), ease: 'back.out(1.6)' }, at(0.9));
      tl.add(charAnim.look(hunch, -1, side ? 0.6 : -0.7, 0.3), at(1.2));
      tl.add(nod(hunch, calm), at(2.25));
    }
  });

  useIdle((root, { calm }) => {
    const hunch = root.querySelector<HTMLElement>('[data-qt-hunch]');
    const stop = hunch ? castIdle([hunch], calm, 2) : () => {};
    const agree = hunch ? gsap.timeline({ repeat: -1, repeatDelay: 6.5, delay: 4 }) : null;
    if (hunch && agree) agree.add(charAnim.look(hunch, 0, 0, 0.4), 0).add(nod(hunch, calm), 0.6).add(charAnim.look(hunch, -1, side ? 0.6 : -0.7, 0.4), 2.2);
    const marks = Array.from(root.querySelectorAll('[data-el="marks"] svg'));
    const float = marks.map((m, i) => gsap.to(m, { y: calm ? -4 : -10, rotation: calm ? 1 : 3, duration: 3.4 + i * 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    return () => {
      stop();
      killAll([agree, ...float]);
    };
  });

  return (
    <>
      <El id="marks" label="Quote marks" box={L.marks} enter="fade" order={0} lockAspect>
        <Marks color={markColor} />
      </El>
      <El id="quote" label="Quote" box={side && !showFace ? { ...L.quote, w: 1560 } : L.quote} enter="split-words" order={1}>
        <div ref={quoteRef} style={{ width: '100%', height: '100%' }}>
          <FitText max={L.quoteMax} min={40} casl={0.6} weight={850} lineHeight={1.02}>
            {withHighlight(quote, ctx.text('highlight'), hl.fill, hl.text)}
          </FitText>
        </div>
      </El>
      {showFace ? (
        <El id="face" label="Photo" box={L.face!} enter="pop" order={6} lockAspect morph={pid ? `person:${pid}:photo` : null}>
          <div style={faceOutline(ctx, person!)}>
            <Portrait person={person!} size={L.faceSize} shape={person!.shape} color={portraitBack(ctx, person!)} />
          </div>
        </El>
      ) : null}
      {zemiSigned ? (
        <El id="face" label="Zemi mark" box={{ ...L.face!, x: L.face!.x + 8, y: L.face!.y + 8, w: L.faceSize - 10, h: L.faceSize - 10 }} enter="pop" order={6} lockAspect>
          <StaticMark tone={ctx.background === 'accent' && ctx.accent === 'yellow' ? 'ink' : 'color'} />
        </El>
      ) : null}
      {name ? (
        <El id="who" label="Who said it" box={whoBox} valign="center" enter="rise" order={7} morph={pid ? `person:${pid}:name` : null}>
          <div style={{ width: '100%', height: 64 }}>
            <FitText max={54} min={30} casl={0.5} weight={900} lineHeight={1.05} valign="center">
              {name}
            </FitText>
          </div>
          {role ? (
            <div style={{ width: '100%', height: 44, marginTop: 6 }}>
              <FitText max={30} min={20} font="body" weight={600} lineHeight={1.3} style={{ color: ctx.colors.fg2 }}>
                {role}
              </FitText>
            </div>
          ) : null}
        </El>
      ) : null}
      {cast.length ? (
        <El id="hunch" label="Character" box={L.hunch} enter="fade" order={4} lockAspect>
          <div data-qt-hunch="" style={{ width: '100%', height: '100%' }}>
            <BumperCharacter shape={cast[0]!} mood="happy" lookX={-1} lookY={side ? 0.6 : -0.7} style={charOutline(ctx, cast[0]!)} />
          </div>
        </El>
      ) : null}
    </>
  );
}

/** Two small nods: yes, yes. */
function nod(root: Element, calm: boolean): gsap.core.Timeline {
  const body = root.querySelector('.bc-body');
  const tl = gsap.timeline();
  if (!body) return tl;
  const k = calm ? 0.6 : 1;
  for (let i = 0; i < 2; i++) {
    tl.to(body, { rotation: 7 * k, y: 5 * k, scaleY: 0.94, duration: 0.18, ease: 'power2.out', transformOrigin: '50% 100%' }).to(body, { rotation: 0, y: 0, scaleY: 1, duration: 0.3, ease: 'back.out(2)' });
  }
  return tl;
}

export default defineTemplate({
  kind: 'quote',
  background: 'paper',
  variants: [
    { key: 'center', label: 'Big quote', hint: 'The quote center stage, who said it underneath' },
    { key: 'side', label: 'With a big photo', hint: 'Quote left, portrait right' },
  ],
  fields: [
    { key: 'quote', label: 'Quote', type: 'longtext', max: 400, default: HOUSE_RULE, placeholder: 'A line worth repeating' },
    { key: 'highlight', label: 'Highlight', type: 'text', max: 80, default: (ctx) => (isHouseRule(ctx) ? 'messy version' : ''), hint: 'A word or a few words from the quote to swipe with the highlighter.' },
    f.name((ctx) => ctx.person?.name ?? (isHouseRule(ctx) ? 'A Zemi house rule' : '')),
    f.role(personRole, 'Position'),
    f.org(personOrg),
  ],
  presets: [
    { key: 'house-rule', label: 'House rule', description: 'Our favorite reminder, no speaker needed.', slide: { fields: { quote: HOUSE_RULE, highlight: 'messy version' }, refs: { speakerId: null } } },
    { key: 'fridays', label: 'Fridays', slide: { fields: { quote: "Research is lonely. Fridays aren't.", highlight: "Fridays aren't", name: 'Zemi' }, refs: { speakerId: null } } },
  ],
  sample: () => ({ fields: { quote: 'A model that says "I don\'t know" at the right time is worth more than one that is always sure.', highlight: '"I don\'t know"' } }),
  describe: (ctx) => {
    const q = ctx.text('quote');
    return q ? `"${q.length > 40 ? `${q.slice(0, 39).trimEnd()}...` : q}"` : 'Quote';
  },
  headline: (ctx) => ctx.text('highlight').replace(/["\u201c\u201d]/g, '').trim() || 'Quote',
  Render,
});
