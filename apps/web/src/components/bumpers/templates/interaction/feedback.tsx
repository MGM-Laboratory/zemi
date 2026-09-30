'use client';

import type { ShapeName } from '@zemi/shared';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { eventNumberLabel } from '../../engine/resolve';
import { BumperCharacter, charAnim } from '../../parts/character';
import { Sticker } from '../../parts/stickers';
import { charColor, Note, QrCard, rest, restChars, shortUrl, textInk } from '../_tpl-mid-kit';
import { defineTemplate, Eyebrow, f, useMascots } from '../kit';

/** Little hearts and stars that drift up around the QR code (positions relative to the hearts box). */
const FLOATERS: Array<{ x: number; y: number; s: number; icon: string; r: number }> = [
  { x: 20, y: 520, s: 70, icon: 'heart', r: -14 },
  { x: 610, y: 610, s: 58, icon: 'heart', r: 12 },
  { x: 60, y: 90, s: 50, icon: 'star', r: -8 },
  { x: 640, y: 250, s: 64, icon: 'heart', r: 18 },
  { x: 330, y: 740, s: 44, icon: 'star', r: 10 },
];

/**
 * Feedback: "Tell us how it went". A QR code to the feedback form on a framed plate, a big heart
 * that drops onto its corner (the character peeking from behind the plate hops when it lands),
 * and little hearts drifting up like reactions on a livestream.
 */
function Render() {
  const ctx = useSlide();
  const stack = ctx.slide.style.variant === 'stack';
  const cast = useMascots(['triangle']).slice(0, 2);
  const url = ctx.text('url') || ctx.site.webUrl;
  const label = ctx.text('qrLabel');
  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title');
  const body = ctx.text('body');
  const note = ctx.text('note');
  const ink = textInk(ctx);

  useEnter((tl, root, { at, calm }) => {
    // A replay can catch the heart mid beat and the little ones mid drift: start them from rest.
    rest(root, '[data-fb-heart] svg', { scale: 1 });
    rest(root, '[data-fb-float]', { x: 0, y: 0 });
    const titleFit = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleFit) tl.fromTo(titleFit, { '--casl': 0 }, { '--casl': 0.9, duration: at(1.5), ease: 'power2.out' }, at(0.3));
    const card = root.querySelector('[data-el="qr"] [data-qr-card]');
    if (card) tl.fromTo(card, { rotation: calm ? -4 : -13, y: 30 }, { rotation: 0, y: 0, duration: at(1.1), ease: BE.back }, at(0.2));
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-fb-char]'));
    restChars(chars);
    chars.forEach((c, i) => {
      const from = Number(c.dataset.from ?? 1);
      tl.fromTo(c, { x: from * (calm ? 60 : 150), opacity: 0 }, { x: 0, opacity: 1, duration: at(0.8), ease: BE.out }, at(0.55 + i * 0.15));
      tl.add(charAnim.look(c, Number(c.dataset.look ?? 0.7), -0.9, 0.3), at(1.2));
    });
    const heart = root.querySelector<HTMLElement>('[data-fb-heart]');
    if (heart) {
      tl.fromTo(heart, { y: calm ? -120 : -460, rotation: -50, opacity: 0 }, { y: 0, rotation: 0, opacity: 1, duration: at(0.75), ease: 'bounce.out' }, at(1.0));
      if (card && !calm) tl.fromTo(card, { scaleY: 1 }, { scaleY: 0.97, duration: at(0.08), yoyo: true, repeat: 1, ease: 'power1.inOut', transformOrigin: '50% 100%' }, at(1.32));
    }
    chars.forEach((c) => tl.add(charAnim.hop(c, { height: calm ? 8 : 22 }), at(1.4)));
    const bits = root.querySelectorAll('[data-fb-float]');
    if (bits.length) tl.fromTo(bits, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: at(0.55), ease: BE.back, stagger: at(0.08) }, at(1.45));
  });

  useIdle((root, { calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-fb-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c));
    const anims: gsap.core.Animation[] = chars.flatMap((c, i) => charAnim.idle(c, { calm, seed: i * 4 + 1 }));
    chars.forEach((c) => {
      // Now and then it looks at the room, then back up at the heart.
      const glance = gsap.timeline({ repeat: -1, repeatDelay: 3.5 });
      glance.add(charAnim.look(c, 0, 0.2, 0.4), 2.6).add(charAnim.look(c, Number(c.dataset.look ?? 0.7), -0.9, 0.4), 4.4);
      anims.push(glance);
    });
    const heart = root.querySelector('[data-fb-heart] svg');
    if (heart) {
      const beat = gsap.timeline({ repeat: -1, repeatDelay: 2.2 });
      beat.to(heart, { scale: calm ? 1.04 : 1.1, duration: 0.16, ease: 'power2.out', transformOrigin: '50% 60%' }).to(heart, { scale: 1, duration: 0.24, ease: 'power2.in' }).to(heart, { scale: calm ? 1.03 : 1.07, duration: 0.16, ease: 'power2.out' }).to(heart, { scale: 1, duration: 0.4, ease: 'power2.inOut' });
      anims.push(beat);
    }
    root.querySelectorAll<HTMLElement>('[data-fb-float]').forEach((el, i) => {
      const d = (calm ? 7 : 5) + (i % 3) * 0.8;
      anims.push(
        gsap.fromTo(
          el,
          { y: 60, opacity: 0, scale: 0.7 },
          { keyframes: { '0%': { opacity: 0 }, '25%': { opacity: 1 }, '75%': { opacity: 1 }, '100%': { opacity: 0 } }, y: calm ? -120 : -220, scale: 1, x: (i % 2 ? 1 : -1) * 18, duration: d, ease: 'sine.inOut', repeat: -1, delay: i * 0.9 },
        ),
      );
    });
    const card = root.querySelector('[data-el="qr"] [data-qr-card]');
    if (card) anims.push(gsap.fromTo(card, { rotation: -0.7 }, { rotation: 0.7, duration: 4.5, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
    };
  });

  const qrBox = stack ? { x: 740, y: 356, w: 440, h: 440 } : { x: 1190, y: 200, w: 520, h: 520 };
  const heartSize = stack ? 130 : 150;
  const charSize = stack ? 170 : 190;
  const floatBox = stack ? { x: 520, y: 180, w: 880, h: 760 } : { x: 1080, y: 110, w: 740, h: 860 };
  const charSpots: Array<{ x: number; y: number; from: number; lookX: number }> = stack
    ? [
        { x: qrBox.x - charSize * 0.86, y: qrBox.y + qrBox.h - charSize * 0.96, from: 1, lookX: 0.7 },
        { x: qrBox.x + qrBox.w - charSize * 0.1, y: qrBox.y + qrBox.h - charSize * 0.96, from: -1, lookX: -0.7 },
      ]
    : [
        { x: qrBox.x - charSize * 0.84, y: qrBox.y + qrBox.h - charSize * 0.96, from: 1, lookX: 0.7 },
        { x: qrBox.x - charSize * 0.62, y: qrBox.y - charSize * 0.02, from: 1, lookX: 0.8 },
      ];

  return (
    <>
      <El id="hearts" label="Floating hearts" box={floatBox} enter="fade" order={3} locked>
        {FLOATERS.map((h, i) => (
          <div key={i} data-fb-float="" style={{ position: 'absolute', left: (h.x / 740) * floatBox.w, top: (h.y / 860) * floatBox.h, width: h.s, height: h.s, rotate: `${h.r}deg`, opacity: ctx.colors.dark ? 0.9 : 1 }}>
            <Sticker name={h.icon} />
          </div>
        ))}
      </El>
      <El id="eyebrow" label="Eyebrow" box={stack ? { x: 400, y: 100, w: 1120, h: 52 } : { x: 140, y: 250, w: 1000, h: 56 }} align={stack ? 'center' : 'start'} enter="wipe" order={0}>
        <Eyebrow size={32} shape="triangle" color={ink.fg} style={{ textShadow: ink.shadow }}>
          {eyebrow}
        </Eyebrow>
      </El>
      <El id="title" label="Title" box={stack ? { x: 160, y: 162, w: 1600, h: 150 } : { x: 130, y: 330, w: 1000, h: 410 }} align={stack ? 'center' : 'start'} enter="split-words" order={1}>
        <FitText max={stack ? 140 : 186} min={64} casl={0.9} lineHeight={0.92} valign={stack ? 'center' : 'start'} style={{ color: ink.fg, textShadow: ink.shadow }}>
          {title}
        </FitText>
      </El>
      {body ? (
        <El id="body" label="Line" box={stack ? { x: 360, y: 896, w: 1200, h: 110 } : { x: 140, y: 780, w: 880, h: 170 }} align={stack ? 'center' : 'start'} enter="rise" order={5}>
          <FitText max={stack ? 38 : 46} min={24} font="body" weight={500} lineHeight={1.35} style={{ color: ink.fg2, textShadow: ink.shadow }}>
            {body}
          </FitText>
        </El>
      ) : null}
      {cast.map((s, i) => {
        const spot = charSpots[i]!;
        return (
          <El key={s} id={`char-${i}`} label={i ? 'Second character' : 'Character'} box={{ x: Math.round(spot.x), y: Math.round(spot.y), w: charSize, h: charSize }} enter="fade" order={4} lockAspect>
            <div data-fb-char="" data-from={spot.from} data-look={spot.lookX} style={{ width: '100%', height: '100%' }}>
              <BumperCharacter shape={s as ShapeName} color={charColor(ctx, s)} mood="happy" lookX={spot.lookX} lookY={-0.9} />
            </div>
          </El>
        );
      })}
      <El id="qr" label="QR code" box={qrBox} enter="pop" order={2} lockAspect morph={`qr:${url}`}>
        <div style={{ width: '100%', height: '100%', rotate: stack ? undefined : '-3deg' }}>
          <QrCard value={url} />
        </div>
      </El>
      <El id="heart" label="Heart sticker" box={{ x: qrBox.x + qrBox.w - heartSize * 0.62, y: qrBox.y - heartSize * 0.42, w: heartSize, h: heartSize }} enter="fade" order={3} lockAspect>
        <div data-fb-heart="" style={{ width: '100%', height: '100%' }}>
          <div style={{ width: '100%', height: '100%', rotate: '12deg' }}>
            <Sticker name="heart" />
          </div>
        </div>
      </El>
      {note ? (
        <El id="note" label="Handwritten note" box={stack ? { x: 1250, y: 440, w: 420, h: 110 } : { x: 1250, y: 850, w: 420, h: 110 }} align="center" enter="draw" delay={1.55}>
          <div style={{ width: '100%', height: '100%', rotate: '-4deg' }}>
            <Note text={note} color={ink.accent} max={52} shadow={ink.shadow} />
          </div>
        </El>
      ) : null}
      {label ? (
        <El id="qrLabel" label="Under the QR code" box={stack ? { x: 560, y: 818, w: 800, h: 56 } : { x: 1110, y: 762, w: 680, h: 64 }} align="center" enter="fade" order={6}>
          <FitText max={34} min={20} font="mono" lineHeight={1.2} valign="center" style={{ color: ink.fg, textShadow: ink.shadow }}>
            {label}
          </FitText>
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'feedback',
  variants: [
    { key: 'split', label: 'Text left, QR right' },
    { key: 'stack', label: 'QR in the middle' },
  ],
  fields: [
    f.eyebrow((ctx) => (ctx.event?.number != null ? `How was Zemi ${eventNumberLabel(ctx.event)}?` : 'How was today?')),
    f.title('Tell us how it went'),
    f.body("What landed, what didn't, what we should try next Friday. Anonymous is fine.", 'Line', 240),
    { ...f.url((ctx) => `${ctx.site.webUrl}/contact?topic=feedback`, 'Feedback form link'), hint: 'A Google Form, a Typeform, or our contact page (the default).' },
    f.qrLabel((ctx) => shortUrl(ctx.text('url') || ctx.site.webUrl).replace(/[?#].*$/, '')),
    { key: 'note', label: 'Handwritten note', type: 'text', max: 40, default: 'Takes a minute', group: 'options' },
  ],
  presets: [
    { key: 'how-it-went', label: 'How it went', description: 'The classic end-of-Friday feedback ask.', slide: {} },
    {
      key: 'next-topic',
      label: 'Pick the next topic',
      description: 'Ask the room what Zemi should cover next.',
      slide: { fields: { eyebrow: 'Your turn to pick', title: 'What should we talk about next?', body: 'Pitch a topic, a paper or a speaker. We read every single one.' } },
    },
    {
      key: 'rate-talks',
      label: 'Rate the talks',
      description: 'Short feedback for the speakers.',
      slide: { fields: { eyebrow: 'For the speakers', title: 'How were the talks?', body: 'Two quick questions. Speakers read every answer, so be kind and be honest.' } },
    },
  ],
  describe: (ctx) => `Feedback: ${ctx.text('qrLabel') || shortUrl(ctx.text('url'))}`,
  headline: () => 'Feedback',
  Render,
});
