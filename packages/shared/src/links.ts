/**
 * Safe links. Every user-supplied URL we render as an `href` goes through `safeLinkHref`, on input
 * (zod refinements in the schemas) and on output (API mappers, for rows saved before the checks).
 *
 * Allowlist, not denylist: a scheme must be one we know. Anything with a control character is refused,
 * because browsers drop tabs and newlines before parsing (`java\tscript:` is `javascript:` to them).
 */

/** Schemes a rendered link may use. `tel:` is for phone and WhatsApp style links. */
export const SAFE_LINK_SCHEMES = ['http', 'https', 'mailto', 'tel'] as const;
export type SafeLinkScheme = (typeof SAFE_LINK_SCHEMES)[number];

/** Only web pages (maps links, the lab URL, publication URLs). */
export const WEB_LINK_SCHEMES: readonly SafeLinkScheme[] = ['http', 'https'];

export interface SafeLinkOptions {
  /** Allowed schemes. Default: http, https, mailto, tel. */
  schemes?: readonly SafeLinkScheme[];
  /** Also allow a site-relative path like `/events/zemi-98` (never `//host` or `/\host`). */
  relative?: boolean;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const BARE_EMAIL = /^[^\s@/:?#]+@[^\s@/:?#]+\.[^\s@/:?#]+$/;

/**
 * The trimmed link when it is safe to put in an `href`, else null.
 *
 *   safeLinkHref('https://labmgm.org')                 // 'https://labmgm.org'
 *   safeLinkHref('mailto:zemi@labmgm.org')             // kept
 *   safeLinkHref(' JaVaScRiPt:alert(1)')               // null
 *   safeLinkHref('/events/zemi-98', { relative: true }) // kept
 *   safeLinkHref('//evil.example', { relative: true })  // null
 */
export function safeLinkHref(raw: string | null | undefined, opts: SafeLinkOptions = {}): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 4096 || CONTROL.test(s)) return null;
  const m = SCHEME.exec(s);
  if (m) {
    const scheme = m[1]!.toLowerCase() as SafeLinkScheme;
    if (!(opts.schemes ?? SAFE_LINK_SCHEMES).includes(scheme)) return null;
    if (scheme === 'http' || scheme === 'https') return /^https?:\/\/[^/\\\s?#]/i.test(s) ? s : null;
    return s.length > m[0].length ? s : null;
  }
  if (opts.relative && /^\/(?![/\\])/.test(s)) return s;
  return null;
}

export const isSafeLinkHref = (raw: string | null | undefined, opts?: SafeLinkOptions): boolean => safeLinkHref(raw, opts) !== null;

/** A web page link (http or https) or null. For maps links, publication URLs and the like. */
export const safeWebUrl = (raw: string | null | undefined): string | null => safeLinkHref(raw, { schemes: WEB_LINK_SCHEMES });

/**
 * Keep only links that are safe to render (for rows saved before the input checks). An `email` link
 * saved as a bare address becomes `mailto:`, which is what the admin editor does on blur.
 */
export function sanitizeLinkList<T extends { url: string; kind?: string }>(links: readonly T[] | null | undefined): T[] {
  if (!Array.isArray(links)) return [];
  const out: T[] = [];
  for (const link of links) {
    if (!link || typeof link !== 'object' || typeof link.url !== 'string') continue;
    const raw = link.url.trim();
    const url = safeLinkHref(link.kind === 'email' && BARE_EMAIL.test(raw) ? `mailto:${raw}` : raw);
    if (url) out.push(url === link.url ? link : { ...link, url });
  }
  return out;
}

/** Friendly copy for a refused link. No dashes (DESIGN section 10). */
export const LINK_MESSAGE = 'Use a full link that starts with https:// (or mailto: for an email).';
export const WEB_LINK_MESSAGE = 'Use a full link that starts with https://';
export const HREF_MESSAGE = 'Use a full link that starts with https://, or a page on this site like /events.';
