'use client';

import { SHAPE_ORDER, type BumperBox, type ShapeName } from '@zemi/shared';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { INK } from '../../engine/palette';
import { BumperCharacter, charAnim } from '../../parts/character';
import { stageConfetti } from '../../parts/confetti';
import { Sticker } from '../../parts/stickers';
import { castIdle, charOutline, every, faceOutline, killAll, oneShots, portraitBack, usePrimedCast } from '../_tpl-talks-kit';
import { defineTemplate, Eyebrow, f, Portrait, useMascots, usePerson } from '../kit';

/**
 * Thank you, speaker: "Thank you, Rani!" in huge loosened type, the portrait small in its shape,
 * a studio style "Clap clap" sign that lights up, and the crew clapping in bursts (fast squashes,
 * no hands needed). Confetti cannons fire from both corners.
 */

const LIT = '#f7bf33';
/** Half a clap (squash or release): 0.18 s keeps the applause under three claps a second. */
const CLAP = 0.18;

/** "zemi.ac/speakers/rani-kusuma" from an absolute URL. */
function shortUrl(url: string | null | undefined): string {
  if (!url) return '';
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

interface Layout {
  photo: BumperBox;
  size: number;
  eyebrow: BumperBox;
  title: BumperBox;
  titleMax: number;
  sign: BumperBox;
  line: BumperBox;
  crew: Array<{ box: BumperBox; shape: ShapeName }>;
  align: 'start' | 'center';
}

const CENTER: Layout = {
  photo: { x: 846, y: 92, w: 250, h: 242 },
  size: 222,
  eyebrow: { x: 160, y: 352, w: 1600, h: 56 },
  title: { x: 140, y: 414, w: 1640, h: 360 },
  titleMax: 190,
  sign: { x: 760, y: 790, w: 400, h: 110 },
  line: { x: 460, y: 960, w: 1000, h: 48 },
  crew: [
    { shape: 'circle', box: { x: 250, y: 780, w: 150, h: 150 } },
    { shape: 'triangle', box: { x: 440, y: 790, w: 140, h: 140 } },
    { shape: 'square', box: { x: 1340, y: 790, w: 140, h: 140 } },
    { shape: 'arch', box: { x: 1520, y: 780, w: 150, h: 150 } },
  ],
  align: 'center',
};

const SPLIT: Layout = {
  photo: { x: 130, y: 250, w: 520, h: 500 },
  size: 460,
  eyebrow: { x: 740, y: 250, w: 1080, h: 56 },
  title: { x: 740, y: 320, w: 1080, h: 380 },
  titleMax: 190,
  sign: { x: 740, y: 740, w: 400, h: 110 },
  line: { x: 740, y: 890, w: 1000, h: 52 },
  crew: [
    { shape: 'circle', box: { x: 1210, y: 730, w: 130, h: 130 } },
    { shape: 'triangle', box: { x: 1360, y: 740, w: 120, h: 120 } },
    { shape: 'square', box: { x: 1500, y: 740, w: 120, h: 120 } },
    { shape: 'arch', box: { x: 1640, y: 730, w: 130, h: 130 } },
  ],
  align: 'start',
};

function Render() {
  const ctx = useSlide();
  usePrimedCast();
  const person = usePerson();
  const L = ctx.slide.style.variant === 'split' ? SPLIT : CENTER;
  const cast = useMascots([...SHAPE_ORDER]);
  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title');
  const cue = ctx.text('cue');
  const line = ctx.flag('showLine', true) ? ctx.text('line') : '';
  const pid = person?.id ?? 'manual';
  const center = L.align === 'center';
  const signBg = ctx.colors.dark && ctx.background !== 'accent' ? '#ffffff14' : INK;
  const dim = '#ffffff4d';

  useEnter((tl, root, { at, calm }) => {
    if (ctx.theme.motion === 'still') return;
    const back = root.querySelector('[data-el="photo"] [data-portrait-back]');
    const photo = root.querySelector('[data-el="photo"] [data-portrait]');
    if (back) tl.from(back, { scale: 0.2, rotation: 60, opacity: 0, duration: at(1), ease: 'zemiPop' }, at(0));
    if (photo) tl.fromTo(photo, { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)', duration: at(0.9), ease: 'zemiInOut', clearProps: 'clipPath' }, at(0.1));
    const heart = root.querySelector('[data-ty-heart]');
    if (heart) tl.from(heart, { scale: 0, rotation: -30, duration: at(0.8), ease: 'back.out(2.2)' }, at(0.05));
    const titleEl = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleEl) tl.fromTo(titleEl, { '--casl': 0 }, { '--casl': 1, duration: at(1.4), ease: 'power2.out' }, at(0.3));
    const sign = root.querySelector<HTMLElement>('[data-ty-sign]');
    const word = root.querySelector<HTMLElement>('[data-ty-word]');
    if (sign) tl.from(sign, { y: -70, rotation: -9, transformOrigin: '50% 0%', duration: at(1.1), ease: 'elastic.out(1, 0.5)' }, at(0.75));
    const crew = Array.from(root.querySelectorAll<HTMLElement>('[data-ty-char]'));
    crew.forEach((c, i) => {
      tl.from(c, { y: 260, duration: at(0.7), ease: 'back.out(1.7)' }, at(0.8 + i * 0.08));
      // Everyone turns to the speaker before the applause starts.
      const r = c.getBoundingClientRect();
      const toRight = r.left + r.width / 2 < (root.getBoundingClientRect().left + root.getBoundingClientRect().width * (center ? 0.5 : 0.2));
      tl.add(charAnim.look(c, toRight ? 0.8 : -0.8, -0.9, 0.3), at(1.1 + i * 0.05));
    });
    if (!calm) {
      tl.add(stageConfetti(root, { x: 120, y: 1060, angle: -62, spread: 22, count: 34, velocity: 1650, gravity: 1300 }), at(1.15));
      tl.add(stageConfetti(root, { x: 1800, y: 1060, angle: -118, spread: 22, count: 34, velocity: 1650, gravity: 1300 }), at(1.25));
    }
    // First round of applause.
    if (word) tl.to(word, { color: LIT, textShadow: `0 0 26px ${LIT}99`, duration: at(0.12) }, at(1.4)).to(word, { color: dim, textShadow: '0 0 0px #f7bf3300', duration: at(0.4) }, at(2.7));
    crew.forEach((c, i) => {
      const body = c.querySelector('.bc-body');
      if (!body) return;
      tl.to(body, { scaleX: 1.14, scaleY: 0.84, duration: at(CLAP), ease: 'power2.out', yoyo: true, repeat: calm ? 3 : 7, transformOrigin: '50% 100%' }, at(1.45 + i * 0.05));
    });
  });

  useIdle((root, { calm }) => {
    const crew = Array.from(root.querySelectorAll<HTMLElement>('[data-ty-char]'));
    const word = root.querySelector<HTMLElement>('[data-ty-word]');
    const stop = castIdle(crew, calm, 5);
    const anims: gsap.core.Animation[] = [];
    const shots = oneShots();
    // Applause comes in bursts: a little under three claps a second, then a breather.
    const clap = every(calm ? 5 : 3.6, () => {
      const burst = gsap.timeline();
      if (word) burst.to(word, { color: LIT, textShadow: `0 0 26px ${LIT}99`, duration: 0.12 }, 0).to(word, { color: dim, textShadow: '0 0 0px #f7bf3300', duration: 0.4 }, 1.25);
      crew.forEach((c, i) => {
        const body = c.querySelector('.bc-body');
        if (body) burst.to(body, { scaleX: 1.14, scaleY: 0.84, duration: CLAP, ease: 'power2.out', yoyo: true, repeat: calm ? 3 : 7, transformOrigin: '50% 100%' }, i * 0.05);
      });
      shots.add(burst);
    }, 1.2);
    const drizzle = calm
      ? null
      : every(9, (k) => {
          shots.add(stageConfetti(root, { x: k % 2 ? 1500 : 420, y: -30, angle: 90, spread: 40, count: 14, velocity: 200, gravity: 700, life: 3.4 }));
        }, 4);
    const back = root.querySelector('[data-el="photo"] [data-portrait-back]');
    if (back) anims.push(gsap.to(back, { rotation: calm ? 4 : 8, duration: 4.5, ease: 'sine.inOut', yoyo: true, repeat: -1, transformOrigin: '50% 50%' }));
    const heart = root.querySelector('[data-ty-heart]');
    if (heart) anims.push(gsap.to(heart, { scale: calm ? 1.04 : 1.09, duration: 0.5, ease: 'sine.inOut', yoyo: true, repeat: -1, repeatDelay: 0.9 }));
    const sign = root.querySelector('[data-ty-sign]');
    if (sign) anims.push(gsap.to(sign, { rotation: calm ? 0.8 : 1.6, transformOrigin: '50% 0%', duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    return () => {
      stop();
      shots.kill();
      killAll([clap, drizzle, ...anims]);
      root.querySelectorAll('[data-confetti]').forEach((n) => n.remove());
      if (word) gsap.set(word, { color: dim, textShadow: 'none' });
      crew.forEach((c) => {
        const body = c.querySelector('.bc-body');
        if (body) gsap.set(body, { scaleX: 1, scaleY: 1 });
      });
    };
  });

  return (
    <>
      <El id="photo" label="Photo" box={L.photo} enter="fade" order={0} lockAspect morph={person ? `person:${pid}:photo` : null}>
        {person ? (
          <div style={faceOutline(ctx, person)}>
            <Portrait person={person} size={L.size} shape={person.shape} color={portraitBack(ctx, person)} />
          </div>
        ) : (
          <div data-ty-heart="" style={{ width: L.size, height: L.size }}>
            <Sticker name="heart" />
          </div>
        )}
      </El>
      {eyebrow ? (
        <El id="eyebrow" label="Eyebrow" box={L.eyebrow} align={L.align} enter="wipe" order={2}>
          <Eyebrow size={34}>{eyebrow}</Eyebrow>
        </El>
      ) : null}
      <El id="title" label="Thank you" box={L.title} align={L.align} enter="split-chars" order={3} morph={person ? `person:${pid}:name` : null}>
        <FitText max={L.titleMax} min={70} casl={1} weight={900} lineHeight={0.92} valign="center">
          {title}
        </FitText>
      </El>
      {cue ? (
        <El id="cue" label="Applause sign" box={L.sign} align={center ? 'center' : 'start'} valign="center" enter="fade" order={6}>
          <div data-ty-sign="" style={{ display: 'inline-flex', alignItems: 'center', gap: 18, padding: '18px 34px', borderRadius: 26, background: signBg, border: `4px solid ${ctx.background === 'accent' ? INK : '#ffffff26'}`, boxShadow: ctx.colors.dark ? undefined : `8px 8px 0 #0e111633` }}>
            <span style={{ width: 16, height: 16, borderRadius: 99, background: '#f94141', flex: 'none' }} />
            <span data-ty-word="" style={{ ...fontStyle('mono', { weight: 800, tracking: 0.16 }), fontSize: 44, lineHeight: 1, textTransform: 'uppercase', color: dim, whiteSpace: 'nowrap' }}>
              {cue}
            </span>
          </div>
        </El>
      ) : null}
      {line ? (
        <El id="line" label="Where to find the slides" box={L.line} align={L.align} enter="rise" order={8}>
          <FitText max={30} min={20} font="mono" weight={600} lineHeight={1.3} style={{ color: ctx.colors.fg2 }}>
            {line}
          </FitText>
        </El>
      ) : null}
      {L.crew
        .filter((c) => cast.includes(c.shape))
        .map((c, i) => (
          <El key={c.shape} id={`char-${c.shape}`} label="Character" box={c.box} enter="fade" order={5} lockAspect>
            <div data-ty-char="" style={{ width: '100%', height: '100%' }}>
              <BumperCharacter shape={c.shape} mood={i % 3 === 1 ? 'wink' : 'happy'} lookX={center ? (c.box.x < 960 ? 0.7 : -0.7) : -0.8} lookY={-0.5} style={charOutline(ctx, c.shape)} />
            </div>
          </El>
        ))}
    </>
  );
}

export default defineTemplate({
  kind: 'thanks-speaker',
  background: 'accent',
  variants: [
    { key: 'center', label: 'Centered', hint: 'Photo on top, the thank-you huge' },
    { key: 'split', label: 'Photo left' },
  ],
  fields: [
    f.eyebrow(() => 'Give it up for'),
    f.title((ctx) => (ctx.person ? `Thank you, ${ctx.person.first}!` : 'Thank you!'), 'Thank you line', 80),
    { key: 'cue', label: 'Applause sign', type: 'text', max: 20, default: 'Clap clap' },
    { key: 'line', label: 'Extra line', type: 'text', max: 120, default: (ctx) => (ctx.person?.url ? `Slides and papers at ${shortUrl(ctx.person.url)}` : ''), hint: 'Where people can find the slides or the paper.' },
    { key: 'showLine', label: 'Show the extra line', type: 'toggle', default: true, group: 'options' },
  ],
  presets: [
    { key: 'everyone', label: 'All the speakers', description: 'One big thank-you at the end.', slide: { fields: { eyebrow: 'One more round for', title: 'Thank you, speakers!', line: '' }, refs: { speakerId: null } } },
    { key: 'panel', label: 'The panel', slide: { fields: { eyebrow: 'Give it up for', title: 'Thank you, panel!', line: '' }, refs: { speakerId: null } } },
  ],
  describe: (ctx) => (ctx.person ? `Thanks, ${ctx.person.first}` : 'Thank you'),
  headline: () => 'Thank you',
  Render,
});
