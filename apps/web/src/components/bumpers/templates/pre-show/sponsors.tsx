'use client';

import { SHAPE_ORDER, type BumperItem, type ImageRef, type ShapeName } from '@zemi/shared';
import { useEnter, useIdle } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BrandShape, BumperImage } from '../../parts/shapes';
import { Sticker } from '../../parts/stickers';
import { defineTemplate, f, useMascots } from '../kit';
import { charColor, hashOf, Label, moves, plate, plateStyle, useOpenCtx, wordSafeMax, type Plate } from '../_tpl-open-kit';

/**
 * Thanks to: the people and places that make Fridays possible. Logos (item images or the
 * slide's images) flip in on white tiles; names without a logo are typeset as little
 * wordmarks. Idle: a soft shine sweeps across the tiles one by one while the crew takes turns
 * bowing, with a heart now and then.
 */

const MAX = 12;

interface Sponsor {
  id: string;
  name: string;
  tier: string;
  logo: ImageRef | null;
}

function fallbackSponsors(ctx: ResolveCtx): BumperItem[] {
  const ids = ctx.slide.refs.assetIds ?? [];
  if (ids.length) return ids.map((assetId, i) => ({ id: `logo-${i}`, title: '', body: '', meta: '', icon: null, assetId, url: null }));
  const host = ctx.site.labName || ctx.site.name;
  return host ? [{ id: 'host', title: host, body: '', meta: 'Hosted by', icon: null, assetId: null, url: null }] : [];
}

function useSponsors(): Sponsor[] {
  const { ctx } = useOpenCtx();
  return ctx.items
    .map((it) => ({ id: it.id, name: ctx.fill(it.title).trim(), tier: ctx.fill(it.meta).trim(), logo: it.assetId ? (ctx.data.images[it.assetId] ?? null) : null }))
    .filter((s) => s.name || s.logo)
    .slice(0, MAX);
}

/** One sponsor tile: the logo contained on white, or the name set as a small wordmark. */
function Tile({ s, w, h, p, big }: { s: Sponsor; w: number; h: number; p: Plate; big?: boolean }) {
  const { ctx } = useOpenCtx();
  const k = hashOf(s.id + s.name);
  const shape: ShapeName = SHAPE_ORDER[k % 4]!;
  const tierSize = big ? 26 : Math.max(16, Math.min(22, h * 0.1));
  const padX = big ? 40 : Math.max(18, h * 0.13);
  const textW = w - padX * 2 - (big ? 96 + 26 : Math.min(64, h * 0.3) + Math.max(10, h * 0.07)) - 8;
  // Logos are designed for white, so tiles stay white even on dark slides.
  const tile = p.dark ? { ...p, bg: '#ffffff', fg: '#0e1116', fg2: '#3b4150', border: '#ffffff' } : p;
  return (
    <div data-sp-tile="" style={{ position: 'relative', width: w, height: h }}>
      <div data-sp-face="" style={{ ...plateStyle(tile, { radius: big ? 34 : 26, lift: big ? 14 : 10, border: 3 }), position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: big ? `34px ${padX}px` : `${Math.max(14, h * 0.1)}px ${padX}px` }}>
        {s.tier ? (
          <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.14 }), fontSize: tierSize, textTransform: 'uppercase', color: tile.fg2, lineHeight: 1, flex: 'none' }}>{s.tier}</span>
        ) : null}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: big ? 26 : Math.max(10, h * 0.07), paddingTop: s.tier ? tierSize * 0.6 : 0 }}>
          {s.logo ? (
            <div style={{ width: '100%', height: '100%' }}>
              <BumperImage image={s.logo} width={w} fit="contain" alt={s.name} style={{ background: 'transparent' }} />
            </div>
          ) : (
            <>
              <div style={{ width: big ? 96 : Math.min(64, h * 0.3), height: big ? 96 : Math.min(64, h * 0.3), flex: 'none' }}>
                <BrandShape shape={shape} />
              </div>
              <div style={{ flex: 1, minWidth: 0, height: big ? '70%' : '78%' }}>
                <FitText max={wordSafeMax(s.name, textW, big ? 110 : Math.min(64, h * 0.3))} min={16} weight={900} casl={[0.1, 0.5, 0.9, 0.3][k % 4]!} lineHeight={0.95} valign="center" style={{ color: tile.fg }}>
                  {s.name}
                </FitText>
              </div>
            </>
          )}
        </div>
        <span data-sp-shine="" aria-hidden="true" style={{ position: 'absolute', top: -20, bottom: -20, left: 0, width: '38%', background: `linear-gradient(100deg, #ffffff00 0%, ${ctx.colors.accentSoft}00 25%, ${ctx.accent === 'yellow' ? '#fde7a6' : ctx.colors.accentSoft} 50%, #ffffff00 75%)`, mixBlendMode: 'multiply', transform: 'translateX(-120%) skewX(-12deg)', pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

function gridFor(n: number, areaW: number, areaH: number, gap: number) {
  // Balanced rows: 5 and 6 go 3 + 2 and 3 + 3, 7 and 8 go 4 + 3 and 4 + 4, 9 is 3 x 3.
  const cols = n <= 4 ? n : n <= 6 ? 3 : n <= 8 ? 4 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const w = (areaW - gap * (cols - 1)) / cols;
  const h = Math.min(rows === 1 ? 380 : 260, (areaH - gap * (rows - 1)) / rows);
  return { cols, rows, w: Math.min(w, rows === 1 && n <= 2 ? 640 : w), h };
}

function Crew({ cast }: { cast: ShapeName[] }) {
  const { ctx } = useOpenCtx();
  const size = cast.length > 2 ? 104 : 140;
  return (
    <div style={{ display: 'flex', gap: 22, alignItems: 'flex-end', justifyContent: 'flex-end', height: '100%' }}>
      {cast.map((s, i) => (
        <div key={s} data-sp-char="" style={{ position: 'relative', width: size, height: size }}>
          <BumperCharacter shape={s} mood={i % 2 ? 'happy' : 'idle'} color={charColor(ctx, s)} lookX={-0.6} lookY={0.4} name={`sponsors-${s}`} />
          <div data-sp-heart="" aria-hidden="true" style={{ position: 'absolute', left: size * 0.3, top: -size * 0.46, width: size * 0.4, height: size * 0.4, opacity: 0 }}>
            <Sticker name="heart" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Render() {
  const { ctx } = useOpenCtx();
  const feature = ctx.slide.style.variant === 'feature';
  const p = plate(ctx);
  const cast = useMascots([...SHAPE_ORDER]);
  const sponsors = useSponsors();
  const line = ctx.text('subtitle');
  const lead = feature ? sponsors[0] : undefined;
  const rest = feature ? sponsors.slice(1) : sponsors;

  useEnter((tl, root, { at, calm }) => {
    if (!moves(ctx)) return;
    const titleFit = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleFit) tl.fromTo(titleFit, { '--casl': 0 }, { '--casl': 0.9, duration: at(1.6), ease: 'power2.out' }, at(0.3));
    const tiles = root.querySelectorAll<HTMLElement>('[data-sp-face]');
    if (tiles.length) tl.fromTo(tiles, { rotationY: calm ? -35 : -95, transformPerspective: 1200, transformOrigin: '0% 50%', opacity: 0 }, { rotationY: 0, opacity: 1, duration: at(0.85), ease: BE.out, stagger: at(calm ? 0.1 : 0.08) }, at(0.45));
    root.querySelectorAll<HTMLElement>('[data-sp-char]').forEach((c, i) => {
      tl.fromTo(c, { y: calm ? 60 : 180, opacity: 0 }, { y: 0, opacity: 1, duration: at(0.6), ease: BE.back }, at(0.8 + i * 0.1));
      if (!calm) tl.add(charAnim.hop(c, { height: 16 }), at(1.45 + i * 0.08));
    });
  });

  useIdle((root, { calm }) => {
    const anims: gsap.core.Animation[] = [];
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-sp-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c));
    chars.forEach((c, i) => anims.push(...charAnim.idle(c, { calm, seed: i * 4 })));
    const shines = Array.from(root.querySelectorAll<HTMLElement>('[data-sp-shine]'));
    if (shines.length) {
      const sweep = gsap.timeline({ repeat: -1, repeatDelay: calm ? 3 : 1.8 });
      shines.forEach((s, i) => sweep.fromTo(s, { xPercent: -120 }, { xPercent: 260, duration: calm ? 1.6 : 1.1, ease: 'power1.inOut', immediateRender: false }, i * 0.28));
      anims.push(sweep);
    }
    // The crew takes turns bowing; a heart floats up now and then.
    let n = 0;
    const bow = gsap.delayedCall(2.4, function loop() {
      const c = chars[n % Math.max(1, chars.length)];
      n += 1;
      if (c) {
        charAnim.squash(c);
        charAnim.look(c, 0, 1, 0.25);
        gsap.delayedCall(0.9, () => charAnim.look(c, -0.6, 0.4, 0.4));
        const heart = c.querySelector('[data-sp-heart]');
        if (heart && n % 2 === 0) {
          gsap
            .timeline()
            .fromTo(heart, { y: 20, opacity: 0, scale: 0.4 }, { y: -10, opacity: 1, scale: 1, duration: 0.45, ease: BE.back })
            .to(heart, { y: -60, opacity: 0, duration: 0.9, ease: 'power1.in' });
        }
      }
      bow.restart(true);
    });
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
      bow.kill();
      shines.forEach((s) => gsap.set(s, { xPercent: -120 }));
    };
  });

  const titleBox = feature ? { x: 124, y: 164, w: 1100, h: 150 } : { x: 124, y: 170, w: 1100, h: 190 };
  const areaTop = feature ? 350 : 470;
  const areaH = 1000 - areaTop;
  return (
    <>
      <El id="eyebrow" label="Eyebrow" box={{ x: 130, y: feature ? 118 : 124, w: 900, h: 40 }} enter="wipe" order={0}>
        <Label color={ctx.colors.fg} bullet={ctx.background === 'accent' ? ctx.colors.onAccent : ctx.colors.accentHex} size={28}>
          {ctx.text('eyebrow')}
        </Label>
      </El>
      <El id="title" label="Title" box={titleBox} enter="split-words" order={1}>
        <FitText max={feature ? 140 : 164} min={60} casl={0} lineHeight={0.92} valign="end">
          {ctx.text('title')}
        </FitText>
      </El>
      {line ? (
        <El id="subtitle" label="Line" box={feature ? { x: 1240, y: 220, w: 560, h: 90 } : { x: 130, y: 372, w: 1100, h: 56 }} align={feature ? 'end' : 'start'} valign="end" enter="rise" order={3}>
          <FitText max={40} min={22} font="body" weight={600} lineHeight={1.2} style={{ color: ctx.colors.fg2 }}>
            {line}
          </FitText>
        </El>
      ) : null}
      {cast.length && !feature ? (
        <El id="cast" label="Characters" box={{ x: 1290, y: 214, w: 510, h: 180 }} enter="fade" order={2} lockAspect>
          <Crew cast={cast} />
        </El>
      ) : null}
      {lead ? (
        <El id="lead" label="Main sponsor" box={{ x: 130, y: areaTop, w: rest.length ? 700 : 1660, h: areaH - 20 }} enter="fade" order={2}>
          <Tile s={lead} w={rest.length ? 700 : 1660} h={areaH - 20} p={p} big />
        </El>
      ) : null}
      {rest.length ? (
        <El id="logos" label="Logos" box={feature ? { x: 890, y: areaTop, w: 910, h: areaH - 20 } : { x: 130, y: areaTop, w: 1660, h: areaH - 30 }} enter="fade" order={2}>
          <Grid list={rest} areaW={feature ? 910 : 1660} areaH={areaH - (feature ? 20 : 30)} p={p} feature={feature} />
        </El>
      ) : null}
    </>
  );
}

function Grid({ list, areaW, areaH, p, feature }: { list: Sponsor[]; areaW: number; areaH: number; p: Plate; feature: boolean }) {
  const gap = feature ? 26 : 34;
  const n = list.length;
  const g = feature ? { cols: n <= 3 ? 1 : 2, rows: Math.ceil(n / (n <= 3 ? 1 : 2)), w: 0, h: 0 } : gridFor(n, areaW, areaH, gap);
  const w = feature ? (areaW - gap * (g.cols - 1)) / g.cols : g.w;
  const h = feature ? Math.min(240, (areaH - gap * (g.rows - 1)) / g.rows) : g.h;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap, alignContent: feature ? 'flex-start' : 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
      {list.map((s) => (
        <Tile key={s.id} s={s} w={w} h={h} p={p} />
      ))}
    </div>
  );
}

export default defineTemplate({
  kind: 'sponsors',
  background: 'paper',
  timing: { autoAdvanceSec: 15 },
  variants: [
    { key: 'grid', label: 'Logo grid' },
    { key: 'feature', label: 'Host up front', hint: 'The first one big, everyone else beside it.' },
  ],
  fields: [f.eyebrow('With love from'), f.title('Thanks to'), f.subtitle('They keep the coffee flowing and the lights on.', 'Line')],
  items: {
    label: 'Sponsors and partners',
    itemLabel: 'Sponsor',
    max: MAX,
    fields: [
      { key: 'title', label: 'Name', type: 'text', placeholder: 'MGM Laboratory' },
      { key: 'meta', label: 'Role', type: 'text', placeholder: 'Host, venue, coffee...' },
      { key: 'assetId', label: 'Logo', type: 'image' },
    ],
    fallback: fallbackSponsors,
  },
  describe: (ctx) => {
    const n = ctx.items.length;
    return n ? `Thanks to (${n})` : 'Thanks to';
  },
  headline: () => 'Thank you',
  sample: () => ({
    items: [
      { id: 'demo-host', title: 'MGM Laboratory', meta: 'Host', body: '' },
      { id: 'demo-venue', title: 'FILKOM UB', meta: 'Venue', body: '' },
      { id: 'demo-coffee', title: 'Kopi Jumat', meta: 'Coffee', body: '' },
      { id: 'demo-club', title: 'Riset Bareng Malang', meta: 'Community', body: '' },
      { id: 'demo-data', title: 'Open Data Jatim', meta: 'Data partner', body: '' },
    ],
  }),
  Render,
});
