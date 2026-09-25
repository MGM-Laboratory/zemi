import { z } from 'zod';
import { blocksSchema, idSchema, linkSchema, optionalUrl, type Blocks, type ImageRef, type LinkItem } from './common.js';

export const generalSettings = z.object({
  siteName: z.string().max(80).default('Zemi'),
  tagline: z.string().max(200).default('The Friday seminar for half-finished research.'),
  labName: z.string().max(120).default('MGM Laboratory'),
  labUrl: z.string().max(300).default('https://labmgm.org'),
  defaultWeekday: z.number().int().min(0).max(6).default(5),
  defaultStart: z.string().default('13:15'),
  defaultEnd: z.string().default('15:15'),
  defaultVenueId: idSchema.optional().nullable(),
  defaultCapacity: z.number().int().min(1).optional().nullable(),
  announcement: z
    .object({ active: z.boolean().default(false), text: z.string().max(200).default(''), href: z.string().max(500).optional().nullable() })
    .default({ active: false, text: '' }),
  footerNote: z.string().max(300).default('Made with too much coffee at MGM Lab.'),
});

export const seoSettings = z.object({
  title: z.string().max(120).default('Zemi, the Friday seminar'),
  description: z.string().max(300).default('Every Friday at 13:15, postgrads share research in progress. Undergrads welcome. Free, hybrid, a little chaotic.'),
  ogImageAssetId: idSchema.optional().nullable(),
  keywords: z.array(z.string()).default([]),
});

const beat = z.object({
  time: z.string().max(10),
  title: z.string().max(160),
  body: z.string().max(600),
});

export const homeSettings = z.object({
  heroEyebrow: z.string().max(120).default('Fridays, 13:15 WIB'),
  heroTitle: z.string().max(200).default('Bring your half-finished research.'),
  heroBody: z.string().max(400).default('Every Friday we pull up chairs and talk about the stuff that is not done yet. Master’s, PhD, undergrads. Same table.'),
  heroPrimaryCta: z.string().max(40).default('Save me a seat'),
  heroSecondaryCta: z.string().max(40).default('What happens here?'),
  beats: z.array(beat).max(12).default([]),
  statsEnabled: z.boolean().default(true),
  funStat: z.string().max(120).default('1 coffee machine we keep blaming'),
  featuredEventId: idSchema.optional().nullable(),
  closingTitle: z.string().max(160).default('See you Friday.'),
  closingBody: z.string().max(300).default('Same time. Maybe a different room. Always free.'),
});

export const aboutSettings = z.object({
  title: z.string().max(200).default('A room for research that is still figuring itself out.'),
  intro: z.string().max(1200).default(''),
  story: blocksSchema.default([]),
  pillars: z.array(z.object({ title: z.string().max(80), body: z.string().max(400), shape: z.enum(['circle', 'triangle', 'square', 'arch']) })).max(8).default([]),
  audiences: z.array(z.object({ title: z.string().max(80), body: z.string().max(400) })).max(6).default([]),
  presentSteps: z.array(z.object({ title: z.string().max(80), body: z.string().max(400) })).max(8).default([]),
  presentCta: z.string().max(80).default('I want to present'),
});

export const contactSettings = z.object({
  title: z.string().max(160).default('Say hi.'),
  intro: z.string().max(600).default('Want to present, collaborate, or just ask something? Drop us a line. A real human reads every message.'),
  email: z.string().max(200).default('zemi@labmgm.org'),
  whatsapp: z.string().max(40).optional().nullable(),
  address: z.string().max(400).default(''),
  mapsUrl: optionalUrl,
  officeHours: z.string().max(200).default('Weekdays, 09:00 to 16:00 WIB'),
  socials: z.array(linkSchema).max(12).default([]),
  topics: z.array(z.string().max(60)).max(10).default(['I want to present', 'Collaboration', 'A question', 'Something else']),
  notifyEmails: z.array(z.email()).max(10).default([]),
});

export const emailSettings = z.object({
  replyTo: z.string().max(200).optional().nullable(),
  senderName: z.string().max(80).default('Zemi'),
  signature: z.string().max(300).default('See you Friday,\nThe Zemi crew'),
  sendReminders: z.boolean().default(true),
  sendStartingNow: z.boolean().default(true),
  sendThankYou: z.boolean().default(true),
});

export const SITE_SETTING_SCHEMAS = {
  general: generalSettings,
  seo: seoSettings,
  home: homeSettings,
  about: aboutSettings,
  contact: contactSettings,
  email: emailSettings,
} as const;
export type SiteSettingKey = keyof typeof SITE_SETTING_SCHEMAS;
export type SiteSettings = { [K in SiteSettingKey]: z.infer<(typeof SITE_SETTING_SCHEMAS)[K]> };

export const faqInput = z.object({
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(3000),
  visibility: z.enum(['published', 'draft']).default('published'),
});
export interface Faq {
  id: string;
  question: string;
  answer: string;
  visibility: 'published' | 'draft';
  sortOrder: number;
}

export const teamMemberInput = z.object({
  name: z.string().min(1).max(160),
  role: z.string().max(160).optional().nullable(),
  bio: z.string().max(1000).optional().nullable(),
  avatarAssetId: idSchema.optional().nullable(),
  links: z.array(linkSchema).max(12).default([]),
  visibility: z.enum(['published', 'draft']).default('published'),
});
export interface TeamMember {
  id: string;
  name: string;
  role: string | null;
  bio: string | null;
  avatar: ImageRef | null;
  avatarAssetId: string | null;
  links: LinkItem[];
  visibility: 'published' | 'draft';
  sortOrder: number;
}

export const contactInput = z.object({
  name: z.string().trim().min(1, 'What should we call you?').max(160),
  email: z.email('That email looks off. Mind checking it?').max(254),
  topic: z.string().max(60).default('Something else'),
  message: z.string().trim().min(10, 'Give us a little more to go on. Ten characters at least.').max(5000),
  website: z.string().max(0).optional(),
});
export type ContactInput = z.infer<typeof contactInput>;

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  status: 'new' | 'read' | 'replied' | 'archived';
  createdAt: string;
}
export const contactMessageUpdate = z.object({ status: z.enum(['new', 'read', 'replied', 'archived']) });

export interface SiteStats {
  sessions: number;
  talks: number;
  speakers: number;
  seatsFilled: number;
  publications: number;
  hoursOfTalk: number;
  firstEventAt: string | null;
}

export interface PublicSite {
  settings: Omit<SiteSettings, 'email' | 'contact'> & { contact: Omit<SiteSettings['contact'], 'notifyEmails'> };
  faqs: Faq[];
  team: TeamMember[];
  stats: SiteStats;
  ogImage: ImageRef | null;
}

export type AboutStory = Blocks;

/* ---------------------------------------------------------------- site CMS additions (site workstream) */

export const faqUpdateInput = faqInput.partial();
export const teamMemberUpdateInput = teamMemberInput.partial();

export const CONTACT_STATUSES = ['new', 'read', 'replied', 'archived'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

/**
 * GET /admin/inbox. `status`: one status, `open` (everything except archived) or `all` (default).
 * The nav badge calls `?status=new&pageSize=1` and reads `.total`.
 */
export const inboxListQuery = z.object({
  status: z.enum([...CONTACT_STATUSES, 'open', 'all']).default('all'),
  search: z.string().max(200).optional(),
  topic: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type InboxListQuery = z.infer<typeof inboxListQuery>;

/** GET /admin/inbox/unread-count */
export interface InboxUnreadCount {
  count: number;
}

/** POST /admin/system/reset-content (superadmin). The phrase must be typed exactly. */
export const RESET_CONTENT_PHRASE = 'delete everything' as const;
export const resetContentInput = z.object({
  confirm: z.literal(RESET_CONTENT_PHRASE, { error: `Type "${RESET_CONTENT_PHRASE}" to confirm.` }),
});

export interface ResetContentResult {
  ok: true;
  /** Rows removed per table. */
  deleted: Record<string, number>;
  /** Objects removed from the bucket. */
  bucketObjects: number;
  /** Admins whose per-item grants were pruned (wildcard grants stay). */
  adminsPruned: number;
}
