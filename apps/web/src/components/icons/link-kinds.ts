import { LINK_KINDS, type LinkKind } from '@zemi/shared';

/** Human labels for LINK_KINDS (select options, aria labels, public link lists). */
export const LINK_KIND_LABELS: Record<LinkKind, string> = {
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

export { LINK_KINDS, type LinkKind };

const HOSTS: Array<[RegExp, LinkKind]> = [
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, 'linkedin'],
  [/(^|\.)github\.com$|(^|\.)github\.io$/, 'github'],
  [/^scholar\.google\./, 'scholar'],
  [/(^|\.)orcid\.org$/, 'orcid'],
  [/(^|\.)researchgate\.net$/, 'researchgate'],
  [/(^|\.)(x|twitter)\.com$/, 'x'],
  [/(^|\.)instagram\.com$|(^|\.)instagr\.am$/, 'instagram'],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'youtube'],
];

const ORCID_ID = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Guess the link kind from a pasted URL (or email / bare ORCID iD).
 * @example detectLinkKind('https://www.linkedin.com/in/rani') // 'linkedin'
 */
export function detectLinkKind(raw: string): LinkKind {
  const s = raw.trim();
  if (!s) return 'website';
  if (s.startsWith('mailto:') || EMAIL.test(s)) return 'email';
  if (ORCID_ID.test(s)) return 'orcid';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    for (const [re, kind] of HOSTS) if (re.test(host)) return kind;
    return 'website';
  } catch {
    return 'other';
  }
}

/**
 * Normalize what people paste: add https://, turn emails into mailto:, ORCID iDs into URLs.
 * @example normalizeLinkUrl('email', 'hi@labmgm.org') // 'mailto:hi@labmgm.org'
 */
export function normalizeLinkUrl(kind: LinkKind, raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (kind === 'email') return s.startsWith('mailto:') ? s : `mailto:${s}`;
  if (kind === 'orcid' && ORCID_ID.test(s)) return `https://orcid.org/${s.toUpperCase()}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  return `https://${s}`;
}

/** Short display text for a link: host + path without protocol, or the email address. */
export function linkDisplay(url: string): string {
  if (url.startsWith('mailto:')) return url.slice(7);
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}
