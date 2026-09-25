/**
 * Demo data seeder. Boots the real Nest application context and uses the real services where it
 * matters (asset pipeline, passphrases, crypto, content reset); bulk rows go straight in with Drizzle.
 *
 *   pnpm --filter @zemi/api seed          # refuses when events already exist
 *   pnpm --filter @zemi/api seed:reset    # wipes all content first (same as POST /admin/system/reset-content)
 *
 * Production (from a checkout, env vars only):
 *   NODE_ENV=production DATABASE_URL=... S3_ENDPOINT=... S3_BUCKET=... (the API's usual env) \
 *     pnpm --filter @zemi/api seed:reset -- --production
 *
 * Env knobs: SEED_RANDOM (default 20240906), SEED_NOW (ISO instant), SEED_RECORDING_LOOPS (default 31,
 * 1 = the raw 4 minute clip), SEED_CONCURRENCY (4), SEED_SAFE_EMAILS (default on in production),
 * SEED_LIFECYCLE_SENT (default on in production), SEED_ENV_FILE (path, or "none").
 * See docs/features/api-site-seed.md.
 */
import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { slugify } from '@zemi/shared';
import { count, countDistinct, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { AppModule } from '../app.module.js';
import { PassphraseService } from '../auth/passphrase.service.js';
import { CryptoService } from '../common/crypto.service.js';
import { concatCopy, configureFfmpeg } from '../common/ffmpeg.js';
import { loadConfig } from '../config/app-config.js';
import { loadDotEnv } from '../config/env.js';
import { DB, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { AssetsService } from '../modules/assets/assets.service.js';
import { JobsService } from '../modules/jobs/jobs.service.js';
import { ContentResetService } from '../modules/site/content-reset.service.js';
import { SiteService } from '../modules/site/site.service.js';
import {
  linkPublications,
  seedDocumentation,
  seedEvents,
  seedPublications,
  seedSpeakers,
  seedStreams,
  seedVenues,
  type MediaIds,
  type SeedCtx,
} from './content.js';
import { MANUAL_AUTHORS, PUBLICATIONS } from './data/publications.js';
import { TEAM } from './data/site.js';
import { SPEAKERS } from './data/speakers.js';
import { seedAdmins, seedAudit, seedFaqTeamInbox, seedSiteSettings } from './extras.js';
import { Rng } from './lib/rng.js';
import { SeedMedia, readManifest, type Manifest, type ManifestItem } from './media.js';
import { seedRegistrations } from './people.js';
import { planEvents } from './plan.js';

const log = (line: string) => console.log(line);
const bool = (v: string | undefined, fallback: boolean) =>
  v === undefined || v === '' ? fallback : /^(1|true|yes|on)$/i.test(v);

/** apps/api, found by walking up from this file (works from src/, dist/ and .tmp/seed-build/). */
function findApiDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg) && JSON.parse(readFileSync(pkg, 'utf8')).name === '@zemi/api') return dir;
    dir = resolve(dir, '..');
  }
  throw new Error('Could not find apps/api (package.json named @zemi/api) above the seeder');
}

const humanize = (s: string | undefined) =>
  (s ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

async function ingestAll(
  media: SeedMedia,
  manifest: Manifest,
  assetsDir: string,
  loops: number,
): Promise<MediaIds> {
  const section = (name: string) => manifest.sections[name]?.items ?? [];
  const file = (item: ManifestItem) => join(assetsDir, item.path);
  const byPath = new Map(
    Object.values(manifest.sections).flatMap((s) => s.items.map((i) => [i.path, i] as const)),
  );
  const ids: MediaIds = {
    speakerAvatars: [],
    authorAvatars: new Map(),
    teamAvatars: new Map(),
    covers: new Map(),
    pubCovers: new Map(),
    docs: [],
    pdfs: new Map(),
    clips: [],
    recording: null,
  };

  // Videos first: they take longest to process.
  for (const clip of section('videos')) {
    ids.clips.push(
      await media.ingest({
        filePath: file(clip),
        filename: `${slugify(clip.title ?? clip.id)}.mp4`,
        purpose: 'documentation',
        mime: clip.mime,
        alt: clip.title ?? null,
        credit: clip.credit ?? null,
        label: clip.id,
      }),
    );
  }
  const rec = section('recordings')[0];
  if (rec) {
    const dir = await mkdtemp(join(tmpdir(), 'zemi-seed-'));
    try {
      let path = file(rec);
      if (loops > 1) {
        // Loop the 4 minute clip to cover a whole session, so rundown chapters land inside the video.
        path = join(dir, 'session.mp4');
        await concatCopy(
          Array.from({ length: loops }, () => file(rec)),
          path,
        );
      }
      const id = await media.ingest({
        filePath: path,
        filename: 'zemi-session-recording.mp4',
        purpose: 'recording',
        mime: 'video/mp4',
        videoMode: 'as-is',
        alt: 'Session recording',
        credit: rec.credit ?? null,
        label: 'recording',
      });
      ids.recording = { id, durationSec: (rec.durationSec ?? 240) * Math.max(1, loops) };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  const speakers = section('speakers');
  for (let i = 0; i < SPEAKERS.length; i++) {
    const item = speakers[i];
    const s = SPEAKERS[i]!;
    if (!item) break;
    if (item.gender && item.gender !== s.gender)
      log(`  warning: ${item.id} is ${item.gender} but ${s.fullName} is listed as ${s.gender}`);
    ids.speakerAvatars.push(
      await media.ingest({
        filePath: file(item),
        filename: `${slugify(s.fullName)}.jpg`,
        purpose: 'speaker-avatar',
        mime: item.mime,
        alt: `Portrait of ${s.fullName}`,
        credit: item.credit ?? null,
        label: item.id,
      }),
    );
  }
  for (const a of MANUAL_AUTHORS) {
    const item = a.portrait ? byPath.get(a.portrait) : undefined;
    if (!item) continue;
    ids.authorAvatars.set(
      a.portrait!,
      await media.ingest({
        filePath: file(item),
        filename: `${slugify(a.fullName)}.jpg`,
        purpose: 'author-avatar',
        mime: item.mime,
        alt: `Portrait of ${a.fullName}`,
        credit: item.credit ?? null,
        label: `${item.id} (author)`,
      }),
    );
  }
  for (const m of TEAM) {
    const item = byPath.get(m.portrait);
    if (!item) continue;
    ids.teamAvatars.set(
      m.portrait,
      await media.ingest({
        filePath: file(item),
        filename: `${slugify(m.name)}.jpg`,
        purpose: 'team-avatar',
        mime: item.mime,
        alt: `Portrait of ${m.name}`,
        credit: item.credit ?? null,
        label: `${item.id} (team)`,
      }),
    );
  }
  for (const c of section('covers')) {
    ids.covers.set(
      c.id,
      await media.ingest({
        filePath: file(c),
        filename: `${c.id}.jpg`,
        purpose: 'event-cover',
        mime: c.mime,
        alt: `Abstract cover art, ${humanize(c.style)}, mostly ${c.accent ?? 'blue'}`,
        credit: c.credit ?? null,
        label: c.id,
      }),
    );
  }
  const usedPubCovers = new Set(PUBLICATIONS.map((p) => p.cover).filter(Boolean));
  for (const c of section('pubCovers')) {
    if (!usedPubCovers.has(c.id)) continue;
    ids.pubCovers.set(
      c.id,
      await media.ingest({
        filePath: file(c),
        filename: `${c.id}.jpg`,
        purpose: 'publication-cover',
        mime: c.mime,
        alt: `Figure-style cover, ${humanize(c.style)}`,
        credit: c.credit ?? null,
        label: c.id,
      }),
    );
  }
  for (const d of section('docs')) {
    ids.docs.push({
      id: await media.ingest({
        filePath: file(d),
        filename: `${d.id}.jpg`,
        purpose: 'documentation',
        mime: d.mime,
        alt: d.alt ?? null,
        credit: d.credit ?? null,
        label: d.id,
      }),
      scene: d.scene ?? 'default',
    });
  }
  for (const pdf of section('pdfs')) {
    const title = String(pdf.title ?? pdf.id);
    ids.pdfs.set(
      pdf.id,
      await media.ingest({
        filePath: file(pdf),
        filename: `${slugify(title, 70)}.pdf`,
        purpose: 'publication-pdf',
        mime: pdf.mime,
        credit: pdf.credit ?? null,
        label: pdf.id,
      }),
    );
  }
  return ids;
}

async function summary(db: Db, app: INestApplicationContext): Promise<void> {
  const n = async (table: PgTable) => (await db.select({ n: count() }).from(table))[0]?.n ?? 0;
  const tables: Array<[string, PgTable]> = [
    ['venues', schema.venues],
    ['speakers', schema.speakers],
    ['events', schema.events],
    ['event_speakers', schema.eventSpeakers],
    ['rundown_items', schema.rundownItems],
    ['publications', schema.publications],
    ['publication_authors', schema.publicationAuthors],
    ['event_publications', schema.eventPublications],
    ['event_media', schema.eventMedia],
    ['registrations', schema.registrations],
    ['checkins', schema.checkins],
    ['event_streams', schema.eventStreams],
    ['stream_sessions', schema.streamSessions],
    ['assets', schema.assets],
    ['faqs', schema.faqs],
    ['team_members', schema.teamMembers],
    ['contact_messages', schema.contactMessages],
    ['admins', schema.admins],
  ];
  log('\nRows:');
  for (const [name, table] of tables)
    log(`  ${name.padEnd(22)} ${String(await n(table)).padStart(6)}`);

  const byVis = await db
    .select({ v: schema.events.visibility, n: count() })
    .from(schema.events)
    .groupBy(schema.events.visibility);
  const [returning] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from (select email from registrations group by email having count(*) > 1) t`,
  );
  const [people] = await db
    .select({ n: countDistinct(schema.registrations.email) })
    .from(schema.registrations);
  const assetStatus = await db
    .select({ s: schema.assets.status, n: count() })
    .from(schema.assets)
    .groupBy(schema.assets.status);
  log(`\nEvents by visibility: ${byVis.map((r) => `${r.v} ${r.n}`).join(', ')}`);
  log(`People: ${people?.n ?? 0} distinct emails, ${returning?.n ?? 0} came more than once`);
  log(`Assets: ${assetStatus.map((r) => `${r.s} ${r.n}`).join(', ')}`);
  const site = app.get(SiteService);
  site.invalidatePublicCache();
  const stats = await site.stats();
  log(
    `Public stats: ${Object.entries(stats)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`,
  );
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2).filter((a) => a !== '--'));
  const reset = args.has('--reset');
  const confirmProduction =
    args.has('--production') || process.env.SEED_CONFIRM_PRODUCTION === 'yes';
  const apiDir = findApiDir();
  const started = Date.now();

  // Local runs read apps/api/.env; production runs use real env vars only (a dev .env must never leak in).
  const envFile = process.env.SEED_ENV_FILE;
  if (process.env.NODE_ENV !== 'production' && envFile !== 'none')
    loadDotEnv(envFile ? resolve(envFile) : join(apiDir, '.env'));
  // No workers in the seeder: teammates' jobs (emails, recordings) stay with the running API. We process our own media.
  process.env.JOBS_ENABLED = 'false';
  // One revalidate at the end instead of one per processed asset.
  const revalidate = { url: process.env.WEB_REVALIDATE_URL, secret: process.env.REVALIDATE_SECRET };
  process.env.WEB_REVALIDATE_URL = '';
  process.env.MAIL_OUTBOX_DIR ??= join(apiDir, '.mail-outbox');

  const config = loadConfig();
  const production = config.isProduction;
  if (production && !confirmProduction) {
    console.error(
      '\nThis is a production environment (NODE_ENV=production). Add --production to confirm you really want demo data there.\n',
    );
    process.exit(1);
  }
  configureFfmpeg({ ffmpeg: config.env.FFMPEG_PATH, ffprobe: config.env.FFPROBE_PATH });
  await runMigrations(config.env.DATABASE_URL, join(apiDir, 'drizzle'));

  log(
    `Zemi seeder: ${production ? 'PRODUCTION' : config.env.NODE_ENV}, db ${config.env.DATABASE_URL.replace(/\/\/[^@]*@/, '//***@')}, bucket ${config.env.S3_BUCKET}`,
  );
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  let exitCode = 0;
  try {
    const db = app.get<Db>(DB);
    const [existing] = await db.select({ n: count() }).from(schema.events);
    if ((existing?.n ?? 0) > 0 && !reset) {
      console.error(
        `\nThere are already ${existing!.n} events. Run "pnpm --filter @zemi/api seed:reset" to wipe content and seed again.\n`,
      );
      exitCode = 1;
    } else {
      if (reset) {
        const r = await app
          .get(ContentResetService)
          .resetContent({ principal: 'system', ip: null });
        const rows = Object.values(r.deleted).reduce((a, b) => a + b, 0);
        log(`Reset: removed ${rows} rows and ${r.bucketObjects} files.`);
      }

      const now = process.env.SEED_NOW ? new Date(process.env.SEED_NOW) : new Date();
      if (Number.isNaN(now.getTime())) throw new Error('SEED_NOW is not a valid date');
      const rng = new Rng(Number(process.env.SEED_RANDOM ?? 20240906));
      const assetsDir = join(apiDir, 'seed', 'assets');
      const manifest = await readManifest(assetsDir);
      const loops = Math.max(1, Math.min(60, Number(process.env.SEED_RECORDING_LOOPS ?? 31) || 1));
      const concurrency = Math.max(1, Math.min(8, Number(process.env.SEED_CONCURRENCY ?? 4) || 4));

      log('Uploading media...');
      const media = new SeedMedia(
        db,
        app.get(AssetsService),
        app.get(JobsService),
        log,
        concurrency,
      );
      const mediaIds = await ingestAll(media, manifest, assetsDir, loops);
      log(
        `  ${media.count} files uploaded, processing with concurrency ${concurrency} while rows go in`,
      );
      void media.start();

      const ctx: SeedCtx = {
        db,
        rng,
        now,
        crypto: app.get(CryptoService),
        log,
        safeEmails: bool(process.env.SEED_SAFE_EMAILS, production),
        lifecycleSent: bool(process.env.SEED_LIFECYCLE_SENT, production),
        media: mediaIds,
        createdBy: { superadmin: 'superadmin', programChair: null, contentManager: null },
      };
      const passphrases = app.get(PassphraseService);

      const plan = planEvents(
        rng.fork('plan'),
        now,
        manifest.sections.covers?.items ?? [],
        SPEAKERS,
      );
      const venueMap = await seedVenues(ctx);
      const firstAdmins = await seedAdmins(ctx, passphrases, [], production);
      ctx.createdBy.programChair = firstAdmins.find((a) => a.role === 'program-chair')?.id ?? null;
      ctx.createdBy.contentManager =
        firstAdmins.find((a) => a.role === 'content-manager')?.id ?? null;

      log('Speakers, publications, events...');
      const speakerIds = await seedSpeakers(ctx, plan);
      const pubs = await seedPublications(ctx, speakerIds);
      const seeded = await seedEvents(ctx, plan, venueMap, speakerIds);
      const links = await linkPublications(ctx, seeded, pubs);
      const docs = await seedDocumentation(ctx, seeded);
      const streams = await seedStreams(ctx, seeded);
      log(
        `  ${speakerIds.size} speakers, ${pubs.length} publications, ${seeded.length} events, ${links} event-publication links, ${docs} documentation items, ${streams.streams} streams, ${streams.sessions} recordings`,
      );

      log('Registrations and check-ins...');
      const people = await seedRegistrations(ctx, seeded);
      log(
        `  ${people.registrations} registrations, ${people.checkedIn} checked in, pool of ${people.poolSize} regulars`,
      );

      log('Site settings, FAQ, team, inbox, admins, audit...');
      await seedSiteSettings(ctx, seeded, venueMap);
      const extras = await seedFaqTeamInbox(ctx);
      const admins = await seedAdmins(ctx, passphrases, seeded, production);
      const lastPub = PUBLICATIONS.find((p) => p.key === 'traffic-preprint')!;
      const audit = await seedAudit(ctx, seeded, admins, {
        speaker: 'Arjun Mehta',
        publication: lastPub.title,
      });
      log(
        `  ${extras.faqs} FAQs, ${extras.team} team members, ${extras.messages} messages, ${admins.length} demo admins, ${audit} audit entries`,
      );

      log('Waiting for media processing...');
      const result = await media.waitAll();
      log(
        `  ${result.ready} assets ready${result.failed.length ? `, ${result.failed.length} FAILED` : ''}`,
      );
      for (const f of result.failed)
        console.error(`  FAILED ${f.label}: ${f.error ?? 'still processing'}`);
      if (result.failed.length) exitCode = 2;

      await summary(db, app);

      log('\nDemo admins (log in at /admin with the passphrase):');
      for (const a of admins) {
        log(`  ${a.name.padEnd(34)} ${(a.passphrase ?? '(unchanged)').padEnd(32)} ${a.summary}`);
      }
      log(`  ${'Superadmin'.padEnd(34)} ${'(SUPERADMIN_PASSPHRASE)'.padEnd(32)} everything`);
      if (production)
        log(
          '\n  These passphrases are shown once. Delete the demo admins before going live, the content reset keeps admins.',
        );

      const eventsWithNext = seeded.find((e) => e.plan.upcomingIndex === 0);
      if (eventsWithNext)
        log(
          `\nNext Friday: Zemi #${eventsWithNext.plan.number}, ${config.env.PUBLIC_WEB_URL}/events/${eventsWithNext.slug}`,
        );

      if (revalidate.url && revalidate.secret) {
        try {
          const res = await fetch(revalidate.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              secret: revalidate.secret,
              tags: ['site', 'events', 'speakers', 'publications'],
            }),
            signal: AbortSignal.timeout(5000),
          });
          log(`Revalidated the web (${res.status}).`);
        } catch (err) {
          log(`Could not reach the web to revalidate: ${(err as Error).message}`);
        }
      }
      log(`\nDone in ${Math.round((Date.now() - started) / 1000)}s.`);
    }
  } finally {
    await app.close().catch(() => undefined);
  }
  process.exit(exitCode);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
