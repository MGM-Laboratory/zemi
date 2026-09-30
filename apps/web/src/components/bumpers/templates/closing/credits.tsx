'use client';

import { SHAPE_ORDER, type BumperItem, type BumperTeamData, type ShapeName } from '@zemi/shared';
import type { CSSProperties } from 'react';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { PAPER } from '../../engine/palette';
import { eventNumberLabel } from '../../engine/resolve';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandShape } from '../../parts/shapes';
import { accentInk, charColor, restChars } from '../_tpl-mid-kit';
import { defineTemplate, Eyebrow, f, useMascots } from '../kit';

interface Credit {
  name: string;
  sub?: string | null;
}
interface Row {
  role: string;
  people: Credit[];
}
interface Section {
  title: string;
  rows: Row[];
}

const CREW_RE = /stream|camera|sound|audio|video|photo|crew|\bav\b|switcher|tech/i;
const HOST_RE = /\bhost\b|\bmc\b|emcee/i;
const SPEED: Record<string, number> = { slow: 42, normal: 64, fast: 96 };

/** Team members credited: the picked ones, else everyone published. */
function teamSource(ctx: ResolveCtx): BumperTeamData[] {
  return ctx.team.length ? ctx.team : Object.values(ctx.data.team);
}

/** Crew rows from the team when the slide has none of its own (camera, sound, stream people). */
function crewFallback(ctx: ResolveCtx): BumperItem[] {
  return teamSource(ctx)
    .filter((t) => t.role && CREW_RE.test(t.role))
    .map((t) => ({ id: `team-${t.id.slice(0, 20)}`, title: t.name, body: '', meta: t.role ?? 'Crew', icon: null, assetId: null, url: null }));
}

/** Everyone, in credit order: on stage (from the lineup), behind the scenes (team), then the crew (items). */
function creditSections(ctx: ResolveCtx): Section[] {
  const talks = ctx.flag('showTalks', true);
  const byRole = (role: string) => ctx.lineup.filter((p) => p.role === role);
  const stage: Row[] = [];
  const push = (role: string, list: typeof ctx.lineup, withTalk: boolean) => {
    if (list.length) stage.push({ role, people: list.map((p) => ({ name: p.name, sub: withTalk && talks ? p.talkTitle : null })) });
  };
  const keynotes = byRole('keynote');
  const speakers = byRole('speaker');
  push(keynotes.length > 1 ? 'Keynotes' : 'Keynote', keynotes, true);
  push(speakers.length > 1 ? 'Speakers' : 'Speaker', speakers, true);
  push('Panel', byRole('panelist'), false);
  push('Moderated by', byRole('moderator'), false);

  const ownCrew = ctx.slide.items.length > 0;
  const team = teamSource(ctx).filter((t) => ownCrew || !(t.role && CREW_RE.test(t.role)));
  const hosts = team.filter((t) => t.role && HOST_RE.test(t.role));
  const others = team.filter((t) => !hosts.includes(t));
  const behind: Row[] = [...hosts, ...others].map((t) => ({ role: t.role || 'Team', people: [{ name: t.name }] }));

  const crew: Row[] = [];
  ctx.items.forEach((it) => {
    if (!it.title) return;
    const role = it.meta || 'Crew';
    const last = crew[crew.length - 1];
    if (last && last.role === role) last.people.push({ name: it.title });
    else crew.push({ role, people: [{ name: it.title }] });
  });

  const out: Section[] = [];
  if (stage.length) out.push({ title: ctx.text('stageTitle'), rows: stage });
  if (behind.length) out.push({ title: ctx.text('teamTitle'), rows: behind });
  if (crew.length) out.push({ title: ctx.text('crewTitle'), rows: crew });
  return out;
}

function SectionHead({ title, color, size = 28, align = 'center' }: { title: string; color: string; size?: number; align?: 'center' | 'start' }) {
  return (
    <div data-credit-line="" style={{ display: 'flex', alignItems: 'center', justifyContent: align === 'center' ? 'center' : 'flex-start', gap: size * 0.7, ...fontStyle('mono', { weight: 700, tracking: 0.16 }), fontSize: size, color, textTransform: 'uppercase', lineHeight: 1 }}>
      <span style={{ width: size * 0.7, height: size * 0.7 }}>
        <BrandShape shape="circle" color={color} />
      </span>
      {title}
      <span style={{ width: size * 0.7, height: size * 0.7 }}>
        <BrandShape shape="square" color={color} />
      </span>
    </div>
  );
}

function CreditRow({ row, fg, fg2, shadow, scale = 1, stacked }: { row: Row; fg: string; fg2: string; shadow?: string; scale?: number; stacked?: 'start' | 'center' }) {
  return (
    <div data-credit-line="" style={stacked ? { display: 'flex', flexDirection: 'column', gap: 10 * scale, alignItems: stacked === 'center' ? 'center' : 'flex-start', textAlign: stacked === 'center' ? 'center' : 'left' } : { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 48 * scale, alignItems: 'baseline' }}>
      <div style={{ ...fontStyle('mono', { weight: 600, tracking: 0.12 }), fontSize: 24 * scale, color: fg2, textTransform: 'uppercase', textAlign: stacked ? 'inherit' : 'right', lineHeight: 1.3, paddingTop: stacked ? 0 : 6 * scale, textShadow: shadow }}>{row.role}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 * scale, alignItems: stacked === 'center' ? 'center' : undefined }}>
        {row.people.map((p, i) => (
          <div key={`${p.name}-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 * scale }}>
            <span style={{ ...fontStyle('display', { weight: 850, casl: 0.35, tracking: -0.02 }), fontSize: 60 * scale, lineHeight: 1.02, color: fg, textShadow: shadow }}>{p.name}</span>
            {p.sub ? <span style={{ ...fontStyle('body', { weight: 500 }), fontSize: 27 * scale, lineHeight: 1.3, color: fg2, maxWidth: 640 * scale, textShadow: shadow }}>{p.sub}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The last line with the crew sitting on it. */
function Outro({ text, url, cast, fg, fg2, shadow, size = 120, charSize = 130 }: { text: string; url: string; cast: ShapeName[]; fg: string; fg2: string; shadow?: string; size?: number; charSize?: number }) {
  const ctx = useSlide();
  return (
    <div data-credit-outro="" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
      {cast.length ? (
        <div style={{ display: 'flex', gap: charSize * 0.12, alignItems: 'flex-end', marginBottom: -size * 0.1 }}>
          {cast.map((s, i) => (
            <div key={s} data-credit-char="" style={{ width: charSize, height: charSize }}>
              <BumperCharacter shape={s} color={charColor(ctx, s)} mood={i === 2 ? 'wink' : 'happy'} lookX={0} lookY={0.4} />
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ ...fontStyle('display', { weight: 900, casl: 1, tracking: -0.035 }), fontSize: size, lineHeight: 0.95, color: fg, textAlign: 'center', textShadow: shadow, textWrap: 'balance' }}>{text}</div>
      {url ? <div style={{ ...fontStyle('mono', { weight: 700, tracking: 0.08 }), fontSize: size * 0.28, color: fg2, textShadow: shadow }}>{url}</div> : null}
    </div>
  );
}

/**
 * Rolling credits: everyone on stage (from the lineup), the team behind it and the crew (items),
 * rolling up slowly like the end of a film until the last line, where the crew sits and cheers.
 * Split puts the title and the crew on the left; board shows everything at once (and stands in
 * for the roll when motion is set to still).
 */
function Render() {
  const ctx = useSlide();
  const still = ctx.theme.motion === 'still';
  const variant = still ? 'board' : (ctx.slide.style.variant ?? 'roll');
  const split = variant === 'split';
  const board = variant === 'board';
  const cast = useMascots([...SHAPE_ORDER]) as ShapeName[];
  const sections = creditSections(ctx);
  const overCam = ctx.background === 'transparent';
  const fg = overCam ? PAPER : ctx.colors.fg;
  const fg2 = overCam ? 'rgba(255,255,255,0.86)' : ctx.colors.fg2;
  const shadow = overCam ? '0 2px 14px rgba(14,17,22,0.75)' : undefined;
  const accent = overCam ? PAPER : accentInk(ctx);
  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title');
  const subtitle = ctx.text('subtitle');
  const outro = ctx.text('outro');
  const url = ctx.site.shortUrl;
  const speed = (SPEED[ctx.text('speed')] ?? SPEED.normal!) * (ctx.theme.motion === 'calm' ? 0.8 : 1);
  const loop = ctx.flag('loop', false);

  useEnter((tl, root, { at, calm }) => {
    const track = root.querySelector<HTMLElement>('[data-credit-track]');
    if (track) tl.set(track, { y: 0, opacity: 1 }, 0);
    const view = root.querySelector<HTMLElement>('[data-credit-view]');
    const limit = view?.clientHeight ?? 1080;
    const lines = Array.from(root.querySelectorAll<HTMLElement>('[data-credit-track] [data-credit-line]')).filter((l) => l.offsetTop < limit);
    if (lines.length) tl.fromTo(lines, { y: calm ? 24 : 60, opacity: 0 }, { y: 0, opacity: 1, duration: at(0.8), ease: BE.out, stagger: at(0.08) }, at(0.25));
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-credit-char]'));
    restChars(chars);
    const side = root.querySelector('[data-credit-side]');
    if (side) {
      chars.forEach((c, i) => tl.fromTo(c, { y: calm ? -60 : -380, opacity: 0 }, { y: 0, opacity: 1, duration: at(0.7), ease: 'bounce.out' }, at(0.6 + i * 0.12)));
      const shelf = root.querySelector('[data-credit-shelf]');
      if (shelf) tl.fromTo(shelf, { scaleX: 0 }, { scaleX: 1, transformOrigin: '0% 50%', duration: at(0.8), ease: BE.out }, at(0.4));
    }
    if (board) {
      chars.forEach((c, i) => tl.add(charAnim.hop(c, { height: calm ? 8 : 20 }), at(1.2 + i * 0.1)));
    }
    const titleFit = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleFit) tl.fromTo(titleFit, { '--casl': 0 }, { '--casl': 1, duration: at(1.5), ease: 'power2.out' }, at(0.3));
  });

  useIdle((root, { calm }) => {
    const anims: gsap.core.Animation[] = [];
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-credit-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c));
    anims.push(...chars.flatMap((c, i) => charAnim.idle(c, { calm, seed: i * 2 })));
    const cheer = () => chars.forEach((c, i) => gsap.delayedCall(i * 0.08, () => void charAnim.cheer(c, { height: calm ? 12 : 26, spin: !calm && i % 2 === 1 })));
    const track = root.querySelector<HTMLElement>('[data-credit-track]');
    const view = root.querySelector<HTMLElement>('[data-credit-view]');
    const end = root.querySelector<HTMLElement>('[data-credit-track] [data-credit-outro]');
    if (track && view && end && !board) {
      // Roll until the last line sits in the middle of the window (layout px, not scaled).
      const distance = Math.max(0, end.offsetTop + end.offsetHeight / 2 - view.clientHeight / 2);
      if (distance > 8) {
        const roll = gsap.timeline({ repeat: loop ? -1 : 0, repeatDelay: 0, delay: 1.2 });
        roll.fromTo(track, { y: 0 }, { y: -distance, duration: distance / speed, ease: 'none' });
        roll.call(cheer);
        if (loop) roll.to(track, { opacity: 0, duration: 0.8, ease: 'power1.in' }, '+=7').set(track, { y: 0 }).to(track, { opacity: 1, duration: 0.8, ease: 'power1.out' });
        anims.push(roll);
      } else {
        anims.push(gsap.delayedCall(1.5, cheer));
      }
    }
    if (chars.length && (board || split)) {
      let n = 0;
      const hop = gsap.timeline({ repeat: -1, repeatDelay: 3.2 });
      hop.call(() => {
        const c = chars[n++ % chars.length];
        if (c) charAnim.hop(c, { height: calm ? 8 : 18 });
      });
      anims.push(hop);
    }
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
    };
  });

  const header = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, textAlign: 'center' }}>
      {eyebrow ? (
        <div data-credit-line="" style={{ ...fontStyle('mono', { weight: 700, tracking: 0.16 }), fontSize: 30, color: accent, textTransform: 'uppercase', textShadow: shadow }}>
          {eyebrow}
        </div>
      ) : null}
      <div data-credit-line="" style={{ ...fontStyle('display', { weight: 900, casl: 0.9, tracking: -0.035 }), fontSize: 112, lineHeight: 0.95, color: fg, maxWidth: 1400, textWrap: 'balance', textShadow: shadow }}>
        {title}
      </div>
      {subtitle ? (
        <div data-credit-line="" style={{ ...fontStyle('body', { weight: 500 }), fontSize: 36, color: fg2, textShadow: shadow }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );

  const list = (scale = 1, sectionGap = 110, stacked?: 'center') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: sectionGap * scale }}>
      {sections.map((sec) => (
        <div key={sec.title} style={{ display: 'flex', flexDirection: 'column', gap: 44 * scale }}>
          <SectionHead title={sec.title} color={accent} size={28 * scale} />
          {sec.rows.map((r, i) => (
            <CreditRow key={`${r.role}-${i}`} row={r} fg={fg} fg2={fg2} shadow={shadow} scale={scale} stacked={stacked} />
          ))}
        </div>
      ))}
    </div>
  );

  const mask = 'linear-gradient(to bottom, transparent 0, #000 120px, #000 calc(100% - 120px), transparent 100%)';

  if (board) {
    const rows = sections.flatMap((s) => s.rows);
    const people = rows.reduce((n, r) => n + r.people.length + (r.people.some((p) => p.sub) ? 0.6 : 0), 0) + sections.length;
    const cols = Math.min(3, Math.max(1, sections.length, people > 9 ? 3 : 1));
    const scale = cols === 3 ? 0.8 : 0.9;
    return (
      <>
        <El id="eyebrow" label="Eyebrow" box={{ x: 400, y: 104, w: 1120, h: 48 }} align="center" enter="wipe" order={0}>
          <Eyebrow size={28} shape="circle" color={fg}>
            {eyebrow}
          </Eyebrow>
        </El>
        <El id="title" label="Title" box={{ x: 160, y: 158, w: 1600, h: 128 }} align="center" enter="split-words" order={1}>
          <FitText max={104} min={48} casl={1} lineHeight={0.95} valign="center" style={{ color: fg, textShadow: shadow }}>
            {title}
          </FitText>
        </El>
        <El id="board" label="Credits" box={{ x: 180, y: 318, w: 1560, h: 480 }} enter="fade" order={2}>
          <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: 80, alignContent: 'start' }}>
            {Array.from({ length: cols }, (_, c) => (
              <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: 34 * scale }}>
                {sections
                  .filter((_, i) => (cols === 1 ? true : i % cols === c))
                  .map((sec) => (
                    <div key={sec.title} style={{ display: 'flex', flexDirection: 'column', gap: 30 * scale }}>
                      <SectionHead title={sec.title} color={accent} size={26 * scale} align="start" />
                      {sec.rows.map((r, i) => (
                        <CreditRow key={`${r.role}-${i}`} row={r} fg={fg} fg2={fg2} shadow={shadow} scale={scale * 0.82} stacked="start" />
                      ))}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </El>
        <El id="outro" label="Last line" box={{ x: 360, y: 800, w: 1200, h: 210 }} align="center" valign="end" enter="rise" order={4}>
          <Outro text={outro} url={url} cast={cast} fg={fg} fg2={fg2} shadow={shadow} size={70} charSize={96} />
        </El>
      </>
    );
  }

  if (split) {
    return (
      <>
        <El id="eyebrow" label="Eyebrow" box={{ x: 140, y: 214, w: 720, h: 56 }} enter="wipe" order={0}>
          <Eyebrow size={30} shape="circle" color={fg}>
            {eyebrow}
          </Eyebrow>
        </El>
        <El id="title" label="Title" box={{ x: 130, y: 286, w: 720, h: 380 }} enter="split-words" order={1}>
          <FitText max={120} min={56} casl={1} lineHeight={0.93} style={{ color: fg, textShadow: shadow }}>
            {title}
          </FitText>
        </El>
        {subtitle ? (
          <El id="subtitle" label="Event" box={{ x: 140, y: 680, w: 700, h: 90 }} enter="rise" order={2}>
            <FitText max={36} min={22} font="body" weight={500} lineHeight={1.3} style={{ color: fg2, textShadow: shadow }}>
              {subtitle}
            </FitText>
          </El>
        ) : null}
        {cast.length ? (
          <El id="cast" label="Characters" box={{ x: 140, y: 820, w: 640, h: 150 }} enter="fade" order={3} lockAspect>
            <div data-credit-side="" style={{ position: 'absolute', inset: 0 }}>
              <div data-credit-shelf="" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, borderRadius: 10, background: fg, opacity: 0.9 }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 10, display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                {cast.map((s, i) => (
                  <div key={s} data-credit-char="" style={{ width: 132, height: 132 }}>
                    <BumperCharacter shape={s} color={charColor(ctx, s)} mood={i === 2 ? 'wink' : 'happy'} lookX={0.8} lookY={-0.2} />
                  </div>
                ))}
              </div>
            </div>
          </El>
        ) : null}
        <El id="roll" label="Credits" box={{ x: 900, y: 0, w: 924, h: 1080 }} enter="fade" order={2}>
          <div data-credit-view="" style={{ position: 'absolute', inset: 0, overflow: 'hidden', maskImage: mask, WebkitMaskImage: mask } as CSSProperties}>
            <div data-credit-track="" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100%', padding: '150px 0', gap: 110, boxSizing: 'border-box' }}>
              {list(0.9, 100, 'center')}
              <Outro text={outro} url={url} cast={[]} fg={fg} fg2={fg2} shadow={shadow} size={84} />
            </div>
          </div>
        </El>
      </>
    );
  }

  return (
    <El id="roll" label="Credits" box={{ x: 110, y: 0, w: 1700, h: 1080 }} enter="fade" order={0}>
      <div data-credit-view="" style={{ position: 'absolute', inset: 0, overflow: 'hidden', maskImage: mask, WebkitMaskImage: mask } as CSSProperties}>
        <div data-credit-track="" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100%', padding: '160px 0', gap: 130, boxSizing: 'border-box' }}>
          {header}
          {list()}
          <Outro text={outro} url={url} cast={cast} fg={fg} fg2={fg2} shadow={shadow} />
        </div>
      </div>
    </El>
  );
}

export default defineTemplate({
  kind: 'credits',
  background: 'ink',
  variants: [
    { key: 'roll', label: 'Rolling, centered' },
    { key: 'split', label: 'Title left, rolling right' },
    { key: 'board', label: 'Everything at once' },
  ],
  fields: [
    f.eyebrow((ctx) => (ctx.event?.number != null ? `Zemi ${eventNumberLabel(ctx.event)} credits` : 'Credits')),
    f.title('Thanks for making today happen'),
    { ...f.subtitle((ctx) => ctx.event?.title ?? '', 'Under the title', 160), type: 'text' },
    { key: 'outro', label: 'Last line', type: 'text', max: 60, default: (ctx) => (ctx.nextEvent ? 'See you next Friday' : 'See you soon') },
    { key: 'stageTitle', label: 'Heading for the speakers', type: 'text', max: 40, default: 'On stage', group: 'options' },
    { key: 'teamTitle', label: 'Heading for the team', type: 'text', max: 40, default: 'Behind the scenes', group: 'options' },
    { key: 'crewTitle', label: 'Heading for the crew', type: 'text', max: 40, default: 'Crew', group: 'options' },
    {
      key: 'speed',
      label: 'Speed',
      type: 'select',
      default: 'normal',
      tokens: false,
      options: [
        { value: 'slow', label: 'Slow' },
        { value: 'normal', label: 'Normal' },
        { value: 'fast', label: 'Fast' },
      ],
      group: 'options',
    },
    { key: 'loop', label: 'Start over when it ends', type: 'toggle', default: false, group: 'options' },
    { key: 'showTalks', label: 'Show talk titles', type: 'toggle', default: true, group: 'options' },
  ],
  items: {
    label: 'Crew',
    itemLabel: 'Person',
    max: 30,
    fields: [
      { key: 'title', label: 'Name', type: 'text', placeholder: 'Their name' },
      { key: 'meta', label: 'Role', type: 'text', placeholder: 'Camera' },
    ],
    fallback: crewFallback,
  },
  sample: () => ({
    items: [
      { id: 'lab-crew-1', title: 'Rizky Hidayat', meta: 'Camera' },
      { id: 'lab-crew-2', title: 'Putri Anjani', meta: 'Sound' },
      { id: 'lab-crew-3', title: 'Galih Saputra', meta: 'Slides and switcher' },
    ],
  }),
  describe: (ctx) => {
    const n = creditSections(ctx).reduce((sum, s) => sum + s.rows.reduce((k, r) => k + r.people.length, 0), 0);
    return n ? `Credits, ${n} people` : 'Credits';
  },
  headline: () => 'Thank you',
  Render,
});
