/** Add long-range Friday fixtures to the existing Railway preview without resetting its data. */
import { asc, eq } from 'drizzle-orm';
import { CryptoService } from '../common/crypto.service.js';
import { loadConfig } from '../config/app-config.js';
import { createDb, createSqlClient } from '../db/client.js';
import { admins, assets, events, siteSettings, speakers, venues } from '../db/schema.js';
import { seedEvents, seedStreams, type MediaIds, type SeedCtx } from './content.js';
import { ADMINS, SEED_ADMIN_TAG, VENUES } from './data/site.js';
import { SPEAKERS, type SpeakerSeed } from './data/speakers.js';
import { Rng } from './lib/rng.js';
import type { ManifestItem } from './media.js';
import { seedRegistrations } from './people.js';
import { planEvents } from './plan.js';

const PROJECT_ID = '09f3b5df-33e1-43a0-b674-bcb47de8e076';
const PREVIEW_HOST = 'zemi-preview.up.railway.app';
const ACCENTS = ['blue', 'yellow', 'red', 'green'] as const;

async function main() {
  const throughDate = process.argv[2];
  const parsedThrough = throughDate ? new Date(`${throughDate}T00:00:00Z`) : new Date(NaN);
  if (!throughDate || !/^\d{4}-\d{2}-\d{2}$/.test(throughDate) || Number.isNaN(parsedThrough.getTime()) || parsedThrough.toISOString().slice(0, 10) !== throughDate) {
    throw new Error('Usage: node dist/seed/extend.js YYYY-MM-DD');
  }
  // This command is intentionally scoped to the known preview, even though NODE_ENV is production there.
  if (process.env.RAILWAY_PROJECT_ID !== PROJECT_ID || process.env.RAILWAY_ENVIRONMENT_NAME !== 'preview' || process.env.RAILWAY_SERVICE_NAME !== 'api') {
    throw new Error('The Friday extension may run only in the Zemi Railway preview API service.');
  }
  process.env.JOBS_ENABLED = 'false';
  const config = loadConfig();
  if (new URL(config.env.PUBLIC_WEB_URL).hostname !== PREVIEW_HOST) throw new Error('Preview web URL does not match the expected host.');
  const client = createSqlClient({ url: config.env.DATABASE_URL, applicationName: 'zemi-preview-extend' });
  const db = createDb(client);
  try {
    const [oldEvents, coverRows, speakerRows, venueRows, adminRows] = await Promise.all([
      db.select({ number: events.number, startsAt: events.startsAt }).from(events).orderBy(asc(events.startsAt)),
      db.select({ id: assets.id, originalFilename: assets.originalFilename, alt: assets.alt, status: assets.status }).from(assets).where(eq(assets.purpose, 'event-cover')).orderBy(asc(assets.originalFilename)),
      db.select({ id: speakers.id, fullName: speakers.fullName }).from(speakers),
      db.select({ id: venues.id, name: venues.name, capacity: venues.capacity }).from(venues),
      db.select({ id: admins.id, name: admins.name, note: admins.note }).from(admins),
    ]);
    if (oldEvents.length < 100) throw new Error('Expected the existing preview fixtures; refusing to extend an unfamiliar database.');
    if (coverRows.length < 30 || coverRows.some(row => row.status !== 'ready')) throw new Error('The preview is missing ready event covers.');

    const covers: ManifestItem[] = coverRows.map(row => {
      const match = /^cover-(\d+)\.jpg$/.exec(row.originalFilename);
      const accent = ACCENTS.find(value => row.alt?.endsWith(`mostly ${value}`));
      if (!match || !accent) throw new Error(`Cannot map preview cover ${row.originalFilename}.`);
      return { id: `cover-${match[1]}`, path: '', type: 'image', mime: 'image/jpeg', bytes: 0, accent };
    });
    const coverIds = new Map(coverRows.map(row => [row.originalFilename.replace(/\.jpg$/, ''), row.id]));
    const speakersByName = new Map(speakerRows.map(row => [row.fullName, row.id]));
    const speakerIds = new Map<string, { id: string; seed: SpeakerSeed }>();
    for (const seed of SPEAKERS) {
      const id = speakersByName.get(seed.fullName);
      if (!id) throw new Error(`The preview is missing speaker ${seed.fullName}.`);
      speakerIds.set(seed.key, { id, seed });
    }
    const venuesByName = new Map(venueRows.map(row => [row.name, row]));
    const venueMap = new Map<string, { id: string; name: string; capacity: number | null; roomNote: string | null }>();
    for (const seed of VENUES) {
      const row = venuesByName.get(seed.name);
      if (!row) throw new Error(`The preview is missing venue ${seed.name}.`);
      venueMap.set(seed.key, { id: row.id, name: row.name, capacity: row.capacity, roomNote: seed.roomNote });
    }

    const now = new Date();
    const rng = new Rng(Number(process.env.SEED_RANDOM ?? 20240906));
    const planned = planEvents(rng.fork('plan'), now, covers, SPEAKERS, throughDate);
    const existingNumbers = new Set(oldEvents.map(row => row.number).filter((value): value is number => value !== null));
    for (const row of oldEvents) {
      if (row.number === null) continue;
      const expected = planned.find(event => event.number === row.number);
      if (expected && expected.startsAt.getTime() !== row.startsAt.getTime()) {
        throw new Error(`Existing Zemi #${row.number} has a different Friday date; no data was changed.`);
      }
    }
    const lastNumber = Math.max(...existingNumbers);
    const future = planned.filter(event => event.number > lastNumber && !existingNumbers.has(event.number));
    if (!future.length) {
      console.log(`Already covered through ${throughDate}; no events added.`);
      return;
    }
    if (future[0].startsAt <= oldEvents.at(-1)!.startsAt) throw new Error('The new Fridays overlap existing events.');
    const media: MediaIds = {
      speakerAvatars: [], authorAvatars: new Map(), teamAvatars: new Map(), covers: coverIds,
      pubCovers: new Map(), docs: [], pdfs: new Map(), clips: [], recording: null,
    };
    const chairName = ADMINS.find(admin => admin.role === 'program-chair')?.name;
    const chair = adminRows.find(row => row.note?.includes(SEED_ADMIN_TAG) && row.name === chairName);
    const ctx: SeedCtx = {
      db, rng, now, crypto: new CryptoService(config), log: console.log,
      safeEmails: true, lifecycleSent: true, media,
      createdBy: { superadmin: 'superadmin', programChair: chair?.id ?? null, contentManager: null },
    };

    const added = await seedEvents(ctx, future, venueMap, speakerIds);
    const streams = await seedStreams(ctx, added);
    const registrations = await seedRegistrations(ctx, added);

    // The old banner hard-coded the October 2026 event. Keep the preview announcement timeless.
    const [general] = await db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, 'general')).limit(1);
    if (general) {
      await db.update(siteSettings).set({
        value: { ...general.value, announcement: { active: true, text: 'A new conversation every Friday. Find your next Zemi.', href: '/events' } },
        updatedBy: 'Preview seed extension', updatedAt: new Date(),
      }).where(eq(siteSettings.key, 'general'));
    }

    const revalidateUrl = config.env.WEB_REVALIDATE_URL;
    const revalidateSecret = config.env.REVALIDATE_SECRET;
    if (revalidateUrl && revalidateSecret) {
      try {
        // The running API keeps /public/site in memory for 30 seconds. Let it expire before
        // the web fetches fresh settings, or the old announcement could be cached again.
        if (general) await new Promise(resolve => setTimeout(resolve, 31_000));
        const result = await fetch(revalidateUrl, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ secret: revalidateSecret, tags: ['site', 'events', 'speakers'] }),
          signal: AbortSignal.timeout(8000),
        });
        console.log(`Web revalidation: ${result.status}`);
      } catch (error) {
        console.log(`Web revalidation failed: ${(error as Error).message}`);
      }
    }
    console.log(`Added ${added.length} Fridays, Zemi #${added[0].plan.number} (${added[0].plan.date}) through #${added.at(-1)!.plan.number} (${added.at(-1)!.plan.date}).`);
    console.log(`Added ${streams.streams} idle streams and ${registrations.registrations} synthetic registrations.`);
  } finally {
    await client.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
