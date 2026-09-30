'use client';

import type { BumperPublicationData, ImageRef } from '@zemi/shared';
import type { CSSProperties } from 'react';
import { useEnter, useIdle, useSlide } from '../../engine/context';
import { El } from '../../engine/element';
import { FitText, fontStyle } from '../../engine/fit-text';
import { gsap } from '../../engine/gsap';
import { ACCENT_HEX, GRAPH, INK, INK_3, PAPER, shapeForName } from '../../engine/palette';
import { isDefaultField } from '../../engine/resolve';
import type { ResolveCtx } from '../../engine/types';
import { BumperCharacter, charAnim } from '../../parts/character';
import { BumperAvatar, BumperImage } from '../../parts/shapes';
import { castIdle, charOutline, killAll, popSwatch, QrCard, qrCardHeight, usePrimedCast } from '../_tpl-talks-kit';
import { defineTemplate, f, useMascots } from '../kit';

/**
 * Paper: a publication on screen. A stack of sheets fans out and the top page writes itself
 * (title bars, a tiny bar chart, lines of text), Block (the data) climbs onto the stack, the
 * title lands, authors pop in as chips (today's speakers highlighted), the DOI scrambles into
 * place and a QR to the paper page sits bottom right.
 */

interface Author {
  name: string;
  avatar: ImageRef | null;
  speaker: boolean;
}

function authorsOf(ctx: ResolveCtx): Author[] {
  const pub = ctx.publication;
  if (!pub) return [];
  const today = new Set(ctx.lineup.map((p) => p.id));
  return pub.authors.map((a) => ({ name: a.name, avatar: a.avatar, speaker: !!a.speakerId && (today.size ? today.has(a.speakerId) : true) }));
}

function venueLine(pub: BumperPublicationData | null): string {
  if (!pub) return '';
  const year = pub.publishedYear != null ? String(pub.publishedYear) : '';
  const venue = pub.containerTitle ?? '';
  if (venue && year && venue.includes(year)) return venue;
  return [venue, year].filter(Boolean).join(', ');
}

const MAX_CHIPS = 4;
const SHEET = { w: 480, h: 650 };

/** The drawn stack of paper. The top page shows the cover when there is one, else a sketch of a paper. */
function Stack({ scale = 1, cover, venue }: { scale?: number; cover: ImageRef | null; venue: string }) {
  const ctx = useSlide();
  const w = SHEET.w * scale;
  const h = SHEET.h * scale;
  const line = (width: number, height: number, color: string, extra?: CSSProperties) => <div data-pp-line="" style={{ width: `${width}%`, height: height * scale, borderRadius: height * scale, background: color, transformOrigin: '0% 50%', ...extra }} />;
  const edge = `${Math.max(2, 3 * scale)}px solid ${INK}`;
  const sheet = (rot: number, dx: number, dy: number, key: string, tone: string) => (
    <div key={key} data-pp-sheet={key} style={{ position: 'absolute', left: dx, top: dy, width: w, height: h, borderRadius: 18 * scale, background: tone, border: edge, rotate: `${rot}deg`, boxShadow: ctx.colors.dark ? '0 20px 50px #00000066' : `0 ${10 * scale}px 0 #0e111614` }} />
  );
  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      {sheet(-7, -26 * scale, 22 * scale, 'back', '#f1f1ee')}
      {sheet(4.5, 22 * scale, 8 * scale, 'mid', '#f7f7f5')}
      <div data-pp-sheet="top" style={{ position: 'absolute', inset: 0, borderRadius: 18 * scale, background: PAPER, border: edge, rotate: '-1.5deg', overflow: 'hidden', backgroundImage: `linear-gradient(to right, ${GRAPH} 2px, transparent 2px), linear-gradient(to bottom, ${GRAPH} 2px, transparent 2px)`, backgroundSize: `${28 * scale}px ${28 * scale}px` }}>
        {cover ? (
          <BumperImage image={cover} width={w} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, padding: `${44 * scale}px ${40 * scale}px`, display: 'flex', flexDirection: 'column', gap: 14 * scale }}>
            <span data-pp-line="" style={{ ...fontStyle('mono', { weight: 700, tracking: 0.12 }), fontSize: 15 * scale, color: INK_3, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transformOrigin: '0% 50%' }}>{venue || 'Preprint'}</span>
            {line(92, 20, INK)}
            {line(78, 20, INK)}
            {line(55, 20, INK)}
            <div style={{ display: 'flex', gap: 10 * scale, alignItems: 'center', marginTop: 6 * scale }}>
              {[ACCENT_HEX.blue, ACCENT_HEX.red].map((c) => (
                <div key={c} data-pp-line="" style={{ width: 22 * scale, height: 22 * scale, borderRadius: 99, background: c }} />
              ))}
              {line(40, 10, '#c9ccd3')}
            </div>
            <div style={{ display: 'flex', gap: 22 * scale, marginTop: 14 * scale, alignItems: 'flex-end', height: 150 * scale, padding: `${16 * scale}px ${20 * scale}px 0`, borderRadius: 14 * scale, background: '#f7f7f5', border: `2px solid ${ctx.colors.line}` }}>
              {[
                [ACCENT_HEX.blue, 0.55],
                [ACCENT_HEX.red, 0.8],
                [ACCENT_HEX.yellow, 0.42],
                [ACCENT_HEX.green, 0.95],
              ].map(([c, v]) => (
                <div key={c as string} data-pp-bar="" style={{ flex: 1, height: `${(v as number) * 100}%`, borderRadius: `${8 * scale}px ${8 * scale}px 0 0`, background: c as string, transformOrigin: '50% 100%' }} />
              ))}
            </div>
            {[96, 88, 93, 70, 90, 60].map((wd, i) => (
              <div key={i}>{line(wd, 9, '#d8d8d2')}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AuthorChips({ authors, big }: { authors: Author[]; big: boolean }) {
  const ctx = useSlide();
  const pop = popSwatch(ctx);
  const shown = authors.slice(0, MAX_CHIPS);
  const more = authors.length - shown.length;
  const s = big ? 1 : 0.86;
  const chipBorder = ctx.colors.dark || ctx.background === 'accent' ? `3px solid ${ctx.colors.fg === INK ? '#0e111640' : '#ffffff40'}` : `3px solid ${INK}`;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 * s, alignContent: 'flex-start', width: '100%' }}>
      {shown.map((a, i) => (
        <span
          key={`${a.name}-${i}`}
          data-pp-chip=""
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 14 * s,
            padding: `${8 * s}px ${24 * s}px ${8 * s}px ${8 * s}px`,
            borderRadius: 999,
            background: a.speaker ? pop.fill : 'transparent',
            color: a.speaker ? pop.text : ctx.colors.fg,
            border: a.speaker ? `3px solid ${pop.fill}` : chipBorder,
            maxWidth: '100%',
          }}
        >
          <BumperAvatar image={a.avatar} name={a.name} clip={shapeForName(a.name)} size={52 * s} ring={a.speaker ? 3 : 0} ringColor={pop.text} />
          <span style={{ ...fontStyle('body', { weight: 700 }), fontSize: 30 * s, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
        </span>
      ))}
      {more > 0 ? (
        <span data-pp-chip="" style={{ display: 'inline-flex', alignItems: 'center', padding: `${8 * s}px ${22 * s}px`, borderRadius: 999, border: chipBorder, ...fontStyle('mono', { weight: 700 }), fontSize: 26 * s, color: ctx.colors.fg2 }}>
          +{more} more
        </span>
      ) : null}
    </div>
  );
}

function Render() {
  const ctx = useSlide();
  usePrimedCast();
  const pub = ctx.publication;
  const wide = ctx.slide.style.variant === 'wide';
  const cast = useMascots(['square']);
  const pop = popSwatch(ctx);
  const type = ctx.text('type');
  const title = ctx.text('title') || 'Pick a publication';
  const venue = ctx.text('venue');
  const doi = ctx.text('doi');
  const url = ctx.text('url');
  const qr = ctx.flag('showQr', true) && !!url;
  const qrLabel = ctx.text('qrLabel');
  const typedAuthors = isDefaultField(ctx.slide, 'authors') ? '' : ctx.text('authors');
  const authors = authorsOf(ctx);
  const pid = pub?.id ?? null;
  const QR = 380;
  const qrH = qrCardHeight(QR, !!qrLabel);

  useEnter((tl, root, { at, calm }) => {
    if (ctx.theme.motion === 'still') return;
    const sheets = Array.from(root.querySelectorAll<HTMLElement>('[data-pp-sheet]'));
    if (sheets.length) {
      tl.from(sheets, { y: 260, rotate: 0, opacity: 0, duration: at(0.95), ease: 'zemiOut', stagger: at(0.07) }, at(0));
      const top = sheets.find((s) => s.dataset.ppSheet === 'top');
      if (top && !calm) tl.fromTo(top, { scaleY: 0.94, scaleX: 1.04 }, { scaleY: 1, scaleX: 1, duration: at(0.6), ease: 'elastic.out(1, 0.45)', immediateRender: false }, at(0.85));
    }
    const lines = root.querySelectorAll('[data-pp-line]');
    if (lines.length) tl.from(lines, { scaleX: 0, duration: at(0.5), ease: 'zemiOut', stagger: at(0.035) }, at(0.55));
    const bars = root.querySelectorAll('[data-pp-bar]');
    if (bars.length) tl.from(bars, { scaleY: 0, duration: at(0.7), ease: 'back.out(1.6)', stagger: at(0.08) }, at(0.8));
    const chips = root.querySelectorAll('[data-pp-chip]');
    if (chips.length) tl.from(chips, { scale: 0.4, opacity: 0, duration: at(0.6), ease: 'back.out(1.7)', stagger: at(0.09) }, at(0.9));
    const titleEl = root.querySelector<HTMLElement>('[data-el="title"] [data-fit]');
    if (titleEl) tl.fromTo(titleEl, { '--casl': 0 }, { '--casl': 0.45, duration: at(1.4), ease: 'power2.out' }, at(0.5));
    const block = root.querySelector<HTMLElement>('[data-pp-block]');
    if (block) {
      tl.from(block, { y: -420, rotation: -25, duration: at(0.8), ease: 'bounce.out' }, at(1.05));
      tl.add(charAnim.squash(block), at(1.6));
      tl.add(charAnim.look(block, wide ? -0.8 : 1, -0.2, 0.35), at(1.95));
      if (!calm) tl.add(charAnim.hop(block, { height: 14 }), at(2.3));
    }
    const card = root.querySelector('[data-el="qr"] [data-qr-card]');
    if (card) tl.from(card, { rotate: -14, scale: 0.6, duration: at(0.9), ease: 'back.out(1.5)' }, at(0.95));
  });

  useIdle((root, { calm }) => {
    const block = root.querySelector<HTMLElement>('[data-pp-block]');
    const stop = block ? castIdle([block], calm, 4) : () => {};
    const glance = block ? gsap.timeline({ repeat: -1, repeatDelay: 4.5, delay: 2 }) : null;
    if (block && glance) {
      glance.add(charAnim.look(block, wide ? 0.9 : 1, 0.6, 0.4), 0);
      if (qr) glance.add(charAnim.look(block, 1, 0.9, 0.4), 1.6);
      glance.add(charAnim.look(block, 0, 0, 0.4), 3.2);
    }
    // The chart keeps "updating", like live data.
    const bars = Array.from(root.querySelectorAll<HTMLElement>('[data-pp-bar]'));
    const data = bars.map((b, i) =>
      gsap.to(b, { scaleY: () => 0.72 + Math.random() * 0.4, duration: 1.6 + i * 0.25, ease: 'sine.inOut', repeat: -1, repeatRefresh: true, yoyo: false, repeatDelay: 0.6, transformOrigin: '50% 100%' }),
    );
    const top = root.querySelector('[data-pp-sheet="top"]');
    const sway = top ? gsap.to(top, { rotate: calm ? -1 : -0.3, duration: 4.2, ease: 'sine.inOut', yoyo: true, repeat: -1 }) : null;
    const card = root.querySelector('[data-el="qr"] [data-qr-card]');
    const tilt = card ? gsap.to(card, { rotate: calm ? 0.8 : 1.6, y: calm ? -3 : -6, duration: 3.8, ease: 'sine.inOut', yoyo: true, repeat: -1 }) : null;
    return () => {
      stop();
      killAll([glance, sway, tilt, ...data]);
    };
  });

  const colW = wide ? 1180 : qr ? 560 : 1004;
  const stackBox = wide ? { x: 1480, y: 520, w: 340, h: 460 } : { x: 110, y: 170, w: 620, h: 800 };
  const stackScale = wide ? 0.62 : 1;
  const blockSize = wide ? 96 : 130;
  const showStack = !wide || !qr;
  return (
    <>
      {showStack ? (
        <El id="stack" label={pub?.cover ? 'Cover' : 'Paper stack'} box={stackBox} enter="fade" order={0} lockAspect>
          <div style={{ position: 'relative', paddingLeft: 40 * stackScale, paddingTop: 70 * stackScale }}>
            <Stack scale={stackScale} cover={pub?.cover ?? null} venue={venue} />
            {cast.length ? (
              <div data-pp-block="" style={{ position: 'absolute', width: blockSize, height: blockSize, left: 40 * stackScale + SHEET.w * stackScale - blockSize - 40 * stackScale, top: 70 * stackScale - blockSize + 6, zIndex: 3 }}>
                <BumperCharacter shape={cast[0]!} mood="happy" lookX={wide ? -0.6 : 0.8} lookY={0.2} style={charOutline(ctx, cast[0]!)} />
              </div>
            ) : null}
          </div>
        </El>
      ) : null}
      {type ? (
        <El id="type" label="Type" box={wide ? { x: 130, y: 150, w: 1200, h: 64 } : { x: 820, y: 170, w: 1004, h: 64 }} enter="pop" order={1}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: '10px 26px', borderRadius: 999, background: pop.fill, color: pop.text, ...fontStyle('mono', { weight: 700, tracking: 0.1 }), fontSize: 26, textTransform: 'uppercase', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{type}</span>
        </El>
      ) : null}
      <El id="title" label="Title" box={wide ? { x: 130, y: 236, w: 1660, h: 350 } : { x: 820, y: 256, w: 1004, h: qr ? 300 : 360 }} enter="split-lines" order={2} morph={pid ? `pub:${pid}:title` : null}>
        <FitText max={wide ? 124 : 92} min={44} casl={0.45} weight={900} lineHeight={0.98}>
          {title}
        </FitText>
      </El>
      {typedAuthors || authors.length ? (
        <El id="authors" label="Authors" box={wide ? { x: 130, y: 640, w: colW, h: 150 } : { x: 820, y: qr ? 610 : 650, w: colW, h: 170 }} enter="none" order={4}>
          {typedAuthors ? (
            <FitText max={36} min={22} font="body" weight={700} lineHeight={1.3}>
              {typedAuthors}
            </FitText>
          ) : (
            <AuthorChips authors={authors} big={!qr || wide} />
          )}
        </El>
      ) : null}
      {venue ? (
        <El id="venue" label="Venue and year" box={wide ? { x: 130, y: 820, w: colW, h: 60 } : { x: 820, y: 850, w: colW, h: 60 }} enter="rise" order={6}>
          <FitText max={40} min={24} font="body" weight={600} lineHeight={1.25} style={{ color: ctx.colors.fg2 }}>
            {venue}
          </FitText>
        </El>
      ) : null}
      {doi ? (
        <El id="doi" label="DOI" box={wide ? { x: 130, y: 900, w: colW, h: 50 } : { x: 820, y: 924, w: colW, h: 50 }} enter="scramble" order={8}>
          <FitText max={28} min={18} font="mono" weight={600} lineHeight={1.3} style={{ color: ctx.colors.fg2 }}>
            {doi}
          </FitText>
        </El>
      ) : null}
      {qr ? (
        <El id="qr" label="QR code" box={wide ? { x: 1424, y: 1016 - qrH, w: QR, h: qrH } : { x: 1444, y: 1016 - qrH, w: QR, h: qrH }} enter="fade" order={5} lockAspect morph={`qr:${url}`}>
          <QrCard value={url} size={QR} label={qrLabel} tilt={-2} />
          {wide && cast.length ? (
            <div data-pp-block="" style={{ position: 'absolute', width: blockSize, height: blockSize, right: 34, top: -blockSize + 8, zIndex: 3 }}>
              <BumperCharacter shape={cast[0]!} mood="happy" lookX={-0.6} lookY={0.3} style={charOutline(ctx, cast[0]!)} />
            </div>
          ) : null}
        </El>
      ) : null}
    </>
  );
}

export default defineTemplate({
  kind: 'paper',
  background: 'graph',
  variants: [
    { key: 'stack', label: 'Paper stack', hint: 'The paper on the left, title and authors right' },
    { key: 'wide', label: 'Big title', hint: 'The title across the top, QR bottom right' },
  ],
  fields: [
    { key: 'type', label: 'Type', type: 'text', max: 40, default: (ctx) => ctx.publication?.typeLabel ?? 'Paper' },
    f.title((ctx) => ctx.publication?.title ?? '', 'Title', 300),
    { key: 'authors', label: 'Authors', type: 'text', max: 300, default: (ctx) => (ctx.publication?.authors ?? []).map((a) => a.name).join(', '), hint: 'From the publication. Type to replace the chips with plain text.' },
    { key: 'venue', label: 'Venue and year', type: 'text', max: 160, default: (ctx) => venueLine(ctx.publication) },
    { key: 'doi', label: 'DOI', type: 'text', max: 160, default: (ctx) => (ctx.publication?.doi ? `doi.org/${ctx.publication.doi}` : ''), tokens: false },
    f.url((ctx) => ctx.publication?.url ?? '', 'Link for the QR code'),
    f.qrLabel(() => 'Read the paper'),
    f.showQr(true),
  ],
  describe: (ctx) => ctx.publication?.title ?? 'Paper',
  headline: () => 'The paper',
  Render,
});

