'use client';

import { LINK_KINDS, SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46, type BumperItem, type BumperSiteData, type LinkItem, type LinkKind, type ShapeName } from '@zemi/shared';
import type { CSSProperties } from 'react';
import { useSlide } from '../engine/context';
import { fontStyle } from '../engine/fit-text';
import { gsap } from '../engine/gsap';
import { INK, INK_2, PAPER, SHAPE_ACCENT, type SlideColors } from '../engine/palette';
import { BrandQr, QR_TONES } from '../parts/qr';
import { BrandShape } from '../parts/shapes';
import { STICKERS, Sticker } from '../parts/stickers';

/**
 * Helpers shared by the closing and utility templates (next-event, closing, socials, section,
 * announcement, image, lower-third, custom, blank): colors that survive every background, the
 * QR card, social link glyphs and the confetti drizzle.
 */

/* ---------------------------------------------------------------- colors */

/** The slide paints on its own accent color. */
export const onAccentBg = (c: SlideColors) => c.bg === c.accentHex;

/** A fill that stands out on this background: the accent, or paper/ink when the slide is the accent. */
export const popFill = (c: SlideColors) => (onAccentBg(c) ? c.onAccent : c.accentHex);

/** Text that sits on `popFill`. */
export const onPop = (c: SlideColors) => (onAccentBg(c) ? c.accentHex : c.onAccent);

/** The accent as a text color that stays readable (yellow never on white, never accent on accent). */
export function accentText(c: SlideColors): string {
  if (onAccentBg(c)) return c.fg;
  if (c.dark) return c.accentHex;
  return c.accent === 'yellow' ? INK : c.accentDeep;
}

/** A physical paper object (card, ticket, calendar page): always white, with ink lines on light slides. */
export function paperObject(c: SlideColors): { fill: string; fg: string; fg2: string; border: string; shadow: string } {
  const accentBg = onAccentBg(c);
  return {
    fill: PAPER,
    fg: INK,
    fg2: INK_2,
    border: c.dark && !accentBg ? '#ffffff00' : INK,
    shadow: accentBg ? (c.accent === 'yellow' ? INK : c.accentDeep) : c.accentHex,
  };
}

/** A brand shape color that reads on this background (the shape matching the accent turns white on an accent slide, so its ink eyes still show). */
export function shapeTint(c: SlideColors, shape: ShapeName): string {
  return onAccentBg(c) && SHAPE_ACCENT[shape] === c.accent ? PAPER : SHAPE_COLORS[shape];
}

/* ---------------------------------------------------------------- QR card */

/**
 * A big scannable QR on its white plate with a label strip underneath, framed so it reads on
 * white paper too (ink border and an offset accent shadow). Fills its box width.
 */
export function QrCard({ value, label, sub, size }: { value: string; label?: string; sub?: string; size: number }) {
  const ctx = useSlide();
  const obj = paperObject(ctx.colors);
  const pad = Math.round(size * 0.02);
  return (
    <div
      data-qr-card=""
      style={{
        width: size,
        borderRadius: 30,
        background: obj.fill,
        border: `4px solid ${obj.border}`,
        boxShadow: `14px 14px 0 ${obj.shadow}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ width: size - 8, height: size - 8, padding: pad }}>
        <BrandQr value={value} style={ctx.theme.qrStyle} color={QR_TONES.ink} logo />
      </div>
      {label ? (
        <div style={{ borderTop: `3px dashed ${INK}33`, padding: '16px 24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ ...fontStyle('display', { weight: 850, casl: 0.6, tracking: -0.02 }), fontSize: Math.round(size * 0.085), lineHeight: 1.05, color: INK, textAlign: 'center' }}>{label}</span>
          {sub ? <span style={{ ...fontStyle('mono', { weight: 600, tracking: 0.04 }), fontSize: Math.round(size * 0.05), color: INK_2, textAlign: 'center' }}>{sub}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- socials */

export const SOCIAL_LABEL: Record<LinkKind, string> = {
  website: 'Website',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  scholar: 'Google Scholar',
  orcid: 'ORCID',
  researchgate: 'ResearchGate',
  x: 'X',
  instagram: 'Instagram',
  youtube: 'YouTube',
  email: 'Email',
  other: 'Link',
};

const isLinkKind = (v: unknown): v is LinkKind => typeof v === 'string' && (LINK_KINDS as readonly string[]).includes(v);

/** Guess a link kind from its address. */
export function socialKindFromUrl(url: string | null | undefined): LinkKind {
  const u = (url ?? '').toLowerCase();
  if (u.startsWith('mailto:') || /^[^/\s]+@[^/\s]+\.[a-z]+$/.test(u)) return 'email';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('github.com')) return 'github';
  if (u.includes('linkedin.com')) return 'linkedin';
  if (u.includes('twitter.com') || /(^|\/\/|\.)x\.com/.test(u)) return 'x';
  if (u.includes('scholar.google')) return 'scholar';
  if (u.includes('orcid.org')) return 'orcid';
  if (u.includes('researchgate.net')) return 'researchgate';
  return 'website';
}

/** "instagram.com/zemi.ac" to "@zemi.ac", "https://www.labmgm.org/" to "labmgm.org". */
export function socialHandle(url: string, kind: LinkKind): string {
  const raw = url.trim();
  if (kind === 'email') return raw.replace(/^mailto:/i, '');
  let host = '';
  let path = '';
  try {
    const u = new URL(/^[a-z]+:/i.test(raw) ? raw : `https://${raw}`);
    host = u.hostname.replace(/^www\./, '');
    path = u.pathname.replace(/\/+$/, '');
  } catch {
    return raw;
  }
  const seg = path.split('/').filter(Boolean);
  if ((kind === 'instagram' || kind === 'x' || kind === 'github') && seg[0]) return `@${seg[0].replace(/^@/, '')}`;
  if (kind === 'youtube' && seg[0]) return seg[0].startsWith('@') ? seg[0] : `${host}/${seg.join('/')}`;
  return path ? `${host}${path}` : host;
}

/** Social rows from the site settings (plus the contact email), as template items. */
export function siteSocialItems(site: BumperSiteData, withEmail = true): BumperItem[] {
  const rows: BumperItem[] = site.socials.map((l: LinkItem, i) => ({
    id: `social-${i}`,
    title: l.label?.trim() || socialHandle(l.url, l.kind),
    body: '',
    meta: SOCIAL_LABEL[l.kind],
    icon: l.kind,
    assetId: null,
    url: l.url,
  }));
  if (withEmail && site.email && !rows.some((r) => r.icon === 'email')) {
    rows.push({ id: 'social-mail', title: site.email, body: '', meta: 'Email', icon: 'email', assetId: null, url: `mailto:${site.email}` });
  }
  return rows;
}

/** The link kind an item stands for: its icon when that is a kind, else its address. */
export function itemKind(item: Pick<BumperItem, 'icon' | 'url' | 'title'>): LinkKind {
  if (isLinkKind(item.icon)) return item.icon;
  return socialKindFromUrl(item.url || item.title);
}

const G = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/** Simple line glyphs for link kinds (24 grid, currentColor). Not brand logos, just friendly hints. */
export function SocialGlyph({ kind, style }: { kind: LinkKind; style?: CSSProperties }) {
  let body;
  switch (kind) {
    case 'instagram':
      body = (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" {...G} />
          <circle cx="12" cy="12" r="4" {...G} />
          <circle cx="17" cy="7" r="1.2" fill="currentColor" />
        </>
      );
      break;
    case 'youtube':
      body = (
        <>
          <rect x="2.5" y="5.5" width="19" height="13" rx="4" {...G} />
          <path d="M10.2 9.2v5.6l4.8-2.8z" fill="currentColor" />
        </>
      );
      break;
    case 'x':
      body = <path d="M5 5l14 14M19 5L5 19" {...G} />;
      break;
    case 'linkedin':
      body = (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" {...G} />
          <path d="M8 10.5V16M8 7.6v.1M11.5 16v-5.5M11.5 13a2.5 2.5 0 0 1 5 0v3" {...G} />
        </>
      );
      break;
    case 'github':
      body = <path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.2 5l-2.4 14" {...G} />;
      break;
    case 'scholar':
      body = <path d="M2.5 9.5 12 4.5l9.5 5-9.5 5zM6.5 11.6v4.4c1.6 1.6 3.4 2.4 5.5 2.4s3.9-.8 5.5-2.4v-4.4M21.5 9.5v5" {...G} />;
      break;
    case 'orcid':
      body = (
        <>
          <circle cx="12" cy="12" r="9" {...G} />
          <path d="M8.6 10.4V16M8.6 7.6v.1M11.8 8v8h1.6a4 4 0 0 0 0-8z" {...G} />
        </>
      );
      break;
    case 'researchgate':
      body = <path d="M6 3.5h8.5l3.5 3.5v13.5H6zM9 11h6M9 14.5h6M9 18h3.5" {...G} />;
      break;
    case 'email':
      body = (
        <>
          <rect x="3" y="5.5" width="18" height="13" rx="3" {...G} />
          <path d="m4 7.5 8 6 8-6" {...G} />
        </>
      );
      break;
    case 'other':
      body = <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" {...G} />;
      break;
    default:
      body = (
        <>
          <circle cx="12" cy="12" r="9" {...G} />
          <path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" {...G} />
        </>
      );
  }
  return (
    <svg viewBox="0 0 24 24" style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible', ...style }} aria-hidden="true" data-glyph={kind}>
      {body}
    </svg>
  );
}

/** An item icon: a sticker key, a brand shape, or a link glyph. */
export function ItemIcon({ item, color }: { item: Pick<BumperItem, 'icon' | 'url' | 'title'>; color: string }) {
  const icon = item.icon ?? '';
  if (icon && STICKERS[icon]) return <Sticker name={icon} />;
  if ((SHAPE_ORDER as readonly string[]).includes(icon)) return <BrandShape shape={icon as ShapeName} color={color} />;
  return <SocialGlyph kind={itemKind(item)} style={{ color }} />;
}

/* ---------------------------------------------------------------- time */

/** "Today", "Tomorrow", "In 7 days" until an instant (Jakarta calendar days). */
export function daysUntilLabel(iso: string, now: number): string {
  const day = (t: number) => Math.floor((t + 7 * 3600_000) / 86_400_000);
  const d = day(Date.parse(iso)) - day(now);
  if (!Number.isFinite(d) || d < 0) return '';
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return `In ${d} days`;
}

/* ---------------------------------------------------------------- characters */

/**
 * Put character wrappers (and their inner groups) back to rest before an entrance is built, so a
 * replay that interrupted a roll, hop or blink never records a half-way pose as the end state.
 */
export function resetCast(chars: Iterable<Element>) {
  for (const c of chars) {
    gsap.set(c, { x: 0, y: 0, rotation: 0, scale: 1 });
    c.querySelectorAll('.bc-sway, .bc-jump').forEach((g) => gsap.set(g, { x: 0, y: 0, rotation: 0 }));
    c.querySelectorAll('.bc-body').forEach((g) => gsap.set(g, { scaleX: 1, scaleY: 1 }));
    c.querySelectorAll('.bc-eye').forEach((g) => gsap.set(g, { scaleY: 1 }));
  }
}

/* ---------------------------------------------------------------- confetti drizzle */

const SVGNS = 'http://www.w3.org/2000/svg';

/**
 * A slow, endless drizzle of brand-shape confetti falling from the top edge like paper (idle
 * loops). `tint` recolors a shape (for example white instead of the accent on an accent slide).
 * Returns a stop function that also removes every piece still falling.
 */
export function drizzle(root: HTMLElement, { calm = false, every = 0.5, tint }: { calm?: boolean; every?: number; tint?: (shape: ShapeName) => string } = {}): () => void {
  const box = document.createElement('div');
  box.setAttribute('data-drizzle', '');
  box.setAttribute('aria-hidden', 'true');
  // Behind the template elements (they sit at z-index 10+), so text always stays readable.
  box.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5';
  (root.querySelector('[data-content]') ?? root).appendChild(box);
  const live = new Set<gsap.core.Timeline>();
  let alive = true;
  let call: gsap.core.Tween | null = null;
  const spawn = () => {
    if (!alive) return;
    const shape = SHAPE_ORDER[Math.floor(Math.random() * SHAPE_ORDER.length)]!;
    const size = 18 + Math.random() * 18;
    const piece = document.createElementNS(SVGNS, 'svg');
    piece.setAttribute('viewBox', '0 0 46 46');
    piece.style.cssText = `position:absolute;left:${80 + Math.random() * 1760}px;top:-70px;width:${size}px;height:${size}px;overflow:visible`;
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', SHAPE_PATHS_46[shape]);
    path.setAttribute('fill', tint?.(shape) ?? SHAPE_COLORS[shape]);
    piece.appendChild(path);
    box.appendChild(piece);
    const dur = (calm ? 12 : 8.5) + Math.random() * 3;
    const side = Math.random() < 0.5 ? -1 : 1;
    const tl = gsap.timeline({
      onComplete: () => {
        piece.remove();
        live.delete(tl);
      },
    });
    tl.to(piece, { y: 1200, duration: dur, ease: 'none' }, 0);
    tl.to(piece, { x: side * (30 + Math.random() * 50), duration: dur / 3, ease: 'sine.inOut', yoyo: true, repeat: 2 }, 0);
    tl.to(piece, { rotation: side * (160 + Math.random() * 320), duration: dur, ease: 'none' }, 0);
    live.add(tl);
    call = gsap.delayedCall((calm ? every * 2 : every) * (0.6 + Math.random() * 0.8), spawn);
  };
  call = gsap.delayedCall(0.1, spawn);
  return () => {
    alive = false;
    call?.kill();
    live.forEach((tl) => tl.kill());
    live.clear();
    box.remove();
  };
}
