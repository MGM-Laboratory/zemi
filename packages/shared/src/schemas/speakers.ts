import { z } from 'zod';
import type { ContentAction } from '../rbac.js';
import type { EventStatus } from '../status.js';
import { blocksSchema, idSchema, linkSchema, slugSchema, visibilitySchema, type Blocks, type ImageRef, type LinkItem } from './common.js';

export const speakerInput = z.object({
  slug: slugSchema,
  fullName: z.string().min(1).max(160),
  nickname: z.string().max(60).optional().nullable(),
  headline: z.string().max(200).optional().nullable(),
  bio: blocksSchema.default([]),
  avatarAssetId: idSchema.optional().nullable(),
  links: z.array(linkSchema).max(20).default([]),
  defaultOrganization: z.string().max(200).optional().nullable(),
  defaultPosition: z.string().max(200).optional().nullable(),
  email: z.union([z.email(), z.literal('')]).optional().nullable(),
  visibility: visibilitySchema.default('published'),
});
export type SpeakerInput = z.infer<typeof speakerInput>;
export const speakerUpdateInput = speakerInput.partial();

/** Minimal speaker for pickers and cards. */
export interface SpeakerRef {
  id: string;
  slug: string;
  fullName: string;
  nickname: string | null;
  headline: string | null;
  avatar: ImageRef | null;
  defaultOrganization: string | null;
  defaultPosition: string | null;
}

export interface SpeakerTalk {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  eventNumber: number | null;
  startsAt: string;
  status: EventStatus;
  role: string;
  talkTitle: string | null;
  organization: string | null;
  position: string | null;
  cover: ImageRef | null;
}

export interface SpeakerPublic extends SpeakerRef {
  bio: Blocks;
  links: LinkItem[];
  talks: SpeakerTalk[];
  publications: Array<{ slug: string; title: string; type: string; year: number | null }>;
  talkCount: number;
}

export interface SpeakerAdmin extends SpeakerPublic {
  email: string | null;
  visibility: z.infer<typeof visibilitySchema>;
  avatarAssetId: string | null;
  createdAt: string;
  updatedAt: string;
  permissions: ContentAction[];
}

export const speakerListQuery = z.object({
  search: z.string().max(200).optional(),
  visibility: visibilitySchema.optional(),
  sort: z.enum(['name', 'recent', 'talks']).default('name'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
