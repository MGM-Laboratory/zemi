import { z } from 'zod';
import { ACCENTS, type Accent, type EventMode, type PublicationType, type SpeakerRole, type VenueKind } from '../constants.js';
import type { Ability } from '../rbac.js';
import type { EventStatus } from '../status.js';
import { hhmmSchema, type ImageRef, type LinkItem } from './common.js';

/**
 * Bumpers: full-screen animated cards played on the venue screen and in OBS between the parts of
 * a Friday (welcome, host, speaker, paper, thanks, Q and A, break, closing...). A *show* is an
 * ordered list of *slides* (each slide is one bumper). Slides reference database records by id
 * (event, speaker, publication, team member, discussion thread, image) and every template
 * resolves its text from those records at render time, so a speaker rename flows through.
 *
 * Coordinates: every slide is authored on a fixed 1920x1080 canvas (`BUMPER_CANVAS`).
 */

export const BUMPER_CANVAS = { width: 1920, height: 1080 } as const;
export const BUMPER_MAX_SLIDES = 150;
/** Title-safe inset (px on the 1920x1080 canvas). */
export const BUMPER_SAFE_INSET = { x: 96, y: 64 } as const;

const ID_RE = /^[A-Za-z0-9_-]{4,32}$/;
/** Slide, item and element ids (short client-made ids, not uuids). */
export const bumperIdSchema = z.string().regex(ID_RE, 'That id looks off.');
const FIELD_KEY_RE = /^[a-zA-Z][\w.-]{0,39}$/;
const fieldKey = z.string().regex(FIELD_KEY_RE);

/* ---------------------------------------------------------------- categories and kinds */

export const BUMPER_CATEGORIES = ['pre-show', 'opening', 'talks', 'interaction', 'breaks', 'closing', 'utility'] as const;
export type BumperCategory = (typeof BUMPER_CATEGORIES)[number];

export const BUMPER_CATEGORY_META: Record<BumperCategory, { label: string; hint: string }> = {
  'pre-show': { label: 'Before we start', hint: 'Loops for the room while people find a seat.' },
  opening: { label: 'Opening', hint: 'Welcome, agenda, host and opening remarks.' },
  talks: { label: 'Talks', hint: 'Speakers, keynotes, papers and thank-yous.' },
  interaction: { label: 'Questions', hint: 'Q and A, featured questions, prompts and QR codes.' },
  breaks: { label: 'Breaks', hint: 'Coffee, photos and "be right back".' },
  closing: { label: 'Closing', hint: 'Awards, credits, next Friday and goodbye.' },
  utility: { label: 'Utility', hint: 'Sections, announcements, photos, lower thirds and a blank canvas.' },
};

export const BUMPER_KINDS = [
  // pre-show
  'standby',
  'countdown',
  'house-rules',
  'wifi',
  'sponsors',
  // opening
  'welcome',
  'event-title',
  'agenda',
  'up-next',
  'mc',
  'opening',
  'ceremony',
  // talks
  'keynote',
  'speaker',
  'paper',
  'talk-title',
  'panel',
  'lineup',
  'thanks-speaker',
  'quote',
  // interaction
  'qna',
  'featured-question',
  'prompt',
  'feedback',
  'register',
  // breaks
  'break',
  'brb',
  'photo',
  // closing
  'awards',
  'credits',
  'next-event',
  'closing',
  'socials',
  // utility
  'section',
  'announcement',
  'image',
  'lower-third',
  'custom',
  'blank',
] as const;
export type BumperKind = (typeof BUMPER_KINDS)[number];

/** What a template can bind to. The inspector shows one picker per ref key. */
export type BumperRefKey =
  | 'event'
  | 'speaker'
  | 'speakers'
  | 'person'
  | 'publication'
  | 'rundown'
  | 'thread'
  | 'threads'
  | 'team'
  | 'image'
  | 'images';

export interface BumperKindMeta {
  label: string;
  category: BumperCategory;
  description: string;
  refs: BumperRefKey[];
}

export const BUMPER_KIND_META: Record<BumperKind, BumperKindMeta> = {
  standby: { label: 'Starting soon', category: 'pre-show', description: 'A countdown to the start with the title, date and room. Loops happily before doors.', refs: ['event'] },
  countdown: { label: 'Countdown', category: 'pre-show', description: 'A big timer to a time of day or a number of minutes. "We start in 5".', refs: [] },
  'house-rules': { label: 'Housekeeping', category: 'pre-show', description: 'Phones on silent, where the coffee is, Wi-Fi, the recording notice.', refs: ['event'] },
  wifi: { label: 'Wi-Fi', category: 'pre-show', description: 'Network name, password and a scan-to-join QR.', refs: [] },
  sponsors: { label: 'Thanks to', category: 'pre-show', description: 'Hosts, partners or sponsors with their logos.', refs: ['images'] },
  welcome: { label: 'Welcome', category: 'opening', description: 'The big hello: the Zemi number, the title and a cheer from the crew.', refs: ['event'] },
  'event-title': { label: 'Event poster', category: 'opening', description: 'Cover, title, date and room, like the event page.', refs: ['event'] },
  agenda: { label: 'Agenda', category: 'opening', description: 'Today\'s rundown with times. It can highlight what is on now.', refs: ['event'] },
  'up-next': { label: 'Up next', category: 'opening', description: 'One agenda item, big, with its time and speaker.', refs: ['event', 'rundown'] },
  mc: { label: 'Your host', category: 'opening', description: 'Introduces the MC or moderator.', refs: ['event', 'person'] },
  opening: { label: 'Opening remarks', category: 'opening', description: 'Introduces whoever opens the session, like the head of the lab.', refs: ['event', 'person'] },
  ceremony: { label: 'A moment', category: 'opening', description: 'Opening prayer, national anthem, a minute of silence or a round of applause.', refs: [] },
  keynote: { label: 'Keynote', category: 'talks', description: 'A grand intro for the keynote speaker and their talk.', refs: ['event', 'speaker'] },
  speaker: { label: 'Speaker', category: 'talks', description: 'Photo, name, affiliation and talk title, straight from their profile.', refs: ['event', 'speaker'] },
  paper: { label: 'Paper', category: 'talks', description: 'Title, authors, venue and year of a publication.', refs: ['event', 'publication'] },
  'talk-title': { label: 'Talk title', category: 'talks', description: 'The talk title, big, with the speaker underneath.', refs: ['event', 'speaker'] },
  panel: { label: 'Panel', category: 'talks', description: 'Two to six people on stage together.', refs: ['event', 'speakers'] },
  lineup: { label: 'Lineup', category: 'talks', description: 'Everyone speaking today in one frame.', refs: ['event'] },
  'thanks-speaker': { label: 'Thank you, speaker', category: 'talks', description: 'A warm thank-you with an applause cue.', refs: ['event', 'speaker'] },
  quote: { label: 'Quote', category: 'talks', description: 'A line worth repeating, with who said it.', refs: ['person'] },
  qna: { label: 'Q and A', category: 'interaction', description: 'zemi.ac/q in huge type and a QR that opens the discussion.', refs: ['event'] },
  'featured-question': { label: 'Question from the room', category: 'interaction', description: 'Put questions from the discussion page on screen.', refs: ['event', 'threads'] },
  prompt: { label: 'Talk to your neighbor', category: 'interaction', description: 'A question or prompt for the room.', refs: [] },
  feedback: { label: 'Feedback', category: 'interaction', description: 'A QR to a feedback form.', refs: [] },
  register: { label: 'Save your seat', category: 'interaction', description: 'A QR to register for this Friday or the next one.', refs: ['event'] },
  break: { label: 'Coffee break', category: 'breaks', description: 'A break with a countdown to when we are back.', refs: [] },
  brb: { label: 'Be right back', category: 'breaks', description: 'For technical hiccups or a quick pause.', refs: [] },
  photo: { label: 'Group photo', category: 'breaks', description: 'Squeeze in. A 3, 2, 1 with a flash.', refs: [] },
  awards: { label: 'Award', category: 'closing', description: 'Best question, best paper, best anything. With confetti.', refs: ['person'] },
  credits: { label: 'Credits', category: 'closing', description: 'Everyone who made today happen, rolling.', refs: ['event', 'team'] },
  'next-event': { label: 'Next Friday', category: 'closing', description: 'A promo for the next event with a register QR.', refs: ['event'] },
  closing: { label: 'Thanks for coming', category: 'closing', description: 'The see-you-next-Friday card.', refs: ['event'] },
  socials: { label: 'Stay in touch', category: 'closing', description: 'Site, socials and how to reach the team.', refs: [] },
  section: { label: 'Section title', category: 'utility', description: 'A chapter card between parts of the show.', refs: [] },
  announcement: { label: 'Announcement', category: 'utility', description: 'A headline and a few lines of text.', refs: [] },
  image: { label: 'Photo', category: 'utility', description: 'One full-screen image with an optional caption.', refs: ['image'] },
  'lower-third': { label: 'Lower third', category: 'utility', description: 'A name strip over the camera, on a clear background.', refs: ['event', 'person'] },
  custom: { label: 'Blank canvas', category: 'utility', description: 'Start empty and add your own text, images, QR codes and characters.', refs: [] },
  blank: { label: 'Black', category: 'utility', description: 'A plain black or clear screen.', refs: [] },
};

/* ---------------------------------------------------------------- transitions */

export const BUMPER_TRANSITIONS = [
  'curtain-call',
  'q-iris',
  'eyelids',
  'shape-morph',
  'grid-mosaic',
  'magic-move',
  'paper-plane',
  'coffee-pour',
  'bridge-arc',
  'block-stack',
  'hunch-shutter',
  'confetti-pop',
  'split-doors',
  'portal-zoom',
  'stamp',
  'blinds',
  'page-turn',
  'ribbon-sweep',
  'scramble-cut',
  'clock-wipe',
  'ink-flood',
  'gravity-drop',
  'halftone',
  'word-wipe',
  'crossfade',
  'cut',
] as const;
export type BumperTransitionKey = (typeof BUMPER_TRANSITIONS)[number];

export type BumperTransitionMood = 'playful' | 'grand' | 'calm' | 'snappy';

export const BUMPER_TRANSITION_META: Record<BumperTransitionKey, { label: string; description: string; mood: BumperTransitionMood }> = {
  'curtain-call': { label: 'Curtain call', description: 'The four characters roll in, stretch into a curtain and close the screen, then pull it open.', mood: 'grand' },
  'q-iris': { label: 'Q iris', description: 'Q rolls in and grows until the screen is blue, blinks, then opens onto the next bumper.', mood: 'playful' },
  eyelids: { label: 'Wake up', description: 'The screen closes its eyes for a beat, then blinks awake on the next bumper.', mood: 'playful' },
  'shape-morph': { label: 'Shape morph', description: 'One giant shape morphs circle, triangle, square, arch, then opens a window.', mood: 'grand' },
  'grid-mosaic': { label: 'Mosaic', description: 'A grid of brand tiles flips across the screen.', mood: 'snappy' },
  'magic-move': { label: 'Magic move', description: 'Things both bumpers share glide to their new spots, everything else trades places.', mood: 'calm' },
  'paper-plane': { label: 'Paper plane', description: 'The page folds into a plane and flies off, pulling the next bumper in.', mood: 'playful' },
  'coffee-pour': { label: 'Coffee pour', description: 'Waves fill the screen from the bottom, then drain away.', mood: 'playful' },
  'bridge-arc': { label: 'Rainbow bridge', description: 'Arches sweep over the screen like a bridge between two moments.', mood: 'grand' },
  'block-stack': { label: 'Block stack', description: 'Blocks drop and stack up, then tumble away.', mood: 'playful' },
  'hunch-shutter': { label: 'Shutter', description: 'Triangles snap shut like a camera shutter.', mood: 'snappy' },
  'confetti-pop': { label: 'Confetti pop', description: 'A flash and a burst of shape confetti.', mood: 'playful' },
  'split-doors': { label: 'Sliding doors', description: 'Bands slide apart in opposite directions.', mood: 'snappy' },
  'portal-zoom': { label: 'Portal', description: 'A circle opens from a point and swallows the screen.', mood: 'grand' },
  stamp: { label: 'Stamp', description: 'A big rubber stamp lands with a thud.', mood: 'snappy' },
  blinds: { label: 'Blinds', description: 'Slats turn to reveal the next bumper.', mood: 'calm' },
  'page-turn': { label: 'Page turn', description: 'A notebook page flips over.', mood: 'calm' },
  'ribbon-sweep': { label: 'Ribbons', description: 'Four brand ribbons streak across.', mood: 'snappy' },
  'scramble-cut': { label: 'Scramble', description: 'Letters scramble into the next title, then cut.', mood: 'snappy' },
  'clock-wipe': { label: 'Clock wipe', description: 'A clock hand sweeps the next bumper in.', mood: 'calm' },
  'ink-flood': { label: 'Ink flood', description: 'Blobs of ink spread and melt away.', mood: 'grand' },
  'gravity-drop': { label: 'Gravity', description: 'The screen drops away and the next one bounces in.', mood: 'playful' },
  halftone: { label: 'Halftone', description: 'Dots swell to cover the screen, then shrink away.', mood: 'calm' },
  'word-wipe': { label: 'Word train', description: 'The next bumper\'s name rushes across in giant type.', mood: 'snappy' },
  crossfade: { label: 'Crossfade', description: 'A calm fade.', mood: 'calm' },
  cut: { label: 'Cut', description: 'Instant switch.', mood: 'snappy' },
};

/* ---------------------------------------------------------------- slide schema */

export const bumperRundownRefSchema = z.object({
  /** Position in the event rundown. Rundown rows are recreated on every save, so we also keep time + agenda to find it again. */
  index: z.number().int().min(0).max(200),
  time: hhmmSchema.nullish(),
  agenda: z.string().max(200).nullish(),
});
export type BumperRundownRef = z.infer<typeof bumperRundownRefSchema>;

export const bumperRefsSchema = z.object({
  /** Overrides the show's event for this slide (for example the next-event promo). */
  eventId: z.uuid().nullish(),
  speakerId: z.uuid().nullish(),
  speakerIds: z.array(z.uuid()).max(12).optional(),
  /** A person who is a team member rather than a speaker (host, opening remarks, awards). */
  teamMemberId: z.uuid().nullish(),
  teamMemberIds: z.array(z.uuid()).max(60).optional(),
  publicationId: z.uuid().nullish(),
  threadIds: z.array(z.uuid()).max(6).optional(),
  /** Main image (photo slide). */
  assetId: z.uuid().nullish(),
  /** Logos, sponsors. */
  assetIds: z.array(z.uuid()).max(24).optional(),
  rundown: bumperRundownRefSchema.nullish(),
});
export type BumperRefs = z.infer<typeof bumperRefsSchema>;

export const bumperFieldValueSchema = z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]);
export type BumperFieldValue = z.infer<typeof bumperFieldValueSchema>;
export const bumperFieldsSchema = z
  .record(fieldKey, bumperFieldValueSchema)
  .refine((v) => Object.keys(v).length <= 80, { message: 'Too many fields on one bumper.' });

/** A row in a list-shaped template (house rules, agenda written by hand, credits, sponsors). */
export const bumperItemSchema = z.object({
  id: bumperIdSchema,
  title: z.string().max(300).default(''),
  body: z.string().max(1000).default(''),
  meta: z.string().max(200).default(''),
  /** A shape name, a sticker key or an emoji-free icon key. */
  icon: z.string().max(40).nullish(),
  assetId: z.uuid().nullish(),
  url: z.string().max(2048).nullish(),
});
export type BumperItem = z.infer<typeof bumperItemSchema>;

export const bumperBoxSchema = z.object({
  x: z.number().min(-1920).max(3840),
  y: z.number().min(-1080).max(2160),
  w: z.number().min(4).max(3840),
  h: z.number().min(4).max(2160),
});
export type BumperBox = z.infer<typeof bumperBoxSchema>;

export const BUMPER_TONES = ['ink', 'paper', 'blue', 'red', 'green', 'yellow', 'accent', 'muted'] as const;
export type BumperTone = (typeof BUMPER_TONES)[number];

/** Per-element override the builder writes when someone drags, resizes or restyles a template element. */
export const bumperLayerSchema = z.object({
  box: bumperBoxSchema.optional(),
  hidden: z.boolean().optional(),
  /** Content scale (text size multiplier). */
  scale: z.number().min(0.2).max(5).optional(),
  rotate: z.number().min(-180).max(180).optional(),
  align: z.enum(['start', 'center', 'end']).optional(),
  tone: z.enum(BUMPER_TONES).optional(),
  z: z.number().int().min(-50).max(50).optional(),
});
export type BumperLayer = z.infer<typeof bumperLayerSchema>;

export const BUMPER_ELEMENT_TYPES = [
  'text',
  'image',
  'qr',
  'shape',
  'character',
  'sticker',
  'clock',
  'countdown',
  'logo',
  'line',
] as const;
export type BumperElementType = (typeof BUMPER_ELEMENT_TYPES)[number];

/** A free element added on top of a template (the "+ Add" menu in the builder). Props per type: docs/features/bumpers.md. */
export const bumperElementSchema = z.object({
  id: bumperIdSchema,
  type: z.enum(BUMPER_ELEMENT_TYPES),
  box: bumperBoxSchema,
  rotate: z.number().min(-180).max(180).default(0),
  z: z.number().int().min(-50).max(50).default(0),
  props: z.record(fieldKey, bumperFieldValueSchema).default({}),
});
export type BumperElement = z.infer<typeof bumperElementSchema>;

export const BUMPER_BACKGROUNDS = ['auto', 'paper', 'ink', 'accent', 'graph', 'image', 'transparent'] as const;
export type BumperBackground = (typeof BUMPER_BACKGROUNDS)[number];
export const BUMPER_MASCOTS = ['auto', 'none', 'circle', 'triangle', 'square', 'arch', 'all'] as const;
export type BumperMascot = (typeof BUMPER_MASCOTS)[number];

export const bumperSlideStyleSchema = z.object({
  /** 'auto' follows the show theme. */
  accent: z.enum(['auto', ...ACCENTS]).default('auto'),
  background: z.enum(BUMPER_BACKGROUNDS).default('auto'),
  backgroundAssetId: z.uuid().nullish(),
  /** How much a background photo is darkened (0 to 0.9). */
  dim: z.number().min(0).max(0.9).default(0.4),
  mascot: z.enum(BUMPER_MASCOTS).default('auto'),
  /** Layout variant key, defined per template. */
  variant: z.string().max(24).nullish(),
  textScale: z.number().min(0.6).max(1.6).default(1),
});
export type BumperSlideStyle = z.infer<typeof bumperSlideStyleSchema>;

export const bumperTimingSchema = z.object({
  /** Seconds before playback moves on by itself. Null = wait for the operator. */
  autoAdvanceSec: z.number().int().min(2).max(7200).nullable().default(null),
  /** When auto-advancing from this slide, jump here instead of the next one (makes loops). */
  loopToId: bumperIdSchema.nullable().default(null),
});
export type BumperTiming = z.infer<typeof bumperTimingSchema>;

export const bumperSlideSchema = z.object({
  id: bumperIdSchema,
  kind: z.enum(BUMPER_KINDS),
  /** Operator label in the rail. Empty = derived from the template and its data. */
  label: z.string().max(80).nullish(),
  refs: bumperRefsSchema.prefault({}),
  fields: bumperFieldsSchema.prefault({}),
  items: z.array(bumperItemSchema).max(40).default([]),
  layers: z.record(fieldKey, bumperLayerSchema).default({}),
  extras: z.array(bumperElementSchema).max(40).default([]),
  style: bumperSlideStyleSchema.prefault({}),
  timing: bumperTimingSchema.prefault({}),
  /** Transition INTO this slide. 'auto' lets the pair rules pick. */
  transitionIn: z.enum(['auto', ...BUMPER_TRANSITIONS]).default('auto'),
  notes: z.string().max(4000).nullish(),
  /** Skipped by playback, kept in the show. */
  hidden: z.boolean().default(false),
});
export type BumperSlide = z.infer<typeof bumperSlideSchema>;
export type BumperSlideInput = z.input<typeof bumperSlideSchema>;

export const BUMPER_MOTION_LEVELS = ['full', 'calm', 'still'] as const;
export type BumperMotionLevel = (typeof BUMPER_MOTION_LEVELS)[number];
export const BUMPER_QR_STYLES = ['rounded', 'dots', 'square'] as const;
export type BumperQrStyle = (typeof BUMPER_QR_STYLES)[number];

export const bumperThemeSchema = z.object({
  /** 'event' uses the linked event's accent (blue when there is none). */
  accent: z.enum(['event', ...ACCENTS]).default('event'),
  background: z.enum(['paper', 'ink', 'graph']).default('paper'),
  /** Show the characters on templates that have them. */
  mascots: z.boolean().default(true),
  motion: z.enum(BUMPER_MOTION_LEVELS).default('full'),
  /** Corner bug: the Zemi mark and the event number. */
  bug: z.boolean().default(true),
  /** Small corner clock (WIB). */
  clock: z.boolean().default(false),
  /** Shrink content 5% for projectors that crop the edges (overscan). Backgrounds stay full-bleed. */
  safeArea: z.boolean().default(false),
  qrStyle: z.enum(BUMPER_QR_STYLES).default('rounded'),
  /** Soft synthesized stings on transitions (off by default: the AV desk owns the sound). */
  sound: z.boolean().default(false),
});
export type BumperTheme = z.infer<typeof bumperThemeSchema>;
export const DEFAULT_BUMPER_THEME: BumperTheme = bumperThemeSchema.parse({});

/* ---------------------------------------------------------------- show inputs */

export const BUMPER_SHOW_STATUSES = ['active', 'archived'] as const;
export type BumperShowStatus = (typeof BUMPER_SHOW_STATUSES)[number];
export const BUMPER_ORIGINS = ['blank', 'generated', 'duplicate', 'starter', 'restored'] as const;
export type BumperOrigin = (typeof BUMPER_ORIGINS)[number];

/** A show's slide list: at most BUMPER_MAX_SLIDES, unique ids. */
export const bumperSlidesArray = z
  .array(bumperSlideSchema)
  .max(BUMPER_MAX_SLIDES, `A show can hold up to ${BUMPER_MAX_SLIDES} bumpers.`)
  .refine((list) => new Set(list.map((s) => s.id)).size === list.length, { message: 'Two bumpers share an id.' });

/** POST /admin/bumpers */
export const bumperShowCreateInput = z.object({
  title: z.string().trim().min(1, 'Give the show a name.').max(120),
  eventId: z.uuid().nullable().optional(),
  theme: bumperThemeSchema.partial().optional(),
  slides: bumperSlidesArray.optional(),
  origin: z.enum(BUMPER_ORIGINS).default('blank'),
});
export type BumperShowCreateInput = z.infer<typeof bumperShowCreateInput>;

/** PATCH /admin/bumpers/:id. `baseVersion` must match the stored version unless `force` is set (409 `version_conflict`). */
export const bumperShowUpdateInput = z.object({
  baseVersion: z.number().int().min(0),
  force: z.boolean().optional(),
  title: z.string().trim().min(1, 'Give the show a name.').max(120).optional(),
  eventId: z.uuid().nullable().optional(),
  theme: bumperThemeSchema.optional(),
  slides: bumperSlidesArray.optional(),
  status: z.enum(BUMPER_SHOW_STATUSES).optional(),
  /** Save a named revision now (otherwise revisions are coalesced every few minutes). */
  checkpoint: z.string().trim().max(80).optional(),
});
export type BumperShowUpdateInput = z.infer<typeof bumperShowUpdateInput>;

/** POST /admin/bumpers/:id/duplicate */
export const bumperDuplicateInput = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  eventId: z.uuid().nullable().optional(),
});
export type BumperDuplicateInput = z.infer<typeof bumperDuplicateInput>;

/** POST /admin/bumpers/:id/output/rotate */
export const bumperRotateInput = z.object({ which: z.enum(['output', 'control', 'both']).default('both') });
export type BumperRotateInput = z.infer<typeof bumperRotateInput>;

/** POST /admin/bumpers/:id/revisions/:revId/restore */
export const bumperRestoreInput = z.object({ baseVersion: z.number().int().min(0) });
export type BumperRestoreInput = z.infer<typeof bumperRestoreInput>;

/** GET /admin/bumpers */
export const bumperListQuery = z.object({
  status: z.enum(['active', 'archived', 'all']).default('active'),
  eventId: z.uuid().optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type BumperListQuery = z.infer<typeof bumperListQuery>;

export const bumperPersonPickSchema = z.object({
  /** auto: pick from the event (moderator for the host, rundown for opening remarks). */
  mode: z.enum(['auto', 'speaker', 'team', 'name', 'none']).default('auto'),
  id: z.uuid().nullish(),
  name: z.string().trim().max(160).nullish(),
  role: z.string().trim().max(160).nullish(),
});
export type BumperPersonPick = z.infer<typeof bumperPersonPickSchema>;

export const BUMPER_QNA_MODES = ['end', 'after-each', 'none'] as const;
export type BumperQnaMode = (typeof BUMPER_QNA_MODES)[number];

/** POST /admin/bumpers/generate. `create: false` returns a preview without saving. */
export const bumperGenerateInput = z.object({
  eventId: z.uuid(),
  title: z.string().trim().max(120).optional(),
  create: z.boolean().default(true),
  /** Standby countdown + agenda (+ housekeeping) looping before the start. */
  preshow: z.boolean().default(true),
  houseRules: z.boolean().default(true),
  welcome: z.boolean().default(true),
  agenda: z.boolean().default(true),
  host: bumperPersonPickSchema.prefault({}),
  opening: bumperPersonPickSchema.prefault({}),
  papers: z.boolean().default(true),
  thanks: z.boolean().default(true),
  qna: z.enum(BUMPER_QNA_MODES).default('end'),
  /** Follow the rundown's break, or skip it. */
  breaks: z.boolean().default(true),
  photo: z.boolean().default(true),
  nextEvent: z.boolean().default(true),
  credits: z.boolean().default(false),
  closing: z.boolean().default(true),
  theme: bumperThemeSchema.partial().optional(),
});
export type BumperGenerateInput = z.infer<typeof bumperGenerateInput>;

/** POST /admin/bumpers/resolve: fetch display data for records picked in the builder. */
export const bumperResolveInput = z.object({
  eventIds: z.array(z.uuid()).max(50).default([]),
  speakerIds: z.array(z.uuid()).max(100).default([]),
  publicationIds: z.array(z.uuid()).max(100).default([]),
  teamMemberIds: z.array(z.uuid()).max(100).default([]),
  threadIds: z.array(z.uuid()).max(50).default([]),
  assetIds: z.array(z.uuid()).max(100).default([]),
});
export type BumperResolveInput = z.infer<typeof bumperResolveInput>;

/** GET /admin/bumpers/sources/:kind */
export const bumperSourceQuery = z.object({
  q: z.string().trim().max(100).optional(),
  eventId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type BumperSourceQuery = z.infer<typeof bumperSourceQuery>;

/* ---------------------------------------------------------------- live control */

/** show: slides on screen. black: solid black. clear: nothing (transparent in OBS). */
export const BUMPER_OUTPUT_MODES = ['show', 'black', 'clear'] as const;
export type BumperOutputMode = (typeof BUMPER_OUTPUT_MODES)[number];

export const BUMPER_CONTROL_ACTIONS = [
  'next',
  'prev',
  'goto',
  'first',
  'last',
  'show',
  'black',
  'clear',
  'toggle-black',
  'autoplay-on',
  'autoplay-off',
  'replay',
  'reset',
] as const;
export type BumperControlAction = (typeof BUMPER_CONTROL_ACTIONS)[number];

/** POST /admin/bumpers/:id/live and POST /public/bumpers/control/:key */
export const bumperControlInput = z.object({
  action: z.enum(BUMPER_CONTROL_ACTIONS),
  /** goto target. */
  slideId: bumperIdSchema.optional(),
  /** goto by 1-based position in playback order (dock number pad, Companion). */
  position: z.number().int().min(1).max(BUMPER_MAX_SLIDES).optional(),
  /** Idempotency for next/prev: only step when the current slide is still this one. */
  fromSlideId: bumperIdSchema.nullish(),
  /** Force a transition for this one change ('cut' for an emergency switch). */
  transition: z.enum(['auto', ...BUMPER_TRANSITIONS]).optional(),
});
export type BumperControlInput = z.infer<typeof bumperControlInput>;

export type BumperControlVia = 'admin' | 'dock' | 'api' | 'auto' | 'system';

/** Authoritative playback state. The server picks the transition so every screen plays the same one. */
export interface BumperLiveState {
  showId: string;
  /** Current slide (by id, so reordering during a show never jumps). Null when the show has no playable slide. */
  slideId: string | null;
  /** When the current slide came on screen (ISO, server clock; reset by replay). Countdowns in minutes count from here on every screen. */
  slideSince: string | null;
  /** 0-based position of `slideId` in playback order (hidden slides skipped), -1 when none. */
  position: number;
  /** Playable slide count. */
  total: number;
  /** Slide shown before the latest change, and how to get from it to `slideId`. */
  fromSlideId: string | null;
  transition: BumperTransitionKey | null;
  dir: 1 | -1;
  mode: BumperOutputMode;
  autoplay: boolean;
  /** When auto-advance fires next (ISO), if the current slide auto-advances. */
  advanceAt: string | null;
  /** First time the show was driven today (ISO). */
  startedAt: string | null;
  updatedAt: string;
  /** Increments on every change; screens converge on the highest seq. */
  seq: number;
  /** Increments on "replay": screens replay the current slide's entrance. */
  cue: number;
  via: BumperControlVia;
  by: string | null;
  /** Server clock when this was sent (ISO), for countdowns on machines with a drifting clock. */
  serverNow: string;
  /** Show content version the state refers to. */
  version: number;
}

export type BumperClientKind = 'output' | 'dock' | 'controller';
export interface BumperPresenceClient {
  id: string;
  kind: BumperClientKind;
  obs: boolean;
  /** "OBS 32 (Chromium 127)", "Chrome 131", ... */
  agent: string | null;
  since: string;
}
export interface BumperPresence {
  outputs: number;
  docks: number;
  controllers: number;
  clients: BumperPresenceClient[];
}

/** SSE messages on /admin/bumpers/:id/live/stream and /public/bumpers/{out,control}/:key/stream. */
export type BumperStreamMessage =
  | { type: 'state'; state: BumperLiveState }
  /** Show content changed: refetch it (slides, theme, data). */
  | { type: 'show'; version: number; updatedAt: string }
  | { type: 'presence'; presence: BumperPresence }
  /** The link was rotated or the show deleted: stop and show the "link expired" card. */
  | { type: 'revoked'; reason: 'rotated' | 'deleted' | 'archived' }
  | { type: 'ping'; t: string };

/* ---------------------------------------------------------------- resolved data (public-safe) */

export interface BumperSpeakerData {
  id: string;
  slug: string;
  fullName: string;
  nickname: string | null;
  headline: string | null;
  avatar: ImageRef | null;
  organization: string | null;
  position: string | null;
  links: LinkItem[];
  /** Absolute public profile URL. */
  url: string;
}

export interface BumperEventSpeaker {
  speakerId: string;
  role: SpeakerRole;
  /** Per-event values, already falling back to the speaker's defaults. */
  organization: string | null;
  position: string | null;
  talkTitle: string | null;
}

export interface BumperRundownItem {
  time: string;
  endTime: string | null;
  agenda: string;
  note: string | null;
  speakerId: string | null;
}

export interface BumperEventData {
  id: string;
  slug: string;
  number: number | null;
  title: string;
  summary: string | null;
  cover: ImageRef | null;
  startsAt: string;
  endsAt: string;
  accent: Accent;
  mode: EventMode;
  tags: string[];
  status: EventStatus;
  venue: { name: string; kind: VenueKind; building: string | null; floor: string | null } | null;
  roomNote: string | null;
  onlineNote: string | null;
  /** Absolute public event URL. */
  url: string;
  speakers: BumperEventSpeaker[];
  rundown: BumperRundownItem[];
  publicationIds: string[];
  /** Registration is open right now. */
  registrationOpen: boolean;
}

export interface BumperPublicationData {
  id: string;
  slug: string;
  type: PublicationType;
  typeLabel: string;
  title: string;
  subtitle: string | null;
  containerTitle: string | null;
  publishedYear: number | null;
  doi: string | null;
  cover: ImageRef | null;
  authors: Array<{ name: string; speakerId: string | null; avatar: ImageRef | null; organization: string | null }>;
  keywords: string[];
  url: string;
}

export interface BumperTeamData {
  id: string;
  name: string;
  role: string | null;
  avatar: ImageRef | null;
}

export interface BumperThreadData {
  id: string;
  title: string;
  excerpt: string;
  authorLabel: string;
  score: number;
  commentCount: number;
  eventId: string | null;
  createdAt: string;
}

export interface BumperSiteData {
  name: string;
  tagline: string | null;
  labName: string | null;
  /** https://zemi.ac (from the API's PUBLIC_WEB_URL). */
  webUrl: string;
  /** zemi.ac */
  shortUrl: string;
  /** https://zemi.ac/q */
  qnaUrl: string;
  /** zemi.ac/q */
  qnaShort: string;
  socials: LinkItem[];
  email: string | null;
  stats: { sessions: number; talks: number; speakers: number; hoursOfTalk: number };
}

/** Everything a slide can read. Public-safe: no emails, no registrant data. Missing ids are simply absent. */
export interface BumperData {
  events: Record<string, BumperEventData>;
  speakers: Record<string, BumperSpeakerData>;
  publications: Record<string, BumperPublicationData>;
  team: Record<string, BumperTeamData>;
  threads: Record<string, BumperThreadData>;
  images: Record<string, ImageRef>;
  site: BumperSiteData;
  /** The next published Friday after the show's event (for the next-event promo). */
  nextEventId: string | null;
  generatedAt: string;
}

/* ---------------------------------------------------------------- show DTOs */

export type BumperPermission = 'run' | 'edit';

export interface BumperEventSummary {
  id: string;
  slug: string;
  number: number | null;
  title: string;
  startsAt: string;
  endsAt: string;
  accent: Accent;
  cover: ImageRef | null;
  status: EventStatus;
}

/** GET /admin/bumpers row. */
export interface BumperShowRow {
  id: string;
  title: string;
  eventId: string | null;
  event: BumperEventSummary | null;
  status: BumperShowStatus;
  origin: BumperOrigin;
  slideCount: number;
  /** Seconds of auto-advancing slides (a floor, operator-paced slides add to it). */
  autoRuntimeSec: number;
  /** First playable slide, for the card thumbnail. */
  cover: BumperSlide | null;
  theme: BumperTheme;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
  lastPlayedAt: string | null;
  archivedAt: string | null;
  live: { slideId: string | null; position: number; mode: BumperOutputMode; outputs: number; onAir: boolean };
  permissions: BumperPermission[];
}

/** GET /admin/bumpers/:id */
export interface BumperShowDetail extends BumperShowRow {
  slides: BumperSlide[];
  data: BumperData;
  state: BumperLiveState;
}

/** GET /admin/bumpers/:id/output (run permission). */
export interface BumperOutputLinks {
  /** Web page for the OBS browser source. */
  outputUrl: string;
  /** Web page for the OBS custom browser dock (controls). */
  dockUrl: string;
  /** POST here with {"action":"next"} from Companion, Stream Deck or curl. */
  controlApiUrl: string;
  outputKey: string;
  controlKey: string;
  rotatedAt: string;
}

export interface BumperRevision {
  id: string;
  version: number;
  title: string;
  slideCount: number;
  reason: string;
  createdAt: string;
  createdByName: string | null;
}

export interface BumperRevisionDetail extends BumperRevision {
  slides: BumperSlide[];
  theme: BumperTheme;
}

/** GET /public/bumpers/out/:key and /public/bumpers/control/:key. Hidden slides are left out. */
export interface BumperPublicShow {
  id: string;
  title: string;
  eventId: string | null;
  theme: BumperTheme;
  slides: BumperSlide[];
  version: number;
  data: BumperData;
  state: BumperLiveState;
  /** True on the control endpoint. */
  canControl: boolean;
}

/** POST /admin/bumpers/generate with create=false */
export interface BumperGeneratePreview {
  title: string;
  eventId: string;
  theme: BumperTheme;
  slides: BumperSlide[];
  data: BumperData;
  /** Plain-language notes, like "No rundown yet, so we followed the lineup order." */
  notes: string[];
}

/** Pickers in the builder. */
export interface BumperEventPick {
  id: string;
  number: number | null;
  title: string;
  startsAt: string;
  accent: Accent;
  cover: ImageRef | null;
  status: EventStatus;
  /** The principal can build bumpers for it (otherwise it can only be referenced, like a next-event promo). */
  canBuild: boolean;
}

export interface BumperImagePick {
  id: string;
  image: ImageRef;
  caption: string | null;
  source: 'event' | 'upload' | 'library';
}

/* ---------------------------------------------------------------- access */

/** Effective bumper permissions on a show (null event = standalone show, needs bumpers.manage). */
export function bumperPermissions(ability: Ability, eventId: string | null): BumperPermission[] {
  if (ability.isSuperadmin || ability.has('bumpers.manage')) return ['run', 'edit'];
  if (!eventId) return [];
  const out: BumperPermission[] = [];
  if (ability.can('event', eventId, 'bumpers.run')) out.push('run');
  if (ability.can('event', eventId, 'bumpers.edit')) out.push('edit');
  return out;
}

/** Sees the Bumpers section at all. */
export function canUseBumpers(ability: Ability): boolean {
  return ability.isSuperadmin || ability.has('bumpers.manage') || ability.canAny('event', 'bumpers.run');
}

/** Can create a show for this event (null = standalone). */
export function canCreateBumpers(ability: Ability, eventId: string | null): boolean {
  return bumperPermissions(ability, eventId).includes('edit');
}

/* ---------------------------------------------------------------- playback order */

/** Slides in playback order (hidden ones skipped). */
export function bumperPlayable<T extends Pick<BumperSlide, 'id' | 'hidden'>>(slides: readonly T[]): T[] {
  return slides.filter((s) => !s.hidden);
}

/** The slide `dir` steps from `currentId`, without wrapping. Unknown current = first/last. */
export function bumperStep<T extends Pick<BumperSlide, 'id' | 'hidden'>>(slides: readonly T[], currentId: string | null, dir: 1 | -1): T | null {
  const list = bumperPlayable(slides);
  if (!list.length) return null;
  const i = currentId ? list.findIndex((s) => s.id === currentId) : -1;
  if (i < 0) return dir === 1 ? list[0]! : list[list.length - 1]!;
  return list[i + dir] ?? null;
}

/** Where auto-advance goes from this slide: its loop target (if playable) or the next slide. */
export function bumperAutoNext<T extends Pick<BumperSlide, 'id' | 'hidden' | 'timing'>>(slides: readonly T[], currentId: string): T | null {
  const list = bumperPlayable(slides);
  const cur = list.find((s) => s.id === currentId);
  if (!cur) return null;
  const loop = cur.timing.loopToId ? list.find((s) => s.id === cur.timing.loopToId) : undefined;
  if (loop) return loop;
  return bumperStep(slides, currentId, 1);
}

/* ---------------------------------------------------------------- transition rules */

/** Small stable hash (FNV-1a) so the same pair of bumpers always gets the same transition. */
export function bumperHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

type PairSlide = Pick<BumperSlide, 'id' | 'kind' | 'transitionIn'> & { refs?: Partial<BumperRefs> };

const PERSON_KINDS: ReadonlySet<BumperKind> = new Set(['speaker', 'keynote', 'talk-title', 'thanks-speaker', 'quote', 'lower-third', 'mc', 'opening', 'awards']);

/** Pairs that share a subject get a magic move (the photo and name glide into place). */
function sharesSubject(from: PairSlide, to: PairSlide): boolean {
  const a = from.refs ?? {};
  const b = to.refs ?? {};
  if (a.speakerId && a.speakerId === b.speakerId && PERSON_KINDS.has(from.kind) && PERSON_KINDS.has(to.kind)) return true;
  if (a.teamMemberId && a.teamMemberId === b.teamMemberId && PERSON_KINDS.has(from.kind) && PERSON_KINDS.has(to.kind)) return true;
  const pair = `${from.kind}>${to.kind}`;
  if (pair === 'agenda>up-next' || pair === 'up-next>agenda') return true;
  if (pair === 'qna>featured-question' || pair === 'featured-question>qna') return true;
  if (pair === 'welcome>event-title' || pair === 'event-title>welcome') return true;
  if (pair === 'lineup>speaker' || pair === 'lineup>keynote') return true;
  return false;
}

/** Candidates by destination kind (and a few special origins). First match wins; the hash picks within the list. */
const INTO: Partial<Record<BumperKind, BumperTransitionKey[]>> = {
  welcome: ['curtain-call'],
  'event-title': ['portal-zoom', 'blinds'],
  agenda: ['grid-mosaic', 'clock-wipe'],
  'up-next': ['clock-wipe'],
  mc: ['bridge-arc', 'shape-morph'],
  opening: ['bridge-arc', 'page-turn'],
  ceremony: ['crossfade', 'halftone'],
  keynote: ['portal-zoom', 'shape-morph'],
  speaker: ['q-iris', 'portal-zoom', 'shape-morph', 'grid-mosaic'],
  paper: ['page-turn', 'blinds'],
  'talk-title': ['scramble-cut', 'split-doors'],
  panel: ['grid-mosaic', 'bridge-arc'],
  lineup: ['grid-mosaic', 'block-stack'],
  'thanks-speaker': ['confetti-pop'],
  quote: ['ink-flood', 'halftone'],
  qna: ['q-iris'],
  'featured-question': ['portal-zoom', 'scramble-cut'],
  prompt: ['ink-flood', 'q-iris'],
  feedback: ['split-doors', 'halftone'],
  register: ['split-doors', 'ribbon-sweep'],
  break: ['coffee-pour'],
  brb: ['gravity-drop'],
  photo: ['hunch-shutter'],
  awards: ['stamp', 'confetti-pop'],
  credits: ['ribbon-sweep', 'blinds'],
  'next-event': ['split-doors', 'portal-zoom'],
  closing: ['curtain-call'],
  socials: ['ribbon-sweep', 'halftone'],
  section: ['word-wipe'],
  announcement: ['block-stack', 'stamp'],
  image: ['halftone', 'blinds'],
  'lower-third': ['crossfade'],
  blank: ['crossfade'],
  standby: ['eyelids', 'halftone'],
  countdown: ['clock-wipe'],
  'house-rules': ['block-stack', 'grid-mosaic'],
  wifi: ['split-doors', 'halftone'],
  sponsors: ['blinds', 'ribbon-sweep'],
  custom: ['grid-mosaic', 'shape-morph', 'ink-flood'],
};

/** Special origin>destination pairs, checked before INTO. */
const PAIRS: Record<string, BumperTransitionKey> = {
  'standby>welcome': 'eyelids',
  'countdown>welcome': 'eyelids',
  'paper>thanks-speaker': 'paper-plane',
  'talk-title>thanks-speaker': 'paper-plane',
  'thanks-speaker>speaker': 'bridge-arc',
  'thanks-speaker>keynote': 'bridge-arc',
  'thanks-speaker>talk-title': 'bridge-arc',
  'speaker>paper': 'page-turn',
  'keynote>paper': 'page-turn',
  'break>up-next': 'clock-wipe',
  'break>speaker': 'clock-wipe',
  'photo>closing': 'confetti-pop',
  'brb>speaker': 'eyelids',
};

const FALLBACK: BumperTransitionKey[] = ['grid-mosaic', 'shape-morph', 'ink-flood', 'blinds', 'split-doors', 'ribbon-sweep', 'halftone', 'block-stack', 'scramble-cut', 'gravity-drop'];
const CALM_OK: ReadonlySet<BumperTransitionKey> = new Set(['magic-move', 'crossfade', 'cut', 'blinds', 'clock-wipe', 'halftone', 'page-turn', 'split-doors', 'word-wipe']);
const CALM_POOL: BumperTransitionKey[] = ['blinds', 'clock-wipe', 'halftone', 'page-turn', 'split-doors'];
/** Transparent destinations must not paint a full-screen curtain over the camera. */
const OVERLAY_KINDS: ReadonlySet<BumperKind> = new Set(['lower-third']);

export interface BumperTransitionContext {
  motion?: BumperMotionLevel;
  /** A per-change override (control input). */
  override?: 'auto' | BumperTransitionKey | null;
}

/**
 * Which transition plays from `from` to `to`. Deterministic: A to B always plays the same one,
 * A to C usually a different one. Order: per-change override, the destination's own
 * `transitionIn`, motion level, shared subject (magic move), special pairs, destination kind, fallback.
 */
export function pickBumperTransition(from: PairSlide | null, to: PairSlide, ctx: BumperTransitionContext = {}): BumperTransitionKey {
  const motion = ctx.motion ?? 'full';
  if (ctx.override && ctx.override !== 'auto') return ctx.override;
  if (!from || from.id === to.id) return 'crossfade';
  if (to.transitionIn && to.transitionIn !== 'auto') return to.transitionIn;
  if (motion === 'still') return 'crossfade';
  if (OVERLAY_KINDS.has(to.kind) || OVERLAY_KINDS.has(from.kind)) return 'crossfade';
  const seed = bumperHash(`${from.id}>${to.id}`);
  if (sharesSubject(from, to)) return 'magic-move';
  let pick: BumperTransitionKey | undefined = PAIRS[`${from.kind}>${to.kind}`];
  if (!pick) {
    const list = INTO[to.kind] ?? FALLBACK;
    pick = list[seed % list.length]!;
    // A bumper following one of its own kind (speaker to speaker) gets variety from the fallback pool.
    if (from.kind === to.kind && list.length === 1) pick = FALLBACK[seed % FALLBACK.length]!;
  }
  if (motion === 'calm' && !CALM_OK.has(pick)) pick = CALM_POOL[seed % CALM_POOL.length]!;
  return pick;
}

/** The planned transition into every playable slide, in order (the builder rail shows these). */
export function planBumperTransitions(slides: readonly BumperSlide[], motion: BumperMotionLevel = 'full'): Record<string, BumperTransitionKey> {
  const list = bumperPlayable(slides);
  const out: Record<string, BumperTransitionKey> = {};
  list.forEach((s, i) => {
    out[s.id] = pickBumperTransition(i > 0 ? list[i - 1]! : null, s, { motion });
  });
  return out;
}

/** Friendly label for the rail when the slide has no label. Templates refine it with data. */
export function bumperKindLabel(kind: BumperKind): string {
  return BUMPER_KIND_META[kind].label;
}
