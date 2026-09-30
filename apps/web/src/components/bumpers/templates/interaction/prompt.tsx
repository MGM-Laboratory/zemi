'use client';

import type { ShapeName } from '@zemi/shared';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { GRAPH, INK, INK_2, PAPER } from '../../engine/palette';
import { BumperCharacter, charAnim } from '../../parts/character';
import { Countdown } from '../../parts/countdown';
import { accentFill, charColor, Pill, restChars, surface, textInk, useEntranceTime } from '../_tpl-mid-kit';
import { defineTemplate, Eyebrow, f, useMascots } from '../kit';

type Box = { x: number; y: number; w: number; h: number };
interface Slot {
  char: Box;
  bubble: Box;
  tail: 'left' | 'right';
  /** Gaze toward the other character. */
  look: number;
  /** Entrance: roll in from this side (-1 left, 1 right). */
  from: -1 | 1;
}

/** A thought bubble with three dots, its little tail circles pointing down toward the thinker. */
function Bubble({ tail, border }: { tail: 'left' | 'right'; border: string }) {
  const side = tail === 'left' ? { left: '14%' } : { right: '14%' };
  const side2 = tail === 'left' ? { left: '4%' } : { right: '4%' };
  return (
    <div data-bubble-inner="" style={{ position: 'relative', width: '100%', height: '100%', transformOrigin: tail === 'left' ? '15% 100%' : '85% 100%' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '70%', borderRadius: 999, background: PAPER, border, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9%' }}>
        {[0, 1, 2].map((i) => (
          <span key={i} data-dot="" style={{ width: '13%', aspectRatio: '1 / 1', borderRadius: 999, background: INK, display: 'block' }} />
        ))}
      </div>
      <span style={{ position: 'absolute', ...side, bottom: '10%', width: '15%', aspectRatio: '1 / 1', borderRadius: 999, background: PAPER, border, boxSizing: 'border-box' }} />
      <span style={{ position: 'absolute', ...side2, bottom: 0, width: '8%', aspectRatio: '1 / 1', borderRadius: 999, background: PAPER, border, boxSizing: 'border-box' }} />
    </div>
  );
}

/**
 * Talk to your neighbor: a big question for the room, a timer chip (a live countdown from when
 * the bumper appears, or just "2 minutes"), and two characters facing each other taking turns
 * thinking out loud: their thought bubbles pop in and out, the dots bounce.
 */
function Render() {
  const ctx = useSlide();
  const card = ctx.slide.style.variant === 'card';
  const cast = useMascots(['circle', 'triangle']).slice(0, 2);
  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title');
  const body = ctx.text('body');
  const minutes = Math.max(1, Math.round(ctx.num('minutes', 2)));
  const timerOn = ctx.flag('timer', true) && ctx.mode === 'live';
  const t0 = useEntranceTime();
  const chip = card ? { fill: ctx.colors.accentHex, text: ctx.colors.onAccent } : accentFill(ctx);
  const s = surface(ctx);
  const bubbleBorder = ctx.colors.dark || ctx.background === 'accent' ? `0px solid transparent` : `4px solid ${INK}`;
  const ink = textInk(ctx);
  const textOn = card ? INK : ink.fg;
  const shadow = card ? undefined : ink.shadow;

  const slots: Slot[] = card
    ? [
        { char: { x: 672, y: 136, w: 210, h: 210 }, bubble: { x: 410, y: 70, w: 250, h: 165 }, tail: 'right', look: 1, from: -1 },
        { char: { x: 1038, y: 136, w: 210, h: 210 }, bubble: { x: 1260, y: 70, w: 250, h: 165 }, tail: 'left', look: -1, from: 1 },
      ]
    : [
        { char: { x: 1180, y: 548, w: 280, h: 280 }, bubble: { x: 1130, y: 300, w: 280, h: 190 }, tail: 'right', look: 1, from: -1 },
        { char: { x: 1510, y: 548, w: 280, h: 280 }, bubble: { x: 1530, y: 300, w: 280, h: 190 }, tail: 'left', look: -1, from: 1 },
      ];
  // One character alone just thinks, centered over the bench.
  if (cast.length === 1) slots[0] = card ? { ...slots[0]!, char: { ...slots[0]!.char, x: 855 }, bubble: { ...slots[0]!.bubble, x: 590 } } : { ...slots[0]!, char: { ...slots[0]!.char, x: 1345 }, bubble: { ...slots[0]!.bubble, x: 1260 } };

  useEnter((tl, root, { at, calm }) => {
    const titleFit = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleFit) tl.fromTo(titleFit, { '--casl': 0 }, { '--casl': 1, duration: at(1.6), ease: 'power2.out' }, at(0.3));
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-prompt-char]'));
    restChars(chars);
    chars.forEach((c, i) => {
      const from = Number(c.dataset.from ?? -1);
      if (i === 0) {
        tl.fromTo(c, { x: from * (calm ? 120 : 520), opacity: 0 }, { x: 0, opacity: 1, duration: at(0.95), ease: 'power3.out' }, at(0.35));
        const jump = c.querySelector('.bc-jump');
        if (jump && !calm) tl.fromTo(jump, { rotation: from * -360 }, { rotation: 0, duration: at(0.95), ease: 'power3.out' }, at(0.35));
      } else {
        tl.fromTo(c, { y: calm ? -80 : -420, opacity: 0 }, { y: 0, opacity: 1, duration: at(0.8), ease: 'bounce.out' }, at(0.6));
      }
      tl.add(charAnim.squash(c), at(i === 0 ? 1.25 : 1.2));
      tl.add(charAnim.look(c, Number(c.dataset.look ?? 0), 0, 0.3), at(1.35));
    });
    root.querySelectorAll<HTMLElement>('[data-bubble-inner]').forEach((b, i) => {
      tl.fromTo(b, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: at(0.5), ease: BE.back }, at(1.45 + i * 0.5));
      const dots = b.querySelectorAll('[data-dot]');
      tl.fromTo(dots, { y: 0 }, { y: -10, duration: at(0.22), ease: 'sine.out', yoyo: true, repeat: 1, stagger: at(0.12) }, at(1.75 + i * 0.5));
    });
    const icon = root.querySelector('[data-el="timer"] [data-pill-icon]');
    if (icon) tl.fromTo(icon, { rotation: -360 }, { rotation: 0, duration: at(0.9), ease: BE.out }, at(0.95));
    const bench = root.querySelector('[data-prompt-bench]');
    if (bench) tl.fromTo(bench, { scaleX: 0 }, { scaleX: 1, transformOrigin: '50% 50%', duration: at(0.7), ease: BE.out }, at(0.3));
  });

  useIdle((root, { calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-prompt-char]'));
    const bubbles = Array.from(root.querySelectorAll<HTMLElement>('[data-bubble-inner]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c));
    const anims: gsap.core.Animation[] = chars.flatMap((c, i) => charAnim.idle(c, { calm, seed: i * 3 + 2 }));
    const dotsOf = (b: HTMLElement) => b.querySelectorAll('[data-dot]');
    const bounce = (tl: gsap.core.Timeline, b: HTMLElement, at: number) => tl.fromTo(dotsOf(b), { y: 0 }, { y: calm ? -6 : -11, duration: 0.3, ease: 'sine.inOut', yoyo: true, repeat: 5, stagger: 0.14 }, at);
    const [b0, b1] = bubbles;
    const [c0, c1] = chars;
    if (b0 && b1 && c0 && c1) {
      // Taking turns: one thinks out loud (dots bounce, a little bob), the other listens and looks.
      const turn = gsap.timeline();
      turn.to(b1, { scale: 0, opacity: 0, duration: 0.3, ease: 'power2.in' }, 0.4);
      bounce(turn, b0, 0.2);
      turn.add(charAnim.look(c1, -1, -0.2, 0.3), 0.3);
      const loop = gsap.timeline({ repeat: -1 });
      const phase = (talk: HTMLElement, listen: HTMLElement, talker: HTMLElement, listener: HTMLElement, lookDir: number, t: number) => {
        loop.to(listen, { scale: 0, opacity: 0, duration: 0.3, ease: 'power2.in' }, t);
        loop.fromTo(talk, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: BE.back, immediateRender: false }, t + 0.15);
        bounce(loop, talk, t + 0.45);
        loop.add(charAnim.hop(talker, { height: calm ? 5 : 10, duration: 0.36 }), t + 0.3);
        loop.add(charAnim.look(listener, lookDir, -0.2, 0.3), t + 0.4);
      };
      phase(b1, b0, c1, c0, 1, 0);
      phase(b0, b1, c0, c1, -1, 2.6);
      loop.to({}, { duration: 0.01 }, 5.19);
      turn.add(loop, 2.6);
      anims.push(turn);
    } else if (b0) {
      const think = gsap.timeline({ repeat: -1, repeatDelay: 0.6 });
      bounce(think, b0, 0);
      anims.push(think);
    }
    return () => {
      stops.forEach((st) => st());
      anims.forEach((a) => a.kill());
    };
  });

  const timerLabel = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const timerBox: Box = card ? { x: 1150, y: 840, w: 580, h: 124 } : { x: 140, y: 800, w: 900, h: 124 };

  return (
    <>
      {card ? (
        <El id="card" label="Card" box={{ x: 300, y: 340, w: 1320, h: 560 }} enter="rise" order={0}>
          <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: 36, background: s.bg, backgroundImage: `linear-gradient(to right, ${GRAPH} 2px, transparent 2px), linear-gradient(to bottom, ${GRAPH} 2px, transparent 2px)`, backgroundSize: '32px 32px', border: s.border, boxShadow: s.shadow }} />
        </El>
      ) : null}
      {!card && cast.length ? (
        <El id="bench" label="Bench" box={cast.length === 1 ? { x: 1290, y: 820, w: 390, h: 20 } : { x: 1150, y: 820, w: 670, h: 20 }} enter="fade" order={2} valign="center">
          <div data-prompt-bench="" style={{ width: '100%', height: 12, borderRadius: 12, background: ink.fg, opacity: 0.9, boxShadow: ink.shadow }} />
        </El>
      ) : null}
      <El id="eyebrow" label="Eyebrow" box={card ? { x: 384, y: 400, w: 900, h: 50 } : { x: 140, y: 196, w: 1080, h: 56 }} enter="wipe" order={1}>
        {card ? (
          <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.12 }), fontSize: 28, textTransform: 'uppercase', color: INK_2, lineHeight: 1 }}>
            <span data-split-target="">{eyebrow}</span>
          </span>
        ) : (
          <Eyebrow size={32} shape="circle" color={ink.fg} style={{ textShadow: ink.shadow }}>
            {eyebrow}
          </Eyebrow>
        )}
      </El>
      <El id="title" label="Question" box={card ? { x: 374, y: 462, w: 1170, h: 330 } : { x: 130, y: 266, w: 960, h: 500 }} enter="split-words" order={2}>
        <FitText max={card ? 132 : 150} min={56} casl={1} lineHeight={0.94} valign={card ? 'center' : 'start'} style={{ color: textOn, textShadow: shadow }}>
          {title}
        </FitText>
      </El>
      {body ? (
        <El id="body" label="Line" box={card ? { x: 384, y: 816, w: 740, h: 56 } : { x: 140, y: 944, w: 1000, h: 60 }} enter="rise" order={5}>
          <FitText max={card ? 32 : 38} min={20} font="body" weight={500} lineHeight={1.3} valign="center" style={{ color: card ? INK_2 : ink.fg2, textShadow: shadow }}>
            {body}
          </FitText>
        </El>
      ) : null}
      <El id="timer" label="Timer" box={timerBox} enter="pop" order={6} align={card ? 'end' : 'start'} valign="center">
        <div style={{ rotate: card ? '3deg' : undefined, transformOrigin: '50% 50%' }}>
          <Pill icon="clock" bg={chip.fill} fg={chip.text} size={56} style={{ boxShadow: card || ctx.background === 'accent' ? `6px 6px 0 ${INK}` : undefined }}>
            {timerOn ? <Countdown to={t0 + minutes * 60_000} variant="inline" size={56} done={ctx.text('done')} color={chip.text} style={{ ...fontStyle('mono', { weight: 700, tracking: 0.02 }), fontSize: 56 }} /> : timerLabel}
          </Pill>
        </div>
      </El>
      {cast.map((shape, i) => {
        const slot = slots[i]!;
        return (
          <El key={`b-${shape}`} id={`bubble-${i}`} label={i ? 'Second thought bubble' : 'Thought bubble'} box={slot.bubble} enter="fade" order={7} lockAspect>
            <Bubble tail={slot.tail} border={bubbleBorder} />
          </El>
        );
      })}
      {cast.map((shape, i) => {
        const slot = slots[i]!;
        return (
          <El key={shape} id={`char-${i}`} label={i ? 'Second character' : 'Character'} box={slot.char} enter="fade" order={3} lockAspect>
            <div data-prompt-char="" data-from={slot.from} data-look={cast.length === 1 ? 0 : slot.look} style={{ width: '100%', height: '100%' }}>
              <BumperCharacter shape={shape as ShapeName} color={charColor(ctx, shape as ShapeName)} mood="idle" lookX={cast.length === 1 ? 0 : slot.look} />
            </div>
          </El>
        );
      })}
    </>
  );
}

export default defineTemplate({
  kind: 'prompt',
  background: 'accent',
  variants: [
    { key: 'duo', label: 'Question left, two characters chatting' },
    { key: 'card', label: 'Question on a card' },
  ],
  fields: [
    f.eyebrow('Talk to your neighbor'),
    { ...f.title("What's the smallest question you're stuck on right now?", 'Question', 200), type: 'longtext' },
    f.body("Turn to the person next to you. We'll hear a few after.", 'Line', 160),
    { ...f.minutes(2, 'Minutes'), max: 30 },
    { key: 'timer', label: 'Run a live timer', type: 'toggle', default: true, hint: 'Counts down from when this bumper shows. Replay it for another round.', group: 'options' },
    { key: 'done', label: 'When time is up', type: 'text', max: 40, default: "Time's up", group: 'options' },
  ],
  presets: [
    { key: 'stuck', label: 'Stuck question', description: 'The classic two-minute neighbor chat.', slide: {} },
    { key: 'one-word', label: 'One word', description: 'Sum up the talk in one word.', slide: { fields: { eyebrow: 'Quick one', title: 'Describe that talk in one word. Go.', minutes: 1, body: "Then tell your neighbor why. We'll collect a few." } } },
    { key: 'pitch', label: 'Thirty second pitch', description: 'Everyone pitches their research to a neighbor.', slide: { fields: { eyebrow: 'Pitch time', title: 'Pitch your research to your neighbor. Messy version welcome.', minutes: 3, body: 'Thirty seconds each, then swap. Nobody expects it to be perfect.' } } },
  ],
  describe: (ctx) => ctx.text('title') || 'Talk to your neighbor',
  headline: () => 'Your turn',
  Render,
});
