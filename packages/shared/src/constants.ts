export const TIMEZONE = 'Asia/Jakarta' as const;
/** Jakarta is fixed UTC+7 with no daylight saving time. */
export const JAKARTA_OFFSET_MINUTES = 7 * 60;

export const DEFAULT_SESSION = {
  weekday: 5, // Friday (0 = Sunday)
  start: '13:15',
  end: '15:15',
} as const;

export const BRAND = {
  name: 'Zemi',
  lab: 'MGM Laboratory',
  labUrl: 'https://labmgm.org',
  mailFrom: 'Zemi <no-reply@labmgm.org>',
  colors: {
    blue: '#3a6dc5',
    yellow: '#f7bf33',
    red: '#f94141',
    green: '#0f8657',
    ink: '#0e1116',
    paper: '#ffffff',
  },
} as const;

export const ACCENTS = ['blue', 'yellow', 'red', 'green'] as const;
export type Accent = (typeof ACCENTS)[number];

export const IMAGE_WIDTHS = [320, 480, 640, 960, 1280, 1600, 1920, 2560] as const;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 96;

export const CSRF_HEADER = 'x-zemi-csrf';
export const SESSION_COOKIE = 'zemi_session';

export const REACTION_KINDS = ['clap', 'heart', 'fire', 'idea', 'laugh'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export const LINK_KINDS = [
  'website',
  'linkedin',
  'github',
  'scholar',
  'orcid',
  'researchgate',
  'x',
  'instagram',
  'youtube',
  'email',
  'other',
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const PUBLICATION_TYPES = [
  'journal-article',
  'conference-paper',
  'preprint',
  'thesis',
  'book',
  'book-chapter',
  'report',
  'dataset',
  'software',
  'project',
  'poster',
  'article',
  'other',
] as const;
export type PublicationType = (typeof PUBLICATION_TYPES)[number];

export const PUBLICATION_TYPE_LABELS: Record<PublicationType, string> = {
  'journal-article': 'Journal article',
  'conference-paper': 'Conference paper',
  preprint: 'Preprint',
  thesis: 'Thesis',
  book: 'Book',
  'book-chapter': 'Book chapter',
  report: 'Report',
  dataset: 'Dataset',
  software: 'Software',
  project: 'Project',
  poster: 'Poster',
  article: 'Article',
  other: 'Other',
};

export const PUBLICATION_STATUSES = [
  'published',
  'in-press',
  'accepted',
  'under-review',
  'preprint',
  'in-progress',
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const PUBLICATION_LINK_KINDS = [
  'pdf',
  'publisher',
  'code',
  'dataset',
  'slides',
  'video',
  'poster',
  'website',
  'other',
] as const;
export type PublicationLinkKind = (typeof PUBLICATION_LINK_KINDS)[number];

export const VENUE_KINDS = ['classroom', 'theater', 'lab', 'hall', 'online', 'other'] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];

export const EVENT_MODES = ['hybrid', 'offline', 'online'] as const;
export type EventMode = (typeof EVENT_MODES)[number];

export const VISIBILITIES = ['draft', 'published', 'unlisted'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const SPEAKER_ROLES = ['speaker', 'keynote', 'moderator', 'panelist'] as const;
export type SpeakerRole = (typeof SPEAKER_ROLES)[number];

export const ASSET_PURPOSES = [
  'event-cover',
  'speaker-avatar',
  'author-avatar',
  'team-avatar',
  'documentation',
  'publication-cover',
  'publication-pdf',
  'recording',
  'editor',
  'site',
  'bumper',
] as const;
export type AssetPurpose = (typeof ASSET_PURPOSES)[number];

/** Crop aspect ratio (width / height) required per purpose. null = free. */
export const PURPOSE_ASPECT: Record<AssetPurpose, number | null> = {
  'event-cover': 4 / 5,
  'speaker-avatar': 1,
  'author-avatar': 1,
  'team-avatar': 1,
  documentation: null,
  'publication-cover': 4 / 5,
  'publication-pdf': null,
  recording: null,
  editor: null,
  site: null,
  bumper: null,
};
