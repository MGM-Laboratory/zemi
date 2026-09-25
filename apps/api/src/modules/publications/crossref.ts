import { HttpStatus } from '@nestjs/common';
import { normalizeDoi, type DoiLookupResult, type PublicationType } from '@zemi/shared';
import { AppError, notFound, serviceUnavailable, unprocessable } from '../../common/errors.js';

/**
 * Crossref prefill for the publication form (GET /admin/publications/doi?doi=).
 * `fetchCrossrefWork` does the HTTP call; `mapCrossrefWork` is pure (tested in crossref.spec.ts).
 */

export const CROSSREF_USER_AGENT = 'Zemi (mailto:zemi@labmgm.org)';
const TIMEOUT_MS = 8000;

/** "https://doi.org/10.1/X", "doi: 10.1/X", "10.1/X" -> "10.1/X"; null when it can't be a DOI. */
export function parseDoiInput(raw: string | null | undefined): string | null {
  let s = (raw ?? '').trim();
  try {
    if (/%[0-9a-f]{2}/i.test(s)) s = decodeURIComponent(s);
  } catch {
    // keep as typed
  }
  s = normalizeDoi(s).replace(/^https?:\/\/(www\.)?doi\.org\//i, '');
  return /^10\.\d{4,9}\/\S+$/.test(s) ? s : null;
}

/** The bits of a Crossref work we read. Everything is optional because Crossref is inconsistent. */
export interface CrossrefWork {
  type?: string;
  subtype?: string;
  title?: string[];
  subtitle?: string[];
  'container-title'?: string[];
  'short-container-title'?: string[];
  volume?: string;
  issue?: string;
  page?: string;
  'article-number'?: string;
  publisher?: string;
  issued?: CrossrefDate;
  'published-print'?: CrossrefDate;
  'published-online'?: CrossrefDate;
  published?: CrossrefDate;
  approved?: CrossrefDate;
  created?: CrossrefDate;
  ISSN?: string[];
  ISBN?: string[];
  URL?: string;
  resource?: { primary?: { URL?: string } };
  abstract?: string;
  language?: string;
  license?: Array<{ URL?: string; 'content-version'?: string }>;
  institution?: Array<{ name?: string }>;
  event?: { name?: string };
  author?: Array<{
    given?: string;
    family?: string;
    name?: string;
    ORCID?: string;
    affiliation?: Array<{ name?: string }>;
  }>;
}
interface CrossrefDate {
  'date-parts'?: Array<Array<number | null>>;
}

const TYPE_MAP: Record<string, PublicationType> = {
  'journal-article': 'journal-article',
  'proceedings-article': 'conference-paper',
  'posted-content': 'preprint',
  book: 'book',
  monograph: 'book',
  'edited-book': 'book',
  'reference-book': 'book',
  'book-set': 'book',
  'book-series': 'book',
  'book-chapter': 'book-chapter',
  'book-section': 'book-chapter',
  'book-part': 'book-chapter',
  'reference-entry': 'book-chapter',
  dissertation: 'thesis',
  report: 'report',
  'report-component': 'report',
  'report-series': 'report',
  dataset: 'dataset',
  database: 'dataset',
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: ' - ' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** House rule: no en or em dashes in anything we write. Imported text gets plain hyphens. */
function dehyphenate(s: string): string {
  return s.replace(/\s*\u2014\s*/g, ' - ').replace(/\u2013/g, '-');
}

/** Inline markup (<i>, <sub>, <mml:math>...) out of a title, entities decoded, whitespace collapsed. */
export function cleanInline(s: string | null | undefined): string {
  if (!s) return '';
  return dehyphenate(decodeEntities(s.replace(/<[^>]+>/g, '')))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * JATS abstract to plain text: drops a leading "Abstract" heading, keeps paragraph breaks
 * (blank line between <jats:p>), strips every other tag.
 */
export function cleanAbstract(s: string | null | undefined): string {
  if (!s) return '';
  let t = s.replace(/<(jats:)?title[^>]*>\s*(abstract|summary|abstrak)\s*[:.]?\s*<\/(jats:)?title>/gi, '');
  t = t.replace(/<\/(jats:)?(p|sec|title)>/gi, '\n\n').replace(/<(jats:)?break\s*\/?>/gi, '\n');
  t = decodeEntities(t.replace(/<[^>]+>/g, ''));
  return dehyphenate(t)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .replace(/^(abstract|summary|abstrak)\s*[:.]?\s+/i, '');
}

const first = (a: string[] | undefined) => (Array.isArray(a) ? a.find((x) => typeof x === 'string' && x.trim()) : undefined);
const clamp = (s: string | null | undefined, max: number): string | null => {
  const t = (s ?? '').trim();
  return t ? t.slice(0, max).trim() : null;
};

function pickDate(w: CrossrefWork): { year: number | null; month: number | null; day: number | null } {
  for (const d of [w.issued, w['published-print'], w['published-online'], w.published, w.approved, w.created]) {
    const parts = d?.['date-parts']?.[0];
    const [y, m, day] = Array.isArray(parts) ? parts : [];
    if (typeof y === 'number' && y >= 1900 && y <= 2200) {
      const month = typeof m === 'number' && m >= 1 && m <= 12 ? m : null;
      return { year: y, month, day: month && typeof day === 'number' && day >= 1 && day <= 31 ? day : null };
    }
  }
  return { year: null, month: null, day: null };
}

/** "https://creativecommons.org/licenses/by-nc/4.0/" -> "CC BY-NC 4.0". Other licenses stay empty (TDM links are noise). */
function licenseLabel(w: CrossrefWork): string | null {
  for (const l of w.license ?? []) {
    const m = /creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/(\d(?:\.\d)?)/i.exec(l.URL ?? '');
    if (m) return m[1].toLowerCase() === 'publicdomain' ? `CC0 ${m[3]}` : `CC ${m[2].toUpperCase()} ${m[3]}`;
  }
  return null;
}

const httpUrl = (u: string | null | undefined): string | null => (u && /^https?:\/\//i.test(u) && u.length <= 2048 ? u : null);

/** Crossref work -> form prefill. Field lengths are clamped to `publicationInput` limits. */
export function mapCrossrefWork(w: CrossrefWork, doi: string): DoiLookupResult {
  const type: PublicationType = TYPE_MAP[w.type ?? ''] ?? 'other';
  const { year, month, day } = pickDate(w);
  const institution = cleanInline(w.institution?.find((i) => i.name)?.name);
  let containerTitle = cleanInline(first(w['container-title']));
  if (!containerTitle && type === 'conference-paper') containerTitle = cleanInline(w.event?.name);
  if (!containerTitle && type === 'preprint') containerTitle = institution;
  const publisher = type === 'thesis' && institution ? institution : cleanInline(w.publisher);
  const pages = (w.page ?? w['article-number'] ?? '').replace(/\s*[\u2010-\u2015\u2212-]+\s*/g, '-');
  const authorsRaw = (w.author ?? [])
    .map((a) => {
      const fullName = cleanInline(a.given && a.family ? `${a.given} ${a.family}` : a.name ?? a.family ?? a.given ?? '');
      const orcid = (a.ORCID ?? '').replace(/^https?:\/\/(www\.)?orcid\.org\//i, '').trim() || null;
      return {
        fullName: fullName.slice(0, 160),
        organization: clamp(cleanInline(a.affiliation?.find((x) => x.name)?.name), 200),
        orcid,
      };
    })
    .filter((a) => a.fullName);
  return {
    type,
    title: clamp(cleanInline(first(w.title)), 400) ?? undefined,
    subtitle: clamp(cleanInline(first(w.subtitle)), 400),
    abstract: clamp(cleanAbstract(w.abstract), 20000),
    containerTitle: clamp(containerTitle, 300),
    volume: clamp(w.volume, 40),
    issue: clamp(w.issue, 40),
    pages: clamp(pages, 40),
    publisher: clamp(publisher, 200),
    publishedYear: year,
    publishedMonth: month,
    publishedDay: day,
    doi: clamp(doi, 200),
    issn: clamp(first(w.ISSN), 40),
    isbn: clamp(first(w.ISBN), 40),
    url: httpUrl(w.resource?.primary?.URL) ?? httpUrl(w.URL),
    language: clamp(w.language, 40),
    license: clamp(licenseLabel(w), 80),
    status: type === 'preprint' ? 'preprint' : 'published',
    authors: authorsRaw.map((a) => ({
      speakerId: null,
      fullName: a.fullName,
      avatarAssetId: null,
      organization: a.organization,
      url: a.orcid ? `https://orcid.org/${a.orcid}` : null,
      isCorresponding: false,
    })),
    authorsRaw,
  };
}

/** GET https://api.crossref.org/works/<doi> with friendly errors. */
export async function fetchCrossrefWork(doi: string, fetchImpl: typeof fetch = fetch): Promise<CrossrefWork> {
  let res: Response;
  try {
    res = await fetchImpl(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { 'User-Agent': CROSSREF_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new AppError(HttpStatus.GATEWAY_TIMEOUT, 'crossref_timeout', 'Crossref is taking too long. Try again in a minute, or fill it in by hand.');
    }
    throw serviceUnavailable("We couldn't reach Crossref. Try again in a minute, or fill it in by hand.");
  }
  if (res.status === 404) {
    throw notFound("Crossref doesn't know that DOI. Double check it, or fill the form by hand.", { details: { doi } });
  }
  if (!res.ok) {
    throw serviceUnavailable(`Crossref answered with an error (${res.status}). Try again in a minute, or fill it in by hand.`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw serviceUnavailable('Crossref sent something we could not read. Try again in a minute.');
  }
  const message = (body as { message?: unknown })?.message;
  if (!message || typeof message !== 'object') throw unprocessable('Crossref had nothing useful for that DOI.', { details: { doi } });
  return message;
}
