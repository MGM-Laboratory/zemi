import {
  safeLinkHref,
  safeWebUrl,
  sanitizeLinkList,
  SITE_DEFAULTS,
  SITE_SETTING_SCHEMAS,
  type PublicSite,
  type SiteSettingKey,
  type SiteSettings,
} from '@zemi/shared';

export const SITE_SETTING_KEYS = Object.keys(SITE_SETTING_SCHEMAS) as SiteSettingKey[];

export const SITE_SETTING_LABELS: Record<SiteSettingKey, string> = {
  general: 'general',
  seo: 'search and sharing',
  home: 'home page',
  about: 'about page',
  contact: 'contact page',
  email: 'email',
};

export function isSiteSettingKey(key: string): key is SiteSettingKey {
  return (SITE_SETTING_KEYS as string[]).includes(key);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Links saved before the safe-link checks, cleaned item by item so one bad link can't reset a whole
 * field to its default: unsafe socials are dropped, an unsafe announcement link or maps link becomes
 * null (the banner text stays). `labUrl` falls back to the default through the schema.
 */
function sanitizeStoredLinks(key: SiteSettingKey, candidate: Record<string, unknown>): Record<string, unknown> {
  const out = { ...candidate };
  if (key === 'contact') {
    if (Array.isArray(out.socials)) out.socials = sanitizeLinkList(out.socials as Array<{ url: string; kind?: string }>);
    if (typeof out.mapsUrl === 'string' && out.mapsUrl.trim() && !safeWebUrl(out.mapsUrl)) out.mapsUrl = null;
  }
  if (key === 'general' && isPlainObject(out.announcement)) {
    const href = out.announcement.href;
    if (typeof href === 'string' && href.trim() && !safeLinkHref(href, { relative: true })) {
      out.announcement = { ...out.announcement, href: null };
    }
  }
  return out;
}

/**
 * Stored value for one section merged over the rich defaults, then parsed with the section schema.
 *
 * The merge is shallow on purpose: a stored field replaces the default field as a whole, so an admin
 * who clears the home beats keeps an empty list. Fields added to the schema later are filled from
 * `SITE_DEFAULTS`. A stored field that no longer passes the schema is dropped (and falls back to the
 * default) instead of breaking the whole page.
 */
export function mergeSetting<K extends SiteSettingKey>(key: K, stored: unknown): SiteSettings[K] {
  const schema = SITE_SETTING_SCHEMAS[key];
  const defaults = SITE_DEFAULTS[key] as Record<string, unknown>;
  let candidate: Record<string, unknown> = sanitizeStoredLinks(key, { ...defaults, ...(isPlainObject(stored) ? stored : {}) });
  for (let attempt = 0; attempt < 5; attempt++) {
    const parsed = schema.safeParse(candidate);
    if (parsed.success) return parsed.data as SiteSettings[K];
    const bad = new Set(parsed.error.issues.map((i) => String(i.path[0] ?? '')).filter(Boolean));
    if (!bad.size) break;
    candidate = { ...candidate };
    for (const field of bad) {
      if (field in defaults) candidate[field] = defaults[field];
      else delete candidate[field];
    }
  }
  return schema.parse(defaults) as SiteSettings[K];
}

/** Every section, merged. `rows` is `site_settings` as `{ key, value }`. */
export function mergeAllSettings(rows: Array<{ key: string; value: unknown }>): SiteSettings {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<SiteSettingKey, unknown>;
  for (const key of SITE_SETTING_KEYS) out[key] = mergeSetting(key, byKey.get(key));
  return out as SiteSettings;
}

/** Settings as the public site may see them: no email section, no organizer notify list. */
export function publicSettings(all: SiteSettings): PublicSite['settings'] {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { email, contact, ...rest } = all;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { notifyEmails, ...publicContact } = contact;
  return { ...rest, contact: publicContact };
}

/** Top-level fields whose JSON differs between two values of a section (for audit summaries). */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).sort();
}
