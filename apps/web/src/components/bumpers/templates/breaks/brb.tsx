'use client';

import { SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46, type ShapeName } from '@zemi/shared';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { INK, PAPER } from '../../engine/palette';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { Sticker } from '../../parts/stickers';
import { accentFill, charColor, Pill, rest, restChars, textInk } from '../_tpl-mid-kit';
import { defineTemplate, Eyebrow, f, useMascots } from '../kit';

type Reason = 'mic' | 'projector' | 'internet' | 'pause' | 'other';

const REASONS: Record<Reason, { label: string; line: string; sticker: string; status: string }> = {
  mic: { label: 'The mic', line: "We're fixing the mic.", sticker: 'mic', status: 'Testing, testing' },
  projector: { label: 'The projector', line: 'The projector needs a minute.', sticker: 'laptop', status: 'Finding the right cable' },
  internet: { label: 'The internet', line: 'The internet is having a moment.', sticker: 'wifi', status: 'Reconnecting' },
  pause: { label: 'A short pause', line: 'Quick pause, back in a sec.', sticker: 'coffee', status: 'Back in a moment' },
  other: { label: 'Something else', line: 'Something needs a quick fix.', sticker: 'bulb', status: 'Working on it' },
};

const reasonOf = (ctx: ResolveCtx): Reason => {
  const r = ctx.text('reason');
  return r in REASONS ? (r as Reason) : 'mic';
};

/** One gear: a disc with brand shapes for teeth, drawn around (cx, cy) so GSAP can spin it about its axle. */
function Gear({ cx, cy, r, teeth, disc, line, hub, name }: { cx: number; cy: number; r: number; teeth: number; disc: string; line: string; hub: string; name: string }) {
  const size = r * 0.34;
  return (
    <g data-gear={name} data-cx={cx} data-cy={cy}>
      {Array.from({ length: teeth }, (_, i) => {
        const shape = SHAPE_ORDER[i % 4]!;
        return (
          <g key={i} transform={`translate(${cx} ${cy}) rotate(${(i * 360) / teeth}) translate(0 ${-r * 0.8})`}>
            <path d={SHAPE_PATHS_46[shape]} transform={`translate(${-size / 2} ${-size / 2}) scale(${size / 46})`} fill={SHAPE_COLORS[shape]} stroke={line} strokeWidth={46 * (5 / size)} strokeLinejoin="round" />
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={r * 0.72} fill={disc} />
      <circle cx={cx} cy={cy} r={r * 0.22} fill={hub} />
      {Array.from({ length: 4 }, (_, i) => {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        // Rounded so the server and the browser agree on the markup.
        return <circle key={i} cx={Math.round(cx + Math.cos(a) * r * 0.46)} cy={Math.round(cy + Math.sin(a) * r * 0.46)} r={r * 0.06} fill={hub} />;
      })}
    </g>
  );
}

/**
 * Be right back: "Hang tight, we're fixing the mic." A gear made of the four shapes keeps turning
 * (a smaller one meshes with it), Block keeps bonking Q on the head like that will help, and a
 * status line works on it. Reasons: the mic, the projector, the internet, a short pause.
 */
function Render() {
  const ctx = useSlide();
  const tape = ctx.slide.style.variant === 'tape';
  const cast = useMascots(['circle', 'square']).slice(0, 2);
  const reason = REASONS[reasonOf(ctx)];
  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title');
  const body = ctx.text('body');
  const status = ctx.text('status');
  const chip = accentFill(ctx);
  const ink = textInk(ctx);
  const disc = ctx.colors.fg;
  const hub = ctx.background === 'transparent' ? PAPER : ctx.colors.bg;
  const tapeFill = ctx.background === 'accent' ? INK : ctx.colors.accentHex;
  const tapeText = ctx.background === 'accent' ? PAPER : ctx.colors.onAccent;

  useEnter((tl, root, { at, calm }) => {
    const gears = Array.from(root.querySelectorAll<SVGGElement>('[data-gear]'));
    gears.forEach((g, i) => {
      const origin = `${g.dataset.cx} ${g.dataset.cy}`;
      tl.fromTo(g, { rotation: (i ? 1 : -1) * (calm ? 60 : 200), scale: 0.2, opacity: 0, svgOrigin: origin }, { rotation: 0, scale: 1, opacity: 1, svgOrigin: origin, duration: at(1.1), ease: BE.back }, at(0.1 + i * 0.18));
    });
    const titleFit = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleFit) tl.fromTo(titleFit, { '--casl': 0 }, { '--casl': 1, duration: at(1.5), ease: 'power2.out' }, at(0.3));
    const q = root.querySelector<HTMLElement>('[data-brb-char="0"]');
    const block = root.querySelector<HTMLElement>('[data-brb-char="1"]');
    restChars([q, block].filter((c): c is HTMLElement => !!c));
    rest(root, '[data-brb-spark]', { opacity: 0, scale: 1, rotation: 0 });
    if (q) {
      tl.fromTo(q, { y: calm ? -80 : -380, opacity: 0 }, { y: 0, opacity: 1, duration: at(0.8), ease: 'bounce.out' }, at(0.5));
      tl.add(charAnim.look(q, -0.6, -0.8, 0.3), at(1.3));
    }
    if (block) {
      tl.fromTo(block, { x: calm ? 80 : 360, rotation: calm ? 20 : 180, opacity: 0 }, { x: 0, rotation: 0, opacity: 1, duration: at(0.9), ease: 'power3.out' }, at(0.75));
      tl.add(charAnim.squash(block), at(1.6));
      tl.add(charAnim.look(block, -1, 0, 0.3), at(1.7));
    }
    const icon = root.querySelector('[data-el="status"] [data-pill-icon]');
    if (icon) tl.fromTo(icon, { rotation: -25 }, { rotation: 0, duration: at(0.9), ease: 'elastic.out(1, 0.35)' }, at(1.2));
    const track = root.querySelector('[data-tape-track]');
    if (track) tl.fromTo(track, { xPercent: 12 }, { xPercent: 0, duration: at(1.2), ease: BE.out }, at(0));
  });

  useIdle((root, { calm }) => {
    const anims: gsap.core.Animation[] = [];
    const stops: Array<() => void> = [];
    const gears = Array.from(root.querySelectorAll<SVGGElement>('[data-gear]'));
    gears.forEach((g, i) => {
      const origin = `${g.dataset.cx} ${g.dataset.cy}`;
      const period = (calm ? 1.6 : 1) * (i ? 9 : 14.4);
      anims.push(gsap.fromTo(g, { rotation: 0, svgOrigin: origin }, { rotation: i ? -360 : 360, svgOrigin: origin, duration: period, ease: 'none', repeat: -1 }));
    });
    const q = root.querySelector<HTMLElement>('[data-brb-char="0"]');
    const block = root.querySelector<HTMLElement>('[data-brb-char="1"]');
    [q, block].forEach((c, i) => {
      if (!c) return;
      stops.push(charAnim.blinkLoop(c));
      anims.push(...charAnim.idle(c, { calm, seed: i * 4 + 3 }));
    });
    if (q && block) {
      // Block hops over and bonks Q on the head, like that will fix it. Q is not impressed.
      const spark = root.querySelector<HTMLElement>('[data-brb-spark]');
      const dx = q.getBoundingClientRect().left - block.getBoundingClientRect().left;
      const scale = block.offsetWidth ? block.getBoundingClientRect().width / block.offsetWidth : 1;
      const reach = (dx / (scale || 1)) * 0.52;
      const bonk = gsap.timeline({ repeat: -1, repeatDelay: calm ? 6 : 4.2, delay: 1.2 });
      bonk
        .add(charAnim.squash(block), 0)
        .to(block, { x: reach * 0.7, y: calm ? -80 : -190, rotation: -24, duration: 0.32, ease: 'power2.out' }, 0.12)
        .to(block, { x: reach, y: calm ? -90 : -110, rotation: -12, duration: 0.14, ease: 'power2.in' }, 0.44)
        .add(charAnim.squash(q), 0.56)
        .to(q.querySelectorAll('.bc-eye'), { scaleY: 0.25, duration: 0.08, yoyo: true, repeat: 1, ease: 'power1.inOut' }, 0.56)
        .to(block, { x: 0, y: 0, rotation: 0, duration: 0.6, ease: 'back.out(1.6)' }, 0.62)
        .add(charAnim.look(q, 1, -0.4, 0.3), 1.1)
        .add(charAnim.look(q, -0.6, -0.8, 0.4), 2.4);
      if (spark) bonk.fromTo(spark, { scale: 0, opacity: 0, rotation: -30 }, { scale: 1, opacity: 1, rotation: 20, duration: 0.25, ease: BE.back }, 0.56).to(spark, { scale: 0.4, opacity: 0, duration: 0.3, ease: 'power2.in' }, 0.95);
      // The bonk works for a second: the big gear speeds up, then settles back.
      const spin = anims[0];
      if (spin) bonk.add(() => void gsap.to(spin, { timeScale: 3, duration: 0.25, yoyo: true, repeat: 1, ease: 'power2.inOut' }), 0.6);
      anims.push(bonk);
    }
    const dots = root.querySelectorAll('[data-status-dot]');
    if (dots.length) anims.push(gsap.fromTo(dots, { opacity: 0.2 }, { opacity: 1, duration: 0.5, ease: 'power1.inOut', stagger: { each: 0.3, repeat: -1, yoyo: true } }));
    const track = root.querySelector('[data-tape-track]');
    if (track) anims.push(gsap.fromTo(track, { xPercent: 0 }, { xPercent: -50, duration: calm ? 48 : 30, ease: 'none', repeat: -1 }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
    };
  });

  const gearBox = tape ? { x: 110, y: 610, w: 470, h: 400 } : { x: 1050, y: 120, w: 770, h: 620 };
  const charSize = tape ? 170 : 200;
  const charBoxes = tape
    ? [
        { x: 1360, y: 790, w: charSize, h: charSize },
        { x: 1600, y: 790, w: charSize, h: charSize },
      ]
    : [
        { x: 1180, y: 740, w: charSize, h: charSize },
        { x: 1470, y: 740, w: charSize, h: charSize },
      ];
  const floorBox = tape ? { x: 1320, y: 956, w: 500, h: 20 } : { x: 1120, y: 936, w: 640, h: 20 };
  // Two identical halves (the four shapes each) so the marquee loops without a seam.
  const tapeWords = Array.from({ length: 8 }, (_, i) => i);

  return (
    <>
      {tape ? (
        <El id="tape" label="Tape" box={{ x: -80, y: 130, w: 2080, h: 150 }} enter="wipe" order={0} locked>
          <div style={{ width: '100%', height: '100%', rotate: '-3deg', background: tapeFill, overflow: 'hidden', display: 'flex', alignItems: 'center', boxShadow: ctx.background === 'accent' ? undefined : `0 10px 0 ${ctx.colors.fg}` }}>
            <div data-tape-track="" style={{ display: 'flex', whiteSpace: 'nowrap', willChange: 'transform' }}>
              {tapeWords.map((i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 34, paddingRight: 34, ...fontStyle('display', { weight: 900, casl: 0.6, tracking: 0.02 }), fontSize: 76, color: tapeText, textTransform: 'uppercase', lineHeight: 1 }}>
                  {eyebrow}
                  <span style={{ width: 44, height: 44, display: 'block' }}>
                    <svg viewBox="0 0 46 46" width="44" height="44" aria-hidden="true">
                      <path d={SHAPE_PATHS_46[SHAPE_ORDER[i % 4]!]} fill={tapeText} />
                    </svg>
                  </span>
                </span>
              ))}
            </div>
          </div>
        </El>
      ) : (
        <El id="eyebrow" label="Eyebrow" box={{ x: 140, y: 250, w: 900, h: 56 }} enter="wipe" order={0}>
          <Eyebrow size={32} shape="square" color={ink.fg} style={{ textShadow: ink.shadow }}>
            {eyebrow}
          </Eyebrow>
        </El>
      )}
      <El id="gears" label="Gears" box={gearBox} enter="fade" order={1} lockAspect>
        <svg viewBox="0 0 770 620" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
          <Gear name="big" cx={306} cy={300} r={280} teeth={12} disc={disc} line={disc} hub={hub} />
          <Gear name="small" cx={628} cy={488} r={150} teeth={8} disc={disc} line={disc} hub={hub} />
        </svg>
      </El>
      <El id="title" label="Title" box={tape ? { x: 260, y: 330, w: 1400, h: 260 } : { x: 130, y: 318, w: 900, h: 230 }} align={tape ? 'center' : 'start'} enter="split-words" order={2}>
        <FitText max={tape ? 230 : 210} min={80} casl={1} lineHeight={0.9} valign={tape ? 'center' : 'start'} style={{ color: ink.fg, textShadow: ink.shadow }}>
          {title}
        </FitText>
      </El>
      {body ? (
        <El id="body" label="Line" box={tape ? { x: 360, y: 604, w: 1200, h: 90 } : { x: 140, y: 566, w: 880, h: 150 }} align={tape ? 'center' : 'start'} enter="rise" order={4}>
          <FitText max={tape ? 58 : 68} min={28} casl={0.4} weight={700} lineHeight={1.1} valign={tape ? 'center' : 'start'} style={{ color: ink.fg, textShadow: ink.shadow }}>
            {body}
          </FitText>
        </El>
      ) : null}
      {status ? (
        <El id="status" label="Status" box={tape ? { x: 560, y: 730, w: 800, h: 110 } : { x: 140, y: 770, w: 900, h: 110 }} align={tape ? 'center' : 'start'} valign="center" enter="pop" order={6}>
          <Pill icon={reason.sticker} bg={chip.fill} fg={chip.text} size={44} style={{ boxShadow: ctx.background === 'accent' || ctx.colors.dark ? undefined : `6px 6px 0 ${INK}` }}>
            <span style={{ display: 'inline-flex', alignItems: 'baseline' }}>
              {status}
              <span aria-hidden="true" style={{ display: 'inline-flex', marginLeft: 4 }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} data-status-dot="">
                    .
                  </span>
                ))}
              </span>
            </span>
          </Pill>
        </El>
      ) : null}
      {cast.length ? (
        <El id="floor" label="Floor" box={floorBox} enter="wipe" order={2} valign="center">
          <div style={{ width: '100%', height: 12, borderRadius: 12, background: ink.fg, opacity: 0.9, boxShadow: ink.shadow }} />
        </El>
      ) : null}
      {cast.map((s, i) => (
        <El key={s} id={`char-${i}`} label={i ? 'Second character' : 'Character'} box={charBoxes[i]!} enter="fade" order={3} lockAspect>
          <div data-brb-char={i} style={{ position: 'relative', width: '100%', height: '100%' }}>
            {i === 0 ? (
              <div data-brb-spark="" style={{ position: 'absolute', left: '58%', top: '-26%', width: '46%', height: '46%', opacity: 0 }}>
                <Sticker name="spark" />
              </div>
            ) : null}
            <BumperCharacter shape={s as ShapeName} color={charColor(ctx, s as ShapeName)} mood={i === 0 ? 'idle' : 'determined'} lookX={i === 0 ? -0.6 : -1} lookY={i === 0 ? -0.8 : 0} />
          </div>
        </El>
      ))}
    </>
  );
}

export default defineTemplate({
  kind: 'brb',
  background: 'graph',
  variants: [
    { key: 'tinker', label: 'Gears right, text left' },
    { key: 'tape', label: 'Tape across the top' },
  ],
  fields: [
    {
      key: 'reason',
      label: 'What happened',
      type: 'select',
      default: 'mic',
      tokens: false,
      options: (Object.keys(REASONS) as Reason[]).map((k) => ({ value: k, label: REASONS[k].label })),
    },
    f.eyebrow('Be right back'),
    f.title('Hang tight', 'Title', 60),
    f.body((ctx) => REASONS[reasonOf(ctx)].line, 'Line', 140),
    { key: 'status', label: 'Status', type: 'text', max: 40, default: (ctx) => REASONS[reasonOf(ctx)].status, group: 'options' },
  ],
  presets: (Object.keys(REASONS) as Reason[])
    .filter((k) => k !== 'other')
    .map((k) => ({ key: k, label: REASONS[k].label, description: REASONS[k].line, slide: { fields: { reason: k } } })),
  describe: (ctx) => `Be right back: ${REASONS[reasonOf(ctx)].label.toLowerCase()}`,
  headline: () => 'BRB',
  Render,
});
