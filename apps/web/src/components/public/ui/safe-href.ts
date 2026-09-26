import { safeLinkHref } from '@zemi/shared';

/**
 * Links typed into the admin (socials, team links, lab URL, footer links) are free text. Only
 * http(s), mailto and tel may ever reach an `href` on the public site. The rule itself lives in
 * `@zemi/shared` (`safeLinkHref`, also used by the API on input and output); this file adds the
 * bits the public pages need on top: dedupe, "opens in a new tab", a comparison key.
 */

/**
 * The trimmed href when `raw` is an absolute http(s), mailto or tel URL, else null. Refuses
 * control characters (`java\tscript:`), protocol-relative `//host` and relative paths.
 *
 * @example safeHref(' https://labmgm.org ') // 'https://labmgm.org'
 * @example safeHref('javascript:alert(1)') // null
 */
export function safeHref(raw: string | null | undefined): string | null {
  return safeLinkHref(raw);
}

/** True for http(s) links, which open in a new tab. mailto and tel stay in place. */
export function isExternalHref(href: string): boolean {
  return /^https?:/i.test(href);
}

/** Keeps items whose `url` is safe (trimmed). Order is kept, duplicates dropped. */
export function safeLinkItems<T extends { url: string }>(items: readonly T[] | null | undefined): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items ?? []) {
    const href = safeHref(item.url);
    if (!href) continue;
    const key = linkKey(href);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, url: href });
  }
  return out;
}

/** A comparison key for "is this the same link": scheme and `www.` dropped, no trailing slash. */
export function linkKey(href: string): string {
  return href
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/[/?#]+$/, '');
}
