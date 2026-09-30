'use client';

import type { BumperBox, ShapeName } from '@zemi/shared';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { BumperCharacter, charAnim } from '../../parts/character';
import { castIdle, charOutline, every, highlighter, killAll, oneShots, QrCard, usePrimedCast } from '../_tpl-talks-kit';
import { defineTemplate, Eyebrow, f, useMascots } from '../kit';

/**
 * Q and A: "Your turn." The QR drops onto Q's head and Q lifts it up for the room, Bridge climbs
 * on top of the plate, Hunch and Block hop around it, and zemi.ac/q sits huge on a highlighter
 * swipe so the people at the back can type it too.
 */

const QR = 460;

interface Layout {
  eyebrow: BumperBox;
  title: BumperBox;
  titleMax: number;
  short: BumperBox;
  shortMax: number;
  line: BumperBox;
  qr: BumperBox;
  crew: Record<ShapeName, BumperBox>;
  align: 'start' | 'center';
}

const RIGHT: Layout = {
  eyebrow: { x: 130, y: 196, w: 980, h: 56 },
  title: { x: 130, y: 260, w: 1040, h: 400 },
  titleMax: 215,
  short: { x: 110, y: 668, w: 1040, h: 160 },
  shortMax: 140,
  line: { x: 130, y: 852, w: 960, h: 100 },
  qr: { x: 1275, y: 196, w: QR, h: QR },
  crew: {
    circle: { x: 1395, y: 652, w: 220, h: 220 },
    triangle: { x: 1180, y: 746, w: 130, h: 130 },
    square: { x: 1690, y: 746, w: 130, h: 130 },
    arch: { x: 1560, y: 90, w: 116, h: 116 },
  },
  align: 'start',
};

const CENTER: Layout = {
  eyebrow: { x: 130, y: 270, w: 560, h: 56 },
  title: { x: 130, y: 336, w: 560, h: 360 },
  titleMax: 170,
  short: { x: 1220, y: 360, w: 600, h: 200 },
  shortMax: 110,
  line: { x: 360, y: 900, w: 1200, h: 70 },
  qr: { x: 730, y: 130, w: QR, h: QR },
  crew: {
    circle: { x: 850, y: 586, w: 220, h: 220 },
    triangle: { x: 640, y: 690, w: 130, h: 130 },
    square: { x: 1150, y: 690, w: 130, h: 130 },
    arch: { x: 1010, y: 24, w: 116, h: 116 },
  },
  align: 'center',
};

const CREW: ShapeName[] = ['circle', 'triangle', 'square', 'arch'];

function Render() {
  const ctx = useSlide();
  usePrimedCast();
  const L = ctx.slide.style.variant === 'center' ? CENTER : RIGHT;
  const cast = useMascots(CREW);
  const hl = highlighter(ctx);
  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title');
  const short = ctx.text('short');
  const url = ctx.text('url') || ctx.site.qnaUrl;
  const line = ctx.text('line');
  const qrLabel = ctx.text('qrLabel');

  useEnter((tl, root, { at, calm }) => {
    if (ctx.theme.motion === 'still') return;
    const titleEl = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleEl) tl.fromTo(titleEl, { '--casl': 0 }, { '--casl': 1, duration: at(1.4), ease: 'power2.out' }, at(0.2));
    const q = root.querySelector<HTMLElement>('[data-qa-char="circle"]');
    const card = root.querySelector<HTMLElement>('[data-el="qr"] [data-qa-lift]');
    if (q) tl.from(q, { y: 300, duration: at(0.7), ease: 'back.out(1.5)' }, at(0.05));
    if (card) {
      // The QR drops onto Q's head...
      tl.from(card, { y: calm ? -260 : -820, rotation: calm ? -4 : -10, duration: at(0.75), ease: 'power3.in' }, at(0.25));
      tl.to(card, { rotation: 0, duration: at(0.5), ease: 'back.out(2)' }, at(1));
      if (q) tl.add(charAnim.squash(q), at(0.98));
      // ...and Q lifts it up for everyone to see.
      if (q) {
        const jump = q.querySelector('.bc-jump');
        if (jump) tl.to(jump, { y: calm ? -8 : -18, duration: at(0.4), ease: 'power2.out' }, at(1.35)).to(jump, { y: 0, duration: at(0.5), ease: 'power2.inOut' }, at(1.75));
        tl.to(card, { y: calm ? -8 : -18, duration: at(0.4), ease: 'power2.out' }, at(1.35)).to(card, { y: 0, duration: at(0.5), ease: 'power2.inOut' }, at(1.75));
        tl.add(charAnim.look(q, 0, -1, 0.3), at(1.3));
      }
    }
    const side = (shape: ShapeName, from: number, t: number) => {
      const c = root.querySelector<HTMLElement>(`[data-qa-char="${shape}"]`);
      if (!c) return;
      tl.from(c, { x: from, opacity: 0, duration: at(0.9), ease: 'power2.out' }, at(t));
      if (!calm) [0, 1, 2].forEach((k) => tl.add(charAnim.hop(c, { height: 26, duration: 0.3 }), at(t + k * 0.3)));
      tl.add(charAnim.squash(c), at(t + 0.95));
    };
    side('triangle', -260, 0.95);
    side('square', 260, 1.05);
    const arch = root.querySelector<HTMLElement>('[data-qa-char="arch"]');
    if (arch) {
      tl.from(arch, { y: -300, duration: at(0.7), ease: 'bounce.out' }, at(1.4));
      tl.add(charAnim.squash(arch), at(1.95));
      tl.add(charAnim.look(arch, -0.4, 1, 0.3), at(2.2));
    }
    const swipe = root.querySelector('[data-qa-swipe]');
    if (swipe) tl.fromTo(swipe, { backgroundSize: '0% 78%' }, { backgroundSize: '100% 78%', duration: at(0.7), ease: 'power2.inOut' }, at(0.9));
  });

  useIdle((root, { calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-qa-char]'));
    const stop = castIdle(chars.filter((c) => c.dataset.qaChar !== 'circle'), calm, 1);
    const q = root.querySelector<HTMLElement>('[data-qa-char="circle"]');
    const card = root.querySelector('[data-el="qr"] [data-qa-lift]');
    const anims: gsap.core.Animation[] = [];
    // Q holds the plate up: the two bob together.
    const blinkQ = q ? charAnim.blinkLoop(q) : () => {};
    const k = calm ? 0.5 : 1;
    if (q) {
      const jump = q.querySelector('.bc-jump');
      const body = q.querySelector('.bc-body');
      if (jump) anims.push(gsap.to(jump, { y: -10 * k, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
      if (body) anims.push(gsap.to(body, { scaleY: 1 + 0.04 * k, scaleX: 1 - 0.02 * k, transformOrigin: '50% 100%', duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
      anims.push(gsap.timeline({ repeat: -1, repeatDelay: 5, delay: 2 }).add(charAnim.look(q, 0, 0, 0.4)).add(charAnim.look(q, 0, -1, 0.4), 2.4));
    }
    if (card) anims.push(gsap.to(card, { y: -10 * k, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    // Hunch and Block take turns hopping, like they have a question too.
    const hoppers = chars.filter((c) => c.dataset.qaChar === 'triangle' || c.dataset.qaChar === 'square');
    const hops = oneShots();
    const hop = hoppers.length ? every(2.4, (n) => hops.add(charAnim.hop(hoppers[n % hoppers.length]!, { height: 18 * k })), 1.5) : null;
    return () => {
      stop();
      blinkQ();
      hops.kill();
      killAll([hop, ...anims]);
      if (card) gsap.set(card, { y: 0 });
    };
  });

  return (
    <>
      {eyebrow ? (
        <El id="eyebrow" label="Eyebrow" box={L.eyebrow} enter="wipe" order={0}>
          <Eyebrow size={32} shape="circle">
            {eyebrow}
          </Eyebrow>
        </El>
      ) : null}
      <El id="title" label="Title" box={L.title} enter="split-chars" order={1}>
        <FitText max={L.titleMax} min={70} casl={1} weight={900} lineHeight={0.94} valign="center">
          {title}
        </FitText>
      </El>
      {short ? (
        <El id="short" label="Short link" box={L.short} valign="center" enter="rise" order={6} morph="site:qna">
          <FitText max={L.shortMax} min={48} weight={900} casl={0.3} lineHeight={1.1} balance={false} valign="center">
            <span data-qa-swipe="" style={{ color: hl.text, backgroundImage: `linear-gradient(${hl.fill}, ${hl.fill})`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 78%', backgroundPosition: '0% 62%', padding: '0 0.14em', borderRadius: '0.12em', whiteSpace: 'nowrap', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>
              {short}
            </span>
          </FitText>
        </El>
      ) : null}
      {line ? (
        <El id="line" label="Line" box={L.line} align={L.align} enter="rise" order={8}>
          <FitText max={42} min={24} font="body" weight={600} lineHeight={1.3} style={{ color: ctx.colors.fg2 }}>
            {line}
          </FitText>
        </El>
      ) : null}
      <El id="qr" label="QR code" box={L.qr} enter="fade" order={2} lockAspect morph={`qr:${url}`}>
        <div data-qa-lift="" style={{ width: QR }}>
          <QrCard value={url} size={QR} label={qrLabel} />
        </div>
      </El>
      {CREW.filter((s) => cast.includes(s)).map((s) => (
        <El key={s} id={`char-${s}`} label={s === 'circle' ? 'Q' : 'Character'} box={L.crew[s]} enter="fade" order={s === 'circle' ? 0 : 3} lockAspect morph={`char:${s}`}>
          <div data-qa-char={s} style={{ width: '100%', height: '100%' }}>
            <BumperCharacter shape={s} mood={s === 'arch' ? 'happy' : s === 'triangle' ? 'surprised' : 'happy'} lookX={s === 'triangle' ? 0.7 : s === 'square' ? -0.7 : 0} lookY={s === 'circle' ? -1 : s === 'arch' ? 1 : -0.6} style={charOutline(ctx, s)} />
          </div>
        </El>
      ))}
    </>
  );
}

export default defineTemplate({
  kind: 'qna',
  background: 'ink',
  variants: [
    { key: 'right', label: 'QR right', hint: 'Your turn and the link left, QR right' },
    { key: 'center', label: 'QR center', hint: 'A poster with the QR in the middle' },
  ],
  fields: [
    f.eyebrow((ctx) => (ctx.person ? `Questions for ${ctx.person.first}` : 'Q and A')),
    f.title(() => 'Your turn.', 'Title', 60),
    { key: 'short', label: 'Link to type', type: 'text', max: 40, default: (ctx) => ctx.site.qnaShort, tokens: false, hint: 'Short enough to read from the back row.' },
    f.url((ctx) => ctx.site.qnaUrl),
    { key: 'line', label: 'Line', type: 'text', max: 140, default: "Scan or type, ask anything, we'll pick a few." },
    f.qrLabel(() => ''),
  ],
  describe: () => 'Q and A',
  headline: () => 'Your turn',
  Render,
});
