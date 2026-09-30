'use client';

import { formatJakarta, type BumperEventData, type ShapeName } from '@zemi/shared';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { INK, INK_2, PAPER, ACCENT_SHAPE } from '../../engine/palette';
import { eventNumberLabel, eventRoom } from '../../engine/resolve';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandShape } from '../../parts/shapes';
import { STICKERS, STICKER_KEYS, Sticker } from '../../parts/stickers';
import { paperObject, popFill, resetCast, shapeTint } from '../_tpl-end-kit';
import { defineTemplate, Eyebrow, useMascots } from '../kit';

type Topic = 'note' | 'recording' | 'lunch' | 'room' | 'venue';
const TOPICS: Array<{ value: Topic; label: string }> = [
  { value: 'note', label: 'Anything' },
  { value: 'recording', label: 'Recording notice' },
  { value: 'lunch', label: 'Lunch is served' },
  { value: 'room', label: 'Room change' },
  { value: 'venue', label: "Next week's venue" },
];

function topic(ctx: ResolveCtx): Topic {
  const t = ctx.field('topic');
  return TOPICS.some((x) => x.value === t) ? (t as Topic) : 'note';
}

/** "Gedung F, FILKOM UB, floor 3" */
function whereDetail(ev: BumperEventData | null): string {
  const v = ev?.venue;
  if (!v) return '';
  return [v.building, v.floor ? `floor ${v.floor}` : null].filter(Boolean).join(', ');
}

const COPY: Record<Topic, { eyebrow: string; title: (ctx: ResolveCtx) => string; body: (ctx: ResolveCtx) => string; sticker: string }> = {
  note: {
    eyebrow: 'Heads up',
    title: () => 'A quick note',
    body: () => 'Keep it short and sweet. Two or three lines read best from the back row.',
    sticker: 'spark',
  },
  recording: {
    eyebrow: 'Heads up',
    title: () => "We're recording",
    body: () => 'This session is recorded and streamed. Want to stay off camera? The back two rows are camera free.',
    sticker: 'rec',
  },
  lunch: {
    eyebrow: 'Break time',
    title: () => 'Lunch is served',
    body: () => "Grab a plate, it's on the left. Veggie options have a green sticker. We start again in 30 minutes.",
    sticker: 'food',
  },
  room: {
    eyebrow: 'Room change',
    title: (ctx) => (ctx.event?.venue?.name ? `We moved to ${ctx.event.venue.name}` : "We've moved rooms"),
    body: (ctx) => {
      const where = ctx.event?.roomNote ? [ctx.event.venue?.building, ctx.event.roomNote].filter(Boolean).join('. ') : whereDetail(ctx.event);
      return where ? `${where}. Same Friday, new room. Follow the signs, we saved you a seat.` : 'Same Friday, new room. Follow the signs, we saved you a seat.';
    },
    sticker: 'door',
  },
  venue: {
    eyebrow: 'Next week',
    title: (ctx) => (ctx.nextEvent?.venue?.name ? `Next week: ${ctx.nextEvent.venue.name}` : 'New spot next week'),
    body: (ctx) => {
      const n = ctx.nextEvent;
      if (!n) return `We're somewhere new next Friday. The room goes up on ${ctx.site.shortUrl}, bring a friend.`;
      const when = `${n.number != null ? `Zemi ${eventNumberLabel(n)}` : n.title} is on ${formatJakarta(n.startsAt, 'date-long')}`;
      const where = [n.venue?.name ? null : eventRoom(n), whereDetail(n)].filter(Boolean).join(', ');
      return `${when}${where ? `, ${where}` : ''}. Bring a friend.`;
    },
    sticker: 'pin',
  },
};

/**
 * Announcement: a headline, a few lines and a sticker. Note: a paper note gets pinned to the
 * screen and swings on its pin while a character peeks around it. Poster: the headline big on
 * the left, the sticker bouncing onto a shape on the right.
 */
function Render() {
  const ctx = useSlide();
  const poster = ctx.slide.style.variant === 'poster';
  const cast = useMascots([poster ? 'square' : 'circle']);
  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title');
  const body = ctx.text('body');
  const stickerKey = ctx.text('sticker');
  const sticker = stickerKey && STICKERS[stickerKey] ? stickerKey : '';
  const still = ctx.theme.motion === 'still';
  const obj = paperObject(ctx.colors);
  const discShape: ShapeName = ACCENT_SHAPE[ctx.accent];

  useEnter((tl, root, { at, calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-an-char]'));
    resetCast(chars);
    const t = root.querySelector<HTMLElement>('[data-el="title"] [data-fit], [data-an-title] [data-fit]');
    if (t) tl.fromTo(t, { '--casl': 0 }, { '--casl': 0.9, duration: at(1.5), ease: 'power2.out' }, at(0.5));
    if (still) return;
    const note = root.querySelector<HTMLElement>('[data-an-note]');
    if (note) {
      // Dropped in, pinned, then it swings on the pin and settles.
      tl.fromTo(note, { y: -1100, rotation: -14 }, { y: 0, rotation: -7, duration: at(0.7), ease: 'power3.out' }, at(0));
      tl.to(note, { rotation: calm ? -1 : 3, duration: at(0.5), ease: 'sine.inOut' }, at(0.85));
      tl.to(note, { rotation: -2.5, duration: at(0.45), ease: 'sine.inOut' }, at(1.35));
      tl.to(note, { rotation: 0, duration: at(0.6), ease: 'sine.out' }, at(1.8));
    }
    const pin = root.querySelector<HTMLElement>('[data-an-pin]');
    if (pin) tl.fromTo(pin, { scale: 2.4, y: -40, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: at(0.22), ease: 'power3.in' }, at(0.62));
    const disc = root.querySelector<HTMLElement>('[data-an-disc]');
    if (disc) tl.fromTo(disc, { scale: 0, rotation: -60 }, { scale: 1, rotation: 0, duration: at(1), ease: 'back.out(1.4)' }, at(0.1));
    const st = root.querySelector<HTMLElement>('[data-an-sticker]');
    if (st) {
      if (poster) tl.fromTo(st, { y: -900, rotation: -40 }, { y: 0, rotation: 0, duration: at(0.8), ease: 'bounce.out' }, at(0.55));
      else tl.fromTo(st, { scale: 0, rotation: -140 }, { scale: 1, rotation: 0, duration: at(0.75), ease: 'back.out(1.8)' }, at(1));
      tl.to(st, { rotation: 12, duration: at(0.12), yoyo: true, repeat: 3, ease: 'sine.inOut' }, at(poster ? 1.45 : 1.8));
    }
    chars.forEach((c, i) => {
      tl.fromTo(c, { x: poster ? 0 : -240, y: poster ? 240 : 0, opacity: poster ? 0 : 1 }, { x: 0, y: 0, opacity: 1, duration: at(0.7), ease: 'back.out(1.5)' }, at(1.2 + i * 0.1));
      tl.add(charAnim.look(c, poster ? 0.9 : -0.8, poster ? -0.7 : -0.2, 0.3), at(1.8));
      if (!calm) tl.add(charAnim.hop(c, { height: 16 }), at(2 + i * 0.1));
    });
  });

  useIdle((root, { calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-an-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c));
    const anims: gsap.core.Animation[] = chars.flatMap((c, i) => charAnim.idle(c, { calm, seed: i * 5 + 2 }));
    const glance = gsap.timeline({ repeat: -1, repeatDelay: 4.5, delay: 2 });
    chars.forEach((c) => glance.add(charAnim.look(c, 0, 0, 0.4), 0).add(charAnim.look(c, poster ? 0.9 : -0.8, poster ? -0.7 : -0.2, 0.4), 2.2));
    anims.push(glance);
    const note = root.querySelector('[data-an-note]');
    if (note) anims.push(gsap.to(note, { rotation: calm ? 0.5 : 1.2, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    const st = root.querySelector('[data-an-sticker]');
    if (st) {
      anims.push(gsap.to(st, { y: calm ? -6 : -14, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
      const wiggle = gsap.timeline({ repeat: -1, repeatDelay: calm ? 8 : 5, delay: 3 });
      wiggle.to(st, { rotation: 10, duration: 0.14, yoyo: true, repeat: 3, ease: 'sine.inOut' });
      anims.push(wiggle);
    }
    const disc = root.querySelector('[data-an-disc]');
    if (disc) anims.push(gsap.to(disc, { rotation: '+=360', duration: calm ? 120 : 70, ease: 'none', repeat: -1 }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
    };
  });

  const charSize = cast.length > 2 ? 110 : 170;
  const crew = (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
      {cast.map((s) => (
        <div key={s} data-an-char="" style={{ width: charSize, height: charSize }}>
          <BumperCharacter shape={s} color={shapeTint(ctx.colors, s)} mood="happy" lookX={poster ? 0.9 : -0.8} lookY={poster ? -0.7 : -0.2} />
        </div>
      ))}
    </div>
  );

  if (poster) {
    return (
      <>
        <El id="disc" label="Shape" box={{ x: 1150, y: 140, w: 600, h: 600 }} enter="fade" lockAspect locked>
          <div data-an-disc="" style={{ width: '100%', height: '100%' }}>
            <BrandShape shape={discShape} color={ctx.background === 'accent' ? (ctx.colors.dark ? '#ffffff2e' : '#ffffff99') : ctx.colors.dark ? `${ctx.colors.accentHex}55` : ctx.colors.accentSoft} />
          </div>
        </El>
        {sticker ? (
          <El id="sticker" label="Sticker" box={{ x: 1400, y: 400, w: 400, h: 400 }} enter="fade" lockAspect>
            <div data-an-sticker="" style={{ width: '100%', height: '100%', rotate: '-8deg' }}>
              <Sticker name={sticker} />
            </div>
          </El>
        ) : null}
        {cast.length ? (
          <El id="cast" label="Characters" box={{ x: 1160, y: 900 - charSize, w: 420, h: charSize }} valign="end" enter="fade" lockAspect>
            {crew}
          </El>
        ) : null}
        <El id="eyebrow" label="Eyebrow" box={{ x: 130, y: 190, w: 1000, h: 56 }} enter="wipe">
          <Eyebrow size={34}>{eyebrow}</Eyebrow>
        </El>
        <El id="title" label="Headline" box={{ x: 120, y: 260, w: 1040, h: 400 }} enter="split-words" order={1}>
          <FitText max={180} min={64} casl={0} lineHeight={1} valign="end">
            {title}
          </FitText>
        </El>
        {body ? (
          <El id="body" label="Text" box={{ x: 130, y: 690, w: 980, h: 260 }} enter="rise" order={4}>
            <FitText max={50} min={26} font="body" weight={600} lineHeight={1.3} style={{ color: ctx.colors.fg2 }}>
              {body}
            </FitText>
          </El>
        ) : null}
      </>
    );
  }

  return (
    <>
      {cast.length ? (
        <El id="cast" label="Characters" box={{ x: 1336, y: 900 - charSize, w: 480, h: charSize }} valign="end" enter="fade" lockAspect>
          {crew}
        </El>
      ) : null}
      <El id="note" label="Note" box={{ x: 190, y: 150, w: 1180, h: 800 }} enter="fade">
        <div data-an-note="" style={{ position: 'absolute', inset: 0, transformOrigin: '50% 3%' }}>
          <div style={{ position: 'absolute', left: 18, top: 18, right: -18, bottom: -18, borderRadius: 34, background: obj.shadow }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: 34, background: obj.fill, border: `5px solid ${obj.border === '#ffffff00' ? PAPER : obj.border}`, padding: '100px 84px 76px', display: 'flex', flexDirection: 'column' }}>
            <Eyebrow size={32} color={INK} shape={ctx.accent === 'yellow' ? 'square' : ACCENT_SHAPE[ctx.accent]}>
              {eyebrow}
            </Eyebrow>
            <div style={{ flex: body ? 1.25 : 1, minHeight: 0, marginTop: 24 }} data-an-title="">
              <FitText max={150} min={56} casl={0} lineHeight={0.95} valign={body ? 'end' : 'center'} split={false} style={{ color: INK }}>
                {title}
              </FitText>
            </div>
            {body ? (
              <div style={{ flex: 1, minHeight: 0, marginTop: 30 }}>
                <FitText max={46} min={24} font="body" weight={600} lineHeight={1.34} style={{ color: INK_2 }} split={false}>
                  {body}
                </FitText>
              </div>
            ) : null}
          </div>
          <div data-an-pin="" style={{ position: 'absolute', left: '50%', top: -40, width: 100, height: 100, marginLeft: -50 }}>
            <svg viewBox="0 0 70 70" width="100" height="100" aria-hidden="true" style={{ overflow: 'visible', display: 'block' }}>
              <ellipse cx="41" cy="46" rx="16" ry="7" fill={INK} opacity="0.18" />
              <circle cx="35" cy="33" r="24" fill={popFill(ctx.colors) === PAPER ? INK : popFill(ctx.colors)} stroke={INK} strokeWidth="4" />
              <circle cx="27" cy="25" r="7" fill={PAPER} opacity="0.7" />
            </svg>
          </div>
        </div>
      </El>
      {sticker ? (
        <El id="sticker" label="Sticker" box={{ x: 1250, y: 190, w: 400, h: 400 }} enter="fade" lockAspect>
          <div data-an-sticker="" style={{ width: '100%', height: '100%', rotate: '8deg' }}>
            <Sticker name={sticker} />
          </div>
        </El>
      ) : null}
    </>
  );
}

const topicCopy = (ctx: ResolveCtx) => COPY[topic(ctx)];

export default defineTemplate({
  kind: 'announcement',
  background: 'paper',
  variants: [
    { key: 'note', label: 'Pinned note' },
    { key: 'poster', label: 'Poster' },
  ],
  fields: [
    { key: 'topic', label: 'About', type: 'select', options: TOPICS, default: 'note', hint: 'Fills the headline, text and sticker. Type over any of them.' },
    { key: 'eyebrow', label: 'Eyebrow', type: 'text', max: 80, default: (ctx) => topicCopy(ctx).eyebrow },
    { key: 'title', label: 'Headline', type: 'text', max: 120, default: (ctx) => topicCopy(ctx).title(ctx) },
    { key: 'body', label: 'Text', type: 'longtext', max: 400, default: (ctx) => topicCopy(ctx).body(ctx) },
    { key: 'sticker', label: 'Sticker', type: 'select', options: [{ value: 'none', label: 'No sticker' }, ...STICKER_KEYS.map((k) => ({ value: k, label: STICKERS[k]!.label }))], default: (ctx) => topicCopy(ctx).sticker, group: 'options' },
  ],
  presets: [
    { key: 'recording', label: 'Recording notice', description: 'This session is recorded and streamed.', slide: { fields: { topic: 'recording' } } },
    { key: 'lunch', label: 'Lunch is served', description: 'Food is out, back in 30 minutes.', slide: { fields: { topic: 'lunch' } } },
    { key: 'room', label: 'Room change', description: 'Points people to the room on the event.', slide: { fields: { topic: 'room' }, style: { variant: 'poster' } } },
    { key: 'venue', label: "Next week's venue", description: 'Where next Friday happens.', slide: { fields: { topic: 'venue' } } },
  ],
  describe: (ctx) => ctx.text('title') || 'Announcement',
  headline: (ctx) => {
    const t = ctx.text('title');
    return t.split(/\s+/).length <= 3 ? t : ctx.text('eyebrow') || 'Heads up';
  },
  Render,
});
