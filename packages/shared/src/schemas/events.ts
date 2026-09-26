import { z } from 'zod';
import { EVENT_MODES, SPEAKER_ROLES, type Accent, type EventMode, type SpeakerRole } from '../constants.js';
import type { EventAction } from '../rbac.js';
import type { EventStatus, StreamState } from '../status.js';
import {
  accentSchema,
  blocksSchema,
  hhmmSchema,
  idSchema,
  isoDate,
  optionalUrl,
  slugSchema,
  visibilitySchema,
  type Blocks,
  type ImageRef,
  type VideoRef,
} from './common.js';
import type { PublicationCard } from './publications.js';
import type { SpeakerRef } from './speakers.js';
import type { Venue } from './venues.js';

export const eventInput = z
  .object({
    slug: slugSchema,
    number: z.number().int().min(0).max(100000).optional().nullable(),
    title: z.string().min(1).max(200),
    summary: z.string().max(400).optional().nullable(),
    coverAssetId: idSchema.optional().nullable(),
    description: blocksSchema.default([]),
    startsAt: isoDate,
    endsAt: isoDate,
    venueId: idSchema.optional().nullable(),
    roomNote: z.string().max(200).optional().nullable(),
    mapsUrl: optionalUrl,
    onlineNote: z.string().max(300).optional().nullable(),
    mode: z.enum(EVENT_MODES).default('hybrid'),
    accent: accentSchema.default('blue'),
    tags: z.array(z.string().min(1).max(40)).max(20).default([]),
    visibility: visibilitySchema.default('draft'),
    registrationOpen: z.boolean().default(true),
    capacity: z.number().int().min(1).max(100000).optional().nullable(),
    registrationClosesAt: isoDate.optional().nullable(),
    showRegistrantCount: z.boolean().default(true),
  })
  .refine((e) => new Date(e.endsAt) > new Date(e.startsAt), {
    message: 'The event has to end after it starts.',
    path: ['endsAt'],
  });
export type EventInput = z.infer<typeof eventInput>;

// .partial() is not available on refined objects in zod v4, so the update schema is explicit.
export const eventUpdateInput = z.object({
  slug: slugSchema.optional(),
  number: z.number().int().min(0).max(100000).optional().nullable(),
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(400).optional().nullable(),
  coverAssetId: idSchema.optional().nullable(),
  description: blocksSchema.optional(),
  startsAt: isoDate.optional(),
  endsAt: isoDate.optional(),
  venueId: idSchema.optional().nullable(),
  roomNote: z.string().max(200).optional().nullable(),
  mapsUrl: optionalUrl,
  onlineNote: z.string().max(300).optional().nullable(),
  mode: z.enum(EVENT_MODES).optional(),
  accent: accentSchema.optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  registrationOpen: z.boolean().optional(),
  capacity: z.number().int().min(1).max(100000).optional().nullable(),
  registrationClosesAt: isoDate.optional().nullable(),
  showRegistrantCount: z.boolean().optional(),
});
export type EventUpdateInput = z.infer<typeof eventUpdateInput>;

/**
 * POST /admin/events. Everything is optional: the API fills in the next free Friday (13:15 to 15:15 WIB),
 * `number` = max + 1, a unique slug from the title, a rotating accent, the default room/capacity from
 * site settings, and `visibility: 'draft'`. A full `eventInput` body is accepted too.
 */
export const eventCreateInput = eventUpdateInput.extend({
  title: z.string().min(1).max(200).optional(),
  visibility: visibilitySchema.optional(),
});
export type EventCreateInput = z.infer<typeof eventCreateInput>;

export const eventPublishInput = z.object({ visibility: visibilitySchema });
export const eventCancelInput = z.object({
  reason: z.string().max(500).optional().nullable(),
  notify: z.boolean().default(true),
});

export const eventSpeakerInput = z.object({
  speakerId: idSchema,
  role: z.enum(SPEAKER_ROLES).default('speaker'),
  organization: z.string().max(200).optional().nullable(),
  position: z.string().max(200).optional().nullable(),
  talkTitle: z.string().max(300).optional().nullable(),
});
export const eventSpeakersInput = z.object({ speakers: z.array(eventSpeakerInput).max(30) });

export const rundownItemInput = z.object({
  time: hhmmSchema,
  endTime: hhmmSchema.optional().nullable(),
  agenda: z.string().min(1).max(200),
  note: z.string().max(500).optional().nullable(),
  speakerId: idSchema.optional().nullable(),
});
export const rundownInput = z.object({ items: z.array(rundownItemInput).max(60) });
export type RundownItemInput = z.infer<typeof rundownItemInput>;

export const eventPublicationsInput = z.object({
  items: z.array(z.object({ publicationId: idSchema, note: z.string().max(300).optional().nullable() })).max(50),
});

export const eventMediaInput = z.object({
  assetId: idSchema,
  caption: z.string().max(500).optional().nullable(),
  featured: z.boolean().default(false),
});
export const eventMediaUpdateInput = z.object({
  caption: z.string().max(500).optional().nullable(),
  featured: z.boolean().optional(),
});
export const orderInput = z.object({ ids: z.array(idSchema).max(500) });

export const eventListQuery = z.object({
  when: z.enum(['upcoming', 'past', 'live', 'all']).default('all'),
  search: z.string().max(200).optional(),
  tag: z.string().max(40).optional(),
  speaker: z.string().max(120).optional(),
  year: z.coerce.number().int().optional(),
  visibility: visibilitySchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export interface EventSpeaker extends SpeakerRef {
  role: SpeakerRole;
  organization: string | null;
  position: string | null;
  talkTitle: string | null;
}

export interface RundownItem {
  id: string;
  time: string;
  endTime: string | null;
  agenda: string;
  note: string | null;
  speaker: SpeakerRef | null;
}

export interface EventMediaItem {
  id: string;
  kind: 'image' | 'video';
  caption: string | null;
  featured: boolean;
  image: ImageRef | null;
  video: VideoRef | null;
  createdAt: string;
}

/**
 * Documentation item as the admin sees it (GET /admin/events/:id/media and EventAdmin.media):
 * includes items whose asset is still processing (image/video null until ready).
 */
export interface EventMediaAdminItem extends EventMediaItem {
  assetId: string;
  status: 'processing' | 'ready' | 'failed';
  error: string | null;
  originalFilename: string;
  sortOrder: number;
}

export interface RecordingChapter {
  title: string;
  startSec: number;
}

export interface Recording {
  id: string;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  isPrimary: boolean;
  video: VideoRef | null;
  chapters: RecordingChapter[];
}

export interface EventCard {
  id: string;
  slug: string;
  number: number | null;
  title: string;
  summary: string | null;
  cover: ImageRef | null;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  isLive: boolean;
  venue: { name: string; kind: string } | null;
  mode: EventMode;
  accent: Accent;
  tags: string[];
  speakers: Array<Pick<EventSpeaker, 'id' | 'slug' | 'fullName' | 'nickname' | 'avatar' | 'organization' | 'role'>>;
  registrationCount: number | null;
  capacity: number | null;
  hasRecording: boolean;
}

export interface EventStreamPublic {
  state: StreamState;
  ingestOnline: boolean;
  hlsUrl: string | null;
  liveStartedAt: string | null;
  viewers: number;
}

export interface EventRegistrationInfo {
  open: boolean;
  closesAt: string | null;
  spotsLeft: number | null;
  /** Why registration is closed, in plain words. */
  reason: string | null;
}

export interface EventDetail extends EventCard {
  description: Blocks;
  roomNote: string | null;
  mapsUrl: string | null;
  onlineNote: string | null;
  venueFull: Pick<Venue, 'id' | 'name' | 'kind' | 'building' | 'floor' | 'capacity' | 'address' | 'mapsUrl'> | null;
  speakersFull: EventSpeaker[];
  rundown: RundownItem[];
  publications: Array<PublicationCard & { note: string | null }>;
  media: EventMediaItem[];
  recordings: Recording[];
  stream: EventStreamPublic;
  registration: EventRegistrationInfo;
  cancelReason: string | null;
  /**
   * `unlisted` events open by link but stay out of lists and search: the public page should send
   * `noindex`. The public API 404s drafts, so there this is only ever `published` or `unlisted`.
   */
  visibility: z.infer<typeof visibilitySchema>;
  prev: { slug: string; title: string; number: number | null } | null;
  next: { slug: string; title: string; number: number | null } | null;
  updatedAt: string;
}

export interface EventAdmin extends Omit<EventDetail, 'prev' | 'next'> {
  visibility: z.infer<typeof visibilitySchema>;
  coverAssetId: string | null;
  venueId: string | null;
  registrationOpen: boolean;
  registrationClosesAt: string | null;
  showRegistrantCount: boolean;
  cancelledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  permissions: EventAction[];
  counts: { registrations: number; checkedIn: number; inPerson: number; online: number };
  /**
   * True once OBS keys exist for this event (the lazily created `event_streams` row).
   * Optional: the admin readiness checklist shows "not sure yet" when it is missing.
   */
  streamConfigured?: boolean;
}

export interface EventAdminRow {
  id: string;
  slug: string;
  number: number | null;
  title: string;
  cover: ImageRef | null;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  visibility: z.infer<typeof visibilitySchema>;
  streamState: StreamState;
  venue: string | null;
  accent: Accent;
  registrations: number;
  checkedIn: number;
  capacity: number | null;
  speakers: string[];
  /** Optional speaker photos for the admin list, same order as `speakers`. Names fall back to initials. */
  speakerAvatars?: Array<{ fullName: string; avatar: ImageRef | null }>;
  permissions: EventAction[];
}

export type LiveEvent =
  | { type: 'state'; stream: EventStreamPublic; status: EventStatus }
  | { type: 'viewers'; viewers: number }
  | { type: 'reaction'; kind: string; count: number }
  | { type: 'ping'; t: string };
