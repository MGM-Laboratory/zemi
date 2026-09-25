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
