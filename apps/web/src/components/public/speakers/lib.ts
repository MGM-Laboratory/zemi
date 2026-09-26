/**
 * Server-safe helpers for the speakers pages (and reused by the publications pages).
 * No React, no browser APIs.
 */
import { SHAPE_COLORS, type LinkItem, type ShapeName } from '@zemi/shared';

/* ------------------------------------------------------------------ urls */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3300').replace(/\/+$/, '');

/** Absolute URL on the public site (JSON-LD, Highwire tags, canonical links). */
export function siteUrl(path = ''): string {
  return `${SITE}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Only http(s) and mailto links survive. Link fields are free text in the contract
 * (`z.string().min(1)`), so a `javascript:` URL could otherwise reach an href.
 */
export function safeHref(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  if (/^mailto:[^\s]+@[^\s]+$/i.test(s)) return s;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export const isHttp = (href: string) => /^https?:\/\//i.test(href);

/** First value of a Next `searchParams` entry, trimmed and capped. */
export function firstParam(v: string | string[] | undefined, max = 200): string | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s.slice(0, max) : undefined;
}

/** Serialize JSON-LD for a <script> tag. `<` is escaped so text can never close the tag. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/* ------------------------------------------------------------------ text */

/** Lowercase, accent-free text for forgiving search ("Nguyễn" matches "nguyen"). */
export function fold(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ------------------------------------------------------------------ portrait frames */

/**
 * Portrait masks. The photo sits inside one of these; a brand shape sits behind it.
 * Triangles make terrible portrait crops, so Hunch only ever appears as the backdrop.
 */
export type FrameShape = 'circle' | 'arch' | 'square' | 'drop';

export const FRAME_SHAPES: FrameShape[] = ['arch', 'circle', 'square', 'drop'];

/** 100x100 paths for each mask (also used as SVG clipPaths for the big portrait). */
export const FRAME_PATHS: Record<FrameShape, string> = {
  circle: 'M50 0 A50 50 0 1 1 49.99 0 Z',
  arch: 'M0 100 V50 A50 50 0 0 1 100 50 V100 Z',
  square: 'M22 0 H78 Q100 0 100 22 V78 Q100 100 78 100 H22 Q0 100 0 78 V22 Q0 0 22 0 Z',
  // A leaf / speech-bubble corner: three round corners and one sharp one.
  drop: 'M50 0 H100 V50 A50 50 0 0 1 50 100 A50 50 0 0 1 0 50 A50 50 0 0 1 50 0 Z',
};

/** CSS `mask-image` value for a frame (data URL, scales with the box). */
export function frameMask(shape: FrameShape): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${FRAME_PATHS[shape]}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const BACKDROPS: ShapeName[] = ['triangle', 'circle', 'square', 'arch'];

export interface SpeakerLook {
  frame: FrameShape;
  backdrop: ShapeName;
  color: string;
  /** Backdrop resting rotation, degrees. */
  tilt: number;
  /** Backdrop offset, % of the frame. */
  dx: number;
  dy: number;
}

/**
 * The frame shape and backdrop for a person. Stable per slug (same person, same look
 * everywhere). `deal` re-rolls the backdrop for the shuffle button, never the frame.
 */
export function speakerLook(slug: string, deal = 0): SpeakerLook {
  const h = hashString(slug);
  const d = deal ? hashString(`${slug}:${deal}`) : h;
  const frame = FRAME_SHAPES[h % FRAME_SHAPES.length]!;
  let backdrop = BACKDROPS[(d >>> 3) % BACKDROPS.length]!;
  // Avoid a circle behind a circle: it reads as a ring, not a toy block.
  if (backdrop === 'circle' && frame === 'circle') backdrop = 'triangle';
  const tilt = ((d >>> 7) % 31) - 15;
  const corner = (d >>> 11) % 4;
  const dx = corner === 0 || corner === 3 ? -9 : 9;
  const dy = corner < 2 ? -8 : 8;
  return { frame, backdrop, color: SHAPE_COLORS[backdrop], tilt, dx, dy };
}

/* ------------------------------------------------------------------ people */

export const ROLE_LABEL: Record<string, string> = {
  speaker: 'Speaker',
  keynote: 'Keynote',
  moderator: 'Moderator',
  panelist: 'Panelist',
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

/** "PhD candidate at MGM Laboratory" / "MGM Laboratory" / null. */
export function positionLine(
  position: string | null | undefined,
  org: string | null | undefined,
): string | null {
  const p = position?.trim();
  const o = org?.trim();
  if (p && o) return `${p} at ${o}`;
  return p || o || null;
}

/** People who work at the lab itself (for the "From the lab" filter). */
export function isLabOrg(org: string | null | undefined): boolean {
  return /\bmgm\b/i.test(org ?? '');
}

/** Social links first by usefulness, email last. Unsafe URLs dropped. */
export function publicLinks(links: LinkItem[]): Array<LinkItem & { href: string }> {
  const order = [
    'website',
    'scholar',
    'orcid',
    'researchgate',
    'github',
    'linkedin',
    'x',
    'instagram',
    'youtube',
    'other',
    'email',
  ];
  return links
    .map((l) => {
      const href = safeHref(
        l.kind === 'email' && !/^mailto:/i.test(l.url) ? `mailto:${l.url}` : l.url,
      );
      return href ? { ...l, href } : null;
    })
    .filter((l): l is LinkItem & { href: string } => l !== null)
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

export function talkWord(n: number): string {
  return n === 1 ? '1 talk' : `${n} talks`;
}
