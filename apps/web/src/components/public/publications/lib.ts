/**
 * Server-safe helpers for the publications pages. No React, no browser APIs.
 */
import {
  normalizeDoi,
  PUBLICATION_TYPE_LABELS,
  type Accent,
  type ImageRef,
  type PublicationCard,
  type PublicationDetail,
  type PublicationLinkKind,
  type PublicationStatus,
  type PublicationType,
  type ShapeName,
} from '@zemi/shared';
import { safeHref, siteUrl } from '@/components/public/speakers/lib';

/* ------------------------------------------------------------------ types and statuses */

export interface TypeLook {
  label: string;
  shape: ShapeName;
  /** Chip tone / accent. */
  tone: Accent;
  hex: string;
}

const HEX: Record<Accent, string> = {
  blue: '#3a6dc5',
  red: '#f94141',
  yellow: '#f7bf33',
  green: '#0f8657',
};
const SHAPE: Record<Accent, ShapeName> = {
  blue: 'circle',
  red: 'triangle',
  yellow: 'square',
  green: 'arch',
};

const TYPE_TONE: Record<PublicationType, Accent> = {
  'journal-article': 'blue',
  'conference-paper': 'red',
  preprint: 'yellow',
  thesis: 'green',
  book: 'blue',
  'book-chapter': 'blue',
  report: 'yellow',
  dataset: 'green',
  software: 'red',
  project: 'green',
  poster: 'yellow',
  article: 'red',
  other: 'blue',
};

export function typeLook(type: PublicationType): TypeLook {
  const tone = TYPE_TONE[type] ?? 'blue';
  return {
    label: PUBLICATION_TYPE_LABELS[type] ?? 'Paper',
    shape: SHAPE[tone],
    tone,
    hex: HEX[tone],
  };
}

/** Plural labels for the filter chips. */
export const TYPE_PLURAL: Record<PublicationType, string> = {
  'journal-article': 'Journal articles',
  'conference-paper': 'Conference papers',
  preprint: 'Preprints',
  thesis: 'Theses',
  book: 'Books',
  'book-chapter': 'Book chapters',
  report: 'Reports',
  dataset: 'Datasets',
  software: 'Software',
  project: 'Projects',
  poster: 'Posters',
  article: 'Articles',
  other: 'Other',
};

export const STATUS_LABEL: Record<PublicationStatus, string> = {
  published: 'Published',
  'in-press': 'In press',
  accepted: 'Accepted',
  'under-review': 'Under review',
  preprint: 'Preprint',
  'in-progress': 'In progress',
};

export const STATUS_TONE: Record<
  PublicationStatus,
  'green' | 'blue' | 'yellow' | 'outline' | 'neutral'
> = {
  published: 'green',
  'in-press': 'blue',
  accepted: 'green',
  'under-review': 'yellow',
  preprint: 'outline',
  'in-progress': 'yellow',
};

/** Friendlier status for a card: nothing for plain "published". */
export function statusNote(status: PublicationStatus): string | null {
  return status === 'published' ? null : STATUS_LABEL[status];
}

/* ------------------------------------------------------------------ dates and venues */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "12 March 2026", "March 2026", "2026", or null. */
export function publishedLabel(
  year: number | null,
  month?: number | null,
  day?: number | null,
): string | null {
  if (!year) return null;
  const m = month && month >= 1 && month <= 12 ? MONTHS[month - 1] : null;
  if (m && day) return `${day} ${m} ${year}`;
  if (m) return `${m} ${year}`;
  return String(year);
}

/** ISO-ish date for schema.org (`2026-03-12`, `2026-03`, `2026`). */
export function isoPublished(
  year: number | null,
  month?: number | null,
  day?: number | null,
): string | undefined {
  if (!year) return undefined;
  const p = (n: number) => String(n).padStart(2, '0');
  if (month && day) return `${year}-${p(month)}-${p(day)}`;
  if (month) return `${year}-${p(month)}`;
  return String(year);
}

/** Google Scholar wants `YYYY/MM/DD` (or `YYYY/MM`, `YYYY`). */
export function highwireDate(
  year: number | null,
  month?: number | null,
  day?: number | null,
): string | undefined {
  return isoPublished(year, month, day)?.replace(/-/g, '/');
}

export interface VenueParts {
  container: string | null;
  /** "12(2)", "12", "(2)". */
  volumeIssue: string | null;
  pages: string | null;
  publisher: string | null;
  date: string | null;
}

export function venueParts(
  p: Pick<
    PublicationDetail,
    | 'containerTitle'
    | 'volume'
    | 'issue'
    | 'pages'
    | 'publisher'
    | 'publishedYear'
    | 'publishedMonth'
    | 'publishedDay'
  >,
): VenueParts {
  const vol = p.volume?.trim();
  const iss = p.issue?.trim();
  const volumeIssue = vol && iss ? `${vol}(${iss})` : vol ? vol : iss ? `(${iss})` : null;
  const pages = p.pages?.trim() ? `pp. ${p.pages.trim().replace(/\s*[‐-―−]+\s*/g, '-')}` : null;
  return {
    container: p.containerTitle?.trim() || null,
    volumeIssue,
    pages,
    publisher:
      p.publisher?.trim() && p.publisher.trim() !== p.containerTitle?.trim()
        ? p.publisher.trim()
        : null,
    date: publishedLabel(p.publishedYear, p.publishedMonth, p.publishedDay),
  };
}

/** First and last page from "145-168" / "e1023". */
export function splitPages(pages: string | null | undefined): { first?: string; last?: string } {
  const s = (pages ?? '').replace(/^pp?\.\s*/i, '').trim();
  if (!s) return {};
  const [first, last] = s.split(/\s*[-‐-―−]+\s*/);
  return { first: first || undefined, last: last || undefined };
}

/* ------------------------------------------------------------------ identifiers and links */

export function doiUrl(doi: string | null | undefined): string | null {
  const d = normalizeDoi(doi);
  return d ? `https://doi.org/${d.split('/').map(encodeURIComponent).join('/')}` : null;
}

export function doiText(doi: string | null | undefined): string | null {
  return normalizeDoi(doi) || null;
}

export function arxivUrl(id: string | null | undefined): string | null {
  const s = (id ?? '').trim().replace(/^arxiv:\s*/i, '');
  return s ? `https://arxiv.org/abs/${encodeURIComponent(s).replace(/%2F/g, '/')}` : null;
}

/** Creative Commons license text ("CC BY-NC 4.0") to its deed URL. */
export function licenseUrl(license: string | null | undefined): string | null {
  const m = (license ?? '').trim().match(/^CC[\s-]+(BY(?:[\s-]+(?:NC|SA|ND))*|0)[\s-]*(\d\.\d)?$/i);
  if (!m) return null;
  const kind = m[1]!.toLowerCase().replace(/\s+/g, '-');
  if (kind === '0') return 'https://creativecommons.org/publicdomain/zero/1.0/';
  return `https://creativecommons.org/licenses/${kind}/${m[2] ?? '4.0'}/`;
}

/** "en" -> "English", "id" -> "Indonesian". Unknown codes pass through. */
export function languageName(code: string | null | undefined): string | null {
  const c = (code ?? '').trim();
  if (!c) return null;
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(c)) return c;
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(c) ?? c;
  } catch {
    return c;
  }
}

/**
 * The PDF on the site's own origin (`/media/...` is rewritten to the API). Same origin makes the
 * `download` attribute work, keeps the viewer iframe first-party, and puts `citation_pdf_url` on
 * the article's host as Google Scholar prefers.
 */
export function sitePdfPath(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/media/')) return `${u.pathname}${u.search}`;
    return safeHref(url);
  } catch {
    return url.startsWith('/media/') ? url : null;
  }
}

export function absoluteSiteUrl(pathOrUrl: string): string {
  return /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : siteUrl(pathOrUrl);
}

export const LINK_KIND_LABEL: Record<PublicationLinkKind, string> = {
  pdf: 'PDF',
  publisher: 'Publisher',
  code: 'Code',
  dataset: 'Dataset',
  slides: 'Slides',
  video: 'Video',
  poster: 'Poster',
  website: 'Website',
  other: 'Link',
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ filtering */

export type PubSort = 'newest' | 'oldest' | 'title';

/** Case-insensitive exact keyword match, like the API's `tag` filter. */
export function hasKeyword(p: Pick<PublicationCard, 'keywords'>, tag: string): boolean {
  const t = tag.trim().toLowerCase();
  return p.keywords.some((k) => k.trim().toLowerCase() === t);
}

/* ------------------------------------------------------------------ payload trimming */

/** Keep only the sources a small rendering needs (the list ships every card to the browser). */
export function slimImage(
  img: ImageRef | null,
  maxWidth: number,
  keepLqip = true,
): ImageRef | null {
  if (!img) return null;
  const pick = (list: ImageRef['avif']) => {
    const kept = list.filter((s) => s.width <= maxWidth);
    return kept.length ? kept : list.slice(0, 1);
  };
  return {
    ...img,
    avif: pick(img.avif ?? []),
    webp: pick(img.webp ?? []),
    lqip: keepLqip ? img.lqip : null,
  };
}

/** A PublicationCard trimmed for the client: tiny author avatars, preview-sized cover. */
export function slimCard(p: PublicationCard): PublicationCard {
  return {
    ...p,
    cover: slimImage(p.cover, 640),
    authors: p.authors.map((a) => ({ ...a, avatar: slimImage(a.avatar, 320, false) })),
  };
}
