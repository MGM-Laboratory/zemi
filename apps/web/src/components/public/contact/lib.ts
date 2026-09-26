import { SITE_DEFAULTS, type LinkItem, type PublicSite } from '@zemi/shared';

export type PublicContact = PublicSite['settings']['contact'];

/** Only these schemes go into an href from admin free text. */
export const SAFE_HREF = /^(https?:|mailto:)/i;

/**
 * Contact settings with sensible fallbacks. When the API is down (`isFallback`), the rich shared
 * defaults stand in. Otherwise the stored values win, and only fields the page can't live without
 * (title, intro, topics, email) fall back when empty. An admin who clears the address keeps it cleared.
 */
export function resolveContact(site: PublicSite & { isFallback?: boolean }): PublicContact {
  const d = SITE_DEFAULTS.contact;
  const { notifyEmails: _n, ...defaults } = d;
  void _n;
  if (site.isFallback) return defaults;
  const c = site.settings.contact;
  return {
    ...c,
    title: c.title?.trim() || defaults.title,
    intro: c.intro?.trim() || defaults.intro,
    email: c.email?.trim() || defaults.email,
    topics: c.topics?.filter((t) => t.trim()).length ? c.topics.filter((t) => t.trim()) : defaults.topics,
    socials: (c.socials ?? []).filter((s) => SAFE_HREF.test(s.url)),
  };
}

/**
 * Pick the topic chip for `?topic=`. Accepts the exact label (any case) or a keyword:
 * `present` matches "I want to present", `collab` matches "Collaboration".
 */
export function matchTopic(topics: string[], param: string | undefined | null): string {
  const fallback = topics[topics.length - 1] ?? 'Something else';
  if (!param) return fallback;
  const q = param.trim().toLowerCase();
  if (!q) return fallback;
  return (
    topics.find((t) => t.toLowerCase() === q) ??
    topics.find((t) => t.toLowerCase().includes(q)) ??
    topics.find((t) => q.length >= 4 && t.toLowerCase().includes(q.slice(0, 5))) ??
    fallback
  );
}

/**
 * wa.me link from a free-text phone number. Strips everything but digits and turns a local
 * leading 0 into Indonesia's 62. Returns null when it doesn't look like a number.
 */
export function whatsappHref(raw: string | null | undefined, text = 'Hi Zemi! '): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** The stored maps link when it's a real URL, else a Google Maps search for the address. */
export function mapsHref(mapsUrl: string | null | undefined, address: string | null | undefined): string | null {
  if (mapsUrl && /^https?:\/\//i.test(mapsUrl)) return mapsUrl;
  if (address?.trim()) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
  return null;
}

export function safeLinks(links: LinkItem[] | null | undefined): LinkItem[] {
  return (links ?? []).filter((l) => SAFE_HREF.test(l.url));
}
