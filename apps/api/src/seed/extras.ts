import {
  EVENT_ACTION_BUNDLES,
  POLICY_PRESETS,
  SITE_DEFAULTS,
  SITE_SETTING_SCHEMAS,
  formatJakarta,
  normalizePolicy,
  type EventAction,
  type Policy,
  type SiteSettingKey,
} from '@zemi/shared';
import { count, eq, like, sql } from 'drizzle-orm';
import type { PassphraseService } from '../auth/passphrase.service.js';
import { admins, auditLogs, contactMessages, faqs, siteSettings, teamMembers } from '../db/schema.js';
import { type SeedCtx, type SeededEvent, email } from './content.js';
import { ADMINS, FAQS, MESSAGES, SEED_ADMIN_TAG, TEAM, VENUES, mapsUrl, type AdminRole } from './data/site.js';
import { assertNoDashes, days, minutes, wib } from './util.js';

/* ------------------------------------------------------------------ site settings */

/** The bar above the header, written for the kind of room next Friday is in. */
function announcementText(next: SeededEvent, venue: (typeof VENUES)[number] | null): string {
  const when = `Zemi #${next.plan.number} is Friday, ${formatJakarta(next.plan.startsAt, 'date-short')}`;
  if (!venue || venue.kind === 'online') return `${when}, online only. Coffee is on you this week.`;
  if (venue.kind === 'theater') return `${when} in ${venue.name}. Bigger room, same coffee.`;
  return `${when} in ${venue.name}. Save a seat, it fills up.`;
}

export async function seedSiteSettings(ctx: SeedCtx, seeded: SeededEvent[], venueIds: Map<string, { id: string }>): Promise<void> {
  const next = seeded.find((e) => e.plan.upcomingIndex === 0 && e.plan.visibility === 'published');
  const featured = seeded.find((e) => e.plan.upcomingIndex !== null && e.plan.theme.big && e.plan.visibility === 'published') ?? next;
  const lab = VENUES.find((v) => v.key === 'lab')!;
  const nextVenue = next ? VENUES.find((v) => venueIds.get(v.key)?.id === next.venueId) : null;

  const values: Record<SiteSettingKey, unknown> = {
    general: {
      ...SITE_DEFAULTS.general,
      defaultVenueId: venueIds.get('c312')?.id ?? null,
      defaultCapacity: 60,
      announcement: next
        ? {
            active: true,
            text: announcementText(next, nextVenue ?? null),
            href: `/events/${next.slug}`,
          }
        : SITE_DEFAULTS.general.announcement,
    },
    seo: SITE_DEFAULTS.seo,
    home: { ...SITE_DEFAULTS.home, featuredEventId: featured?.id ?? null },
    about: SITE_DEFAULTS.about,
    contact: {
      ...SITE_DEFAULTS.contact,
      whatsapp: '+62 812 1315 1515',
      address: `MGM Laboratory, ${lab.address}`,
      mapsUrl: mapsUrl(lab.lat!, lab.lng!),
      socials: [
        { kind: 'instagram', url: 'https://www.instagram.com/zemi.fridays', label: '@zemi.fridays' },
        { kind: 'youtube', url: 'https://www.youtube.com/@zemi-seminar', label: 'Recordings' },
        { kind: 'linkedin', url: 'https://www.linkedin.com/company/mgm-laboratory', label: 'MGM Laboratory' },
        { kind: 'github', url: 'https://github.com/mgm-lab', label: 'mgm-lab' },
        { kind: 'website', url: 'https://labmgm.org', label: 'labmgm.org' },
      ],
      notifyEmails: [email(ctx, 'zemi', 'labmgm.org')],
    },
    email: SITE_DEFAULTS.email,
  };
  for (const key of Object.keys(SITE_SETTING_SCHEMAS) as SiteSettingKey[]) {
    const value = SITE_SETTING_SCHEMAS[key].parse(values[key]) as Record<string, unknown>;
    assertNoDashes(`site settings ${key}`, value);
    await ctx.db
      .insert(siteSettings)
      .values({ key, value, updatedBy: 'Seeder' })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: 'Seeder', updatedAt: new Date() } });
  }
}

/* ------------------------------------------------------------------ faq, team, inbox */

async function isEmpty(ctx: SeedCtx, table: typeof faqs | typeof teamMembers | typeof contactMessages): Promise<boolean> {
  const [row] = await ctx.db.select({ n: count() }).from(table);
  return (row?.n ?? 0) === 0;
}

export async function seedFaqTeamInbox(ctx: SeedCtx): Promise<{ faqs: number; team: number; messages: number }> {
  const out = { faqs: 0, team: 0, messages: 0 };
  if (await isEmpty(ctx, faqs)) {
    assertNoDashes('faqs', FAQS);
    await ctx.db.insert(faqs).values(FAQS.map((f, i) => ({ question: f.question, answer: f.answer, visibility: f.visibility ?? 'published', sortOrder: i })));
    out.faqs = FAQS.length;
  } else ctx.log('  faqs: table not empty, left as is');

  if (await isEmpty(ctx, teamMembers)) {
    assertNoDashes('team', TEAM);
    await ctx.db.insert(teamMembers).values(
      TEAM.map((m, i) => ({
        name: m.name,
        role: m.role,
        bio: m.bio,
        avatarAssetId: ctx.media.teamAvatars.get(m.portrait) ?? null,
        links: m.links,
        visibility: 'published' as const,
        sortOrder: i,
      })),
    );
    out.team = TEAM.length;
  } else ctx.log('  team: table not empty, left as is');

  if (await isEmpty(ctx, contactMessages)) {
    assertNoDashes('messages', MESSAGES);
    await ctx.db.insert(contactMessages).values(
      MESSAGES.map((m) => {
        const [local, domain] = m.email.split('@') as [string, string];
        const at = new Date(ctx.now.getTime() - days(m.daysAgo));
        const iso = new Date(at.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
        let createdAt = wib(iso, `${String(m.hour).padStart(2, '0')}:${String((m.daysAgo * 17) % 60).padStart(2, '0')}`);
        if (createdAt > ctx.now) createdAt = new Date(ctx.now.getTime() - minutes(35));
        return {
          name: m.name,
          email: email(ctx, local, domain),
          topic: m.topic,
          message: m.message,
          status: m.status,
          ip: null,
          userAgent: null,
          createdAt,
          updatedAt: m.status === 'new' ? createdAt : new Date(Math.min(ctx.now.getTime(), createdAt.getTime() + days(1))),
        };
      }),
    );
    out.messages = MESSAGES.length;
  } else ctx.log('  inbox: table not empty, left as is');
  return out;
}

/* ------------------------------------------------------------------ admins */

export interface SeededAdmin {
  role: AdminRole;
  id: string;
  name: string;
  passphrase: string | null;
  expiresAt: Date | null;
  summary: string;
}

const eventGrant = (id: string, actions: EventAction[]) => ({ type: 'event' as const, id, actions });

function policyFor(role: AdminRole, seeded: SeededEvent[]): { policy: Policy; expiresAt: Date | null; summary: string } {
  const upcoming = seeded.filter((e) => e.plan.upcomingIndex !== null && !e.plan.cancelled);
  const next = upcoming.find((e) => e.plan.visibility === 'published');
  const preset = (key: string) => POLICY_PRESETS.find((p) => p.key === key)!.policy;
  switch (role) {
    case 'door-crew':
      return {
        policy: { capabilities: [], grants: next ? [eventGrant(next.id, EVENT_ACTION_BUNDLES['door-crew'])] : [] },
        expiresAt: next ? wib(next.plan.date, '18:00') : null,
        summary: next ? `scan + manual check-in for Zemi #${next.plan.number}, expires ${formatJakarta(wib(next.plan.date, '18:00'), 'datetime')} WIB` : 'no upcoming event',
      };
    case 'stream-operator': {
      const three = upcoming.filter((e) => e.plan.visibility !== 'draft').slice(0, 3);
      const last = three[three.length - 1];
      return {
        policy: { capabilities: [], grants: three.map((e) => eventGrant(e.id, EVENT_ACTION_BUNDLES['stream-operator'])) },
        expiresAt: last ? wib(last.plan.date, '18:00') : null,
        summary: `stream control for Zemi ${three.map((e) => `#${e.plan.number}`).join(', ')}`,
      };
    }
    case 'program-chair':
      return {
        policy: {
          capabilities: ['events.create', 'speakers.create', 'venues.manage'],
          grants: [
            { type: 'event', id: '*', actions: ['view'] },
            { type: 'speaker', id: '*', actions: ['view', 'edit'] },
            ...upcoming.map((e) => eventGrant(e.id, [...EVENT_ACTION_BUNDLES['event-editor'], 'publish', 'registrations.view'])),
          ],
        },
        expiresAt: null,
        summary: `creates events, edits the ${upcoming.length} upcoming ones`,
      };
    case 'content-manager':
      return { policy: preset('content-manager'), expiresAt: null, summary: 'speakers, publications, site pages, media library' };
    case 'viewer':
      return { policy: preset('viewer'), expiresAt: null, summary: 'read-only, no personal data' };
    case 'old-door-crew': {
      const june = seeded.filter((e) => e.plan.past && e.plan.date >= '2026-06-01' && e.plan.date <= '2026-06-30');
      return {
        policy: { capabilities: [], grants: june.map((e) => eventGrant(e.id, EVENT_ACTION_BUNDLES['door-crew'])) },
        expiresAt: wib('2026-06-30', '23:59'),
        summary: 'expired on 30 Jun 2026 (shows the "access ended" state)',
      };
    }
  }
}

/**
 * Demo admins with scoped policies. Outside production they get fixed, documented passphrases; in
 * production each run generates fresh ones (printed once). Re-runs find them by the note tag and
 * update them in place, so grants always point at the current event ids.
 */
export async function seedAdmins(ctx: SeedCtx, passphrases: PassphraseService, seeded: SeededEvent[], production: boolean): Promise<SeededAdmin[]> {
  const existing = await ctx.db.select().from(admins).where(like(admins.note, `%${SEED_ADMIN_TAG}%`));
  const out: SeededAdmin[] = [];
  const lastLogin: Partial<Record<AdminRole, Date>> = {
    'stream-operator': new Date(ctx.now.getTime() - minutes(60 * 8)),
    'content-manager': new Date(ctx.now.getTime() - days(2)),
    'program-chair': new Date(ctx.now.getTime() - days(1)),
    viewer: new Date(ctx.now.getTime() - days(20)),
    'old-door-crew': wib('2026-06-19', '12:55'),
  };
  for (const spec of ADMINS) {
    const { policy, expiresAt, summary } = policyFor(spec.role, seeded);
    const passphrase = production ? passphrases.generate() : spec.devPassphrase;
    const note = `${spec.note} ${SEED_ADMIN_TAG}`;
    const found = existing.find((a) => a.name === spec.name);
    let secret: { passphraseLookup: string; passphraseHash: string } | null = await passphrases.prepare(passphrase);
    try {
      await passphrases.assertAvailable(passphrase, found?.id ?? null);
    } catch {
      ctx.log(`  admins: passphrase for ${spec.name} is used by another admin, keeping the old one`);
      secret = null;
    }
    const values = {
      name: spec.name,
      note,
      policy: normalizePolicy(policy),
      expiresAt,
      disabledAt: null,
      lastLoginAt: lastLogin[spec.role] ?? null,
      createdBy: 'superadmin',
      ...(secret ?? {}),
    };
    let id: string;
    if (found) {
      await ctx.db.update(admins).set(values).where(eq(admins.id, found.id));
      id = found.id;
    } else {
      if (!secret) continue;
      const [row] = await ctx.db
        .insert(admins)
        .values({ ...values, passphraseLookup: secret.passphraseLookup, passphraseHash: secret.passphraseHash, createdAt: new Date(ctx.now.getTime() - days(40)) })
        .returning({ id: admins.id });
      id = row.id;
    }
    out.push({ role: spec.role, id, name: spec.name, passphrase: secret ? passphrase : null, expiresAt, summary });
  }
  return out;
}

/* ------------------------------------------------------------------ audit */

/** A handful of believable history entries, tagged `meta.seed` so the next run replaces them. */
export async function seedAudit(ctx: SeedCtx, seeded: SeededEvent[], seededAdmins: SeededAdmin[], names: { speaker: string; publication: string }): Promise<number> {
  await ctx.db.delete(auditLogs).where(sql`${auditLogs.meta} ->> 'seed' = 'true'`);
  const admin = (role: AdminRole) => seededAdmins.find((a) => a.role === role);
  const last = [...seeded].reverse().find((e) => e.plan.past && !e.plan.cancelled);
  const next = seeded.find((e) => e.plan.upcomingIndex === 0);
  const big = seeded.find((e) => e.plan.upcomingIndex !== null && e.plan.theme.big);
  const cancelled = seeded.find((e) => e.plan.cancelled);
  const ago = (d: number, extraMin = 0) => new Date(ctx.now.getTime() - days(d) - minutes(extraMin));
  type Entry = { actor: 'superadmin' | 'system' | AdminRole; action: string; resourceType?: string; resourceId?: string; summary: string; at: Date };
  const entries: Entry[] = [
    ...seededAdmins.map((a, i): Entry => ({ actor: 'superadmin', action: 'admin.create', resourceType: 'admin', resourceId: a.id, summary: `Added admin "${a.name}"`, at: ago(40 - i, 30) })),
    ...(cancelled ? [{ actor: 'superadmin' as const, action: 'event.cancel', resourceType: 'event', resourceId: cancelled.id, summary: `Cancelled "${cancelled.plan.title}" (Zemi #${cancelled.plan.number}): heavy rain`, at: wib(cancelled.plan.date, '06:10') }] : []),
    ...(big ? [{ actor: 'program-chair' as const, action: 'event.create', resourceType: 'event', resourceId: big.id, summary: `Created "${big.plan.title}" for ${formatJakarta(big.plan.startsAt, 'datetime')} WIB`, at: ago(30, 200) }] : []),
    ...(next ? [{ actor: 'program-chair' as const, action: 'event.publish', resourceType: 'event', resourceId: next.id, summary: `Published "${next.plan.title}" (Zemi #${next.plan.number})`, at: next.publishedAt ?? ago(10) }] : []),
    { actor: 'content-manager', action: 'speaker.create', resourceType: 'speaker', summary: `Added ${names.speaker} to the speakers`, at: ago(12, 90) },
    { actor: 'content-manager', action: 'publication.create', resourceType: 'publication', summary: `Added the publication "${names.publication}"`, at: ago(9, 45) },
    { actor: 'superadmin', action: 'site.update', resourceType: 'site', resourceId: 'home', summary: 'Updated the home page settings (beats, funStat)', at: ago(20, 15) },
    { actor: 'superadmin', action: 'inbox.update', resourceType: 'contact', summary: 'Marked the message from Hendra Susanto as replied', at: ago(18, 300) },
    ...(last
      ? [
          { actor: 'stream-operator' as const, action: 'stream.live', resourceType: 'event', resourceId: last.id, summary: `Went live for Zemi #${last.plan.number}`, at: wib(last.plan.date, '13:14', 30) },
          { actor: 'stream-operator' as const, action: 'stream.end', resourceType: 'event', resourceId: last.id, summary: `Ended the stream for Zemi #${last.plan.number}`, at: wib(last.plan.date, '15:18', 30) },
          { actor: 'system' as const, action: 'recording.ready', resourceType: 'event', resourceId: last.id, summary: `Recording for Zemi #${last.plan.number} is ready`, at: wib(last.plan.date, '15:31') },
        ]
      : []),
  ];
  const rows = entries
    .filter((e) => e.at <= ctx.now)
    .map((e) => {
      const who = e.actor === 'superadmin' || e.actor === 'system' ? null : admin(e.actor);
      return {
        actorType: e.actor === 'superadmin' ? ('superadmin' as const) : e.actor === 'system' ? ('system' as const) : ('admin' as const),
        actorId: e.actor === 'superadmin' ? 'superadmin' : e.actor === 'system' ? null : (who?.id ?? null),
        actorName: e.actor === 'superadmin' ? 'Superadmin' : e.actor === 'system' ? 'System' : (who?.name ?? 'Admin'),
        action: e.action,
        resourceType: e.resourceType ?? null,
        resourceId: e.resourceId ?? null,
        summary: e.summary,
        meta: { seed: true },
        ip: null,
        createdAt: e.at,
      };
    });
  if (rows.length) await ctx.db.insert(auditLogs).values(rows);
  return rows.length;
}
