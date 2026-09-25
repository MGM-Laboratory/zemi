/**
 * Citation formatters. Owned by the publications workstream (api-content).
 * Contract: pure functions over CitationSource. Output plain text (or BibTeX/RIS text).
 *
 *   formatCitation('apa', publicationToCitationSource(detail))
 *   citationFileName('bibtex', src)          // "lecun2015deep.bib"
 *   CITATION_FILE_TYPES.bibtex.mime          // "application/x-bibtex; charset=utf-8"
 *
 * Rules shared by every style:
 * - Titles keep the casing they were typed with (auto sentence/title casing breaks names and acronyms).
 * - Page ranges use a plain hyphen ("436-444"). No en or em dashes anywhere, per the house rules.
 *   BibTeX uses "436--444" (two ASCII hyphens), which LaTeX typesets correctly.
 * - Author strings are "Given Family" full names. "Family, Given" is accepted too, which is the
 *   escape hatch for names the parser gets wrong. Wrap a name in braces ("{MGM Laboratory}") to
 *   force it to be treated as an organization. Honorifics (Dr., Prof., Ir.) and trailing degrees
 *   (", M.Kom.", ", Ph.D.") are dropped. Single names (common in Indonesia) are never inverted.
 */
import type { PublicationDetail } from './schemas/publications.js';

export type CitationFormat = 'apa' | 'ieee' | 'mla' | 'chicago' | 'harvard' | 'vancouver' | 'bibtex' | 'ris' | 'text';

export const CITATION_FORMATS: Array<{ key: CitationFormat; label: string }> = [
  { key: 'apa', label: 'APA 7' },
  { key: 'ieee', label: 'IEEE' },
  { key: 'mla', label: 'MLA 9' },
  { key: 'chicago', label: 'Chicago' },
  { key: 'harvard', label: 'Harvard' },
  { key: 'vancouver', label: 'Vancouver' },
  { key: 'bibtex', label: 'BibTeX' },
  { key: 'ris', label: 'RIS' },
  { key: 'text', label: 'Plain text' },
];

/** File extension and MIME type for downloads (`citationFileName` uses the extension). */
export const CITATION_FILE_TYPES: Record<CitationFormat, { extension: string; mime: string }> = {
  apa: { extension: 'txt', mime: 'text/plain; charset=utf-8' },
  ieee: { extension: 'txt', mime: 'text/plain; charset=utf-8' },
  mla: { extension: 'txt', mime: 'text/plain; charset=utf-8' },
  chicago: { extension: 'txt', mime: 'text/plain; charset=utf-8' },
  harvard: { extension: 'txt', mime: 'text/plain; charset=utf-8' },
  vancouver: { extension: 'txt', mime: 'text/plain; charset=utf-8' },
  bibtex: { extension: 'bib', mime: 'application/x-bibtex; charset=utf-8' },
  ris: { extension: 'ris', mime: 'application/x-research-info-systems; charset=utf-8' },
  text: { extension: 'txt', mime: 'text/plain; charset=utf-8' },
};

export type ThesisKind = 'phd' | 'masters' | 'bachelors';

export interface CitationSource {
  type: string;
  title: string;
  subtitle?: string | null;
  authors: string[]; // "Given Family" full names, in order
  containerTitle?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  publisher?: string | null;
  year?: number | null;
  month?: number | null;
  day?: number | null;
  doi?: string | null;
  url?: string | null;
  isbn?: string | null;
  issn?: string | null;
  arxivId?: string | null;
  citationKey?: string | null;
  accessedAt?: string | null;
  /** Additive fields (all optional). */
  abstract?: string | null;
  keywords?: string[] | null;
  language?: string | null;
  /** Publication status (`in-press`, `accepted`...). APA prints "(in press)" when there is no year. */
  status?: string | null;
  /** Software/dataset version. Falls back to `volume` for those two types. */
  version?: string | null;
  /** Degree for theses. Unknown means doctoral (the most common Crossref "dissertation"). */
  thesisKind?: ThesisKind | null;
}

/* ------------------------------------------------------------------ names */

export interface CitationName {
  /** Given names as typed ("Yann", "Aidan N.", "Jean-Paul"). Empty for single names and organizations. */
  given: string;
  /** Lowercase particles that belong to the family name ("van der", "de"). */
  particle: string;
  /** Family name without particles. For organizations, the whole name. */
  family: string;
  /** Jr., Sr., II, III, IV. */
  suffix: string;
  /** Organization or explicit literal name: never inverted or abbreviated. */
  literal: boolean;
}

const PARTICLES = new Set([
  'van', 'von', 'de', 'der', 'den', 'del', 'della', 'dei', 'degli', 'di', 'da', 'du', 'des', 'le', 'la',
  'los', 'las', 'dos', 'das', 'do', 'ter', 'ten', 'te', 'zu', 'zur', 'af', 'av', 'bin', 'binti', 'ibn', 'al', 'el',
]);
const SUFFIX_RE = /^(jr|sr|jnr|snr|ii|iii|iv)\.?$/i;
const HONORIFIC_RE = /^(prof|professor|dr|drs|dra|ir|mr|mrs|ms|mx|miss|sir|dame)\.?$/i;
const DEGREES = new Set([
  'phd', 'dphil', 'md', 'msc', 'bsc', 'meng', 'beng', 'mba', 'mph', 'ma', 'ba', 'ms', 'bs', 'mt', 'st', 'se', 'sh',
  'mh', 'mm', 'mkom', 'skom', 'spd', 'mpd', 'ssi', 'msi', 'sip', 'spsi', 'mpsi', 'ssos', 'ss', 'skm', 'mkes', 'sked',
  'spt', 'sak', 'mak', 'cpa', 'ipu', 'ipm', 'mcs', 'mcomp', 'bcomp', 'mphil', 'edd', 'llm', 'llb', 'mfa',
]);
const ORG_RE =
  /\b(laborator(y|ies)|lab|labs|team|group|consortium|committee|association|society|institute|institut|university|universitas|universiti|foundation|organi[sz]ation|council|department|ministry|kementerian|agency|badan|center|centre|project|collaboration|initiative|network|alliance|inc|ltd|corp|corporation|company|gmbh|llc|press)\b/i;

const collapse = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function isDegree(part: string): boolean {
  const p = part.trim();
  if (!p) return false;
  if (DEGREES.has(p.replace(/[.\s]/g, '').toLowerCase())) return true;
  // Indonesian style degrees such as "S.Kom.", "M.Pd", "S.Si."
  return /^[A-Z]{1,2}\.\s?[A-Z][a-z]{1,5}\.?$/.test(p);
}

function literalName(name: string): CitationName {
  return { given: '', particle: '', family: name, suffix: '', literal: true };
}

function splitParticles(tokens: string[]): { particle: string; family: string } {
  let i = 0;
  while (i < tokens.length - 1 && PARTICLES.has(tokens[i]) && tokens[i] === tokens[i].toLowerCase()) i++;
  return { particle: tokens.slice(0, i).join(' '), family: tokens.slice(i).join(' ') };
}

function stripHonorifics(tokens: string[]): string[] {
  const out = [...tokens];
  while (out.length > 1 && HONORIFIC_RE.test(out[0])) out.shift();
  return out;
}

function naturalOrder(part: string, suffix: string): CitationName {
  let tokens = stripHonorifics(part.split(' ').filter(Boolean));
  if (tokens.length > 2 && SUFFIX_RE.test(tokens[tokens.length - 1]) && !suffix) {
    suffix = tokens[tokens.length - 1];
    tokens = tokens.slice(0, -1);
  }
  if (tokens.length <= 1) return { given: '', particle: '', family: tokens[0] ?? '', suffix, literal: false };
  // Family starts at the first lowercase particle after the first given name ("Jan van der Berg").
  let start = tokens.length - 1;
  for (let i = 1; i < tokens.length - 1; i++) {
    if (PARTICLES.has(tokens[i]) && tokens[i] === tokens[i].toLowerCase()) {
      start = i;
      break;
    }
  }
  const { particle, family } = splitParticles(tokens.slice(start));
  return { given: tokens.slice(0, start).join(' '), particle, family, suffix, literal: false };
}

/** Parse one author string. Exported for tests and for anyone who needs "Family, G." bits. */
export function parseCitationName(raw: string): CitationName {
  const s = collapse(raw);
  if (!s) return literalName('');
  if (s.startsWith('{') && s.endsWith('}')) return literalName(collapse(s.slice(1, -1)));
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  while (parts.length > 1 && isDegree(parts[parts.length - 1])) parts.pop();
  const bare = parts.join(', ');
  if (ORG_RE.test(bare) && bare.split(' ').length >= 2) return literalName(bare);
  if (parts.length === 1) return naturalOrder(parts[0], '');
  if (parts.length === 2 && SUFFIX_RE.test(parts[1])) return naturalOrder(parts[0], parts[1]);
  // Inverted: "Family, Given" or BibTeX style "Family, Jr., Given".
  let suffix = '';
  let given = parts.slice(1).join(' ');
  if (parts.length >= 3 && SUFFIX_RE.test(parts[1])) {
    suffix = parts[1];
    given = parts.slice(2).join(' ');
  }
  const { particle, family } = splitParticles(parts[0].split(' ').filter(Boolean));
  return { given: stripHonorifics(given.split(' ').filter(Boolean)).join(' '), particle, family, suffix, literal: false };
}

const familyOf = (n: CitationName) => [n.particle, n.family].filter(Boolean).join(' ');

function firstLetter(token: string): string {
  const ch = Array.from(token).find((c) => /\p{L}/u.test(c));
  return ch ? ch.toUpperCase() : '';
}

/** "Yann André" -> "Y. A." ; "Jean-Paul" -> "J.-P." ; "J.R.R." -> "J. R. R." */
function initials(given: string, opts: { period: boolean; space: boolean; hyphen: boolean }): string {
  const tokens = given.replace(/\./g, '. ').split(/\s+/).filter(Boolean);
  const dot = opts.period ? '.' : '';
  const out: string[] = [];
  for (const t of tokens) {
    const letters = t.split('-').map(firstLetter).filter(Boolean);
    if (!letters.length) continue;
    out.push(letters.map((l) => l + dot).join(opts.hyphen ? '-' : ''));
  }
  return out.join(opts.space ? ' ' : '');
}

const APA_INI = { period: true, space: true, hyphen: true };
const HARVARD_INI = { period: true, space: false, hyphen: true };
const NLM_INI = { period: false, space: false, hyphen: false };

const withSuffix = (s: string, n: CitationName, sep = ', ') => (n.suffix ? `${s}${sep}${n.suffix}` : s);

function nameInverted(n: CitationName, ini: typeof APA_INI | null): string {
  if (n.literal || !n.given) return withSuffix(n.literal ? n.family : familyOf(n), n);
  const given = ini ? initials(n.given, ini) : n.given;
  return withSuffix(`${familyOf(n)}, ${given}`, n);
}

function nameNatural(n: CitationName, ini: typeof APA_INI | null): string {
  if (n.literal) return n.family;
  const given = n.given ? (ini ? initials(n.given, ini) : n.given) : '';
  return withSuffix([given, familyOf(n)].filter(Boolean).join(' '), n);
}

function nameVancouver(n: CitationName): string {
  if (n.literal) return n.family;
  const ini = initials(n.given, NLM_INI);
  const base = [familyOf(n), ini].filter(Boolean).join(' ');
  return n.suffix ? `${base} ${n.suffix.replace(/\./g, '')}` : base;
}

function joinList(items: string[], conj: string, oxford: boolean): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}${oxford ? ',' : ''} ${conj} ${items[items.length - 1]}`;
}

/* ------------------------------------------------------------------ source normalization */

type Kind =
  | 'journal'
  | 'conference'
  | 'book'
  | 'chapter'
  | 'thesis'
  | 'report'
  | 'dataset'
  | 'software'
  | 'preprint'
  | 'article'
  | 'poster'
  | 'generic';

const KIND_BY_TYPE: Record<string, Kind> = {
  'journal-article': 'journal',
  'conference-paper': 'conference',
  preprint: 'preprint',
  thesis: 'thesis',
  book: 'book',
  'book-chapter': 'chapter',
  report: 'report',
  dataset: 'dataset',
  software: 'software',
  poster: 'poster',
  article: 'article',
  project: 'generic',
  other: 'generic',
};

interface Norm {
  kind: Kind;
  names: CitationName[];
  title: string;
  container: string;
  volume: string;
  issue: string;
  pages: string;
  publisher: string;
  year: number | null;
  month: number | null;
  day: number | null;
  doi: string;
  url: string;
  isbn: string;
  issn: string;
  arxiv: string;
  version: string;
  thesisKind: ThesisKind;
  status: string;
  language: string;
  abstract: string;
  keywords: string[];
  accessed: { y: number; m: number; d: number } | null;
}

/** "https://doi.org/10.1/x", "doi:10.1/x" -> "10.1/x" */
export function normalizeDoi(doi: string | null | undefined): string {
  return collapse(doi)
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim();
}

/** Any dash-like character becomes a hyphen; "pp." and spaces around the range go away. */
function normalizePages(pages: string | null | undefined): string {
  return collapse(pages)
    .replace(/^pp?\.\s*/i, '')
    .replace(/\s*[-\u2010\u2011\u2012\u2013\u2014\u2015\u2212]+\s*/g, '-');
}

const isRange = (pages: string) => /\S-\S/.test(pages);

function pageParts(pages: string): { start: string; end: string } {
  const i = pages.indexOf('-');
  return i > 0 ? { start: pages.slice(0, i), end: pages.slice(i + 1) } : { start: pages, end: '' };
}

/** Elide repeated leading digits of the end page. `minKeep` 1 for NLM (123-9), 2 for MLA (123-29). */
function elidePages(pages: string, minKeep: number): string {
  const { start, end } = pageParts(pages);
  if (!/^\d+$/.test(start) || !/^\d+$/.test(end) || start.length !== end.length || Number(end) <= Number(start)) {
    return pages;
  }
  if (minKeep >= 2 && Number(start) < 100) return pages;
  let i = 0;
  while (i < start.length - minKeep && start[i] === end[i]) i++;
  return `${start}-${end.slice(i)}`;
}

function validMonth(m: number | null | undefined): number | null {
  return typeof m === 'number' && Number.isInteger(m) && m >= 1 && m <= 12 ? m : null;
}

function validDay(d: number | null | undefined): number | null {
  return typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 31 ? d : null;
}

function parseAccessed(s: string | null | undefined): Norm['accessed'] {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(collapse(s));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return validMonth(mo) && validDay(d) ? { y, m: mo, d } : null;
}

/** Guess master's vs doctoral from the words around a thesis. Null when nothing gives it away. */
export function inferThesisKind(texts: Array<string | null | undefined>): ThesisKind | null {
  const hay = texts.filter(Boolean).join(' ');
  if (/\b(master'?s?|magister|m\.?\s?sc|msc|m\.kom|mkom|tesis)\b/i.test(hay)) return 'masters';
  if (/\b(ph\.?\s?d|doctoral|doctorate|disertasi|dissertation|dr\.?\s?rer)\b/i.test(hay)) return 'phd';
  if (/\b(bachelor'?s?|sarjana|skripsi|undergraduate|b\.?\s?sc)\b/i.test(hay)) return 'bachelors';
  return null;
}

function normalize(src: CitationSource): Norm {
  const kind = KIND_BY_TYPE[src.type] ?? 'generic';
  const title = collapse(src.title) || 'Untitled';
  const subtitle = collapse(src.subtitle);
  const fullTitle = subtitle ? `${title}${/[:?!.]$/.test(title) ? '' : ':'} ${subtitle}` : title;
  const volume = collapse(src.volume);
  const year = typeof src.year === 'number' && Number.isInteger(src.year) ? src.year : null;
  return {
    kind,
    names: (src.authors ?? []).map(parseCitationName).filter((n) => n.family || n.given),
    title: fullTitle,
    container: collapse(src.containerTitle),
    volume,
    issue: collapse(src.issue),
    pages: normalizePages(src.pages),
    publisher: collapse(src.publisher),
    year,
    month: year ? validMonth(src.month) : null,
    day: year && validMonth(src.month) ? validDay(src.day) : null,
    doi: normalizeDoi(src.doi),
    url: collapse(src.url),
    isbn: collapse(src.isbn),
    issn: collapse(src.issn),
    arxiv: collapse(src.arxivId).replace(/^arxiv:\s*/i, ''),
    version: collapse(src.version) || (kind === 'software' || kind === 'dataset' ? volume : ''),
    thesisKind: src.thesisKind ?? 'phd',
    status: collapse(src.status),
    language: collapse(src.language),
    abstract: collapse(src.abstract),
    keywords: (src.keywords ?? []).map(collapse).filter(Boolean),
    accessed: parseAccessed(src.accessedAt),
  };
}

const doiLink = (n: Norm) => (n.doi ? `https://doi.org/${n.doi}` : '');
const arxivLink = (n: Norm) => (n.arxiv ? `https://arxiv.org/abs/${n.arxiv}` : '');
/** Best link: DOI, then URL, then the arXiv page. */
const bestLink = (n: Norm) => doiLink(n) || n.url || arxivLink(n);
/** Book-like volumes (and software/datasets) never have volume/issue as journal numbers. */
const repository = (n: Norm) => n.container || n.publisher || (n.arxiv ? 'arXiv' : '');
/** Degree-awarding body of a thesis. */
const institution = (n: Norm) => n.publisher || n.container;

const endsWithPunct = (s: string) => /[.?!]$/.test(s);
const withPeriod = (s: string) => (!s || endsWithPunct(s) ? s : `${s}.`);
const capFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const compact = (items: Array<string | null | undefined | false>) => items.filter((x): x is string => !!x);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_MLA = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const MONTHS_IEEE = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ------------------------------------------------------------------ APA 7 */

function apaAuthors(names: CitationName[]): string {
  const f = names.map((n) => nameInverted(n, APA_INI));
  if (f.length <= 1) return f[0] ?? '';
  if (f.length <= 20) return `${f.slice(0, -1).join(', ')}, & ${f[f.length - 1]}`;
  return `${f.slice(0, 19).join(', ')}, . . . ${f[f.length - 1]}`;
}

function apaDate(n: Norm): string {
  if (!n.year) return /^(in-press|accepted)$/.test(n.status) ? '(in press)' : '(n.d.)';
  const dated = n.kind === 'article' || n.kind === 'poster';
  if (dated && n.month) return `(${n.year}, ${MONTHS[n.month - 1]}${n.day ? ` ${n.day}` : ''})`;
  return `(${n.year})`;
}

function apa(n: Norm): string {
  const pages = n.pages ? `${isRange(n.pages) ? 'pp.' : 'p.'} ${n.pages}` : '';
  let titleEl = n.title;
  let source = '';
  switch (n.kind) {
    case 'journal': {
      let s = n.container;
      if (s && n.volume) s += `, ${n.volume}`;
      if (s && n.issue) s += n.volume ? `(${n.issue})` : `, (${n.issue})`;
      if (s && n.pages) s += `, ${n.pages}`;
      source = withPeriod(s);
      break;
    }
    case 'conference':
    case 'chapter':
      source = compact([
        n.container ? withPeriod(`In ${n.container}${pages ? ` (${pages})` : ''}`) : '',
        withPeriod(n.publisher),
      ]).join(' ');
      break;
    case 'thesis': {
      const label = n.thesisKind === 'masters' ? "Master's thesis" : n.thesisKind === 'bachelors' ? "Bachelor's thesis" : 'Doctoral dissertation';
      const inst = institution(n);
      titleEl = `${n.title} [${label}${inst ? `, ${inst}` : ''}]`;
      source = n.publisher && n.container && n.container !== inst ? withPeriod(n.container) : '';
      break;
    }
    case 'report':
      titleEl = `${n.title}${n.issue ? ` (Report No. ${n.issue})` : ''}`;
      source = withPeriod(n.publisher);
      break;
    case 'dataset':
    case 'software':
      titleEl = `${n.title}${n.version ? ` (Version ${n.version})` : ''} [${n.kind === 'dataset' ? 'Data set' : 'Computer software'}]`;
      source = withPeriod(n.publisher);
      break;
    case 'preprint':
      source = withPeriod(repository(n));
      break;
    case 'article':
      source = withPeriod(n.container);
      break;
    case 'poster':
      titleEl = `${n.title} [Poster presentation]`;
      source = withPeriod(n.container);
      break;
    default:
      source = withPeriod(n.publisher || n.container);
  }
  const authors = apaAuthors(n.names);
  const head = authors
    ? `${withPeriod(authors)} ${apaDate(n)}. ${withPeriod(titleEl)}`
    : `${withPeriod(titleEl)} ${apaDate(n)}.`;
  return compact([head, source, bestLink(n)]).join(' ');
}

/* ------------------------------------------------------------------ IEEE */

function ieeeAuthors(names: CitationName[]): string {
  const f = names.map((n) => nameNatural(n, APA_INI));
  if (f.length > 6) return `${f[0]} et al.`;
  return joinList(f, 'and', true);
}

function ieeeDate(n: Norm, withDay = false): string {
  if (!n.year) return '';
  if (!n.month) return String(n.year);
  const m = MONTHS_IEEE[n.month - 1];
  return withDay && n.day ? `${m} ${n.day}, ${n.year}` : `${m} ${n.year}`;
}

function ieee(n: Norm): string {
  const authors = ieeeAuthors(n.names);
  const pages = n.pages ? `${isRange(n.pages) ? 'pp.' : 'p.'} ${n.pages}` : '';
  const doi = n.doi ? `doi: ${n.doi}` : '';
  const year = n.year ? String(n.year) : '';
  const online = !n.doi && (n.url || n.arxiv) ? ` [Online]. Available: ${n.url || arxivLink(n)}` : '';
  const quoted = (rest: string[]) => {
    const t = n.title;
    const head = rest.length ? (endsWithPunct(t) ? `"${t}"` : `"${t},"`) : `"${withPeriod(t)}"`;
    return rest.length ? `${head} ${rest.join(', ')}.` : head;
  };
  const italic = (rest: string[]) => `${withPeriod(n.title)}${rest.length ? ` ${rest.join(', ')}.` : ''}`;
  let body: string;
  switch (n.kind) {
    case 'journal':
      body = quoted(compact([n.container, n.volume && `vol. ${n.volume}`, n.issue && `no. ${n.issue}`, pages, ieeeDate(n), doi]));
      break;
    case 'conference':
    case 'chapter':
      body = quoted(compact([n.container && `in ${n.container}`, n.kind === 'chapter' && n.publisher, year, pages, doi]));
      break;
    case 'book':
      body = italic(compact([n.publisher, year, doi]));
      break;
    case 'thesis': {
      const label = n.thesisKind === 'masters' ? 'M.S. thesis' : n.thesisKind === 'bachelors' ? 'B.S. thesis' : 'Ph.D. dissertation';
      body = quoted(compact([label, institution(n), year, doi]));
      break;
    }
    case 'report':
      body = quoted(compact([n.publisher, `Tech. Rep.${n.issue ? ` ${n.issue}` : ''}`, ieeeDate(n), doi]));
      break;
    case 'dataset':
    case 'software':
      body = quoted(compact([n.version && `version ${n.version}`, n.publisher, year, doi]));
      break;
    case 'preprint':
      body = quoted(compact([n.arxiv ? `arXiv:${n.arxiv}` : repository(n), ieeeDate(n), doi]));
      break;
    case 'article':
      body = quoted(compact([n.container, ieeeDate(n, true), doi]));
      break;
    case 'poster':
      body = quoted(compact([n.container && `presented at ${n.container}`, ieeeDate(n), doi]));
      break;
    default:
      body = quoted(compact([n.publisher || n.container, year, doi]));
  }
  return `${authors ? `${authors}, ` : ''}${body}${online}`;
}

/* ------------------------------------------------------------------ MLA 9 */

function mlaAuthors(names: CitationName[]): string {
  if (!names.length) return '';
  const first = nameInverted(names[0], null);
  if (names.length === 1) return first;
  if (names.length === 2) return `${first}, and ${nameNatural(names[1], null)}`;
  return `${first}, et al.`;
}

function mlaDate(n: Norm): string {
  if (!n.year) return '';
  if (!n.month) return String(n.year);
  return `${n.day ? `${n.day} ` : ''}${MONTHS_MLA[n.month - 1]} ${n.year}`;
}

function mla(n: Norm): string {
  const pages = n.pages ? `${isRange(n.pages) ? 'pp.' : 'p.'} ${elidePages(n.pages, 2)}` : '';
  const link = n.doi ? doiLink(n) : (n.url || arxivLink(n)).replace(/^https?:\/\//i, '');
  const date = mlaDate(n);
  const quotedTitle = `"${withPeriod(n.title)}"`;
  const plainTitle = withPeriod(n.title);
  let title = quotedTitle;
  let container: string[] = [];
  let tail = '';
  switch (n.kind) {
    case 'journal':
      container = compact([n.container, n.volume && `vol. ${n.volume}`, n.issue && `no. ${n.issue}`, date, pages, link]);
      break;
    case 'conference':
    case 'chapter':
      container = compact([n.container, n.publisher, date, pages, link]);
      break;
    case 'thesis': {
      title = plainTitle;
      const label = n.thesisKind === 'masters' ? "Master's thesis" : n.thesisKind === 'bachelors' ? "Bachelor's thesis" : 'PhD dissertation';
      container = compact([date]);
      tail = compact([withPeriod(compact([institution(n), label]).join(', ')), link && withPeriod(link)]).join(' ');
      break;
    }
    case 'software':
      title = plainTitle;
      container = compact([n.version && `version ${n.version}`, n.publisher, date, link]);
      break;
    case 'book':
    case 'report':
    case 'dataset':
    case 'generic':
      title = plainTitle;
      container = compact([n.publisher || (n.kind === 'generic' ? n.container : ''), date, link]);
      break;
    case 'preprint':
      container = compact([repository(n), date, link]);
      break;
    case 'article':
      container = compact([n.container, date, link]);
      break;
    case 'poster':
      container = compact([n.container, date]);
      tail = 'Poster presentation.';
      break;
  }
  const authors = mlaAuthors(n.names);
  const joined = container.join(', ');
  const containerText = container.length ? withPeriod(container[0] === link ? joined : capFirst(joined)) : '';
  return compact([authors && withPeriod(authors), title, containerText, tail]).join(' ');
}

/* ------------------------------------------------------------------ Chicago (author-date, 17th) */

function chicagoAuthors(names: CitationName[]): string {
  if (!names.length) return '';
  const first = nameInverted(names[0], null);
  if (names.length === 1) return first;
  const rest = names.slice(1).map((x) => nameNatural(x, null));
  if (names.length > 10) return `${[first, ...rest.slice(0, 6)].join(', ')}, et al.`;
  if (names.length === 2) return `${first}, and ${rest[0]}`;
  return `${[first, ...rest.slice(0, -1)].join(', ')}, and ${rest[rest.length - 1]}`;
}

function chicago(n: Norm): string {
  const quoted = `"${withPeriod(n.title)}"`;
  const plain = withPeriod(n.title);
  const monthDay = n.month ? `${MONTHS[n.month - 1]}${n.day ? ` ${n.day}` : ''}` : '';
  let title = quoted;
  let source = '';
  switch (n.kind) {
    case 'journal': {
      let s = n.container;
      if (s && n.volume) s += ` ${n.volume}`;
      if (s && n.issue) s += ` (${n.issue})`;
      if (s && n.pages) s += n.volume || n.issue ? `: ${n.pages}` : `, ${n.pages}`;
      source = withPeriod(s);
      break;
    }
    case 'conference':
    case 'chapter':
      source = compact([n.container && withPeriod(`In ${n.container}${n.pages ? `, ${n.pages}` : ''}`), withPeriod(n.publisher)]).join(' ');
      break;
    case 'thesis': {
      const label = n.thesisKind === 'masters' ? "Master's thesis" : n.thesisKind === 'bachelors' ? "Bachelor's thesis" : 'PhD diss.';
      source = withPeriod(compact([label, institution(n)]).join(', '));
      break;
    }
    case 'book':
    case 'report':
    case 'generic':
      title = plain;
      source = withPeriod(n.publisher || (n.kind === 'generic' ? n.container : ''));
      break;
    case 'dataset':
    case 'software':
      title = plain;
      source = compact([n.version && `Version ${n.version}.`, withPeriod(n.publisher)]).join(' ');
      break;
    case 'preprint':
      source = withPeriod(compact(['Preprint', n.arxiv ? `arXiv:${n.arxiv}` : repository(n)]).join(', '));
      break;
    case 'article':
      source = withPeriod(compact([n.container, monthDay]).join(', '));
      break;
    case 'poster':
      source = withPeriod(compact([n.container ? `Poster presented at ${n.container}` : 'Poster', monthDay]).join(', '));
      break;
  }
  const authors = chicagoAuthors(n.names);
  const year = n.year ? String(n.year) : 'n.d.';
  const head = authors ? `${withPeriod(authors)} ${withPeriod(year)} ${title}` : `${title} ${withPeriod(year)}`;
  const link = bestLink(n);
  return compact([head, source, link && `${link}.`]).join(' ');
}

/* ------------------------------------------------------------------ Harvard (Cite Them Right) */

function harvardAuthors(names: CitationName[]): string {
  const f = names.map((n) => nameInverted(n, HARVARD_INI));
  if (f.length >= 4) return `${f[0]} et al.`;
  return joinList(f, 'and', false);
}

function fullDate(p: { y: number; m: number; d: number }): string {
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

function harvard(n: Norm): string {
  const pages = n.pages ? `${isRange(n.pages) ? 'pp.' : 'p.'} ${n.pages}` : '';
  const quoted = `'${n.title}'`;
  const plain = n.title;
  const dayMonth = n.month ? `${n.day ? `${n.day} ` : ''}${MONTHS[n.month - 1]}` : '';
  // [title element, rest joined after it]. Title elements that end the sentence carry their own period.
  let title: string;
  let rest: string;
  switch (n.kind) {
    case 'journal': {
      let vol = n.volume;
      if (n.issue) vol += `(${n.issue})`;
      title = quoted;
      rest = compact([n.container, vol, pages]).join(', ');
      rest = rest ? `, ${withPeriod(rest)}` : '.';
      break;
    }
    case 'conference':
    case 'chapter': {
      title = quoted;
      const where = n.container ? `, in ${n.container}` : '';
      const pub = compact([n.publisher, pages]).join(', ');
      rest = `${where}${pub ? `. ${withPeriod(pub)}` : '.'}`;
      break;
    }
    case 'thesis': {
      const label = n.thesisKind === 'masters' ? "Master's thesis" : n.thesisKind === 'bachelors' ? "Bachelor's thesis" : 'PhD thesis';
      title = withPeriod(plain);
      rest = ` ${compact([`${label}.`, withPeriod(institution(n))]).join(' ')}`;
      break;
    }
    case 'dataset':
      title = `${plain} [Dataset].`;
      rest = n.publisher ? ` ${withPeriod(n.publisher)}` : '';
      break;
    case 'software':
      title = `${plain}${n.version ? ` (Version ${n.version})` : ''} [Computer program].`;
      rest = n.publisher ? ` ${withPeriod(n.publisher)}` : '';
      break;
    case 'preprint':
      title = `${quoted} [Preprint].`;
      rest = repository(n) ? ` ${withPeriod(repository(n))}` : '';
      break;
    case 'article':
      title = quoted;
      rest = compact([n.container, dayMonth]).join(', ');
      rest = rest ? `, ${withPeriod(rest)}` : '.';
      break;
    case 'poster':
      title = `${quoted} [Poster].`;
      rest = n.container ? ` ${withPeriod(n.container)}` : '';
      break;
    default:
      title = withPeriod(plain);
      rest = n.publisher || n.container ? ` ${withPeriod(n.publisher || n.container)}` : '';
  }
  const authors = harvardAuthors(n.names);
  const year = `(${n.year ?? 'no date'})`;
  const head = authors ? `${authors} ${year} ${title}${rest}` : `${title.replace(/\.$/, '')} ${year}${rest || '.'}`;
  let link = '';
  if (n.doi) link = ` Available at: ${doiLink(n)}.`;
  else if (n.url || n.arxiv) link = ` Available at: ${n.url || arxivLink(n)}${n.accessed ? ` (Accessed: ${fullDate(n.accessed)})` : ''}.`;
  return `${head}${link}`;
}

/* ------------------------------------------------------------------ Vancouver (ICMJE / NLM) */

function vancouverAuthors(names: CitationName[]): string {
  const f = names.map(nameVancouver);
  if (f.length > 6) return `${f.slice(0, 6).join(', ')}, et al.`;
  return f.join(', ');
}

function vancouver(n: Norm): string {
  const pages = n.pages ? elidePages(n.pages, 1) : '';
  const date = n.year ? compact([String(n.year), n.month ? MONTHS_SHORT[n.month - 1] : '', n.month && n.day ? String(n.day) : '']).join(' ') : '';
  const pubYear = compact([n.publisher, n.year ? String(n.year) : '']).join('; ');
  const title = n.title;
  let parts: string[];
  switch (n.kind) {
    case 'journal': {
      let s = date;
      const vi = `${n.volume}${n.issue ? `(${n.issue})` : ''}`;
      if (vi) s += `;${vi}`;
      if (pages) s += `:${pages}`;
      parts = [withPeriod(title), n.container && withPeriod(n.container), s && withPeriod(s)].filter(Boolean) as string[];
      break;
    }
    case 'conference':
    case 'chapter':
      parts = compact([withPeriod(title), n.container && withPeriod(`In: ${n.container}`), pubYear && withPeriod(pubYear), pages && withPeriod(`p. ${pages}`)]);
      break;
    case 'thesis': {
      const label = n.thesisKind === 'masters' ? "master's thesis" : n.thesisKind === 'bachelors' ? "bachelor's thesis" : 'dissertation';
      parts = compact([`${title} [${label}].`, withPeriod(compact([institution(n), n.year ? String(n.year) : '']).join('; '))]);
      break;
    }
    case 'report':
      parts = compact([withPeriod(title), pubYear && withPeriod(pubYear), n.issue && `Report No.: ${n.issue}.`]);
      break;
    case 'dataset':
      parts = compact([`${title} [dataset].`, pubYear && withPeriod(pubYear)]);
      break;
    case 'software':
      parts = compact([`${title} [software].`, n.version && `Version ${n.version}.`, pubYear && withPeriod(pubYear)]);
      break;
    case 'preprint':
      parts = compact([`${title} [preprint].`, withPeriod(compact([n.arxiv ? `arXiv:${n.arxiv}` : repository(n), date]).join('; '))]);
      break;
    case 'article':
      parts = compact([withPeriod(title), n.container && withPeriod(n.container), date && withPeriod(date)]);
      break;
    case 'poster':
      parts = compact([`${title} [poster].`, withPeriod(compact([n.container, date]).join('; '))]);
      break;
    default:
      parts = compact([withPeriod(title), withPeriod(compact([n.publisher || n.container, n.year ? String(n.year) : '']).join('; '))]);
  }
  const authors = vancouverAuthors(n.names);
  const link = n.doi ? `doi:${n.doi}` : n.url || n.arxiv ? `Available from: ${n.url || arxivLink(n)}` : '';
  return compact([authors && withPeriod(authors), ...parts, link]).join(' ');
}

/* ------------------------------------------------------------------ BibTeX */

const TEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};

/** Escape LaTeX special characters in a BibTeX field value. UTF-8 letters stay as they are. */
export function bibtexEscape(s: string): string {
  return s.replace(/[\\{}&%$#_~^]/g, (ch) => TEX_ESCAPES[ch] ?? ch);
}

/** Brace words with inner capitals (acronyms, "LeCun", "iPhone") so styles never lowercase them. */
function protectCaps(escaped: string): string {
  return escaped
    .split(/(\s+)/)
    .map((tok) => {
      const m = /^([^\p{L}\p{N}\\]*)(.*?)([^\p{L}\p{N}}]*)$/u.exec(tok);
      if (!m || !m[2]) return tok;
      const core = m[2];
      return /\p{Lu}/u.test(Array.from(core).slice(1).join('')) ? `${m[1]}{${core}}${m[3]}` : tok;
    })
    .join('');
}

function bibtexName(n: CitationName): string {
  if (n.literal) return `{${bibtexEscape(n.family)}}`;
  const fam = bibtexEscape(familyOf(n));
  if (!n.given) return n.suffix ? `${fam}, ${bibtexEscape(n.suffix)},` : fam;
  return n.suffix ? `${fam}, ${bibtexEscape(n.suffix)}, ${bibtexEscape(n.given)}` : `${fam}, ${bibtexEscape(n.given)}`;
}

const BIBTEX_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function bibtexType(n: Norm): string {
  switch (n.kind) {
    case 'journal':
      return 'article';
    case 'conference':
      return 'inproceedings';
    case 'thesis':
      return n.thesisKind === 'phd' ? 'phdthesis' : 'mastersthesis';
    case 'book':
      return 'book';
    case 'chapter':
      return 'incollection';
    case 'report':
      return 'techreport';
    case 'software':
      return 'software';
    case 'article':
      return n.container ? 'article' : 'misc';
    default:
      return 'misc';
  }
}

function sanitizeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9_:.\-+/]/g, '');
}

function bibtex(n: Norm, src: CitationSource): string {
  const type = bibtexType(n);
  const key = sanitizeKey(collapse(src.citationKey)) || makeCitationKey(src);
  const fields: Array<[string, string, boolean?]> = [];
  const add = (name: string, value: string | null | undefined, raw = false) => {
    if (value) fields.push([name, raw ? value : bibtexEscape(value), raw]);
  };
  if (n.names.length) fields.push(['author', n.names.map(bibtexName).join(' and ')]);
  fields.push(['title', protectCaps(bibtexEscape(n.title))]);
  switch (n.kind) {
    case 'journal':
    case 'article':
      add('journal', n.container);
      break;
    case 'conference':
    case 'chapter':
      add('booktitle', n.container);
      break;
    case 'thesis':
      add('school', institution(n));
      if (n.thesisKind === 'bachelors') add('type', "Bachelor's thesis");
      break;
    case 'report':
      add('institution', n.publisher || n.container);
      break;
    case 'poster':
      if (n.container) add('howpublished', `Poster presented at ${n.container}`);
      break;
    case 'preprint':
      if (!n.arxiv && repository(n)) add('howpublished', repository(n));
      break;
    case 'generic':
    case 'dataset':
    case 'software':
      if (n.container && n.container !== n.publisher) add('howpublished', n.container);
      break;
  }
  if (n.year) add('year', String(n.year));
  if (n.month) fields.push(['month', BIBTEX_MONTHS[n.month - 1], true]);
  if (n.kind !== 'software' && n.kind !== 'dataset') add('volume', n.volume);
  if (n.version) add('version', n.version);
  add('number', n.issue);
  if (n.pages) add('pages', n.pages.replace(/-/g, '--'));
  if (n.kind !== 'thesis' && n.kind !== 'report') add('publisher', n.publisher);
  add('isbn', n.isbn);
  add('issn', n.issn);
  if (n.arxiv) {
    add('eprint', n.arxiv, true);
    add('archiveprefix', 'arXiv', true);
  }
  add('doi', n.doi, true);
  add('url', n.url || (n.arxiv && !n.doi ? arxivLink(n) : ''), true);
  if (n.keywords.length) add('keywords', n.keywords.join(', '));
  if (n.language) add('language', n.language);
  const width = Math.max(...fields.map(([name]) => name.length));
  const body = fields
    .map(([name, value, raw]) => `  ${name.padEnd(width)} = ${raw && name === 'month' ? value : `{${value}}`}`)
    .join(',\n');
  return `@${type}{${key},\n${body}\n}`;
}

/* ------------------------------------------------------------------ RIS */

const RIS_TYPES: Record<Kind, string> = {
  journal: 'JOUR',
  conference: 'CONF',
  thesis: 'THES',
  book: 'BOOK',
  chapter: 'CHAP',
  report: 'RPRT',
  dataset: 'DATA',
  software: 'COMP',
  preprint: 'GEN',
  article: 'GEN',
  poster: 'GEN',
  generic: 'GEN',
};

function ris(n: Norm): string {
  const lines: string[] = [];
  const add = (tag: string, value: string | null | undefined) => {
    const v = collapse(value);
    if (v) lines.push(`${tag}  - ${v}`);
  };
  add('TY', RIS_TYPES[n.kind]);
  for (const name of n.names) add('AU', name.literal ? name.family : nameInverted(name, null));
  add('TI', n.title);
  if (n.kind === 'thesis') {
    add('PB', institution(n));
    add('M3', n.thesisKind === 'masters' ? "Master's thesis" : n.thesisKind === 'bachelors' ? "Bachelor's thesis" : 'Doctoral dissertation');
  } else {
    add('T2', n.container);
  }
  if (n.year) {
    add('PY', String(n.year));
    const mm = n.month ? String(n.month).padStart(2, '0') : '';
    const dd = n.month && n.day ? String(n.day).padStart(2, '0') : '';
    add('DA', `${n.year}/${mm}/${dd}/`);
  }
  if (n.kind !== 'software' && n.kind !== 'dataset') add('VL', n.volume);
  add('IS', n.issue);
  if (n.pages) {
    const { start, end } = pageParts(n.pages);
    add('SP', start);
    add('EP', end);
  }
  if (n.version) add('ET', n.version);
  if (n.kind !== 'thesis') add('PB', n.publisher);
  add('SN', n.isbn || n.issn);
  add('DO', n.doi);
  add('UR', n.url || (n.doi ? doiLink(n) : arxivLink(n)));
  if (n.arxiv) add('M1', `arXiv:${n.arxiv}`);
  for (const k of n.keywords) add('KW', k);
  add('AB', n.abstract);
  add('LA', n.language);
  lines.push('ER  - ');
  return `${lines.join('\r\n')}\r\n`;
}

/* ------------------------------------------------------------------ plain text */

function plain(n: Norm): string {
  const authors = joinList(n.names.map((x) => nameNatural(x, null)), 'and', true);
  let container = n.container;
  if (container && (n.volume || n.issue)) container += ` ${n.volume}${n.issue ? `(${n.issue})` : ''}`;
  if (container && n.pages) container += `, ${n.pages}`;
  const publisher = n.kind !== 'journal' && n.publisher && n.publisher !== n.container ? n.publisher : '';
  return compact([
    authors && withPeriod(authors),
    n.year ? `${n.year}.` : '',
    withPeriod(n.title),
    container && withPeriod(container),
    publisher && withPeriod(publisher),
    bestLink(n),
  ]).join(' ');
}

/* ------------------------------------------------------------------ public API */

const KEY_STOPWORDS = new Set([
  'a', 'an', 'the', 'on', 'of', 'in', 'for', 'to', 'and', 'at', 'by', 'with', 'from', 'towards', 'toward', 'via',
  'into', 'about', 'is', 'sebuah', 'suatu', 'pada', 'dan', 'untuk', 'dengan', 'yang', 'di', 'ke', 'dari', 'dalam',
  'terhadap',
]);

function asciiWord(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Google Scholar style key: first author's family name + year + first meaningful title word, lowercase
 * ASCII ("lecun2015deep"). "anon" without authors, "nd" without a year. The API adds a suffix when
 * two publications collide.
 */
export function makeCitationKey(src: Pick<CitationSource, 'authors' | 'year' | 'title'>): string {
  const first = (src.authors ?? []).map(parseCitationName).find((n) => n.family || n.given);
  let who = 'anon';
  if (first) who = asciiWord(first.literal ? (first.family.split(' ')[0] ?? '') : first.family || first.given) || 'anon';
  const year = typeof src.year === 'number' ? String(src.year) : 'nd';
  const words = collapse(src.title).split(/[\s:;,.!?()[\]"'/-]+/).map(asciiWord).filter(Boolean);
  const word = words.find((w) => !KEY_STOPWORDS.has(w)) ?? words[0] ?? '';
  return `${who}${year}${word}`.slice(0, 80);
}

export function formatCitation(format: CitationFormat, src: CitationSource): string {
  const n = normalize(src);
  switch (format) {
    case 'apa':
      return apa(n);
    case 'ieee':
      return ieee(n);
    case 'mla':
      return mla(n);
    case 'chicago':
      return chicago(n);
    case 'harvard':
      return harvard(n);
    case 'vancouver':
      return vancouver(n);
    case 'bibtex':
      return bibtex(n, src);
    case 'ris':
      return ris(n);
    case 'text':
    default:
      return plain(n);
  }
}

/** Every format at once, for a "Cite this" panel. */
export function formatAllCitations(src: CitationSource): Record<CitationFormat, string> {
  const out = {} as Record<CitationFormat, string>;
  for (const { key } of CITATION_FORMATS) out[key] = formatCitation(key, src);
  return out;
}

/** Download name like "lecun2015deep.bib" (the citation key, or a key made from the source). */
export function citationFileName(format: CitationFormat, src: Pick<CitationSource, 'authors' | 'year' | 'title' | 'citationKey'>): string {
  const base = sanitizeKey(collapse(src.citationKey)).replace(/[:/+]/g, '-') || makeCitationKey(src) || 'citation';
  return `${base}.${CITATION_FILE_TYPES[format].extension}`;
}

/**
 * Build a CitationSource from the public publication detail. `fallbackUrl` (the Zemi page, say) is
 * used when the publication has no DOI, URL or publisher link; `accessedAt` (YYYY-MM-DD) feeds
 * the Harvard "Accessed:" note for URL-only works.
 */
export function publicationToCitationSource(
  detail: PublicationDetail,
  opts: { fallbackUrl?: string | null; accessedAt?: string | null } = {},
): CitationSource {
  const authors = (detail.authorsFull?.length ? detail.authorsFull : detail.authors ?? []).map((a) => a.fullName).filter(Boolean);
  const publisherLink = detail.links?.find((l) => l.kind === 'publisher')?.url ?? null;
  const url = detail.url || publisherLink || (detail.doi ? null : opts.fallbackUrl ?? null);
  return {
    type: detail.type,
    title: detail.title,
    subtitle: detail.subtitle,
    authors,
    containerTitle: detail.containerTitle,
    volume: detail.volume,
    issue: detail.issue,
    pages: detail.pages,
    publisher: detail.publisher,
    year: detail.publishedYear,
    month: detail.publishedMonth,
    day: detail.publishedDay,
    doi: detail.doi,
    url,
    isbn: detail.isbn,
    issn: detail.issn,
    arxivId: detail.arxivId,
    citationKey: detail.citationKey,
    accessedAt: opts.accessedAt ?? null,
    abstract: detail.abstract,
    keywords: detail.keywords,
    language: detail.language,
    status: detail.status,
    thesisKind:
      detail.type === 'thesis'
        ? inferThesisKind([detail.subtitle, detail.containerTitle, detail.publisher, ...(detail.keywords ?? []), detail.title])
        : null,
  };
}
