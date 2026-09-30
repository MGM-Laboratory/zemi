import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  bigint,
} from 'drizzle-orm/pg-core';
import type {
  Adjust,
  Blocks,
  BumperSlide,
  BumperTheme,
  Crop,
  LinkItem,
  Policy,
  PublicationLink,
} from '@zemi/shared';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () =>
  ts('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------ admins */

export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  note: text('note'),
  passphraseLookup: text('passphrase_lookup').notNull().unique(),
  passphraseHash: text('passphrase_hash').notNull(),
  policy: jsonb('policy').$type<Policy>().notNull().default({ capabilities: [], grants: [] }),
  expiresAt: ts('expires_at'),
  disabledAt: ts('disabled_at'),
  lastLoginAt: ts('last_login_at'),
  createdBy: text('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    principalType: text('principal_type', { enum: ['superadmin', 'admin'] }).notNull(),
    adminId: uuid('admin_id').references(() => admins.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_admin_idx').on(t.adminId)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorType: text('actor_type', { enum: ['superadmin', 'admin', 'system', 'public'] }).notNull(),
    actorId: text('actor_id'),
    actorName: text('actor_name').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    summary: text('summary').notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>(),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_created_idx').on(t.createdAt),
    index('audit_resource_idx').on(t.resourceType, t.resourceId),
  ],
);

/* ------------------------------------------------------------------ assets */

export interface AssetVariants {
  /**
   * Processing revision. Appended to media URLs as `?v=<rev>` so re-processed files (recrop) bust the
   * immutable cache while keys stay `assets/<id>/w<width>.<fmt>`. Additive, no migration needed (jsonb).
   */
  rev?: string;
  /** Page count for PDFs, when cheap to read. */
  pages?: number;
  /** width -> storage key */
  avif?: Record<string, string>;
  webp?: Record<string, string>;
  mp4?: string;
  webm?: string;
  hls?: string;
  poster?: string;
  storyboard?: {
    key: string;
    interval: number;
    columns: number;
    tileWidth: number;
    tileHeight: number;
    count: number;
  };
}

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind', { enum: ['image', 'video', 'document', 'audio'] }).notNull(),
    purpose: text('purpose').notNull(),
    status: text('status', { enum: ['processing', 'ready', 'failed'] }).notNull().default('processing'),
    error: text('error'),
    originalFilename: text('original_filename').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull().default(0),
    originalKey: text('original_key').notNull(),
    variants: jsonb('variants').$type<AssetVariants>().notNull().default({}),
    width: integer('width'),
    height: integer('height'),
    durationSec: real('duration_sec'),
    lqip: text('lqip'),
    color: text('color'),
    crop: jsonb('crop').$type<Crop>(),
    adjust: jsonb('adjust').$type<Adjust>(),
    alt: text('alt'),
    caption: text('caption'),
    credit: text('credit'),
    createdBy: text('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('assets_purpose_idx').on(t.purpose, t.createdAt)],
);

/* ------------------------------------------------------------------ venues */

export const venues = pgTable('venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['classroom', 'theater', 'lab', 'hall', 'online', 'other'] }).notNull(),
  building: text('building'),
  floor: text('floor'),
  capacity: integer('capacity'),
  address: text('address'),
  mapsUrl: text('maps_url'),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ speakers */

export const speakers = pgTable(
  'speakers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    fullName: text('full_name').notNull(),
    nickname: text('nickname'),
    headline: text('headline'),
    bio: jsonb('bio').$type<Blocks>().notNull().default([]),
    bioText: text('bio_text').notNull().default(''),
    avatarAssetId: uuid('avatar_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    links: jsonb('links').$type<LinkItem[]>().notNull().default([]),
    defaultOrganization: text('default_organization'),
    defaultPosition: text('default_position'),
    email: text('email'),
    visibility: text('visibility', { enum: ['draft', 'published', 'unlisted'] }).notNull().default('published'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('speakers_name_idx').on(t.fullName)],
);

/* ------------------------------------------------------------------ events */

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    number: integer('number'),
    title: text('title').notNull(),
    summary: text('summary'),
    coverAssetId: uuid('cover_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    description: jsonb('description').$type<Blocks>().notNull().default([]),
    descriptionText: text('description_text').notNull().default(''),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at').notNull(),
    venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'set null' }),
    roomNote: text('room_note'),
    mapsUrl: text('maps_url'),
    onlineNote: text('online_note'),
    mode: text('mode', { enum: ['hybrid', 'offline', 'online'] }).notNull().default('hybrid'),
    accent: text('accent', { enum: ['blue', 'yellow', 'red', 'green'] }).notNull().default('blue'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    visibility: text('visibility', { enum: ['draft', 'published', 'unlisted'] }).notNull().default('draft'),
    registrationOpen: boolean('registration_open').notNull().default(true),
    capacity: integer('capacity'),
    registrationClosesAt: ts('registration_closes_at'),
    showRegistrantCount: boolean('show_registrant_count').notNull().default(true),
    cancelledAt: ts('cancelled_at'),
    cancelReason: text('cancel_reason'),
    publishedAt: ts('published_at'),
    remindersScheduledFor: ts('reminders_scheduled_for'),
    /** Lifecycle emails: set once each batch has been sent so the scheduler never double-sends. */
    reminderSentAt: ts('reminder_sent_at'),
    startingSentAt: ts('starting_sent_at'),
    thanksSentAt: ts('thanks_sent_at'),
    /**
     * Set when `startsAt` moved more than an hour later (the `*_sent_at` columns are reset at the same
     * time). Lifecycle recipient dedupe only counts emails sent after it, so people hear the new time.
     */
    scheduleChangedAt: ts('schedule_changed_at'),
    createdBy: text('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('events_starts_idx').on(t.startsAt), index('events_visibility_idx').on(t.visibility)],
);

export const eventSpeakers = pgTable(
  'event_speakers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    speakerId: uuid('speaker_id')
      .notNull()
      .references(() => speakers.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['speaker', 'keynote', 'moderator', 'panelist'] }).notNull().default('speaker'),
    organization: text('organization'),
    position: text('position'),
    talkTitle: text('talk_title'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    index('event_speakers_event_idx').on(t.eventId),
    index('event_speakers_speaker_idx').on(t.speakerId),
  ],
);

export const rundownItems = pgTable(
  'rundown_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    time: text('time').notNull(),
    endTime: text('end_time'),
    agenda: text('agenda').notNull(),
    note: text('note'),
    speakerId: uuid('speaker_id').references(() => speakers.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('rundown_event_idx').on(t.eventId)],
);

/* ------------------------------------------------------------------ publications */

export const publications = pgTable(
  'publications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    abstract: text('abstract'),
    body: jsonb('body').$type<Blocks>().notNull().default([]),
    coverAssetId: uuid('cover_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    pdfAssetId: uuid('pdf_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    containerTitle: text('container_title'),
    volume: text('volume'),
    issue: text('issue'),
    pages: text('pages'),
    publisher: text('publisher'),
    publishedYear: integer('published_year'),
    publishedMonth: integer('published_month'),
    publishedDay: integer('published_day'),
    doi: text('doi'),
    isbn: text('isbn'),
    issn: text('issn'),
    arxivId: text('arxiv_id'),
    url: text('url'),
    links: jsonb('links').$type<PublicationLink[]>().notNull().default([]),
    keywords: text('keywords').array().notNull().default(sql`'{}'::text[]`),
    language: text('language'),
    status: text('status').notNull().default('published'),
    license: text('license'),
    citationKey: text('citation_key'),
    visibility: text('visibility', { enum: ['draft', 'published', 'unlisted'] }).notNull().default('published'),
    createdBy: text('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('publications_year_idx').on(t.publishedYear)],
);

export const publicationAuthors = pgTable(
  'publication_authors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicationId: uuid('publication_id')
      .notNull()
      .references(() => publications.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    speakerId: uuid('speaker_id').references(() => speakers.id, { onDelete: 'set null' }),
    fullName: text('full_name'),
    avatarAssetId: uuid('avatar_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    organization: text('organization'),
    url: text('url'),
    isCorresponding: boolean('is_corresponding').notNull().default(false),
  },
  (t) => [index('pub_authors_pub_idx').on(t.publicationId), index('pub_authors_speaker_idx').on(t.speakerId)],
);

export const eventPublications = pgTable(
  'event_publications',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    publicationId: uuid('publication_id')
      .notNull()
      .references(() => publications.id, { onDelete: 'cascade' }),
    note: text('note'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.publicationId] })],
);

/* ------------------------------------------------------------------ documentation media */

export const eventMedia = pgTable(
  'event_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    caption: text('caption'),
    featured: boolean('featured').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('event_media_event_idx').on(t.eventId)],
);

/* ------------------------------------------------------------------ registrations */

export const registrations = pgTable(
  'registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull().default(''),
    attendanceMode: text('attendance_mode', { enum: ['in-person', 'online'] }).notNull().default('in-person'),
    ticketCode: text('ticket_code').notNull().unique(),
    qrToken: text('qr_token').notNull().unique(),
    status: text('status', { enum: ['registered', 'cancelled'] }).notNull().default('registered'),
    source: text('source', { enum: ['web', 'admin', 'walk-in', 'import'] }).notNull().default('web'),
    checkedInAt: ts('checked_in_at'),
    checkedInBy: text('checked_in_by'),
    checkInMethod: text('check_in_method', { enum: ['qr', 'manual'] }),
    notes: text('notes'),
    emailStatus: text('email_status', { enum: ['pending', 'sent', 'failed', 'logged'] }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    cancelledAt: ts('cancelled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('registrations_event_email_uq').on(t.eventId, t.email),
    index('registrations_event_idx').on(t.eventId, t.createdAt),
    index('registrations_email_idx').on(t.email),
  ],
);

export const checkins = pgTable(
  'checkins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    action: text('action', { enum: ['check-in', 'undo'] }).notNull(),
    method: text('method', { enum: ['qr', 'manual'] }).notNull(),
    /** Principal id (admin uuid or 'superadmin'). Null on rows from before it was kept. */
    actorId: text('actor_id'),
    /** Display name at the time, for the feed. Filters use `actorId`. */
    actorName: text('actor_name').notNull(),
    device: text('device'),
    createdAt: createdAt(),
  },
  (t) => [index('checkins_event_idx').on(t.eventId, t.createdAt)],
);

/* ------------------------------------------------------------------ streaming */

export const eventStreams = pgTable('event_streams', {
  eventId: uuid('event_id')
    .primaryKey()
    .references(() => events.id, { onDelete: 'cascade' }),
  streamKey: text('stream_key').notNull().unique(),
  privateKeyEnc: text('private_key_enc').notNull(),
  state: text('state', { enum: ['idle', 'preview', 'live', 'ended'] }).notNull().default('idle'),
  ingestOnline: boolean('ingest_online').notNull().default(false),
  ingestOnlineAt: ts('ingest_online_at'),
  liveStartedAt: ts('live_started_at'),
  liveEndedAt: ts('live_ended_at'),
  currentSessionId: uuid('current_session_id'),
  peakViewers: integer('peak_viewers').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const streamSessions = pgTable(
  'stream_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    streamKey: text('stream_key').notNull(),
    title: text('title'),
    startedAt: ts('started_at').notNull(),
    endedAt: ts('ended_at'),
    recordingStatus: text('recording_status', {
      enum: ['recording', 'waiting', 'processing', 'ready', 'failed', 'none'],
    })
      .notNull()
      .default('recording'),
    recordingAssetId: uuid('recording_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    visibility: text('visibility', { enum: ['public', 'hidden'] }).notNull().default('public'),
    isPrimary: boolean('is_primary').notNull().default(false),
    peakViewers: integer('peak_viewers').notNull().default(0),
    error: text('error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('stream_sessions_event_idx').on(t.eventId, t.startedAt)],
);

export const recordingSegments = pgTable(
  'recording_segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    streamKey: text('stream_key').notNull(),
    s3Key: text('s3_key').notNull(),
    filename: text('filename').notNull(),
    startedAt: ts('started_at').notNull(),
    durationSec: real('duration_sec'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('segments_key_start_idx').on(t.streamKey, t.startedAt),
    uniqueIndex('segments_key_file_uq').on(t.streamKey, t.filename),
  ],
);

/* ------------------------------------------------------------------ email */

export const emailLogs = pgTable(
  'email_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    to: text('to').notNull(),
    template: text('template').notNull(),
    subject: text('subject').notNull(),
    status: text('status', { enum: ['sent', 'failed', 'logged'] }).notNull(),
    providerId: text('provider_id'),
    error: text('error'),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    registrationId: uuid('registration_id').references(() => registrations.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('email_logs_event_idx').on(t.eventId, t.createdAt)],
);

/* ------------------------------------------------------------------ site CMS */

export const siteSettings = pgTable('site_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  updatedAt: updatedAt(),
  updatedBy: text('updated_by'),
});

export const faqs = pgTable('faqs', {
  id: uuid('id').primaryKey().defaultRandom(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  visibility: text('visibility', { enum: ['published', 'draft'] }).notNull().default('published'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const teamMembers = pgTable('team_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  role: text('role'),
  bio: text('bio'),
  avatarAssetId: uuid('avatar_asset_id').references(() => assets.id, { onDelete: 'set null' }),
  links: jsonb('links').$type<LinkItem[]>().notNull().default([]),
  visibility: text('visibility', { enum: ['published', 'draft'] }).notNull().default('published'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const contactMessages = pgTable(
  'contact_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    topic: text('topic').notNull(),
    message: text('message').notNull(),
    status: text('status', { enum: ['new', 'read', 'replied', 'archived'] }).notNull().default('new'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('contact_created_idx').on(t.createdAt)],
);

export const slugRedirects = pgTable(
  'slug_redirects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resourceType: text('resource_type', { enum: ['event', 'speaker', 'publication'] }).notNull(),
    oldSlug: text('old_slug').notNull(),
    resourceId: uuid('resource_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('slug_redirects_uq').on(t.resourceType, t.oldSlug)],
);

/* ------------------------------------------------------------------ discussions */

export const discussionIdentities = pgTable('discussion_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  tag: text('tag').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  status: text('status', { enum: ['active', 'suspended', 'deleted'] }).notNull().default('active'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('discussion_identity_name_tag_uq').on(sql`lower(${t.name})`, t.tag)]);

export const discussionThreads = pgTable('discussion_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id').references(() => discussionIdentities.id, { onDelete: 'set null' }),
  authorLabel: text('author_label').notNull(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  body: jsonb('body').$type<Blocks>().notNull(),
  bodyText: text('body_text').notNull(),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  status: text('status', { enum: ['open', 'locked', 'archived', 'hidden', 'deleted'] }).notNull().default('open'),
  pinned: boolean('pinned').notNull().default(false),
  flagged: boolean('flagged').notNull().default(false),
  acceptedCommentId: uuid('accepted_comment_id'),
  score: integer('score').notNull().default(0),
  commentCount: integer('comment_count').notNull().default(0),
  reportCount: integer('report_count').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('discussion_threads_created_idx').on(t.createdAt),
  index('discussion_threads_event_idx').on(t.eventId, t.createdAt),
  index('discussion_threads_status_idx').on(t.status, t.reportCount),
]);

export const discussionComments = pgTable('discussion_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  threadId: uuid('thread_id').notNull().references(() => discussionThreads.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id'),
  authorId: uuid('author_id').references(() => discussionIdentities.id, { onDelete: 'set null' }),
  authorLabel: text('author_label').notNull(),
  body: text('body').notNull(),
  status: text('status', { enum: ['visible', 'hidden', 'deleted'] }).notNull().default('visible'),
  score: integer('score').notNull().default(0),
  reportCount: integer('report_count').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('discussion_comments_thread_idx').on(t.threadId, t.createdAt)]);

export const discussionVotes = pgTable('discussion_votes', {
  identityId: uuid('identity_id').notNull().references(() => discussionIdentities.id, { onDelete: 'cascade' }),
  targetType: text('target_type', { enum: ['thread', 'comment'] }).notNull(),
  targetId: uuid('target_id').notNull(),
  value: integer('value').notNull(),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.identityId, t.targetType, t.targetId] }), index('discussion_votes_target_idx').on(t.targetType, t.targetId)]);

export const discussionReactions = pgTable('discussion_reactions', {
  identityId: uuid('identity_id').notNull().references(() => discussionIdentities.id, { onDelete: 'cascade' }),
  targetType: text('target_type', { enum: ['thread', 'comment'] }).notNull(),
  targetId: uuid('target_id').notNull(),
  kind: text('kind').notNull(),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.identityId, t.targetType, t.targetId, t.kind] })]);

export const discussionReports = pgTable('discussion_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id').references(() => discussionIdentities.id, { onDelete: 'set null' }),
  targetType: text('target_type', { enum: ['thread', 'comment'] }).notNull(),
  targetId: uuid('target_id').notNull(),
  reason: text('reason').notNull(),
  note: text('note'),
  status: text('status', { enum: ['open', 'resolved', 'dismissed'] }).notNull().default('open'),
  createdAt: createdAt(),
  resolvedAt: ts('resolved_at'),
  resolvedBy: text('resolved_by'),
}, (t) => [index('discussion_reports_status_idx').on(t.status, t.createdAt)]);

/* ------------------------------------------------------------------ bumpers */

/**
 * A bumper show: an ordered list of animated full-screen slides for the venue screen and OBS.
 * Slides live in one jsonb array (validated by the shared zod schema) so reorders and edits are
 * atomic and versioned. The live_* columns are the authoritative playback state; SSE only fans it out.
 */
export const bumperShows = pgTable(
  'bumper_shows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['active', 'archived'] }).notNull().default('active'),
    origin: text('origin', { enum: ['blank', 'generated', 'duplicate', 'starter', 'restored'] }).notNull().default('blank'),
    theme: jsonb('theme').$type<BumperTheme>().notNull(),
    slides: jsonb('slides').$type<BumperSlide[]>().notNull().default([]),
    version: integer('version').notNull().default(1),
    /** Read-only capability id in the OBS output URL (plain, like a ticket token). */
    outputKey: text('output_key').notNull().unique(),
    /** Control key for the OBS dock / Companion: sha256 for lookup, AES-GCM (AAD = show id) to show it again. */
    controlKeyHash: text('control_key_hash').notNull().unique(),
    controlKeyEnc: text('control_key_enc').notNull(),
    keysRotatedAt: ts('keys_rotated_at').notNull().defaultNow(),
    liveSlideId: text('live_slide_id'),
    liveFromSlideId: text('live_from_slide_id'),
    liveTransition: text('live_transition'),
    liveDir: integer('live_dir').notNull().default(1),
    liveMode: text('live_mode', { enum: ['show', 'black', 'clear'] }).notNull().default('show'),
    liveAutoplay: boolean('live_autoplay').notNull().default(true),
    liveAdvanceAt: ts('live_advance_at'),
    liveStartedAt: ts('live_started_at'),
    liveUpdatedAt: ts('live_updated_at').notNull().defaultNow(),
    liveSeq: integer('live_seq').notNull().default(0),
    liveCue: integer('live_cue').notNull().default(0),
    liveSlideSince: ts('live_slide_since'),
    liveVia: text('live_via'),
    liveBy: text('live_by'),
    lastPlayedAt: ts('last_played_at'),
    archivedAt: ts('archived_at'),
    createdBy: text('created_by'),
    createdByName: text('created_by_name'),
    updatedBy: text('updated_by'),
    updatedByName: text('updated_by_name'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('bumper_shows_event_idx').on(t.eventId),
    index('bumper_shows_status_updated_idx').on(t.status, t.updatedAt),
    index('bumper_shows_advance_idx').on(t.liveAdvanceAt),
  ],
);

/** Saved versions of a show (coalesced autosaves, generations, restores). */
export const bumperRevisions = pgTable(
  'bumper_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    showId: uuid('show_id')
      .notNull()
      .references(() => bumperShows.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    theme: jsonb('theme').$type<BumperTheme>().notNull(),
    slides: jsonb('slides').$type<BumperSlide[]>().notNull(),
    reason: text('reason').notNull().default('save'),
    createdBy: text('created_by'),
    createdByName: text('created_by_name'),
    createdAt: createdAt(),
  },
  (t) => [index('bumper_revisions_show_idx').on(t.showId, t.createdAt)],
);
