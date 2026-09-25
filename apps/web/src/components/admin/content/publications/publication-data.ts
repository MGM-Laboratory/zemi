'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  blocksSchema,
  PUBLICATION_LINK_KINDS,
  PUBLICATION_STATUSES,
  PUBLICATION_TYPES,
  slugSchema,
  visibilitySchema,
  type CitationSource,
  type ImageRef,
  type Paginated,
  type PublicationAdmin,
  type PublicationAuthorInput,
  type PublicationInput,
  type PublicationLinkKind,
  type PublicationStatus,
  type PublicationType,
  type SpeakerRef,
  type Visibility,
} from '@zemi/shared';
import { z } from 'zod';
import { adminFetch } from '@/lib/admin/api';
import { adminKeys } from '@/lib/admin/query-keys';
import { cleanDoi, DOI_PATTERN, newKey, nullToBlank } from '../shared/form-utils';
import { toPaginated, type PublicationRow } from '../shared/types';

/* ------------------------------------------------------------------ labels */

export const STATUS_LABELS: Record<PublicationStatus, string> = {
  published: 'Published',
  'in-press': 'In press',
  accepted: 'Accepted',
  'under-review': 'Under review',
  preprint: 'Preprint',
  'in-progress': 'In progress',
};

export const LINK_KIND_LABELS: Record<PublicationLinkKind, string> = {
  pdf: 'PDF',
  publisher: 'Publisher page',
  code: 'Code',
  dataset: 'Dataset',
  slides: 'Slides',
  video: 'Video',
  poster: 'Poster',
  website: 'Website',
  other: 'Other',
};

/** What to call "containerTitle" for each type. */
export function containerLabel(type: PublicationType | string | undefined): { label: string; placeholder: string } {
  switch (type) {
    case 'journal-article':
      return { label: 'Journal', placeholder: 'Nature' };
    case 'conference-paper':
    case 'poster':
      return { label: 'Conference or proceedings', placeholder: 'Proceedings of CHI 2026' };
    case 'book-chapter':
      return { label: 'Book title', placeholder: 'Handbook of Friendly Robots' };
    case 'thesis':
      return { label: 'University', placeholder: 'Universitas Brawijaya' };
    case 'report':
      return { label: 'Institution or series', placeholder: 'MGM Lab technical reports' };
    case 'preprint':
      return { label: 'Server', placeholder: 'arXiv' };
    case 'software':
    case 'dataset':
      return { label: 'Repository', placeholder: 'Zenodo' };
    default:
      return { label: 'Where it appeared', placeholder: 'Journal, conference or site' };
  }
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

export const LANGUAGE_SUGGESTIONS = ['English', 'Indonesian', 'Japanese', 'Malay', 'Mandarin', 'Korean', 'Arabic', 'German', 'French', 'Spanish'];
export const LICENSE_SUGGESTIONS = ['CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-NC 4.0', 'CC BY-NC-ND 4.0', 'CC0 1.0', 'All rights reserved', 'MIT', 'Apache-2.0', 'GPL-3.0'];

/* ------------------------------------------------------------------ queries */

export type PublicationSort = 'year' | 'recent' | 'title';

export interface PublicationListParams {
  search?: string;
  type?: PublicationType | null;
  year?: number | null;
  visibility?: Visibility | null;
  sort: PublicationSort;
  page: number;
  pageSize: number;
}

/** GET /admin/publications?search&type&year&visibility&sort&page&pageSize */
export function usePublicationList(p: PublicationListParams) {
  const query = {
    search: p.search || undefined,
    type: p.type || undefined,
    year: p.year ?? undefined,
    visibility: p.visibility || undefined,
    sort: p.sort,
    page: p.page,
    pageSize: p.pageSize,
  };
  return useQuery({
    queryKey: adminKeys.publications.list(query),
    queryFn: async ({ signal }) =>
      toPaginated(await adminFetch<Paginated<PublicationRow> | PublicationRow[]>('/admin/publications', { query, signal }), p.page, p.pageSize),
    placeholderData: keepPreviousData,
  });
}

/** GET /admin/publications/:id */
export function usePublication(id: string | null) {
  return useQuery({
    queryKey: adminKeys.publications.detail(id ?? 'none'),
    queryFn: ({ signal }) => adminFetch<PublicationAdmin>(`/admin/publications/${id}`, { signal }),
    enabled: Boolean(id),
  });
}

/* ------------------------------------------------------------------ form model */

function isHttpUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

const LINK_MSG = 'That link should start with https://';

export const authorRowSchema = z
  .object({
    key: z.string(),
    kind: z.enum(['speaker', 'manual']),
    speaker: z.custom<SpeakerRef | null>(() => true),
    fullName: z.string().max(160, 'Keep the name under 160 characters.'),
    avatarAssetId: z.string().nullable(),
    avatar: z.custom<ImageRef | null>(() => true),
    organization: z.string().max(200),
    url: z.string().max(2048),
    isCorresponding: z.boolean(),
  })
  .superRefine((a, ctx) => {
    if (a.kind === 'speaker' && !a.speaker) ctx.addIssue({ code: 'custom', path: ['speaker'], message: 'Pick someone from the directory, or remove this row.' });
    if (a.kind === 'manual' && !a.fullName.trim()) ctx.addIssue({ code: 'custom', path: ['fullName'], message: 'Add their name.' });
    if (a.kind === 'manual' && a.url.trim() && !isHttpUrl(a.url.trim())) ctx.addIssue({ code: 'custom', path: ['url'], message: LINK_MSG });
  });
export type AuthorRow = z.infer<typeof authorRowSchema>;

export const linkRowSchema = z
  .object({
    key: z.string(),
    kind: z.enum(PUBLICATION_LINK_KINDS),
    label: z.string().max(120),
    url: z.string().max(2048),
  })
  .superRefine((l, ctx) => {
    if (l.url.trim() && !isHttpUrl(l.url.trim())) ctx.addIssue({ code: 'custom', path: ['url'], message: LINK_MSG });
  });
export type LinkRow = z.infer<typeof linkRowSchema>;

const text = (max: number) => z.string().max(max, `Keep it under ${max} characters.`);

/** Form-local schema: strings stay strings (inputs need ''), authors and links carry UI state. */
export const publicationFormSchema = z.object({
  slug: slugSchema,
  type: z.enum(PUBLICATION_TYPES),
  title: z.string().trim().min(1, 'Give it a title.').max(400),
  subtitle: text(400),
  abstract: text(20000),
  body: blocksSchema,
  coverAssetId: z.string().nullable(),
  pdfAssetId: z.string().nullable(),
  containerTitle: text(300),
  volume: text(40),
  issue: text(40),
  pages: text(40),
  publisher: text(200),
  publishedYear: z.number().int().min(1900, 'Pick a year after 1900.').max(2200, 'That year is a bit far out.').nullable(),
  publishedMonth: z.number().int().min(1).max(12).nullable(),
  publishedDay: z.number().int().min(1, 'Days start at 1.').max(31, 'No month has that many days.').nullable(),
  doi: text(200).refine((v) => !v.trim() || DOI_PATTERN.test(cleanDoi(v)), 'A DOI looks like 10.1038/nature14539.'),
  isbn: text(40),
  issn: text(40),
  arxivId: text(40),
  url: z.string().max(2048).refine((v) => !v.trim() || isHttpUrl(v.trim()), LINK_MSG),
  links: z.array(linkRowSchema).max(30, 'That is 30 links, the max.'),
  keywords: z.array(z.string().min(1).max(60)).max(30),
  language: text(40),
  status: z.enum(PUBLICATION_STATUSES),
  license: text(80),
  citationKey: text(80).refine((v) => !v || /^[A-Za-z0-9_:.-]+$/.test(v), 'Letters, numbers and _ : . - only, no spaces.'),
  visibility: visibilitySchema,
  authors: z.array(authorRowSchema).max(100),
});
export type PublicationFormValues = z.infer<typeof publicationFormSchema>;

export const EMPTY_PUBLICATION: PublicationFormValues = {
  slug: '',
  type: 'journal-article',
  title: '',
  subtitle: '',
  abstract: '',
  body: [],
  coverAssetId: null,
  pdfAssetId: null,
  containerTitle: '',
  volume: '',
  issue: '',
  pages: '',
  publisher: '',
  publishedYear: null,
  publishedMonth: null,
  publishedDay: null,
  doi: '',
  isbn: '',
  issn: '',
  arxivId: '',
  url: '',
  links: [],
  keywords: [],
  language: '',
  status: 'published',
  license: '',
  citationKey: '',
  visibility: 'published',
  authors: [],
};

export function emptyManualAuthor(patch: Partial<AuthorRow> = {}): AuthorRow {
  return { key: newKey('a'), kind: 'manual', speaker: null, fullName: '', avatarAssetId: null, avatar: null, organization: '', url: '', isCorresponding: false, ...patch };
}

export function speakerAuthor(s: SpeakerRef, patch: Partial<AuthorRow> = {}): AuthorRow {
  return { key: newKey('a'), kind: 'speaker', speaker: s, fullName: s.fullName, avatarAssetId: null, avatar: s.avatar, organization: '', url: '', isCorresponding: false, ...patch };
}

/** Rebuild author rows from the admin record. authorInputs holds the raw overrides, authorsFull the display data. */
function authorsToRows(p: PublicationAdmin): AuthorRow[] {
  const full = p.authorsFull ?? [];
  const inputs = p.authorInputs ?? [];
  const zipped = inputs.length === full.length;
  return full.map((a, i) => {
    const input = zipped ? (inputs[i] as PublicationAuthorInput | undefined) : undefined;
    if (a.speaker) {
      const org = input && 'speakerId' in input && input.speakerId ? (input.organization ?? '') : zipped ? '' : (a.organization ?? '');
      return speakerAuthor(a.speaker, { key: a.id || newKey('a'), organization: org, isCorresponding: a.isCorresponding });
    }
    const manual = input && !('speakerId' in input && input.speakerId) ? (input as Extract<PublicationAuthorInput, { fullName: string }>) : null;
    return emptyManualAuthor({
      key: a.id || newKey('a'),
      fullName: a.fullName ?? manual?.fullName ?? '',
      avatarAssetId: manual?.avatarAssetId ?? a.avatar?.id ?? null,
      avatar: a.avatar ?? null,
      organization: nullToBlank(manual?.organization ?? a.organization),
      url: nullToBlank(manual?.url ?? a.url),
      isCorresponding: a.isCorresponding,
    });
  });
}

export function publicationToForm(p: PublicationAdmin): PublicationFormValues {
  return {
    slug: p.slug,
    type: p.type,
    title: p.title,
    subtitle: nullToBlank(p.subtitle),
    abstract: nullToBlank(p.abstract),
    body: Array.isArray(p.body) ? p.body : [],
    coverAssetId: p.coverAssetId ?? p.cover?.id ?? null,
    pdfAssetId: p.pdfAssetId ?? p.pdf?.id ?? null,
    containerTitle: nullToBlank(p.containerTitle),
    volume: nullToBlank(p.volume),
    issue: nullToBlank(p.issue),
    pages: nullToBlank(p.pages),
    publisher: nullToBlank(p.publisher),
    publishedYear: p.publishedYear ?? null,
    publishedMonth: p.publishedMonth ?? null,
    publishedDay: p.publishedDay ?? null,
    doi: nullToBlank(p.doi),
    isbn: nullToBlank(p.isbn),
    issn: nullToBlank(p.issn),
    arxivId: nullToBlank(p.arxivId),
    url: nullToBlank(p.url),
    links: (p.links ?? []).map((l) => ({ key: newKey('l'), kind: l.kind, label: l.label, url: l.url })),
    keywords: p.keywords ?? [],
    language: nullToBlank(p.language),
    status: p.status ?? 'published',
    license: nullToBlank(p.license),
    citationKey: nullToBlank(p.citationKey),
    visibility: p.visibility ?? 'published',
    authors: authorsToRows(p),
  };
}

const n = (s: string | null | undefined) => {
  const t = (s ?? '').trim();
  return t ? t : null;
};

/** Form values to the shared PublicationInput (what the API validates). */
export function formToInput(v: PublicationFormValues): PublicationInput {
  return {
    slug: v.slug,
    type: v.type,
    title: v.title.trim(),
    subtitle: n(v.subtitle),
    abstract: n(v.abstract),
    body: v.body ?? [],
    coverAssetId: v.coverAssetId,
    pdfAssetId: v.pdfAssetId,
    containerTitle: n(v.containerTitle),
    volume: n(v.volume),
    issue: n(v.issue),
    pages: n(v.pages),
    publisher: n(v.publisher),
    publishedYear: v.publishedYear,
    publishedMonth: v.publishedYear ? v.publishedMonth : null,
    publishedDay: v.publishedYear && v.publishedMonth ? v.publishedDay : null,
    doi: n(cleanDoi(v.doi)),
    isbn: n(v.isbn),
    issn: n(v.issn),
    arxivId: n(v.arxivId),
    url: n(v.url),
    links: v.links
      .filter((l) => l.url.trim())
      .map((l) => ({ kind: l.kind, label: l.label.trim() || LINK_KIND_LABELS[l.kind], url: l.url.trim() })),
    keywords: v.keywords,
    language: n(v.language),
    status: v.status,
    license: n(v.license),
    citationKey: n(v.citationKey),
    visibility: v.visibility,
    authors: v.authors.map((a): PublicationAuthorInput =>
      a.kind === 'speaker' && a.speaker
        ? { speakerId: a.speaker.id, organization: n(a.organization), isCorresponding: a.isCorresponding }
        : { fullName: a.fullName.trim(), avatarAssetId: a.avatarAssetId, organization: n(a.organization), url: n(a.url), isCorresponding: a.isCorresponding },
    ),
  };
}

/** The live "Cite this" source, straight from the form. */
export function formToCitation(v: Partial<PublicationFormValues>): CitationSource {
  return {
    type: v.type ?? 'article',
    title: v.title?.trim() || 'Untitled',
    subtitle: n(v.subtitle),
    authors: (v.authors ?? []).map((a) => (a.kind === 'speaker' ? (a.speaker?.fullName ?? '') : a.fullName).trim()).filter(Boolean),
    containerTitle: n(v.containerTitle),
    volume: n(v.volume),
    issue: n(v.issue),
    pages: n(v.pages),
    publisher: n(v.publisher),
    year: v.publishedYear ?? null,
    month: v.publishedMonth ?? null,
    day: v.publishedDay ?? null,
    doi: n(cleanDoi(v.doi)),
    url: n(v.url),
    isbn: n(v.isbn),
    issn: n(v.issn),
    arxivId: n(v.arxivId),
    citationKey: n(v.citationKey),
  };
}

/** "lecun2015deep": first author's family name + year + first real title word. */
export function suggestCitationKey(v: Partial<PublicationFormValues>): string {
  const first = (v.authors ?? [])[0];
  const name = first ? (first.kind === 'speaker' ? first.speaker?.fullName : first.fullName) : '';
  const family = (name ?? '').trim().split(/\s+/).pop() ?? '';
  const stop = new Set(['a', 'an', 'the', 'on', 'of', 'in', 'for', 'and', 'to', 'with', 'towards', 'toward']);
  const word = (v.title ?? '').toLowerCase().split(/[^a-z0-9]+/i).find((w) => w && !stop.has(w)) ?? 'paper';
  const ascii = (s: string) => s.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  return `${ascii(family) || 'zemi'}${v.publishedYear ?? ''}${ascii(word)}`.slice(0, 80);
}

export const SORT_OPTIONS: Array<{ value: PublicationSort; label: string }> = [
  { value: 'year', label: 'Newest first' },
  { value: 'recent', label: 'Recently updated' },
  { value: 'title', label: 'Title, A to Z' },
];
