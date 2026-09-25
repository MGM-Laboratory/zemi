import { z } from 'zod';
import {
  PUBLICATION_LINK_KINDS,
  PUBLICATION_STATUSES,
  PUBLICATION_TYPES,
  type PublicationStatus,
  type PublicationType,
} from '../constants.js';
import type { ContentAction } from '../rbac.js';
import {
  blocksSchema,
  idSchema,
  optionalUrl,
  slugSchema,
  visibilitySchema,
  type Blocks,
  type FileRef,
  type ImageRef,
} from './common.js';
import type { SpeakerRef } from './speakers.js';

export const publicationLinkSchema = z.object({
  kind: z.enum(PUBLICATION_LINK_KINDS),
  label: z.string().min(1).max(120),
  url: z.string().min(1).max(2048),
});
export type PublicationLink = z.infer<typeof publicationLinkSchema>;

export const publicationAuthorInput = z.union([
  z.object({
    speakerId: idSchema,
    organization: z.string().max(200).optional().nullable(),
    isCorresponding: z.boolean().default(false),
  }),
  z.object({
    speakerId: z.null().optional(),
    fullName: z.string().min(1).max(160),
    avatarAssetId: idSchema.optional().nullable(),
    organization: z.string().max(200).optional().nullable(),
    url: optionalUrl,
    isCorresponding: z.boolean().default(false),
  }),
]);
export type PublicationAuthorInput = z.infer<typeof publicationAuthorInput>;

export const publicationInput = z.object({
  slug: slugSchema,
  type: z.enum(PUBLICATION_TYPES),
  title: z.string().min(1).max(400),
  subtitle: z.string().max(400).optional().nullable(),
  abstract: z.string().max(20000).optional().nullable(),
  body: blocksSchema.default([]),
  coverAssetId: idSchema.optional().nullable(),
  pdfAssetId: idSchema.optional().nullable(),
  containerTitle: z.string().max(300).optional().nullable(),
  volume: z.string().max(40).optional().nullable(),
  issue: z.string().max(40).optional().nullable(),
  pages: z.string().max(40).optional().nullable(),
  publisher: z.string().max(200).optional().nullable(),
  publishedYear: z.number().int().min(1900).max(2200).optional().nullable(),
  publishedMonth: z.number().int().min(1).max(12).optional().nullable(),
  publishedDay: z.number().int().min(1).max(31).optional().nullable(),
  doi: z.string().max(200).optional().nullable(),
  isbn: z.string().max(40).optional().nullable(),
  issn: z.string().max(40).optional().nullable(),
  arxivId: z.string().max(40).optional().nullable(),
  url: optionalUrl,
  links: z.array(publicationLinkSchema).max(30).default([]),
  keywords: z.array(z.string().min(1).max(60)).max(30).default([]),
  language: z.string().max(40).optional().nullable(),
  status: z.enum(PUBLICATION_STATUSES).default('published'),
  license: z.string().max(80).optional().nullable(),
  citationKey: z.string().max(80).optional().nullable(),
  visibility: visibilitySchema.default('published'),
  authors: z.array(publicationAuthorInput).max(100).default([]),
});
export type PublicationInput = z.infer<typeof publicationInput>;
export const publicationUpdateInput = publicationInput.partial();

export const publicationQuickInput = z.object({
  title: z.string().min(1).max(400),
  url: optionalUrl,
});

export interface PublicationAuthor {
  id: string;
  speaker: SpeakerRef | null;
  fullName: string;
  avatar: ImageRef | null;
  organization: string | null;
  url: string | null; // manual authors: opens in a new tab. Speaker authors link to /speakers/:slug
  isCorresponding: boolean;
}

export interface PublicationCard {
  id: string;
  slug: string;
  type: PublicationType;
  title: string;
  subtitle: string | null;
  containerTitle: string | null;
  publishedYear: number | null;
  status: PublicationStatus;
  cover: ImageRef | null;
  authors: Array<Pick<PublicationAuthor, 'fullName' | 'avatar'> & { speakerSlug: string | null }>;
  keywords: string[];
  doi: string | null;
  hasPdf: boolean;
}

export interface PublicationDetail extends PublicationCard {
  abstract: string | null;
  body: Blocks;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  publisher: string | null;
  publishedMonth: number | null;
  publishedDay: number | null;
  isbn: string | null;
  issn: string | null;
  arxivId: string | null;
  url: string | null;
  links: PublicationLink[];
  language: string | null;
  license: string | null;
  citationKey: string | null;
  pdf: FileRef | null;
  authorsFull: PublicationAuthor[];
  events: Array<{ id: string; slug: string; title: string; number: number | null; startsAt: string; cover: ImageRef | null }>;
  updatedAt: string;
}

export interface PublicationAdmin extends PublicationDetail {
  visibility: z.infer<typeof visibilitySchema>;
  coverAssetId: string | null;
  pdfAssetId: string | null;
  authorInputs: PublicationAuthorInput[];
  createdAt: string;
  permissions: ContentAction[];
}

export const publicationListQuery = z.object({
  search: z.string().max(200).optional(),
  type: z.enum(PUBLICATION_TYPES).optional(),
  year: z.coerce.number().int().optional(),
  tag: z.string().max(60).optional(),
  speaker: z.string().max(120).optional(),
  visibility: visibilitySchema.optional(),
  sort: z.enum(['recent', 'year', 'title']).default('year'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

/** Result of GET /admin/publications/doi?doi= (Crossref). Partial input to prefill the form. */
export type DoiLookupResult = Partial<PublicationInput> & {
  authorsRaw: Array<{
    fullName: string;
    organization: string | null;
    orcid: string | null;
    /** A speaker in the directory with the same name (case and accent insensitive), when there is exactly one. */
    speaker?: SpeakerRef | null;
  }>;
};

/** GET /admin/publications row. */
export interface PublicationAdminRow extends PublicationCard {
  visibility: z.infer<typeof visibilitySchema>;
  /** Events (any visibility) that reference it. */
  eventCount: number;
  createdAt: string;
  updatedAt: string;
  permissions: ContentAction[];
}

/** GET /admin/publications/lookup item and POST /admin/publications/quick result (the web's PublicationRef). */
export interface PublicationLookupItem {
  id: string;
  slug: string;
  title: string;
  type: PublicationType;
  publishedYear: number | null;
  containerTitle: string | null;
  visibility: z.infer<typeof visibilitySchema>;
}

/**
 * POST /admin/publications body. Same as `publicationInput`, but `slug` may be left out: the API makes a
 * unique one from the title.
 */
export const publicationCreateInput = publicationInput.extend({ slug: slugSchema.optional() });
export type PublicationCreateInput = z.infer<typeof publicationCreateInput>;

export const doiLookupQuery = z.object({
  doi: z
    .string({ error: 'Paste a DOI first, like 10.1038/nature14539.' })
    .trim()
    .min(1, 'Paste a DOI first, like 10.1038/nature14539.')
    .max(300, 'That DOI is way too long. Mind checking it?'),
});

/** DELETE /admin/publications/:id result. */
export interface PublicationDeleteResult {
  ok: true;
  /** Events that listed this publication (their event_publications rows are gone). */
  affectedEvents: number;
}
