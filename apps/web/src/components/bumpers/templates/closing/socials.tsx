'use client';

import { SHAPE_COLORS, SHAPE_ORDER, type BumperItem, type ShapeName } from '@zemi/shared';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { ACCENT_HEX, INK, INK_2, PAPER, SHAPE_ACCENT } from '../../engine/palette';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { ItemIcon, onAccentBg, paperObject, QrCard, resetCast, shapeTint, siteSocialItems, SOCIAL_LABEL, itemKind } from '../_tpl-end-kit';
import { defineTemplate, Eyebrow, f, useMascots } from '../kit';

/** Tile colors for the link icons: the brand shapes in turn (white on the slide's own accent). */
function tile(ctx: ResolveCtx, i: number, onCard = false): { bg: string; fg: string } {
  const shape: ShapeName = SHAPE_ORDER[i % SHAPE_ORDER.length]!;
  if (!onCard && onAccentBg(ctx.colors) && SHAPE_ACCENT[shape] === ctx.accent) return { bg: PAPER, fg: INK };
  return { bg: SHAPE_COLORS[shape], fg: shape === 'square' ? INK : PAPER };
}

const kindLabel = (it: BumperItem) => it.meta || SOCIAL_LABEL[itemKind(it)];

/**
 * Stay in touch: the site address huge with a highlighter swipe, the socials with friendly link
 * icons, and a QR to the site with a character sitting on it. A soft "ping" walks down the links
 * while it is on screen, and the character looks at each one. Cards: the links are dealt out as
 * a row of cards next to the QR.
 */
function Render() {
  const ctx = useSlide();
  const cards = ctx.slide.style.variant === 'cards';
  const cast = useMascots(['arch']);
  const links = ctx.items.filter((it) => it.title.trim()).slice(0, cards ? 3 : 5);
  const url = ctx.text('url');
  const showQr = ctx.flag('showQr', true) && !!url;
  const still = ctx.theme.motion === 'still';
  const obj = paperObject(ctx.colors);
  // DESIGN.md: the highlighter is a yellow swipe behind ink text; on dark and accent slides it turns translucent.
  const hl = onAccentBg(ctx.colors) ? (ctx.colors.dark ? '#ffffff38' : '#ffffff80') : ctx.colors.dark ? `${ctx.colors.accentHex}66` : ACCENT_HEX.yellow;

  useEnter((tl, root, { at, calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-so-char]'));
    resetCast(chars);
    const t = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (t) tl.fromTo(t, { '--casl': 0 }, { '--casl': 1, duration: at(1.5), ease: 'power2.out' }, at(0.35));
    if (still) return;
    const swipe = root.querySelector('[data-so-swipe]');
    if (swipe) tl.fromTo(swipe, { backgroundSize: '0% 100%' }, { backgroundSize: '100% 100%', duration: at(0.75), ease: 'zemiInOut' }, at(0.85));
    const tiles = root.querySelectorAll('[data-so-tile]');
    if (tiles.length) tl.fromTo(tiles, { rotation: -200, scale: 0.2 }, { rotation: 0, scale: 1, duration: at(0.7), ease: 'back.out(1.8)', stagger: at(0.1) }, at(cards ? 0.7 : 0.75));
    const dealt = root.querySelectorAll<HTMLElement>('[data-so-card]');
    dealt.forEach((c, i) => tl.fromTo(c, { y: 520, rotation: (i % 2 ? 1 : -1) * 18 }, { y: 0, rotation: 0, duration: at(0.8), ease: 'back.out(1.2)' }, at(0.3 + i * 0.12)));
    chars.forEach((c, i) => {
      tl.fromTo(c, { y: -560, rotation: -30 }, { y: 0, rotation: 0, duration: at(0.7), ease: 'bounce.out' }, at(1.05 + i * 0.12));
      tl.add(charAnim.squash(c), at(1.55 + i * 0.12));
      tl.add(charAnim.look(c, cards ? 0 : -1, 0.6, 0.35), at(1.9));
      if (!calm) tl.add(charAnim.hop(c, { height: 18 }), at(2.1 + i * 0.1));
    });
  });

  useIdle((root, { calm }) => {
    const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-so-char]'));
    const stops = chars.map((c) => charAnim.blinkLoop(c));
    const anims: gsap.core.Animation[] = chars.flatMap((c, i) => charAnim.idle(c, { calm, seed: i * 2 + 3 }));
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-so-row]'));
    if (rows.length) {
      // The ping: each link gets a turn, its icon hops and the character looks at it.
      const ping = gsap.timeline({ repeat: -1, repeatDelay: 1.2, delay: 1 });
      rows.forEach((row, i) => {
        const at = i * (calm ? 2.6 : 1.8);
        const icon = row.querySelector('[data-so-tile]');
        if (icon) ping.to(icon, { y: calm ? -6 : -14, rotation: (i % 2 ? 1 : -1) * 10, duration: 0.22, ease: 'power2.out', yoyo: true, repeat: 1 }, at);
        ping.to(row, { x: cards ? 0 : calm ? 6 : 14, y: cards ? (calm ? -8 : -18) : 0, duration: 0.3, ease: 'power2.out', yoyo: true, repeat: 1, repeatDelay: 0.5 }, at);
        chars.forEach((c) => {
          const r = row.getBoundingClientRect();
          const b = c.getBoundingClientRect();
          const dx = (r.left + r.width / 2 - (b.left + b.width / 2)) / Math.max(1, r.width + b.width);
          const dy = (r.top + r.height / 2 - (b.top + b.height / 2)) / Math.max(1, r.height * 3);
          ping.add(charAnim.look(c, Math.max(-1, Math.min(1, dx * 3)), Math.max(-1, Math.min(1, dy * 3)), 0.3), at);
        });
      });
      anims.push(ping);
    }
    const qr = root.querySelector('[data-el="qr"] [data-qr-card]');
    if (qr) anims.push(gsap.to(qr, { rotation: calm ? 0.6 : 1.4, duration: 3.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    return () => {
      stops.forEach((s) => s());
      anims.forEach((a) => a.kill());
    };
  });

  const eyebrow = ctx.text('eyebrow');
  const title = ctx.text('title');
  const subtitle = ctx.text('subtitle');
  const charSize = cast.length > 2 ? 104 : 150;
  const crew = cast.length ? (
    <div style={{ position: 'absolute', left: 0, right: 0, top: -charSize + 16, display: 'flex', justifyContent: 'center', gap: 12, zIndex: 2, pointerEvents: 'none' }}>
      {cast.map((s) => (
        <div key={s} data-so-char="" style={{ width: charSize, height: charSize }}>
          <BumperCharacter shape={s} color={shapeTint(ctx.colors, s)} mood="happy" lookX={cards ? 0 : -1} lookY={0.6} />
        </div>
      ))}
    </div>
  ) : null;
  const qrLabel = ctx.text('qrLabel');
  const qrSub = ctx.text('qrSub');

  if (cards) {
    const n = links.length + (showQr ? 1 : 0);
    const cardW = 380;
    const qrW = 404;
    const gap = 40;
    const total = links.length * cardW + (showQr ? qrW : 0) + Math.max(0, n - 1) * gap;
    const x0 = Math.round((1920 - total) / 2);
    const qrX = x0 + links.length * (cardW + gap);
    return (
      <>
        <El id="eyebrow" label="Eyebrow" box={{ x: 260, y: 140, w: 1400, h: 56 }} align="center" enter="wipe">
          <Eyebrow size={32}>{eyebrow}</Eyebrow>
        </El>
        <El id="title" label="Site address" box={{ x: 160, y: 206, w: 1600, h: 220 }} align="center" enter="split-chars" order={1}>
          <FitText max={200} min={80} casl={0} lineHeight={0.95} valign="center">
            {title}
          </FitText>
        </El>
        {subtitle ? (
          <El id="subtitle" label="Line" box={{ x: 260, y: 426, w: 1400, h: 60 }} align="center" enter="rise" order={3}>
            <FitText max={40} min={24} font="body" weight={600} lineHeight={1.25} style={{ color: ctx.colors.fg2 }}>
              {subtitle}
            </FitText>
          </El>
        ) : null}
        {links.map((it, i) => {
          const t = tile(ctx, i, true);
          const left = x0 + i * (cardW + gap);
          return (
            <El key={it.id} id={`link-${i}`} label={`Link ${i + 1}`} box={{ x: left, y: 590, w: cardW, h: 330 }} enter="fade" order={4 + i}>
              <div data-so-card="" style={{ width: '100%', height: '100%' }}>
                <div data-so-row="" style={{ width: '100%', height: '100%', borderRadius: 30, background: obj.fill, border: `4px solid ${obj.border}`, boxShadow: `12px 12px 0 ${obj.shadow}`, padding: '34px 30px 30px', display: 'flex', flexDirection: 'column', rotate: `${i % 2 ? 2 : -2}deg` }}>
                  <div data-so-tile="" style={{ width: 104, height: 104, borderRadius: 30, background: t.bg, color: t.fg, padding: 20, flex: 'none' }}>
                    <ItemIcon item={it} color={t.fg} />
                  </div>
                  <div style={{ marginTop: 'auto', height: 74, width: '100%' }}>
                    <FitText max={52} min={24} weight={850} casl={0.4} lineHeight={1.05} valign="end" style={{ color: INK }}>
                      {it.title}
                    </FitText>
                  </div>
                  <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.12 }), fontSize: 22, marginTop: 10, color: INK_2, textTransform: 'uppercase' }}>{kindLabel(it)}</span>
                </div>
              </div>
            </El>
          );
        })}
        {showQr ? (
          <El id="qr" label="QR code" box={{ x: qrX, y: 560, w: qrW, h: 456 }} enter="pop" order={4 + links.length} lockAspect morph={`qr:${url}`}>
            <div data-so-card="" style={{ position: 'relative' }}>
              {crew}
              <QrCard value={url} size={qrW - 14} label={qrLabel} sub={qrSub} />
            </div>
          </El>
        ) : null}
      </>
    );
  }

  const rowGap = links.length > 3 ? 18 : 26;
  const rowH = Math.min(116, Math.floor((470 - Math.max(0, links.length - 1) * rowGap) / Math.max(1, links.length)));
  return (
    <>
      <El id="eyebrow" label="Eyebrow" box={{ x: 130, y: 130, w: 1000, h: 56 }} enter="wipe">
        <Eyebrow size={32}>{eyebrow}</Eyebrow>
      </El>
      <El id="title" label="Site address" box={{ x: 116, y: 190, w: showQr ? 1180 : 1640, h: 240 }} enter="split-chars" order={1}>
        <FitText max={240} min={90} casl={0} lineHeight={0.95} valign="center">
          {title}
        </FitText>
        {/* The highlighter: a see-through copy of the address with a marker stripe that hugs the letters. */}
        <div style={{ position: 'absolute', inset: 0, zIndex: -1 }} aria-hidden="true">
          <FitText max={240} min={90} casl={0} lineHeight={0.95} valign="center" split={false} style={{ color: 'transparent' }}>
            <span data-so-swipe="" style={{ backgroundImage: `linear-gradient(transparent 56%, ${hl} 56%, ${hl} 90%, transparent 90%)`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', padding: '0 0.06em', margin: '0 -0.06em' }}>{title}</span>
          </FitText>
        </div>
      </El>
      {subtitle ? (
        <El id="subtitle" label="Line" box={{ x: 130, y: 434, w: showQr ? 1100 : 1600, h: 60 }} enter="rise" order={3}>
          <FitText max={42} min={24} font="body" weight={600} lineHeight={1.25} style={{ color: ctx.colors.fg2 }}>
            {subtitle}
          </FitText>
        </El>
      ) : null}
      {links.length ? (
        <El id="links" label="Links" box={{ x: 130, y: 540, w: showQr ? 1100 : 1600, h: 470 }} enter="fade" order={4}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: rowGap, width: '100%' }}>
            {links.map((it, i) => {
              const t = tile(ctx, i);
              return (
                <div key={it.id} data-so-row="" style={{ display: 'flex', alignItems: 'center', gap: 28, height: rowH }}>
                  <div data-so-tile="" style={{ width: rowH, height: rowH, borderRadius: rowH * 0.3, background: t.bg, color: t.fg, padding: rowH * 0.2, flex: 'none' }}>
                    <ItemIcon item={it} color={t.fg} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ height: rowH * 0.56 }}>
                      <FitText max={56} min={26} weight={850} casl={0.35} lineHeight={1.05} valign="end" balance={false} style={{ whiteSpace: 'nowrap' }}>
                        {it.title}
                      </FitText>
                    </div>
                    <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.12 }), fontSize: 20, color: ctx.colors.fg2, textTransform: 'uppercase' }}>{kindLabel(it)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </El>
      ) : null}
      {showQr ? (
        <El id="qr" label="QR code" box={{ x: 1360, y: 420, w: 464, h: 560 }} enter="pop" order={5} lockAspect morph={`qr:${url}`}>
          <div style={{ position: 'relative' }}>
            {crew}
            <QrCard value={url} size={450} label={qrLabel} sub={qrSub} />
          </div>
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'socials',
  background: 'paper',
  variants: [
    { key: 'list', label: 'Address and a list' },
    { key: 'cards', label: 'A row of cards' },
  ],
  fields: [
    f.eyebrow('Stay in touch'),
    f.title((ctx) => ctx.site.shortUrl, 'Site address', 80),
    f.subtitle((ctx) => ctx.site.tagline ?? 'Talks, papers and recordings, all in one place.', 'Line'),
    f.url((ctx) => ctx.site.webUrl),
    f.qrLabel('Come say hi'),
    { key: 'qrSub', label: 'Small print under the QR', type: 'text', max: 60, default: (ctx) => ctx.site.shortUrl },
    f.showQr(true),
  ],
  items: {
    label: 'Links',
    itemLabel: 'Link',
    max: 5,
    fields: [
      { key: 'title', label: 'Handle or address', type: 'text', placeholder: '@zemi.ac' },
      { key: 'meta', label: 'Label', type: 'text', placeholder: 'Instagram' },
      { key: 'url', label: 'Link', type: 'url', placeholder: 'https://instagram.com/zemi.ac' },
      { key: 'icon', label: 'Icon', type: 'icon' },
    ],
    fallback: (ctx) => siteSocialItems(ctx.site),
  },
  describe: () => 'Stay in touch',
  headline: (ctx) => ctx.site.shortUrl || 'Stay in touch',
  Render,
});
