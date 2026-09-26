import { formatJakarta, slugify, type Blocks, type LinkItem, type PublicationLink } from '@zemi/shared';
import { eq } from 'drizzle-orm';
import { blocksToPlainText } from '../common/blocks.js';
import { randomBase62 } from '../common/crypto.js';
import type { CryptoService } from '../common/crypto.service.js';
import type { Db } from '../db/client.js';
import {
  eventMedia,
  eventPublications,
  eventSpeakers,
  eventStreams,
  events,
  publicationAuthors,
  publications,
  rundownItems,
  speakers,
  streamSessions,
  venues,
} from '../db/schema.js';
import {
  ABSTRACT_CONTEXT,
  ABSTRACT_EVAL,
  ABSTRACT_GAP,
  ABSTRACT_IMPACT,
  ABSTRACT_RELEASE,
  AREA_HOOKS,
  AREA_LABEL,
  BRING_BULLETS,
  CAPTIONS,
  INTRO_BY_COUNT,
  LEAVE_BULLETS,
  ONLINE_NOTE,
  QUOTES,
  VENUE_LINES,
} from './data/copy.js';
import { CANCEL_REASON } from './data/events.js';
import { MANUAL_AUTHORS, PUBLICATIONS, type PubSeed } from './data/publications.js';
import { VENUES, mapsUrl } from './data/site.js';
import { SPEAKERS, type SpeakerSeed } from './data/speakers.js';
import { bullet, doc, h, numbered, p, quote } from './lib/blocks.js';
import type { Rng } from './lib/rng.js';
import { rundownFor, type PlannedEvent } from './plan.js';
import { assertNoDashes, days, insertChunked, minutes, wib, withArticle, words } from './util.js';

export interface MediaIds {
  /** By speaker index; null when that upload failed. */
  speakerAvatars: Array<string | null>;
  authorAvatars: Map<string, string>;
  teamAvatars: Map<string, string>;
  covers: Map<string, string>;
  pubCovers: Map<string, string>;
  docs: Array<{ id: string; scene: string }>;
  pdfs: Map<string, string>;
  clips: string[];
  recording: { id: string; durationSec: number } | null;
}

export interface SeedCtx {
  db: Db;
  rng: Rng;
  now: Date;
  crypto: CryptoService;
  log: (line: string) => void;
  /** Rewrite every address to a reserved `.example` domain (default in production). */
  safeEmails: boolean;
  /** Mark reminder/starting/thank-you emails as already sent on upcoming events too. */
  lifecycleSent: boolean;
  media: MediaIds;
  createdBy: { superadmin: string; programChair: string | null; contentManager: string | null };
}

export const email = (ctx: Pick<SeedCtx, 'safeEmails'>, local: string, domain: string) =>
  `${local}@${domain}${ctx.safeEmails ? '.example' : ''}`.toLowerCase();

/* ================================================================== venues */

export async function seedVenues(ctx: SeedCtx): Promise<Map<string, { id: string; name: string; capacity: number | null; roomNote: string | null }>> {
  const out = new Map<string, { id: string; name: string; capacity: number | null; roomNote: string | null }>();
  const existing = await ctx.db.select({ id: venues.id, name: venues.name }).from(venues);
  const byName = new Map(existing.map((v) => [v.name, v.id]));
  for (const v of VENUES) {
    const values = {
      name: v.name,
      kind: v.kind,
      building: v.building,
      floor: v.floor,
      capacity: v.capacity,
      address: v.address,
      mapsUrl: v.lat !== null && v.lng !== null ? mapsUrl(v.lat, v.lng) : null,
      notes: v.notes,
      createdAt: new Date('2024-08-20T03:00:00Z'),
    };
    let id = byName.get(v.name);
    if (id) await ctx.db.update(venues).set(values).where(eq(venues.id, id));
    else id = (await ctx.db.insert(venues).values(values).returning({ id: venues.id }))[0].id;
    out.set(v.key, { id, name: v.name, capacity: v.capacity, roomNote: v.roomNote });
  }
  return out;
}

/* ================================================================== speakers */

const ORG_DOMAIN: Record<string, string> = {
  'MGM Laboratory': 'labmgm.org',
  'Universitas Indonesia': 'ui.ac.id',
  'Institut Teknologi Bandung': 'itb.ac.id',
  'Universitas Gadjah Mada': 'ugm.ac.id',
  'Institut Teknologi Sepuluh Nopember': 'its.ac.id',
  'Telkom University': 'telkomuniversity.ac.id',
  BRIN: 'brin.go.id',
  'National University of Singapore': 'nus.edu.sg',
  'Kyoto University': 'kyoto-u.ac.jp',
  'TU Delft': 'tudelft.nl',
  KAIST: 'kaist.ac.kr',
  'Technical University of Munich': 'tum.de',
  'Hanoi University of Science and Technology': 'hust.edu.vn',
  'Lintas AI Research': 'lintas.ai',
  'Samudra Data Lab': 'samudradata.co.id',
  'Nusa Robotics': 'nusarobotics.com',
  'Kereta Labs': 'keretalabs.id',
};

function speakerEmail(ctx: SeedCtx, s: SpeakerSeed): string {
  const [first, ...rest] = s.fullName.toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, '').split(/\s+/);
  const last = rest[rest.length - 1] ?? '';
  return email(ctx, last ? `${first}.${last}` : first, ORG_DOMAIN[s.org] ?? 'labmgm.org');
}

function speakerLinks(ctx: SeedCtx, s: SpeakerSeed, rng: Rng): LinkItem[] {
  const code = (n: number) => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789'[rng.int(0, 57)]).join('');
  const digits = (n: number) => Array.from({ length: n }, () => rng.int(0, 9)).join('');
  return s.links.map((kind): LinkItem => {
    switch (kind) {
      case 'website':
        return { kind, url: `https://${s.handle}.github.io`, label: 'Website' };
      case 'linkedin':
        return { kind, url: `https://www.linkedin.com/in/${s.handle}`, label: null };
      case 'github':
        return { kind, url: `https://github.com/${s.handle}`, label: null };
      case 'scholar':
        return { kind, url: `https://scholar.google.com/citations?user=${code(12)}`, label: 'Google Scholar' };
      case 'orcid':
        return { kind, url: `https://orcid.org/0000-000${rng.int(1, 3)}-${digits(4)}-${digits(4)}`, label: null };
      case 'researchgate':
        return { kind, url: `https://www.researchgate.net/profile/${s.fullName.replace(/\s+/g, '-')}`, label: null };
      case 'x':
        return { kind, url: `https://x.com/${s.handle}`, label: null };
      case 'instagram':
        return { kind, url: `https://www.instagram.com/${s.handle}`, label: null };
      case 'youtube':
        return { kind, url: `https://www.youtube.com/@${s.handle}`, label: null };
      case 'email':
        return { kind, url: `mailto:${speakerEmail(ctx, s)}`, label: 'Email' };
      default:
        return { kind: 'other', url: `https://${s.handle}.github.io`, label: null };
    }
  });
}

function speakerBio(s: SpeakerSeed, rng: Rng, talks: PlannedEvent[]): Blocks {
  const she = s.gender === 'female' ? 'she' : 'he';
  const her = s.gender === 'female' ? 'her' : 'him';
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const done = talks.filter((e) => e.past && !e.cancelled);
  const next = talks.find((e) => !e.past && e.visibility === 'published');
  const history: string[] = [];
  if (done.length) {
    const first = done[0];
    const again = done.length - 1;
    history.push(
      `${s.nickname} first presented at Zemi #${first.number} in ${formatJakarta(first.startsAt, 'month-year')}` +
        (again > 0 ? ` and has been back ${again === 1 ? 'once' : `${again} times`} since.` : '.'),
    );
  }
  if (next) history.push(`Catch ${her} next at Zemi #${next.number} on ${formatJakarta(next.startsAt, 'date')}.`);
  return doc(
    p(`**${s.nickname}** is ${withArticle(s.position)} at ${s.org}, working on ${s.focus}. ${s.before}`),
    p(`Right now ${she} is deep into ${s.now}. ${cap(she)} likes talks where the audience pushes back, so bring your hardest question.`),
    rng.chance(0.75) ? p(`Outside the lab: ${s.fun}`) : null,
    p(`Ask ${her} about:`),
    s.ask.slice(0, rng.int(2, 3)).map((a) => bullet(a)),
    history.length ? p(history.join(' ')) : null,
  );
}

export async function seedSpeakers(ctx: SeedCtx, plan: PlannedEvent[]): Promise<Map<string, { id: string; slug: string; seed: SpeakerSeed }>> {
  const rng = ctx.rng.fork('speakers');
  const out = new Map<string, { id: string; slug: string; seed: SpeakerSeed }>();
  const rows = SPEAKERS.map((s, i) => {
    const talks = plan.filter((e) => e.talks.some((t) => t.speakerKey === s.key));
    const bio = speakerBio(s, rng, talks);
    assertNoDashes(`speaker ${s.key}`, [s.headline, bio]);
    const firstTalk = talks[0]?.startsAt ?? ctx.now;
    const createdAt = new Date(
      Math.min(ctx.now.getTime() - days(rng.int(2, 12)), Math.max(new Date('2024-08-15T03:00:00Z').getTime(), firstTalk.getTime() - days(rng.int(14, 30)))),
    );
    return {
      slug: slugify(s.fullName),
      fullName: s.fullName,
      nickname: s.nickname,
      headline: s.headline,
      bio,
      bioText: blocksToPlainText(bio),
      avatarAssetId: ctx.media.speakerAvatars[i] ?? null,
      links: speakerLinks(ctx, s, rng),
      defaultOrganization: s.org,
      defaultPosition: s.position,
      email: speakerEmail(ctx, s),
      visibility: s.visibility ?? ('published' as const),
      createdAt,
      updatedAt: new Date(Math.min(ctx.now.getTime(), createdAt.getTime() + days(rng.int(1, 200)))),
    };
  });
  const inserted = await ctx.db.insert(speakers).values(rows).returning({ id: speakers.id, slug: speakers.slug });
  inserted.forEach((r, i) => out.set(SPEAKERS[i].key, { id: r.id, slug: r.slug, seed: SPEAKERS[i] }));
  return out;
}

/* ================================================================== publications */

function buildAbstract(pub: PubSeed, rng: Rng): string {
  if (typeof pub.abstract === 'string') return pub.abstract;
  const parts = pub.abstract;
  const out = [rng.pick(ABSTRACT_CONTEXT[pub.area]), rng.pick(ABSTRACT_GAP), parts.we];
  if (parts.detail) out.push(parts.detail);
  out.push(parts.result);
  const extras = [rng.pick(ABSTRACT_EVAL), rng.pick(ABSTRACT_IMPACT), rng.pick(ABSTRACT_RELEASE)];
  for (const e of extras) {
    if (words(out.join(' ')) >= 190) break;
    out.push(e);
  }
  let text = out.join(' ');
  while (words(text) < 150) text += ` ${rng.pick(ABSTRACT_IMPACT)}`;
  return text;
}

function pubBody(pub: PubSeed, rng: Rng): Blocks {
  const parts = typeof pub.abstract === 'string' ? null : (pub.abstract);
  if (!pub.body || !parts) return [];
  switch (pub.body) {
    case 'project':
      return doc(
        h('About the project'),
        p(parts.we),
        parts.detail ? p(parts.detail) : null,
        h('Where it stands'),
        p(`Work in progress. ${parts.result}`),
        p('**Want to help?** We are always looking for:'),
        bullet('Testers who use this in real life'),
        bullet('Students who want a thesis topic with real users'),
        bullet('Partners with data, rooms or patience to share'),
      );
    case 'software':
      return doc(
        h('What it does'),
        p(parts.we),
        parts.detail ? p(parts.detail) : null,
        h('Getting started'),
        numbered('Clone the repository and read the README first. Really.'),
        numbered('Download the pretrained model with the included script.'),
        numbered('Run the demo, then try it on your own data.'),
        p(parts.result),
      );
    case 'article':
      return doc(p(parts.we), parts.detail ? p(parts.detail) : null, quote(rng.pick(QUOTES)), p(parts.result));
    case 'book':
      return doc(
        h('About the book'),
        p(parts.we),
        parts.detail ? p(parts.detail) : null,
        h('Who it is for'),
        bullet('Postgraduate students preparing their first talks'),
        bullet('Supervisors who want a seminar culture that is less scary'),
        bullet('Anyone who has ever apologized for unfinished slides'),
        p(parts.result),
      );
    default:
      return [];
  }
}

const DOI_TYPES = new Set(['journal-article', 'conference-paper', 'dataset', 'report', 'book', 'book-chapter', 'software', 'thesis']);

function pubLinks(pub: PubSeed, slug: string, rng: Rng): PublicationLink[] {
  const short = slug.split('-').slice(0, 3).join('-');
  return (pub.links ?? []).map((kind): PublicationLink => {
    switch (kind) {
      case 'code':
        return { kind, label: 'Code on GitHub', url: `https://github.com/mgm-lab/${short}` };
      case 'slides':
        return { kind, label: 'Slides', url: `https://labmgm.org/slides/${slug}.pdf` };
      case 'dataset':
        return { kind, label: 'Dataset on Zenodo', url: `https://zenodo.org/records/${rng.int(1_000_000, 9_999_999)}` };
      case 'website':
        return { kind, label: 'Project page', url: `https://labmgm.org/projects/${short}` };
      default:
        return { kind, label: 'Link', url: `https://labmgm.org/${short}` };
    }
  });
}

export interface SeededPub {
  id: string;
  key: string;
  title: string;
  year: number;
  type: string;
  speakerKeys: string[];
  visibility: 'published' | 'draft' | 'unlisted';
}

export async function seedPublications(ctx: SeedCtx, speakerIds: Map<string, { id: string; seed: SpeakerSeed }>): Promise<SeededPub[]> {
  const rng = ctx.rng.fork('publications');
  const manual = new Map(MANUAL_AUTHORS.map((a) => [a.key, a]));
  const usedSlugs = new Set<string>();
  const doiSeq = new Map<number, number>();
  const out: SeededPub[] = [];

  for (const pub of PUBLICATIONS) {
    let slug = slugify(pub.title, 80);
    if (usedSlugs.has(slug)) slug = slugify(`${pub.title} ${pub.type}`, 90);
    for (let n = 2; usedSlugs.has(slug); n++) slug = `${slugify(pub.title, 80)}-${n}`;
    usedSlugs.add(slug);

    const abstract = buildAbstract(pub, rng);
    const n = words(abstract);
    if (n < 150 || n > 250) ctx.log(`  warning: abstract for ${pub.key} has ${n} words`);
    const body = pubBody(pub, rng);
    assertNoDashes(`publication ${pub.key}`, [pub.title, pub.subtitle, abstract, body, pub.container]);

    let doi: string | null = null;
    if (DOI_TYPES.has(pub.type) && pub.status !== 'in-progress' && pub.status !== 'under-review') {
      const seq = (doiSeq.get(pub.year) ?? 0) + 1;
      doiSeq.set(pub.year, seq);
      doi = `10.5555/zemi.${pub.year}.${String(seq).padStart(3, '0')}`;
    }
    const url = doi ? `https://doi.org/${doi}` : pub.arxiv ? `https://arxiv.org/abs/${pub.arxiv}` : pub.type === 'article' ? `https://labmgm.org/notes/${slug}` : null;
    const created = new Date(Date.UTC(pub.year, (pub.month ?? 6) - 1, pub.day ?? 15, 3) + days(rng.int(2, 40)));

    const [row] = await ctx.db
      .insert(publications)
      .values({
        slug,
        type: pub.type,
        title: pub.title,
        subtitle: pub.subtitle ?? null,
        abstract,
        body,
        coverAssetId: pub.cover ? (ctx.media.pubCovers.get(pub.cover) ?? null) : null,
        pdfAssetId: pub.pdf ? (ctx.media.pdfs.get(pub.pdf) ?? null) : null,
        containerTitle: pub.container ?? null,
        volume: pub.volume ?? null,
        issue: pub.issue ?? null,
        pages: pub.pages ?? null,
        publisher: pub.publisher ?? null,
        publishedYear: pub.year,
        publishedMonth: pub.month ?? null,
        publishedDay: pub.day ?? null,
        doi,
        isbn: pub.isbn ?? null,
        issn: pub.issn ?? null,
        arxivId: pub.arxiv ?? null,
        url,
        links: pubLinks(pub, slug, rng),
        keywords: pub.keywords,
        language: pub.lang ?? 'en',
        status: pub.status,
        license: pub.license ?? null,
        citationKey: null,
        visibility: pub.visibility ?? 'published',
        createdBy: ctx.createdBy.contentManager ?? ctx.createdBy.superadmin,
        createdAt: new Date(Math.min(created.getTime(), ctx.now.getTime() - days(1))),
        updatedAt: new Date(Math.min(created.getTime() + days(rng.int(0, 60)), ctx.now.getTime())),
      })
      .returning({ id: publications.id });

    const speakerKeys: string[] = [];
    const authorRows = pub.authors.map((raw, i) => {
      const corresponding = raw.endsWith('*');
      const ref = raw.replace(/\*$/, '');
      if (ref.startsWith('m:')) {
        const a = manual.get(ref.slice(2));
        if (!a) throw new Error(`Unknown manual author ${ref} on ${pub.key}`);
        return {
          publicationId: row.id,
          sortOrder: i,
          speakerId: null,
          fullName: a.fullName,
          avatarAssetId: a.portrait ? (ctx.media.authorAvatars.get(a.portrait) ?? null) : null,
          organization: a.organization,
          url: a.url ?? null,
          isCorresponding: corresponding,
        };
      }
      const s = speakerIds.get(ref);
      if (!s) throw new Error(`Unknown speaker ${ref} on ${pub.key}`);
      speakerKeys.push(ref);
      return {
        publicationId: row.id,
        sortOrder: i,
        speakerId: s.id,
        fullName: null,
        avatarAssetId: null,
        organization: s.seed.org,
        url: null,
        isCorresponding: corresponding,
      };
    });
    await ctx.db.insert(publicationAuthors).values(authorRows);
    out.push({ id: row.id, key: pub.key, title: pub.title, year: pub.year, type: pub.type, speakerKeys, visibility: pub.visibility ?? 'published' });
  }
  return out;
}

/* ================================================================== events */

function describeEvent(e: PlannedEvent, speakerSeeds: Map<string, SpeakerSeed>, venueName: string, roomNote: string | null, rng: Rng): Blocks {
  const n = e.talks.length;
  const areas = [...new Set(e.talks.map((t) => AREA_LABEL[t.area]))];
  const lean = areas.length === 1 ? `This one leans toward ${areas[0]}.` : `Expect a mix of ${areas.slice(0, -1).join(', ')} and ${areas[areas.length - 1]}.`;
  const talkBlocks = e.talks.flatMap((t) => {
    const s = speakerSeeds.get(t.speakerKey)!;
    const she = s.gender === 'female' ? 'she' : 'he';
    return [
      h(t.title, 3),
      p(`**${s.fullName}** (${t.position}, ${t.organization}). ${rng.pick(AREA_HOOKS[t.area])}`),
      rng.chance(0.6) ? p(`Lately ${she} has been working on ${s.now}.`) : null,
    ];
  });
  const bring = rng.chance(0.6);
  const list = rng.sample(bring ? BRING_BULLETS : LEAVE_BULLETS, rng.int(2, 3));
  const where =
    e.mode === 'online'
      ? VENUE_LINES.online
      : `We are in **${venueName}** this week.${roomNote ? ` ${roomNote}` : ''} ${e.mode === 'offline' ? VENUE_LINES.offline : VENUE_LINES.hybrid}`;
  return doc(
    h("What's on"),
    p(`${INTRO_BY_COUNT[Math.min(n, 3) - 1]} ${lean}`),
    talkBlocks,
    p(bring ? '**Good to bring**' : '**You will leave with**'),
    list.map((x) => bullet(x)),
    quote(rng.pick(QUOTES)),
    h('Good to know'),
    p(where),
    p('Registration is free. Doors open at 13:15 WIB and we wrap by 15:15.'),
  );
}

export interface SeededEvent {
  plan: PlannedEvent;
  id: string;
  slug: string;
  capacity: number | null;
  venueId: string;
  publishedAt: Date | null;
  speakerKeys: string[];
}

export async function seedEvents(
  ctx: SeedCtx,
  plan: PlannedEvent[],
  venueMap: Map<string, { id: string; name: string; capacity: number | null; roomNote: string | null }>,
  speakerIds: Map<string, { id: string; seed: SpeakerSeed }>,
): Promise<SeededEvent[]> {
  const rng = ctx.rng.fork('events');
  const seeds = new Map(SPEAKERS.map((s) => [s.key, s]));
  const out: SeededEvent[] = [];
  const DAY = days(1);

  const rows = plan.map((e) => {
    const venue = venueMap.get(e.venueKey)!;
    const description = describeEvent(e, seeds, venue.name, venue.roomNote, rng);
    assertNoDashes(`event ${e.number}`, [e.title, e.theme.summary, description]);
    // Published one to two weeks ahead, but never in the future (far-off Fridays were published recently).
    const publishedAt =
      e.visibility === 'draft'
        ? null
        : new Date(Math.min(wib(e.date, '10:00').getTime() - days(rng.int(8, 18)) + minutes(rng.int(0, 300)), ctx.now.getTime() - minutes(rng.int(120, 4000))));
    const createdAt = new Date((publishedAt ?? new Date(Math.min(ctx.now.getTime(), e.startsAt.getTime() - days(20)))).getTime() - days(rng.int(1, 9)));
    const titleSlug = /^zemi\s*#?\d+/i.test(e.title) ? slugify(e.title, 90) : slugify(`zemi ${e.number} ${e.title}`, 90);
    const reminder = new Date(wib(e.date, '09:00').getTime() - DAY);
    const sent = e.past || ctx.lifecycleSent;
    return {
      row: {
        slug: titleSlug,
        number: e.number,
        title: e.title,
        summary: e.theme.summary,
        coverAssetId: ctx.media.covers.get(e.coverId) ?? null,
        description,
        descriptionText: blocksToPlainText(description),
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        venueId: venue.id,
        roomNote: e.mode === 'online' ? null : venue.roomNote,
        mapsUrl: null,
        onlineNote: e.mode === 'offline' ? null : e.mode === 'online' ? ONLINE_NOTE.online : ONLINE_NOTE.hybrid,
        mode: e.mode,
        accent: e.accent,
        tags: e.theme.tags,
        visibility: e.visibility,
        registrationOpen: true,
        capacity: venue.capacity,
        registrationClosesAt: null,
        showRegistrantCount: true,
        cancelledAt: e.cancelled ? wib(e.date, '06:10') : null,
        cancelReason: e.cancelled ? CANCEL_REASON : null,
        publishedAt,
        remindersScheduledFor: sent ? reminder : null,
        reminderSentAt: sent && !e.cancelled ? reminder : null,
        startingSentAt: sent && !e.cancelled ? new Date(e.startsAt.getTime() - minutes(10)) : null,
        thanksSentAt: sent && !e.cancelled ? new Date(e.endsAt.getTime() + minutes(95)) : null,
        createdBy: e.upcomingIndex !== null && ctx.createdBy.programChair ? ctx.createdBy.programChair : ctx.createdBy.superadmin,
        createdAt,
        updatedAt: new Date(Math.min(ctx.now.getTime(), (publishedAt ?? createdAt).getTime() + days(rng.int(0, 5)))),
      },
      e,
      venue,
      publishedAt,
    };
  });

  // Insert one by one in date order so ids line up with the plan (and slugs stay unique by number).
  for (const r of rows) {
    const [ins] = await ctx.db.insert(events).values(r.row).returning({ id: events.id, slug: events.slug });
    out.push({ plan: r.e, id: ins.id, slug: ins.slug, capacity: r.venue.capacity, venueId: r.venue.id, publishedAt: r.publishedAt, speakerKeys: r.e.talks.map((t) => t.speakerKey) });
  }

  // Speakers and rundowns.
  const speakerRows: Array<typeof eventSpeakers.$inferInsert> = [];
  const rundownRows: Array<typeof rundownItems.$inferInsert> = [];
  for (const ev of out) {
    ev.plan.talks.forEach((t, i) =>
      speakerRows.push({
        eventId: ev.id,
        speakerId: speakerIds.get(t.speakerKey)!.id,
        role: t.role,
        organization: t.organization,
        position: t.position,
        talkTitle: t.title,
        sortOrder: i,
      }),
    );
    rundownFor(ev.plan).forEach((item, i) =>
      rundownRows.push({
        eventId: ev.id,
        time: item.time,
        endTime: item.endTime,
        agenda: item.agenda,
        note: item.note,
        speakerId: item.speakerKey ? speakerIds.get(item.speakerKey)!.id : null,
        sortOrder: i,
      }),
    );
  }
  await insertChunked(ctx.db, eventSpeakers, speakerRows);
  await insertChunked(ctx.db, rundownItems, rundownRows);
  return out;
}

/* ================================================================== links, media, streams */

export async function linkPublications(ctx: SeedCtx, seededEvents: SeededEvent[], pubs: SeededPub[]): Promise<number> {
  const rng = ctx.rng.fork('event-publications');
  const rows: Array<typeof eventPublications.$inferInsert> = [];
  const notes = ['The paper behind this talk.', 'Background reading, if you want a head start.', 'The earlier version of this work.', 'Where the numbers in the slides come from.', null];
  for (const ev of seededEvents) {
    if (ev.plan.cancelled) continue;
    const year = Number(ev.plan.date.slice(0, 4));
    const titles = new Set<string>();
    const candidates = pubs
      .filter((p) => p.visibility === 'published' && p.speakerKeys.some((k) => ev.speakerKeys.includes(k)) && Math.abs(p.year - year) <= 1)
      .sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year) || (a.type === 'preprint' ? 1 : 0) - (b.type === 'preprint' ? 1 : 0));
    const want = Math.min(candidates.length, rng.int(0, 3));
    for (const pub of candidates) {
      if (rows.filter((r) => r.eventId === ev.id).length >= want) break;
      if (titles.has(pub.title)) continue;
      titles.add(pub.title);
      rows.push({ eventId: ev.id, publicationId: pub.id, note: rng.pick(notes), sortOrder: titles.size - 1 });
    }
  }
  await insertChunked(ctx.db, eventPublications, rows);
  return rows.length;
}

/** Documentation photos for the 20 most recent past sessions, a short clip for 5 of them. */
export async function seedDocumentation(ctx: SeedCtx, seededEvents: SeededEvent[]): Promise<number> {
  const rng = ctx.rng.fork('documentation');
  const recent = seededEvents.filter((e) => e.plan.past && !e.plan.cancelled).slice(-20);
  const rows: Array<typeof eventMedia.$inferInsert> = [];
  recent.forEach((ev, idx) => {
    const photos = rng.sample(ctx.media.docs, rng.int(3, 8));
    // Uploaded a day or two after the session, or a few hours ago for last night's.
    const base = ev.plan.endsAt.getTime() + days(rng.int(1, 2));
    photos.forEach((ph, i) => {
      const captions = CAPTIONS[ph.scene] ?? CAPTIONS.default;
      rows.push({ eventId: ev.id, assetId: ph.id, caption: rng.pick(captions), featured: i === 0, sortOrder: i, createdAt: new Date(Math.min(base + minutes(i * 3), ctx.now.getTime() - minutes(60 - i))) });
    });
    if (ctx.media.clips.length && idx % 4 === 1) {
      rows.push({
        eventId: ev.id,
        assetId: ctx.media.clips[Math.floor(idx / 4) % ctx.media.clips.length],
        caption: 'Twelve seconds of the afternoon.',
        featured: false,
        sortOrder: photos.length,
        createdAt: new Date(Math.min(base + minutes(40), ctx.now.getTime() - minutes(20))),
      });
    }
  });
  await insertChunked(ctx.db, eventMedia, rows);
  return rows.length;
}

/**
 * Stream rows: `ended` with a ready public recording for the 8 most recent past sessions (one uploaded
 * recording asset shared by every session), `idle` for everything upcoming.
 */
export async function seedStreams(ctx: SeedCtx, seededEvents: SeededEvent[]): Promise<{ streams: number; sessions: number }> {
  const rng = ctx.rng.fork('streams');
  const recorded = seededEvents.filter((e) => e.plan.past && !e.plan.cancelled && e.plan.mode !== 'offline').slice(-8);
  const upcoming = seededEvents.filter((e) => !e.plan.past && !e.plan.cancelled);
  const recording = ctx.media.recording;
  let sessions = 0;
  for (const ev of [...recorded, ...upcoming]) {
    const isRecorded = recorded.includes(ev);
    const streamKey = `zm${randomBase62(16)}`;
    const startedAt = wib(ev.plan.date, '13:14', 30);
    const endedAt = new Date(startedAt.getTime() + (recording?.durationSec ?? 7200) * 1000);
    const peak = isRecorded ? rng.int(18, 110) : 0;
    await ctx.db.insert(eventStreams).values({
      eventId: ev.id,
      streamKey,
      privateKeyEnc: ctx.crypto.encrypt(randomBase62(32), ev.id),
      state: isRecorded ? 'ended' : 'idle',
      ingestOnline: false,
      ingestOnlineAt: isRecorded ? new Date(startedAt.getTime() - minutes(6)) : null,
      liveStartedAt: isRecorded ? startedAt : null,
      liveEndedAt: isRecorded ? endedAt : null,
      currentSessionId: null,
      peakViewers: peak,
      createdAt: new Date(Math.min(ev.plan.startsAt.getTime() - days(3), ctx.now.getTime() - minutes(rng.int(30, 600)))),
    });
    if (isRecorded && recording) {
      await ctx.db.insert(streamSessions).values({
        eventId: ev.id,
        streamKey,
        title: 'Full session',
        startedAt,
        endedAt,
        recordingStatus: 'ready',
        recordingAssetId: recording.id,
        visibility: 'public',
        isPrimary: true,
        peakViewers: peak,
        createdAt: startedAt,
      });
      sessions++;
    }
  }
  return { streams: recorded.length + upcoming.length, sessions };
}
